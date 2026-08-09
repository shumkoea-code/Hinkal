# MAX-бот: починка и логика (2026-08-09)

Deploy: `sochi-portal_web:max-bot-fix` · бот https://max.ru/se13771314_bot

## Почему не работал
1. **Битый PEM** корня Минцифры → TLS к `platform-api2.max.ru` падал.
2. Личные сообщения слались как `chat_id` — в MAX диалог 1-на-1 адресуется по **`user_id`**.
3. Вебхук не был подписан (`subscriptions: []`); секрет должен совпадать с `^[a-zA-Z0-9_-]{5,256}$`.
4. Пользователь **обязан** открыть бота и нажать Start — иначе `dialog.not.found`.

## Что сделано
- Исправлен CA-bundle (`certs/russian_trusted_*.crt` → `russian_trusted_ca.pem`).
- Клиент `src/lib/max.ts`: api2, user_id, ensureWebhook, диагностика.
- Вебхук: `/start|/старт`, `/help`, `/status`, `/id`, `/applications`, `/bookings`, callback-кнопки.
- Уведомления сотрудникам в MAX при новых заявках/бронях (`max-moderation.ts`).
- Профиль: поле **MAX ID**; настройки: подсказки и перерегистрация вебхука.
- API: `GET/POST /api/admin/max` (status, ensureWebhook, test).

## Как пользоваться
1. Открыть https://max.ru/se13771314_bot → Start / «старт».
2. Бот пришлёт ваш MAX ID.
3. Вставить ID в профиль сайта или в «MAX user id получателей» в настройках.
4. Админка → Оповещения → «Зарегистрировать webhook MAX» при сбоях.

## Проверено
- `/me` ок, подписка на webhook активна.
- Отправка user_id=137836618 (уже стартовал бота) — OK.
- user_id=13771314 — `dialog.not.found` пока не откроет бота.
