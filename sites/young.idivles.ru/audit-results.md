# young.idivles.ru — результаты аудита и усиления (2026‑08‑09)

Владелец подтвердил, что сайт его; работы выполнены на VPS **176.124.204.53** (root, порт SSH **4488**).
Все проверки по ролям — только чтение (GET); тестовые учётки создавались и **удалялись**.

## 1. Инвентаризация сервера

- ОС: Debian 12, nginx 1.22.1 (reverse proxy, TLS Let's Encrypt).
- Портал `young.idivles.ru` = Docker Compose **`sochi-portal`** в `/opt/sochi-portal`:
  - `sochi-portal_web_1` — Next.js 16 (standalone) на `127.0.0.1:3000`;
  - `sochi-portal_db_1` — PostgreSQL 16 (`sochi_portal`, 56 таблиц, ~13 МБ);
  - `sochi-portal_redis_1` — Redis 7.
- Аутентификация: **next-auth** (Credentials: email/телефон + bcrypt), JWT‑сессии,
  роль перечитывается из БД на каждый запрос; есть rate‑limit и captcha.
- Firewall `ufw` активен (80/443/4488), `fail2ban` (jails `sshd`, `3x-ipl`).
- На VPS есть и другие проекты (x‑ui/xray, rtb‑backend, и т.д.) — их **не трогали**.

> Примечание: SSH был недоступен не из‑за пароля, а из‑за нестандартного порта — **4488**
> (не 22). После уточнения порта доступ восстановился.

## 2. Резервная копия (сделана ДО изменений)

Каталог на сервере: **`/root/backups/sochi-portal/2026-08-09_082813/`**

| Файл | Что | 
|------|-----|
| `db.dump` | PostgreSQL (custom format, `pg_restore`) |
| `db.sql.gz` | PostgreSQL (plain SQL, gzip) |
| `app.tgz` | код `/opt/sochi-portal` (без `node_modules`/`.next`/`data/postgres`/`.git`) |
| `env.backup` | `.env` (права `600`) |
| `nginx.tgz` | `nginx.conf` + сайт `sochi-portal` + `conf.d/yp-limits.conf` |
| `SHA256SUMS` | контрольные суммы |

Копии nginx‑конфигов перед правкой: `/root/backups/sochi-portal/nginx-2026-08-09_083607/`.

Восстановление БД при необходимости:
```bash
docker exec -i sochi-portal_db_1 pg_restore -U sochi -d sochi_portal --clean < db.dump
```

## 3. Проверка по всем ролям (контроль доступа)

Роли в системе: **USER, PARTICIPANT, MODERATOR, ADMIN, SCANNER, TECH** (в БД присутствуют все).
Для каждой создавалась временная учётка, выполнялся реальный вход через next‑auth, затем
проверялись репрезентативные эндпоинты. После теста учётки удалены (в БД не осталось).

Модель прав (из кода `src/lib/acl*.ts`):
- `requireAdmin` → только **ADMIN/TECH**;
- `requirePermission(x)` → ADMIN/TECH всегда, **MODERATOR** — если есть право `x`, иначе отказ;
- `requireAdminOrModerator` → ADMIN/MODERATOR/TECH;
- `requireEndUser` → USER/PARTICIPANT/ADMIN/MODERATOR (блокирует **SCANNER** и **TECH**);
- `requireUser` → любой вошедший.

**Результаты (HTTP‑коды):**

| Роль | сессия | `/api/admin/backup` (requireAdmin) | `/api/admin/stats` (requirePermission) | `/api/user/notifications` (requireUser) |
|------|--------|:---:|:---:|:---:|
| аноним | — | 401 | 401 | 401 |
| USER | USER | 403 | 403 | 200 |
| PARTICIPANT | PARTICIPANT | 403 | 403 | 200 |
| MODERATOR (без прав) | MODERATOR | 403 | 403 | 200 |
| ADMIN | ADMIN | **200** | **200** | 200 |
| SCANNER | SCANNER | 403 | 403 | 200 |
| TECH | TECH | **200** | **200** | 200 |

**Вывод:** контроль доступа корректен и enforced на сервере. Повышения привилегий нет:
админ‑эндпоинты доступны только ADMIN/TECH; permission‑gated закрыт для MODERATOR без нужного
права; аноним везде получает 401. Это соответствует заявленной модели прав.

> `requireEndUser` (блокировка SCANNER/TECH для бронирований/заявок) проверена по коду —
> эти операции POST‑only, поэтому вживую (без изменения данных) не дёргались.

## 4. Усиление безопасности (применено)

Правки на сервере (с бэкапом конфигов, проверкой `nginx -t`, `systemctl reload nginx`):

1. **`server_tokens off;`** в `/etc/nginx/nginx.conf` — скрыта версия (`Server: nginx/1.22.1` → `nginx`).
2. В сайте `sochi-portal` на уровне `server`:
   - **`proxy_hide_header X-Powered-By;`** — убран `X-Powered-By: Next.js`;
   - **`add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;`** — добавлен отсутствовавший заголовок.

Проверка после: все прежние заголовки (HSTS, CSP, X‑Frame‑Options: DENY, X‑Content‑Type‑Options,
Referrer‑Policy, `no‑store`) на месте; добавился Permissions‑Policy; версия и стек скрыты.

**Оценка сканера: было B (85/100) → стало A (91/100).** Отчёт: [`../../reports/young.idivles.ru.md`](../../reports/young.idivles.ru.md).

## 5. Осталось (рекомендации, требуют изменений в приложении)

- **Y‑1 (средний): CSP `'unsafe-inline'`/`'unsafe-eval'`.** Перейти на nonce‑CSP в Next.js
  (middleware выдаёт `nonce`, `script-src 'nonce-…' 'strict-dynamic'`). Внедрять через
  `Content-Security-Policy-Report-Only`. Не применял на сервере — это правка кода/сборки,
  нужен тест, чтобы не сломать Яндекс.Метрику/встраивания.
- **Y‑5 (инфо): `/.well-known/security.txt`.** Готовый шаблон — `fixes/well-known/security.txt`;
  нужен реальный контакт для связи по безопасности (не стал публиковать заглушку).

## 6. Откат изменений (если понадобится)

```bash
# nginx-конфиги
cp /root/backups/sochi-portal/nginx-2026-08-09_083607/nginx.conf.bak /etc/nginx/nginx.conf
cp /root/backups/sochi-portal/nginx-2026-08-09_083607/sochi-portal.bak /etc/nginx/sites-available/sochi-portal
nginx -t && systemctl reload nginx
```

> **Update 2026-08-09:** `Permissions-Policy` for young.idivles.ru changed to `camera=(self)` so `/scanner` can use the device camera; mic/payment/usb remain blocked.
