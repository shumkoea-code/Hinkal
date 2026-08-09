# Отчёт по безопасности — young.idivles.ru

- **Цель:** https://young.idivles.ru
- **Дата:** 2026-08-09 06:22:25 UTC
- **Метод:** пассивный неинвазивный аудит (только GET/HEAD/OPTIONS)
- **Инструмент:** websec-scan.sh

## Итоговая оценка: A (100/100)

| Уровень | Кол-во проблем |
|---------|----------------|
| Высокие | 0 |
| Средние | 0 |
| Низкие  | 0 |

## Подробные результаты

| Статус | Уровень | Проверка | Детали |
|--------|---------|----------|--------|
| OK | MED | Редирект HTTP→HTTPS | Location: https://young.idivles.ru/ |
| INFO | INFO | TLS-сертификат: издатель | C = US, O = Let's Encrypt, CN = YE2 |
| OK | LOW | Срок сертификата | ещё 83 дн. (Oct 31 14:49:50 2026 GMT) |
| OK | LOW | Протокол TLS 1.2 | поддерживается |
| OK | LOW | Протокол TLS 1.3 | поддерживается |
| OK | LOW | HSTS | max-age=31536000; includeSubDomains |
| OK | LOW | Content-Security-Policy | script-src строгий (nonce/strict-dynamic); style-src 'unsafe-inline' — допустимо |
| OK | LOW | X-Content-Type-Options | nosniff |
| OK | LOW | Защита от кликджекинга | DENY |
| OK | LOW | Referrer-Policy | strict-origin-when-cross-origin |
| OK | LOW | Permissions-Policy | camera=(), microphone=(), geolocation=(), payment=(), usb=() |
| INFO | INFO | cross-origin-opener-policy | не задан (опционально) |
| INFO | INFO | cross-origin-resource-policy | не задан (опционально) |
| OK | LOW | Заголовок Server | nginx (без версии) |
| INFO | INFO | Set-Cookie | куки не устанавливаются на главной |
| OK | INFO | CORS | Access-Control-Allow-Origin не выставляется |
| OK | LOW | Метод TRACE | отключён (код 405) |
| OK | INFO | robots.txt | присутствует (/robots.txt) |
| OK | INFO | sitemap.xml | присутствует (/sitemap.xml) |
| OK | LOW | security.txt | присутствует (реальный файл) |
| OK | LOW | Несуществующий путь | → 404 |
| OK | LOW | Листинг каталогов | не обнаружен |
| OK | LOW | Типовые утечки | ни один из 14 путей не отдал реальный файл |
| OK | LOW | Mixed content | явных http:// ресурсов в HTML не найдено |

## Легенда

- **FAIL** — проблема, которую нужно исправить.
- **WARN** — потенциальная проблема / требует внимания.
- **OK** — проверка пройдена.
- **INFO** — информационная запись.

> ⚠️ Аудит пассивный: проверялась только видимая снаружи поверхность.
> Backend/API и обработка персональных данных требуют отдельной
> авторизованной проверки на тестовом стенде.
