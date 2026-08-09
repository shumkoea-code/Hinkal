# Telegram-настройки в приложении + бот для MAX — дизайн, логика и план внедрения

Дата: 2026‑08‑09. Цель: (A) управлять Telegram-оповещениями из настроек сайта и профиля;
(B) продумать/подготовить бота для мессенджера MAX для оповещений и работы модераторов/админов.

> ✅ **Статус: внедрено и задеплоено** (см. [`telegram-max-deployed.md`](telegram-max-deployed.md)).
> Telegram-доставка проверена. MAX-код и вебхук готовы; включение ждёт бот-токен юрлица.

---

## 0. Что уже работает сейчас (ops-слой, без изменений приложения)

Оповещения о доступности сайта уже включены через watchdog (`tools/yp-watchdog.sh`,
systemd-таймер каждые 2 мин). Токен и id заданы в `/etc/yp-watchdog.conf` (права 600):
- `ALERT_TG_TOKEN` — токен бота (задан: `@Youngportalbot`).
- `ALERT_TG_CHAT` — **список** chat id через запятую → это и есть «добавить/удалить/изменить id»
  на уровне инфраструктуры (просто редактируется строка).

> ⚠️ **Действие от владельца:** чтобы Telegram доставлял сообщения, каждый получатель должен
> один раз нажать **Start** у бота `@Youngportalbot` (Telegram запрещает боту писать первым —
> сейчас API отвечает `chat not found` для id `8555955292`, пока не нажат Start).

---

## A. Управление Telegram из настроек сайта и профиля (в приложении)

### A.1 Модель данных (Prisma) — аддитивно, безопасно (`prisma db push`)
```prisma
model SiteSettings {
  // ...
  telegramBotToken      String?   // токен бота (только сервер, не отдаётся в клиент)
  telegramAlertChatIds  String?   // CSV chat id для системных оповещений
  telegramAlertsEnabled Boolean   @default(false)
}
model User {
  // ...
  telegramChatId  String?   // numeric chat id пользователя (для личных уведомлений в TG)
  telegramLinkedAt DateTime?
}
```

### A.2 Библиотека отправки — `src/lib/telegram.ts`
```ts
import { prisma } from '@/lib/prisma';
export async function tgSend(text: string, chatIds?: string[]) {
  const s = await prisma.siteSettings.findUnique({ where: { id: '1' } });
  const token = s?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!token || s?.telegramAlertsEnabled === false) return;
  const ids = (chatIds ?? (s?.telegramAlertChatIds || '').split(','))
    .map(x => x.trim()).filter(Boolean);
  await Promise.allSettled(ids.map(id =>
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: id, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    })));
}
```

### A.3 Настройки сайта — вкладка «Оповещения»
Файл `src/app/admin/settings/page.tsx` (server action с `prisma.siteSettings.upsert` ~стр. 217):
- в сборку `data` из `formData` добавить `telegramBotToken`, `telegramAlertChatIds`,
  `telegramAlertsEnabled` (для вкладки `notifications`);
- **CRUD id** реализуется как редактируемый список (textarea «один id на строку» → на сохранении
  нормализуем в CSV). Добавить/удалить/изменить = отредактировать строки. Просто и надёжно в SSR-форме.
- **Кнопка «Отправить тест»** — отдельная server action → `tgSend('Проверка связи', ...)`.
- **Безопасность:** токен рендерить как `placeholder`/masked, не выводить значение в HTML;
  доступ только `requireAdminPage()` (уже есть). Токен не попадает в клиентский бандл.

### A.4 Привязка Telegram в профиле
- Файл `src/app/api/user/profile/route.ts`: в `profileSchema` добавить
  `telegramChatId: z.string().regex(/^\d{5,15}$/).optional().or(z.literal('')).nullable()`;
  в маппинг (`updateData`, ~стр. 245 рядом с `telegramUrl`) —
  `if (data.telegramChatId !== undefined) updateData.telegramChatId = data.telegramChatId || null;`
  и `telegramLinkedAt = new Date()`.
- В UI профиля добавить поле «Telegram chat id» + подсказку «как узнать id» (напр. через
  `@userinfobot` или наш бот по команде `/start` — см. A.6).

### A.5 «Привязать из профиля» в настройках
- В настройках (для админа) кнопка **«Добавить мой Telegram»**: server action читает
  `session.user` → его `telegramChatId` из БД → добавляет в `telegramAlertChatIds`, если задан.
- Аналогично можно массово: «добавить всех админов/модераторов с привязанным telegramChatId».

### A.6 (Опционально) авто-привязка через бота
Вебхук/поллинг бота: на `/start` бот отвечает пользователю его `chat.id`, а пользователь вставляет
его в профиль. Либо one-time deep link `t.me/Youngportalbot?start=<userToken>` → бот сохраняет
`telegramChatId` для пользователя автоматически (нужен вебхук-эндпоинт, см. раздел про MAX — механика та же).

### A.7 Куда слать (триггеры оповещений)
Использовать `tgSend()` в существующих местах бизнес-логики:
- новая заявка (`/api/applications`, `/api/bookings`) → уведомить дежурных админов/модераторов;
- новое сообщение на модерацию (`moderation`) → уведомить с правом `moderation`;
- системные события (режим обслуживания, ошибки) — уже есть `createUserNotification`; добавить TG.

