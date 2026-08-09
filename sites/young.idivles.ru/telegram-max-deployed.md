# Telegram + MAX — что внедрено (2026‑08‑09)

Разделы A (Telegram в настройках/профиле) и полная заготовка MAX — **задеплоены** на
`young.idivles.ru`. Контейнер `healthy`, CSP/nonce сохранены.

---

## A. Telegram — в приложении

### Где в UI
- **Админка → Настройки → вкладка «Оповещения»**  
  (`/admin/settings?tab=notifications`)
  - токен бота (поле password, пусто = не менять);
  - список chat id (добавить/удалить/изменить — редактируемая textarea, CSV/по строкам);
  - чекбокс «Включить Telegram-оповещения»;
  - кнопки **«Отправить тест»** и **«Добавить мой Telegram из профиля»**.
- **Профиль пользователя** — поле **«Telegram chat ID (для уведомлений)»**  
  (рядом с публичной ссылкой `@username`). Сохраняется через `/api/user/profile`.

### Данные (Prisma + БД)
`SiteSettings`: `telegramBotToken`, `telegramAlertChatIds`, `telegramAlertsEnabled`  
`User`: `telegramChatId`, `telegramLinkedAt`

### Код
- `src/lib/telegram.ts` — `tgSend` / `tgSendRaw` / inline-кнопки / `tgSetWebhook`
- `src/lib/telegram-moderation.ts` — карточки заявок/броней, очередь, approve/reject
- `src/app/api/integrations/telegram/webhook/route.ts` — команды и callback-кнопки
- хуки: `notifyStaffNewBooking` → TG; `POST /api/applications` → TG
- UI: кнопка **«Подключить модерацию (вебхук)»** во вкладке «Оповещения»

### Модерация и согласования в Telegram (практично)
Новые **PENDING**-заявки и брони приходят в чат карточкой с кнопками:

| Кнопка / команда | Действие |
|------------------|----------|
| ✅ Одобрить | Статус `APPROVED` на сайте + уведомление пользователю (+ promote participant) |
| ❌ Отклонить | Статус `REJECTED`, причина «Отклонено через Telegram-бота» |
| Открыть в админке | Ссылка в `/admin/applications` или `/admin/bookings` |
| `/pending` | Очередь до 10 заявок + 10 броней с теми же кнопками |
| `/start` | Показать ваш chat ID |
| `/help` | Краткая справка |

Получатели: chat id из «Оповещения» **и** сотрудники (ADMIN/MODERATOR/TECH) с `telegramChatId` в профиле и правом `applications` / `bookings`.

**Проверено на проде:** вебхук зарегистрирован, `/pending` отдаёт очередь (2 demo-заявки + 1 бронь), callback approve на demo-заявке → `APPROVED` (затем возвращено в `PENDING`).

### Ops-слой (watchdog)
`/etc/yp-watchdog.conf` — токен + chat id; systemd-таймер каждые 2 мин.  
**Проверено:** тестовое сообщение Telegram **доставлено** (`@Youngportalbot` → chat `8555955292`).

### Как добавить/убрать получателя
1. Получатель жмёт **Start** у `@Youngportalbot`.
2. Узнаёт свой chat id (`/start` у бота).
3. Вписывает id в профиле **или** админ правит список во вкладке «Оповещения».
4. Админ один раз жмёт **«Подключить модерацию (вебхук)»** (уже сделано: `https://young.idivles.ru/api/integrations/telegram/webhook`).

---

## B. MAX — полная настройка (код готов, запуск ждёт токен юрлица)

### Что уже на сервере
| Компонент | Статус |
|-----------|--------|
| Поля `SiteSettings`: `maxBotToken`, `maxWebhookSecret`, `maxAlertChatIds`, `maxBotEnabled` | ✅ в БД |
| Поля `User`: `maxUserId`, `maxLinkedAt` | ✅ в БД |
| `src/lib/max.ts` — отправка + регистрация вебхука (`platform-api2.max.ru`) | ✅ |
| Вебхук `GET/POST /api/integrations/max/webhook` | ✅ жив (`{"ok":true,"service":"max-webhook"}`) |
| UI во вкладке «Оповещения»: токен, секрет, chat ids, enable, «Тест MAX», «Зарегистрировать вебхук» | ✅ |
| Корневой CA Минцифры в контейнере (`NODE_EXTRA_CA_CERTS=/app/certs/russian_trusted_ca.pem`) | ✅ |
| ACL на действия (ADMIN/TECH или MODERATOR с правом applications/bookings) | ✅ в коде вебхука |

### Команды бота MAX (после включения)
- `/start` — показать MAX user id для привязки в профиле  
- `/help`, `/status`  
- `/applications` — список PENDING-заявок (для сотрудников)  
- `/app_ok_<id>` / `/app_no_<id>` — одобрить/отклонить заявку  
- `/book_ok_<id>` / `/book_no_<id>` — то же для броней  

### Как включить MAX (когда будет токен)
1. Верифицировать организацию (юрлицо РФ) в MAX → получить **бот-токен**.
2. Админка → Оповещения → вставить токен + секрет вебхука → включить → **Сохранить**.
3. Нажать **«Зарегистрировать вебхук»** (URL: `https://young.idivles.ru/api/integrations/max/webhook`).
4. В профиле сотрудников указать `maxUserId` (после `/start` у бота).
5. Тест: кнопка «Тест MAX» + команды в чате бота.

> Пока `maxBotEnabled=false` и токена нет — вебхук отвечает, но не выполняет действий (inert).

---

## Откат
Образ до фичи: `sochi-portal_web:pre-feat`  
Бэкап файлов: `/root/backups/sochi-portal/feat-2026-08-09_101216/`  
Бэкап до TG-модерации: `/root/backups/tg-mod-*`
```bash
cd /opt/sochi-portal
docker tag sochi-portal_web:pre-feat sochi-portal_web:latest
docker-compose up -d web
```

---

## Проверки после деплоя
- `/api/health` → `ok:true`, контейнер `healthy`
- CSP nonce на главной сохранён
- `/api/integrations/telegram/webhook` → `{"ok":true,"service":"telegram-webhook"}`
- `/api/integrations/max/webhook` → `{"ok":true,"service":"max-webhook"}`
- `/admin/settings?tab=notifications` (под ADMIN) → Telegram + кнопка «Подключить модерацию»
- Telegram: сообщение «Модерация подключена» + `/pending` → очередь с кнопками
- Callback approve на demo-заявке меняет статус на `APPROVED`
