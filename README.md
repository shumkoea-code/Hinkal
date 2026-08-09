# Hinkal — учебный проект по анализу безопасности сайта

Проект по изучению сайта [hinkalnayaureki.ru](https://hinkalnayaureki.ru/) («Хинкальная у реки», Сочи)
и разбору его уязвимостей. Цель — научиться проводить базовый аудит веб‑ресурса, найти проблемы
безопасности и подготовить готовые к применению исправления.

> ⚠️ **Важно об этике и законности.** Все проверки в этом проекте — **пассивные** и неинвазивные:
> используются только те данные, которые сайт и так отдаёт обычному браузеру (HTTP‑заголовки ответа,
> TLS‑сертификат, публичный HTML/JS, файлы `robots.txt` и т.п.). **Никаких атак, сканеров, брутфорса,
> фаззинга или попыток эксплуатации** против рабочего сервера не выполнялось. Любое активное
> тестирование (сканирование портов, тесты на SQL‑инъекции/XSS, нагрузочные тесты) допустимо только
> для сайта, которым вы владеете или на который у вас есть письменное разрешение.

## Структура репозитория

| Путь | Что внутри |
|------|-----------|
| [`security/01-goals.md`](security/01-goals.md) | Цель и задачи проекта |
| [`security/02-methodology.md`](security/02-methodology.md) | Методология, границы (scope) и правила проверки |
| [`security/03-findings.md`](security/03-findings.md) | Найденные проблемы с оценкой критичности и доказательствами |
| [`security/04-remediation.md`](security/04-remediation.md) | Как исправить каждую проблему |
| [`security/05-checklist.md`](security/05-checklist.md) | Чек‑лист для более глубокого (авторизованного) тестирования владельцем |
| [`fixes/nginx/hinkalnayaureki.conf`](fixes/nginx/hinkalnayaureki.conf) | Готовый усиленный конфиг nginx (security‑заголовки, TLS, CSP) |
| [`fixes/well-known/security.txt`](fixes/well-known/security.txt) | Шаблон `/.well-known/security.txt` |
| [`tools/websec-scan.sh`](tools/websec-scan.sh) | **Полный** пассивный сканер: TLS, заголовки, cookies, CORS, методы, утечки, 404 → оценка + Markdown-отчёт. Принимает любой сайт (аргументом или интерактивно) |
| [`tools/check-headers.sh`](tools/check-headers.sh) | Быстрый скрипт для повторной пассивной проверки заголовков |
| [`reports/`](reports/) | Готовые Markdown-отчёты сканера (напр. [`hinkalnayaureki.ru.md`](reports/hinkalnayaureki.ru.md)) |

## Краткий итог (TL;DR)

Сайт — это статический SPA на Vite + React, который отдаётся через `nginx/1.18.0 (Ubuntu)`.
Само приложение по HTTP выглядит корректно (HTTPS работает, есть редирект с 80 на 443,
валидный сертификат Let's Encrypt). Основные проблемы — на уровне конфигурации веб‑сервера:

- отсутствуют базовые заголовки безопасности (HSTS, CSP, `X-Content-Type-Options`,
  `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`);
- сервер раскрывает точную версию (`nginx/1.18.0 (Ubuntu)`);
- SPA‑fallback возвращает `index.html` с кодом `200` на любые несуществующие пути
  (в т.ч. `/sitemap.xml`, `/.well-known/security.txt`) вместо честного `404`;
- версия nginx 1.18.0 устарела и требует обновления.

Все находки и способы их устранения подробно описаны в [`security/`](security/).
Готовые исправления лежат в [`fixes/`](fixes/).

## Как пользоваться

### Полная проверка любого сайта

```bash
# проверить конкретный сайт и сохранить отчёт в reports/<host>-<дата>.md
bash tools/websec-scan.sh https://hinkalnayaureki.ru

# спросит URL интерактивно
bash tools/websec-scan.sh

# указать файл отчёта / пропустить проверку утечек / без цвета
bash tools/websec-scan.sh -o report.md --skip-files --no-color https://example.com
```

Сканер проверяет: редирект HTTP→HTTPS, TLS (издатель, срок, протоколы 1.0–1.3),
заголовки безопасности (HSTS, CSP, X-Content-Type-Options, X-Frame-Options/frame-ancestors,
Referrer-Policy, Permissions-Policy, COOP/CORP), раскрытие версии ПО, флаги cookies
(Secure/HttpOnly/SameSite), CORS, HTTP-методы (в т.ч. TRACE), публичные файлы,
поведение 404, листинг каталогов, типовые «утекшие» файлы (`.git`, `.env`, …)
с корректным отсевом SPA-fallback, и смешанный контент. На выходе — оценка A–F и Markdown-отчёт.

### Проверка со входом (для своего сайта)

Сайт использует вход по номеру телефона и SMS-коду (`/api/auth/send-code` → `/api/auth/verify-code`,
далее `Authorization: Bearer <token>`). Сканер умеет логиниться и проверять API уже под сессией.

```bash
# 1) запросить SMS-код (придёт на телефон)
bash tools/websec-scan.sh --send-code-only --login 89001234567 https://hinkalnayaureki.ru

# 2) войти с кодом и выполнить авторизованные проверки
bash tools/websec-scan.sh --login 89001234567 --code 1234 --skip-send https://hinkalnayaureki.ru

# либо одной командой (спросит код интерактивно):
bash tools/websec-scan.sh --login 89001234567 https://hinkalnayaureki.ru

# либо с готовым токеном, без SMS:
bash tools/websec-scan.sh --token "<bearer>" https://hinkalnayaureki.ru
```

Авторизованный режим **только читает** и проверяет: что вход по коду работает; что защищённые
эндпоинты (`/api/loyalty/balance`, `/api/order/my`) требуют токен; что неверный токен отклоняется;
что обычный пользователь **не** имеет доступа к `/api/admin/*` (broken access control); а также
хранение токена, кэширование приватных данных и CORS на API. Заказы и оплаты (`/api/order/create`,
`/api/pay/tinkoff/init`) **не** вызываются.

### Исправление найденного

1. Прочитайте [`security/01-goals.md`](security/01-goals.md) → [`security/03-findings.md`](security/03-findings.md).
2. Примените конфиг из [`fixes/nginx/hinkalnayaureki.conf`](fixes/nginx/hinkalnayaureki.conf)
   (сначала в режиме `Content-Security-Policy-Report-Only`, см. комментарии в файле).
3. Перепроверьте: `bash tools/websec-scan.sh https://hinkalnayaureki.ru`.