### A.8 План внедрения (1 сборка)
1. `prisma db push` (аддитивно) — 2 поля в SiteSettings, 2 в User.
2. `src/lib/telegram.ts` + правки settings/profile.
3. `docker-compose build web && up -d` (есть swap; откат — образ `pre-*`, бэкап кода).
4. Проверка: вкладка «Оповещения» сохраняет токен/ids, «тест» доходит; профиль сохраняет chat id.

---

## B. Бот для мессенджера MAX (max.ru) — изучение возможности + дизайн

### B.1 Возможность (по документации dev.max.ru, 2026)
- **Bot API есть.** База: `https://platform-api2.max.ru` (миграция с `platform-api.max.ru`),
  токен в заголовке `Authorization`. Методы: `messages`, `chats`, `subscriptions`, `uploads`.
- **Вебхуки** (продакшн): `POST /subscriptions` с `url` (HTTPS, доверенный CA — Let's Encrypt подходит)
  и `secret` → приходят `Update` на наш endpoint; проверяем заголовок `X-Max-Bot-Api-Secret`.
  Long polling — только для разработки.
- **SDK:** TypeScript `@dementevdev/maxbot-ts` (webhook/inline keyboards/фильтры) — подходит для Next.
- ⚠️ **Комплаенс (важно):** с августа 2026 публиковать ботов в MAX можно **только через
  верифицированные юрлица РФ**. Центр развития молодёжи — муниципальное юрлицо, т.е. потенциально
  проходит, но нужна регистрация/верификация организации в MAX и получение **бот-токена**.
- ⚠️ **Инфра:** для исходящих запросов к `platform-api2.max.ru` с сервера нужен **корневой сертификат
  Минцифры** в доверенных (иначе TLS-ошибка `SELF_SIGNED_CERT_IN_CHAIN`). Установить на VPS/в контейнер.

**Вывод:** технически реализуемо и вписывается в текущий стек (Next.js API route + HTTPS + LE).
Блокеры для запуска — не код, а: (1) верификация юрлица в MAX и бот-токен, (2) CA Минцифры на сервере.

### B.2 Дизайн интеграции (логика и функции)

**Хранение (SiteSettings):** `maxBotToken`, `maxWebhookSecret`, `maxAlertChatIds`, `maxEnabled`.
**Связь пользователей:** `User.maxUserId String?` (+ `maxLinkedAt`). Привязка — через deep-link/`/start`
с одноразовым токеном (как в A.6), чтобы сопоставить MAX-пользователя с ролью на портале.

**Исходящие оповещения** — `src/lib/max.ts` (аналог `tgSend`):
```
POST https://platform-api2.max.ru/messages   Authorization: <token>
{ chat_id, text }   // + inline keyboard для действий
```
Слать те же события, что и в Telegram (новые заявки, модерация, падения — через watchdog по HTTP).

**Входящие (вебхук)** — `src/app/api/integrations/max/webhook/route.ts`:
1. Проверить `X-Max-Bot-Api-Secret` == `maxWebhookSecret` (иначе 401).
2. Разобрать `Update` (сообщение/командa/callback от кнопки).
3. Определить пользователя по `maxUserId` → его роль на портале.
4. **Авторизация действий по существующей ACL** (переиспользуем `src/lib/acl-shared.ts`):
   - только `ADMIN/TECH` или `MODERATOR` с нужным правом (`applications`, `bookings`, `moderation`).
5. Выполнить действие через уже существующие сервисы/эндпоинты:
   - `/заявки` → список ожидающих (из `/api/applications`), кнопки **Одобрить/Отклонить**
     (маппинг на существующую логику заявок; запись действия в журнал);
   - `/бронь` → подтвердить/отклонить booking;
   - `/модерация` → показать сообщения на модерации, кнопки **Скрыть/ОК/Бан** (существующий
     `moderation`-функционал);
   - `/статус` → здоровье сайта (проксирует `/api/health`).
6. Ответить сообщением/обновлением клавиатуры.

**Команды (пример):**
`/start` (привязка), `/help`, `/status`, `/applications`, `/bookings`, `/moderation`.
**Callback-кнопки:** `app:approve:<id>`, `app:reject:<id>`, `mod:hide:<id>`, `book:confirm:<id>` …
Каждое действие: проверка роли/права → изменение в БД (через сервисный слой, транзакция) →
запись в аудит → уведомление автору заявки.

**Безопасность:** секрет вебхука; проверка подписи; строгая ACL на каждое действие; rate-limit;
идемпотентность callback (защита от повторов); токен только на сервере.

### B.3 План внедрения MAX (после получения токена)
1. Владелец: верификация организации в MAX → бот-токен.
2. На сервер: добавить корневой CA Минцифры (в контейнер web) для исходящего TLS.
3. Реализовать `src/lib/max.ts` + вебхук-роут + поля SiteSettings/User + `POST /subscriptions`.
4. Тест на «песочнице»/тест-чате, затем прод.

---

## Что нужно от владельца
- **Telegram сейчас:** нажать **Start** у `@Youngportalbot` с нужных аккаунтов (иначе доставки нет).
- **Разрешение** на 1 сборку-деплой для внедрения раздела A (настройки+профиль) — готово к реализации.
- **Для MAX:** верифицировать организацию в MAX и прислать **бот-токен** + разрешение поставить CA Минцифры.
