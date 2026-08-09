# Развёртывание на другом VPS: чистый сайт и резервный клон (HA)

Полная инструкция к тулкиту `tools/yp-provision/`.  
Сайт-образец: **young.idivles.ru** (`/opt/sochi-portal` на VPS `176.124.204.53:4488`).

---

## 0. Что вы получаете

| Режим | Назначение |
|-------|------------|
| **1. Greenfield** | Новый чистый портал для **другой организации**: своё имя, домен, админ, пустая/своя БД. |
| **2. HA clone** | **Резервная копия** текущего сайта: код + PostgreSQL + uploads, периодический sync, promote при аварии. |

Админка: раздел **Система → Репликация** (stubs в `tools/yp-provision/admin-stubs/`) — секрет, peer, интервал, статус heartbeat.

---

## 1. Требования

### Машина, с которой запускаете мастер
- Linux/macOS с `bash`, `ssh`, `scp`, `rsync`, `openssl`
- Для пароля SSH: `sshpass`
- Доступ по SSH **к целевому** VPS (и для HA — ещё к primary)

### Целевой VPS
- Debian 12 / Ubuntu 22.04+ (скрипт ставит Docker, nginx, certbot, ufw)
- ≥ 2 ГБ RAM (лучше 4 ГБ), ≥ 20 ГБ диска, 1–2 vCPU
- Открыты: SSH, 80, 443
- Для SSL: DNS A-запись домена уже указывает на этот VPS

### Primary (для HA)
- Рабочий `/opt/sochi-portal` + `docker compose`
- Возможность `pg_dump` из контейнера `db`
- Желательно отдельный SSH-ключ **только для синка** (не пароль root в cron)

---

## 2. Быстрый старт

```bash
cd /path/to/Hinkal
chmod +x tools/yp-provision/bin/*
./tools/yp-provision/bin/yp-provision
```

Мастер спросит по порядку:

1. **Режим** — 1 (чистый) или 2 (клон)
2. **VPS** — IP/host, порт SSH, логин, пароль **или** путь к ключу
3. **Сайт** — домен, название, админ (режим 1) **или** параметры primary/sync (режим 2)

Неинтерактивно:

```bash
cp tools/yp-provision/templates/site.env.example /tmp/site.env
# отредактировать
./tools/yp-provision/bin/yp-provision --config /tmp/site.env --mode greenfield --yes
```

---

## 3. Вариант 1 — новый чистый сайт

### Что спрашивается
- IP VPS, порт SSH, логин, пароль/ключ  
- Домен, название организации, короткое имя  
- Email + пароль первого админа  
- Часовой пояс, каталог установки (`/opt/youth-portal`)  
- Let's Encrypt да/нет  
- Откуда код: rsync с primary-дерева **или** tar.gz уже на VPS  

### Что делает скрипт
1. Ставит Docker, nginx, certbot, ufw, fail2ban  
2. Копирует код портала **без** `node_modules`, `.next`, `data`, `uploads`, `.env`  
3. Пишет новый `.env` (новые `NEXTAUTH_SECRET`, пароль БД, `NEXTAUTH_URL=https://домен`)  
4. Поднимает compose, проксирует nginx → `:3000`  
5. Пытается выпустить сертификат  
6. Best-effort обновляет `SiteSettings.siteName`  

### После установки
1. Откройте `https://ваш-домен`  
2. Войдите админом → **смените пароль**  
3. Заполните бренд (лого, цвета), модули в `/admin`  
4. Не копируйте прод-`.env` с young.idivles.ru — только структуру  
5. `RESEND_API_KEY` можно оставить пустым (портал умеет skip почты)  

### Чеклист soft-launch
- [ ] `/api/health` = 200  
- [ ] Регистрация / логин  
- [ ] Загрузка аватара (uploads volume writable)  
- [ ] HTTPS без mixed content  
- [ ] Бэкап БД настроен (`pg_dump` + offsite)  

