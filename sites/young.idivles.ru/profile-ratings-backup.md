# Profile UX + portfolio download + Telegram Abracadabra backup

## UI
- Рейтинги (Ур / А / С / Э) всегда **в одну строку** (`flex-wrap: nowrap`, компактные чипы).
- Публичный профиль: кольца прогресса под шапкой; убран дубль заголовка «Галерея».
- Одобренное портфолио: кнопки **Смотреть** и **Скачать** на профиле и в действиях.

## Telegram backup
Фраза (точно): `Абракадабра, Евгений Шумко!`

Только для chat ID из настроек оповещений или `ADMIN.telegramChatId`.  
Webhook ставит заявку в `data/backup-requests/`; cron каждую минуту (`/etc/cron.d/sochi-tg-backup`) собирает:
- `pg_dump` БД
- tar.gz проекта (+ `.env` внутри архива)
и шлёт документы в тот же чат. Кулдаун 30 мин.

## Deploy
Image: `sochi-portal_web:profile-ratings-backup`
