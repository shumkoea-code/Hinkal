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
- `src/lib/telegram.ts` — `tgSend` / `tgSendRaw`
- правки: `admin/settings/page.tsx`, `api/user/profile/route.ts`, `dashboard/page.tsx`

### Ops-слой (watchdog)
`/etc/yp-watchdog.conf` — токен + chat id; systemd-таймер каждые 2 мин.  
**Проверено:** тестовое сообщение Telegram **доставлено** (`@Youngportalbot` → chat `8555955292`).

### Как добавить/убрать получателя
1. Получатель жмёт **Start** у `@Youngportalbot`.
2. Узнаёт свой chat id (`/start` у бота или через `@userinfobot`).
3. Вписывает id в профиле **или** админ правит список во вкладке «Оповещения» / в watchdog-конфиге.

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
```bash
cd /opt/sochi-portal
docker tag sochi-portal_web:pre-feat sochi-portal_web:latest
docker-compose up -d web
```

---

## Проверки после деплоя
- `/api/health` → `ok:true`, контейнер `healthy`
- CSP nonce на главной сохранён
- `/api/integrations/max/webhook` → `{"ok":true,"service":"max-webhook"}`
- `/admin/settings?tab=notifications` (под ADMIN) → секции Telegram и MAX видны
- Telegram test message → доставлено
