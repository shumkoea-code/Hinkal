# Полный аудит авторизации / регистрации / входа (2026-08-09)

Сайт: **young.idivles.ru** (sochi-portal). Деплой-тег: `sochi-portal_web:auth-hardening`.

## Карта потоков

| Поток | Точки входа | Хранение |
|---|---|---|
| Регистрация | `POST /api/register` → email OTP → `POST /api/verify` | `PendingUser` → `User` |
| Вход | `/login` → NextAuth Credentials (+ optional Yandex/VK) | JWT (`tokenVersion`, `mustChangePassword`) |
| Смена пароля | `/change-password`, профиль | `tokenVersion++` + `tokenKeepAlive` |
| Забыли пароль | `/forgot-password` → письмо → `/reset-password` | `VerificationToken` |
| Фраза | recovery phrase reset | `recoveryPhraseHash` |
| Админ | сброс пароля, заявки, audit-log | `AdminAuditLog` |

Защита: rate limit (login/register/verify/reset/phrase), captcha после 2 неудачных входов и на регистрацию, honeypot, proxy enforce `mustChangePassword` → `/change-password`.

## Критические находки и статус

### 1. Смена пароля ломала текущую сессию — **исправлено**
`POST /api/auth/change-password` делал `tokenVersion++` без `tokenKeepAlive`, клиент вызывал `update({ keepAlive: undefined })`. JWT получал `error: "revoked"` сразу после успешной смены (в т.ч. после админского temp-пароля).

**Фикс:** как у revoke-others — `newTokenKeepAlive()`, ответ с `keepAlive`, клиент `update({ keepAlive })`. То же для смены пароля в профиле (`PUT /api/user/profile` + dashboard).

### 2. Письма не настроены — **пропуск (не блокер)**
Если Resend/SMTP не готовы, отправка **пропускается**:
- регистрация сразу активирует аккаунт (`emailSkipped`);
- forgot-password предлагает фразу/админа без требования ключа.

См. `email-skip-when-unconfigured.md`. При появлении валидного ключа OTP/письма включаются сами.

### 3. `reset-password` по email — **исправлено**
Было `update({ where: { email: identifier } })` (хрупко к регистру). Стало: поиск `mode: 'insensitive'` → `update` по `id`, сброс `mustChangePassword`, `bcrypt` cost 12.

### 4. Сообщения ошибок входа — **исправлено**
Captcha fail раньше `return null` → всегда «Неверный логин/пароль». Теперь `throw new Error(message)`; логин показывает текст от authorize (rate-limit / блок / captcha).

### 5. После логина с `mustChangePassword` — **усилено**
Proxy уже редиректил на `/change-password`. Добавлен явный redirect в `/login` после успешного `signIn`.

### 6. Единый минимум пароля 8 — **сделано**
Register / reset / recovery / profile / UI `minLength`.

### 7. Forgot-password enumeration timing — **смягчено**
Короткий выравнивающий delay, если пользователь не найден; identifier = канонический `user.email`.

## Проверки после деплоя
- Страницы login/register/forgot/change → 200
- `POST /api/register` с паролем &lt; 8 → `Пароль должен быть минимум 8 символов`
- `POST /api/auth/reset-password` E2E: `mustChangePassword` → false, `tokenVersion` +1
- `change-password` route в образе содержит `keepAlive`
- Контейнер healthy

## Аккаунт z228007@yandex.ru
Активирован ранее; сейчас `mustChangePassword=false`. Если вход не проходит — админский сброс в карточке пользователя (временный пароль покажется один раз).

## Патчи
`sites/young.idivles.ru/code/auth-hardening/`
