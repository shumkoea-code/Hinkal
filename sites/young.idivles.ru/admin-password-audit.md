# Регистрация, почта, сброс пароля и аудит админов (2026-08-09)

## Почему не регистрировался z228007@yandex.ru
1. Регистрация создаёт `PendingUser` и шлёт код через **Resend**.
2. В логах: `[EMAIL][resend] fail: API key is invalid`.
3. В `.env` нет `RESEND_API_KEY`; в `SiteSettings.smtpPass` ключ длиной 16 (невалидный).
4. Старый код при ошибке почты **удалял** заявку → пользователь застревал в цикле.

## Что сделано
- При ошибке почты заявка **сохраняется** (`emailDeliveryFailed: true`).
- Админка: `/admin/pending-users` — активировать / повторить письмо.
- Сброс пароля: карточка пользователя → «Сброс пароля» (`POST /api/admin/users/[id]/reset-password`), сессии сбрасываются (`tokenVersion++`), `mustChangePassword=true`.
- Журнал: `/admin/audit-log` + модель `AdminAuditLog` (пароли в лог не пишутся).
- Также логируются смена роли и блок/разблок.

## Что нужно админу для почты
В **Настройки → почта** или `.env` задать валидный `RESEND_API_KEY` (и `RESEND_FROM=noreply@young.idivles.ru`).

## Восстановление z228007@yandex.ru
Аккаунт активирован вручную после сбоя почты; выдан временный пароль с принудительной сменой при входе.

## Связанный полный аудит
См. [auth-full-audit.md](./auth-full-audit.md) — keepAlive на смене пароля, hardening login/reset, деплой `auth-hardening`.
