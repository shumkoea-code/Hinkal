# Почта не настроена — пропускаем отправку (2026-08-09)

Если исходящая почта **не готова** (нет `RESEND_API_KEY` / короткий placeholder в `smtpPass` / SMTP недоступен), портал **не требует** настраивать ключ и не блокирует пользователей.

## Поведение
| Поток | Если почта не готова |
|---|---|
| Регистрация | OTP-письмо пропускается, аккаунт сразу активируется (`emailSkipped: true`, `requiresVerification: false`) |
| Forgot password | `503` + подсказка: фраза восстановления или админ (без требования задать Resend) |
| Повтор кода админом | Предлагает активировать заявку вручную |
| `sendEmail()` | `{ success:false, skipped:true, error:'email_not_configured' }` |

Готовность: `isOutboundEmailReady()` в `src/lib/email.ts` (ключ ≥ 20 символов).

Деплой-тег: `sochi-portal_web:email-skip`.
