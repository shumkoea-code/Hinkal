# Отчёт по безопасности — hinkalnayaureki.ru

- **Цель:** https://hinkalnayaureki.ru
- **Дата:** 2026-08-09 04:54:16 UTC
- **Метод:** пассивный аудит + авторизованные проверки API (только чтение; без создания заказов/оплат)
- **Роль учётной записи:** guest
- **Инструмент:** websec-scan.sh

## Итоговая оценка: F (39/100)

| Уровень | Кол-во проблем |
|---------|----------------|
| Высокие | 0 |
| Средние | 7 |
| Низкие  | 6 |

## Подробные результаты

| Статус | Уровень | Проверка | Детали |
|--------|---------|----------|--------|
| OK | MED | Редирект HTTP→HTTPS | Location: https://hinkalnayaureki.ru/ |
| INFO | INFO | TLS-сертификат: издатель | C = US, O = Let's Encrypt, CN = YR1 |
| OK | LOW | Срок сертификата | ещё 59 дн. (Oct  7 08:57:52 2026 GMT) |
| OK | LOW | Протокол TLS 1.2 | поддерживается |
| OK | LOW | Протокол TLS 1.3 | поддерживается |
| FAIL | MED | HSTS (Strict-Transport-Security) | отсутствует |
| FAIL | MED | Content-Security-Policy | отсутствует |
| FAIL | LOW | X-Content-Type-Options | отсутствует (нужен nosniff) |
| FAIL | MED | Защита от кликджекинга | нет X-Frame-Options / frame-ancestors |
| FAIL | LOW | Referrer-Policy | отсутствует |
| FAIL | LOW | Permissions-Policy | отсутствует |
| INFO | INFO | cross-origin-opener-policy | не задан (опционально) |
| INFO | INFO | cross-origin-resource-policy | не задан (опционально) |
| WARN | LOW | Заголовок Server | раскрывает версию: nginx/1.18.0 (Ubuntu) |
| INFO | INFO | Set-Cookie | куки не устанавливаются на главной |
| OK | INFO | CORS | Access-Control-Allow-Origin не выставляется |
| OK | LOW | Метод TRACE | отключён (код 405) |
| INFO | INFO | SPA-fallback | неизвестные пути отдают index.html (200) — учтено при проверках |
| OK | INFO | robots.txt | присутствует (/robots.txt) |
| INFO | INFO | sitemap.xml | нет (/sitemap.xml → SPA-fallback 200) |
| WARN | LOW | security.txt | нет реального файла (канал для сообщений об уязвимостях, RFC 9116) |
| WARN | LOW | Несуществующий путь | → 200 (вероятно SPA-fallback; неизвестные пути должны давать 404) |
| OK | LOW | Листинг каталогов | не обнаружен |
| OK | LOW | Типовые утечки | не найдены (14 путей; 200-ответы — это SPA-fallback, не файлы) |
| OK | LOW | Mixed content | явных http:// ресурсов в HTML не найдено |
| OK | LOW | Вход по SMS-коду | verify-code → 200, токен получен, роль: guest |
| WARN | MED | Хранение токена | Bearer-токен хранится в localStorage — при XSS может быть украден (лучше httpOnly-cookie) |
| OK | LOW | GET /api/loyalty/balance (с токеном) | → 200 (доступ есть) |
| WARN | MED | Кэш /api/loyalty/balance | нет no-store/private — приватные данные могут кэшироваться (нет Cache-Control) |
| OK | LOW | GET /api/order/my (с токеном) | → 200 (доступ есть) |
| WARN | MED | Кэш /api/order/my | нет no-store/private — приватные данные могут кэшироваться (нет Cache-Control) |
| OK | LOW | Защита /api/loyalty/balance (без токена) | → 401 (требует авторизацию) |
| OK | LOW | Защита /api/order/my (без токена) | → 401 (требует авторизацию) |
| OK | LOW | Неверный токен | → 401 (отклонён) |
| OK | LOW | Контроль доступа /api/admin/stats | → 403 (закрыт для пользователя) |
| OK | LOW | Контроль доступа /api/admin/users | → 403 (закрыт для пользователя) |
| OK | LOW | Контроль доступа /api/admin/orders | → 403 (закрыт для пользователя) |
| OK | LOW | Контроль доступа /api/admin/menu | → 403 (закрыт для пользователя) |
| WARN | MED | CORS API | отражает произвольный Origin (https://evil.example) без Allow-Credentials — политика слишком широкая (риск при переходе на cookie-аутентификацию) |

## Легенда

- **FAIL** — проблема, которую нужно исправить.
- **WARN** — потенциальная проблема / требует внимания.
- **OK** — проверка пройдена.
- **INFO** — информационная запись.

> ⚠️ Аудит пассивный: проверялась только видимая снаружи поверхность.
> Backend/API и обработка персональных данных требуют отдельной
> авторизованной проверки на тестовом стенде.
