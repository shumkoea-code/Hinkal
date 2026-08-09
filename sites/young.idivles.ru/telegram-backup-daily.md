# Telegram-бэкап: Abracadabra + ежедневная отправка админу

Дата: 2026-08-09

## Что сломалось

1. Каталог `/opt/sochi-portal/data/backup-requests` был от `root`, контейнер `web` пишет от uid `1000` → **EACCES**, webhook отдавал **500**, фраза «Абракадабра…» молчала.
2. Скрипт хоста не видел токен в `.env` (`TELEGRAM_BOT_TOKEN` пуст; токен только в `SiteSettings`).
3. Упаковка `.env` через `tar -rzf` в уже сжатый `.tar.gz` падала (`Cannot update compressed archives`) → запрос уходил в `failed`, файлы не слались.

## Что сделано

- Права `data/backup-requests` → uid 1000, cron чинит владельца перед обработкой.
- `TELEGRAM_BOT_TOKEN` / `ALERT_TG_*` синхронизированы из БД в `.env` для хост-скриптов.
- Исправлен `scripts/process-tg-backup-requests.sh` (токен + tar одной проходкой).
- Добавлен `scripts/daily-tg-backup.sh` + cron каждый час (проверка часа МСК).
- Настройки в БД: `dailyBackupEnabled`, `dailyBackupChatId`, `dailyBackupHour`.
- UI: Админка → Настройки → Оповещения → «Ежедневный бэкап в Telegram».
- Очередь enqueue с try/catch (без 500 наружу).

## Как пользоваться

### Разовая фраза
В бот **Young.Portal** от авторизованного chat ID:

`Абракадабра, Евгений Шумко!`

Ответ «принята» → в течение минуты приходят dump + full archive + manifest. Кулдаун 30 мин.

Авторизованы: chat ID из «получатели оповещений», `dailyBackupChatId`, либо `User.telegramChatId` у ADMIN.

### Ежедневно
Только **один** выбранный chat ID (`dailyBackupChatId`), час МСК (`dailyBackupHour`, по умолчанию 3).

Сейчас на проде: enabled, chat `8555955292`, час `3`.

### Проверка на сервере

```bash
tail -50 /var/log/sochi-tg-backup.log
ls -lah /var/backups/sochi-portal/tg/
ls /opt/sochi-portal/data/backup-requests/{done,failed}
```

Cron: `/etc/cron.d/sochi-tg-backup`
