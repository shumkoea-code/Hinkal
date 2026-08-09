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
| [`tools/check-headers.sh`](tools/check-headers.sh) | Скрипт для повторной пассивной проверки заголовков |

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

1. Прочитайте [`security/01-goals.md`](security/01-goals.md) → [`security/03-findings.md`](security/03-findings.md).
2. Примените конфиг из [`fixes/nginx/hinkalnayaureki.conf`](fixes/nginx/hinkalnayaureki.conf)
   (сначала в режиме `Content-Security-Policy-Report-Only`, см. комментарии в файле).
3. Проверьте результат: `bash tools/check-headers.sh https://hinkalnayaureki.ru`.