---

## 4. Вариант 2 — резервный клон (HA)

### Архитектура

```
                  ┌──────────────┐
     DNS A ──────►│   PRIMARY    │  young.idivles.ru
                  │  sochi-portal│
                  │  Postgres    │
                  │  uploads     │
                  └──────┬───────┘
                         │  каждые N мин:
                         │  pg_dump + rsync uploads
                         │  (+ опционально heartbeat API)
                         ▼
                  ┌──────────────┐
                  │   STANDBY    │  standby.* или тот же IP после promote
                  │  копия БД    │
                  │  uploads     │
                  │  sync timer  │
                  │  health WD   │
                  └──────────────┘
```

### Что синхронизируется

| Компонент | Как | Интервал (реком.) |
|-----------|-----|-------------------|
| PostgreSQL | `pg_dump` на primary → `DROP/CREATE` + restore на standby | 5–15 мин |
| `public/uploads/` | `rsync -az --delete` | вместе с БД |
| Код / image | по умолчанию **нет** (ставьте тот же image tag вручную после деплоя) | при релизе |
| `.env` | **не** копировать целиком; `NEXTAUTH_SECRET` и `DATABASE_URL` локальные; URL может отличаться до promote | один раз |
| Redis | не реплицируем (сессии/кэш пересоздаются) | — |

> RPO (потеря данных): до длины интервала синка (например ≤15 мин).  
> RTO (время восстановления): минуты на `yp-ha-promote` + DNS TTL.

### Порядок развёртывания standby

1. Поднимите **второй VPS**, DNS для тестового имени (`standby.young.idivles.ru`) → новый IP.  
2. Запустите мастер → режим **2**.  
3. Укажите SSH к **новому** VPS и доступы к **primary**.  
4. Скрипт поставит `/opt/yp-ha/*`, `/etc/yp-ha.conf`, systemd timers.  
5. Первый sync долгий — смотрите `/var/log/yp-ha/ha.log`.  
6. Проверьте `https://standby…/api/health` и логин тем же пользователем, что на primary (после sync БД).  

### Failover (когда primary недоступен)

**Рекомендуется manual** (по умолчанию):

```bash
# на STANDBY
/opt/yp-ha/yp-ha-promote --yes
# затем в DNS-панели: A-запись боевого домена → IP standby
# TTL заранее держите 60–120 секунд
```

**dns-ttl** — задайте `YP_DNS_HOOK=/opt/yp-ha/dns-promote.sh` (ваш скрипт API Cloudflare/REG.RU).  
**floating-ip** — `YP_FLOATING_IP_HOOK` переносит IP у хостера.

Авто-promote (`YP_AUTO_PROMOTE=1`) **опасен** (ложные срабатывания → split-brain). Включайте только с пониманием и monitoring.

### Анти-split-brain (мелочи, обязательно)

1. На standby **остановите** приём боевого трафика, пока роль `standby` (отдельный hostname).  
2. После promote на старом primary: `docker compose stop web` или firewall deny 80/443.  
3. Один writer: никогда не поднимайте запись в БД на обоих узлах одновременно.  
4. Sync timer на promoted-узле **отключается** (`yp-ha-promote` делает stop/disable).  
5. Секрет репликации только в `/etc/yp-ha.conf` (chmod 600) и в админке; не в git.  

### Возврат primary (failback)

1. Почините старый primary.  
2. Один раз синхронизируйте **в обратную сторону** (standby→old) или сделайте старый новым standby.  
3. Переключите DNS обратно только после успешного sync и health.  
4. Документируйте кто сейчас primary в админке «Репликация».  

---

## 5. Настройка в админке

Файлы-заготовки: `tools/yp-provision/admin-stubs/`.

