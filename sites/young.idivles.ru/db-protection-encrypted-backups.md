# Защита БД и шифрование Telegram-бэкапов

Дата: 2026-08-09  
Сайт: https://young.idivles.ru  
Проект: `/opt/sochi-portal`

## Короткий ответ

**Снаружи БД закрыта. Внутри хоста мы усилили защиту (Redis-пароль, права, шифробэкапы).**  
**Против полного root на том же сервере абсолютной защиты нет**, если ключи расшифровки когда-либо оказываются в памяти/на диске этой машины. Ниже — модель угроз и что именно сделано.

---

## 1. Модель угроз (честно)

| Угроза | Защита сейчас |
|--------|----------------|
| Интернет → Postgres :5432 | Порт **не опубликован**, с публичного IP **закрыт** |
| Случайный доступ с хоста без root | Каталог `data/postgres` mode `700`, `.env` mode `600` |
| Компрометация контейнера `web` | Redis только с паролем; vault паролей бэкапа **root-only** (web не читает) |
| Утечка файла бэкапа из Telegram | Архивы **AES-256-CBC**, пароль **не** в том же сообщении |
| Злоумышленник с **root на VPS** | Может читать RAM, `.env`, Docker volumes, подменить скрипты. Это предел любой схемы, где ключ живёт на том же сервере |

**Вывод:** защита «даже если есть root» = *затруднить* и *не оставлять открытый дамп*, но не магический сейф от владельца сервера. Для стойкости к root ключ должен жить **вне** сервера (HSM, отдельный секрет у админа только offline) — это отдельный контур.

---

## 2. Что защищено внутри

### PostgreSQL
- Слушает только Docker-сеть, **без** `ports:` наружу.
- Внешний probe на `IP:5432` — closed.
- Пароль из `.env` (`POSTGRES_PASSWORD`), подключение приложения по `DATABASE_URL` только к сервису `db`.
- `password_encryption = scram-sha-256`.
- Данные на диске: `data/postgres` с правами `700` (UID postgres в контейнере).

### Redis
- Включён `--requirepass` + `protected-mode`.
- `REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379`.
- Снаружи не публикуется.

### Секреты на диске
- `.env` — `600 root`.
- Пароли бэкапов: `/opt/sochi-portal/data/backup-secrets/` — **`700 root:root`**, файлы `*.pass.enc` шифруются ключом `BACKUP_VAULT_KEY` (из `.env`).
- Контейнер `web` (uid 1000) **не** читает vault; только ставит JSON-заявки в очередь.

---

## 3. Шифрованные бэкапы в Telegram

### Алгоритм
1. Снимается `pg_dump` + tar проекта (включая `.env.backup` внутри архива).
2. Оба файла шифруются: **AES-256-CBC**, PBKDF2, **200000** итераций (`openssl enc`).
3. Plaintext на диске **удаляется** (`shred` / `rm`).
4. В Telegram уходят только `*.dump.enc`, `*.tar.gz.enc` и манифест.
5. Уникальный пароль (32 символа) сохраняется в vault (`stamp.pass.enc`).

### Фразы (точные)

| Фраза | Действие |
|-------|----------|
| `Абракадабра, Евгений Шумко!` | Поставить в очередь сборку + шифрование бэкапа |
| `Шумко Евгений, дай пароль!` | Выдать пароль от **последнего** бэкапа (только авторизованному chat ID) |

Пароль **не** присылается вместе с файлами — только по второй команде.

### Кто может
- Chat ID из «получатели оповещений»;
- `dailyBackupChatId` (ежедневный получатель);
- ADMIN с привязанным `telegramChatId`.

### Расшифровка у себя

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in full-YYYY-mm-dd_HHMMSS.tar.gz.enc \
  -out full.tar.gz \
  -pass pass:'ПАРОЛЬ_ИЗ_ТЕЛЕГРАМ'

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in db-YYYY-mm-dd_HHMMSS.dump.enc \
  -out db.dump \
  -pass pass:'ПАРОЛЬ_ИЗ_ТЕЛЕГРАМ'
```

### Ежедневный бэкап
Тот же пайплайн шифрования; получатель — **только** `dailyBackupChatId` (Админка → Настройки → Оповещения).

---

## 4. Компоненты на сервере

| Путь | Назначение |
|------|------------|
| `scripts/process-tg-backup-requests.sh` | Сборка, шифрование, отправка, выдача пароля |
| `scripts/daily-tg-backup.sh` | Ежедневная постановка в очередь |
| `/etc/cron.d/sochi-tg-backup` | `*` очередь; `5 * * * *` daily check |
| `data/backup-requests/` | Заявки от web (uid 1000) |
| `data/backup-requests/password-requests/` | Заявки «дай пароль» |
| `data/backup-secrets/` | Vault паролей (root) |
| `/var/backups/sochi-portal/tg/*.enc` | Шифрофайлы |
| `/var/log/sochi-tg-backup.log` | Лог |

Переменные `.env`: `TELEGRAM_BOT_TOKEN`, `BACKUP_VAULT_KEY`, `REDIS_PASSWORD`, `REDIS_URL`.

---

## 5. Рекомендации «ещё жёстче» (если нужен почти-offline ключ)

1. Хранить `BACKUP_VAULT_KEY` не на сервере, а вводить вручную при выдаче пароля (ломает автовыдачу).  
2. Диск с `data/postgres` на LUKS; ключ LUKS только на USB/TPM.  
3. Отдельный read-only replica / бэкап на другой хост без общего root.  
4. Не слать `.env` внутри архива — вынести секреты в отдельный sealed channel.

---

## 6. Быстрая проверка

```bash
# Postgres не снаружи
ss -lntp | grep 5432   # только docker/internal или 127.0.0.1 чужого инстанса
# Redis с паролем
docker-compose exec -T redis sh -c 'redis-cli -a "$REDIS_PASSWORD" ping'
# Очередь/vault
ls -la /opt/sochi-portal/data/backup-secrets
ls -la /var/backups/sochi-portal/tg/*.enc
tail -30 /var/log/sochi-tg-backup.log
```

В боте Young.Portal:
1. `Абракадабра, Евгений Шумко!` → файлы `.enc`  
2. `Шумко Евгений, дай пароль!` → пароль