### Встроить в портал
1. Скопировать `AdminReplicaClient.tsx` → `src/app/admin/system/replica/page.tsx` (обернуть layout админки).  
2. API `GET/PUT /api/admin/replica` — хранить JSON в `SiteSettings.replicaJson` или таблице `ReplicaMeta`.  
3. `POST /api/admin/replica/heartbeat` — Bearer shared secret со standby (`yp-ha-sync` уже шлёт heartbeat).  
4. Пункт в `AdminSidebar`: **Система → Репликация** (только ADMIN/TECH).  

### Поля UI
- Включено / роль (standalone|primary|standby)  
- Peer host, shared secret  
- Интервал синка, sync uploads  
- Failover mode, auto-promote (off by default)  
- Last sync / last heartbeat / status (read-only)  

### Операции из админки (рекомендуемые кнопки v2)
- «Проверить peer» → HTTP health standby  
- «Запросить sync сейчас» → SSH/queue на standby (`systemctl start yp-ha-sync`) — через защищённый ops webhook  
- «Инструкция promote» — чеклист без авто-DNS  

---

## 6. Файлы тулкита

```
tools/yp-provision/
  bin/yp-provision          # мастер
  bin/yp-ha-sync            # sync job (на standby)
  bin/yp-ha-promote         # failover
  bin/yp-ha-health          # проверка primary
  lib/{common,ssh,greenfield,ha}.sh
  systemd/yp-ha-*.{service,timer}
  admin-stubs/              # UI/API заготовки
  templates/site.env.example
```

Установка скриптов на узел: мастер копирует в `/opt/yp-ha/` и unit-файлы в systemd.

---

## 7. Безопасность

- Отдельный SSH-ключ для синка: `command=` ограничение не нужно, но ключ без пароля root-логина человека.  
- `/etc/yp-ha.conf`, `/etc/yp-ha.pass` → `chmod 600`.  
- Не открывайте Docker API (2375) в интернет.  
- Heartbeat API только с timing-safe compare секрета + rate limit.  
- Бэкапы dump храните 12 последних локально + периодический offsite (уже есть telegram/encrypted backup в проекте).  
- На greenfield всегда новые секреты — никогда не переиспользуйте prod `NEXTAUTH_SECRET`.  

---

## 8. Проверка (acceptance)

### Greenfield
```bash
curl -fsS https://NEW_DOMAIN/api/health
# логин админом, смена пароля, создание клуба
```

### HA
```bash
# standby
systemctl list-timers | grep yp-ha
tail -50 /var/log/yp-ha/ha.log
curl -fsS https://STANDBY_DOMAIN/api/health

# симуляция аварии (осторожно на проде!)
# на primary: docker compose stop web
# на standby: /opt/yp-ha/yp-ha-health   # копит fails
# promote вручную + DNS
```

Сверьте число пользователей/клубов:

```sql
SELECT count(*) FROM "User";
SELECT count(*) FROM "Club";
```

на primary и standby после sync.

---

## 9. Типичные проблемы

| Симптом | Что проверить |
|---------|----------------|
| SSH permission denied | Порт, fail2ban, пароль/ключ |
| certbot fail | A-запись, порт 80 снаружи |
| sync: pg_dump empty | Имя сервиса `db`, user/db в compose |
| uploads 404 после promote | rsync uploads, volume path |
| сессии слетели после failover | Ожидаемо (Redis локальный); пользователи перелогинятся |
| split-brain | Оба web пишут в разные БД — остановите старый primary |

---

## 10. Связь с текущим продом

Пока Cloud Agent **не имеет SSH** на `176.124.204.53` (пароль сменён), автоматический прогон мастера с primary недоступен из агента.  
Запускайте `yp-provision` **с машины, где есть доступ**, или добавьте ключ агента:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJvcjBXIVCeBUlkn+iRLyO79Lxe9uwyqPxTLgspKAeTC cursor-cloud-agent-young-idivles
```

Параллельно в этом же PR: фикс наложения меню (`code/navbar-overlap/`) — деплой на прод после восстановления SSH.
