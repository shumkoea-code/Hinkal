# young.idivles.ru — план усиления безопасности и тестирования по ролям

**Сайт:** «Центр развития молодёжи Сочи. Официальный портал»
**Стек:** Next.js (App Router) за `nginx/1.22.1`, аутентификация — next-auth (`/api/auth/*`).
**VPS:** 176.124.204.53 (root, порт SSH **4488**).
**Дата:** 2026‑08‑09.

> ✅ **Статус: выполнено.** Доступ получен (SSH‑порт оказался 4488, не 22), сделан бэкап,
> проверены все роли, применено усиление заголовков. Итоги — в
> [`audit-results.md`](audit-results.md). Ниже — исходный план.

---

## 1. Текущее состояние (по пассивному аудиту)

Отчёт сканера: [`../../reports/young.idivles.ru.md`](../../reports/young.idivles.ru.md) — оценка **B (85/100)**.

**Уже хорошо:** HTTPS + редирект, валидный сертификат Let's Encrypt (TLS 1.2/1.3),
**HSTS**, подробный **CSP** с `frame-ancestors 'none'`/`object-src 'none'`/`base-uri`/`form-action`,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
`Cache-Control: private, no-store`, честный `404`, без листинга каталогов, без утечек файлов.

**Что улучшить:**

| # | Проблема | Уровень | Исправление |
|---|----------|---------|-------------|
| Y‑1 | CSP содержит `'unsafe-inline'` и `'unsafe-eval'` в `script-src` | Средний | перейти на nonce/hash‑CSP (см. §4) |
| Y‑2 | Нет заголовка `Permissions-Policy` | Низкий | добавить (см. `fixes/nginx/young.idivles.ru.conf`) |
| Y‑3 | Раскрыта версия: `Server: nginx/1.22.1` | Низкий | `server_tokens off` |
| Y‑4 | Раскрыт стек: `X-Powered-By: Next.js` | Низкий | `poweredByHeader:false` / `proxy_hide_header` |
| Y‑5 | Нет реального `/.well-known/security.txt` | Инфо | добавить файл (RFC 9116) |

## 2. Модель ролей и API (по статическому анализу бандла)

Роли (найдены в клиентском коде): **USER, MODERATOR, MANAGER, ADMIN**.
Аутентификация: next-auth, `/api/auth`, `/api/auth/signin`.

Наблюдаемые API‑эндпоинты (неполный список, часть подгружается в кабинете/админке):
`/api/auth/*`, `/api/user/bookings`, `/api/user/bookings/invite`, `/api/user/consent`,
`/api/user/eco`, `/api/user/games`, `/api/user/games/start`, `/api/user/notifications`,
`/api/user/presence`, `/api/user/push`, `/api/user/quick-access`, `/api/user/security`,
`/api/bookings`, `/api/friends`, `/api/calendar/ics`, `/api/views`.

> Полный список эндпоинтов и требуемые для каждого роли будут уточнены на сервере
> (маршруты `app/api/**/route.ts`) после получения доступа.

## 3. Проверка по ролям (матрица контроля доступа)

Цель — убедиться, что каждый эндпоинт доступен **только** нужным ролям, а privilege
escalation невозможен. Проверки только на чтение; изменяющие операции — на тестовых данных.

Для каждой роли (гость → USER → MODERATOR → MANAGER → ADMIN) проверить:

- [ ] Аноним не имеет доступа к `/api/user/*` и админ‑эндпоинтам (ожидается 401/403).
- [ ] USER видит только свои данные (нет IDOR: чужой `bookingId`/`userId` → 403/404).
- [ ] USER не имеет доступа к функциям MODERATOR/MANAGER/ADMIN (403).
- [ ] MODERATOR/MANAGER не имеют доступа к чисто админским эндпоинтам (403).
- [ ] ADMIN‑эндпоинты недоступны более низким ролям и требуют повторной проверки прав на сервере (не только скрытие пункта меню в UI).
- [ ] Прямой доступ к админ‑страницам по URL (не через меню) закрыт для не‑админов.
- [ ] Токен/сессия next-auth: cookie `Secure; HttpOnly; SameSite`; проверка CSRF на изменяющих запросах.

Инструмент: `tools/websec-scan.sh` умеет авторизованные проверки по Bearer/куке —
будет запущен под каждой ролью после получения тестовых учёток или их создания в БД.

## 4. Про CSP (Y‑1)

`'unsafe-inline'`/`'unsafe-eval'` ослабляют защиту от XSS. Для Next.js рекомендуется
nonce‑based CSP через middleware: генерировать `nonce` на каждый запрос, прокидывать в
`script-src 'nonce-...' 'strict-dynamic'` и в инлайновые скрипты. Это убирает
`'unsafe-inline'`. `'unsafe-eval'` часто нужен в dev/аналитике — проверить, требуется ли
он в проде (Яндекс.Метрика обычно работает без него). Внедрять поэтапно через
`Content-Security-Policy-Report-Only`, затем переключать.

## 5. План резервной копии (выполнить на сервере)

Снять ПЕРЕД любыми изменениями, сохранить в `/root/backups/<дата>/`:

```bash
D=/root/backups/$(date +%F_%H%M%S); mkdir -p "$D"
# 1) конфигурация nginx
tar czf "$D/nginx.tgz" /etc/nginx
# 2) код приложения (путь уточнить), без node_modules/.next
tar czf "$D/app.tgz" --exclude node_modules --exclude .next -C /var/www young.idivles.ru
# 3) окружение/секреты приложения (.env) — хранить безопасно
cp /var/www/young.idivles.ru/.env "$D/env.backup" 2>/dev/null || true
# 4) база данных (уточнить СУБД):
#   PostgreSQL: pg_dump -Fc <db> > "$D/db.dump"
#   MySQL/MariaDB: mysqldump --single-transaction <db> | gzip > "$D/db.sql.gz"
sha256sum "$D"/* > "$D/SHA256SUMS"
```

## 6. Требуется доступ (блокеры)

На данный момент SSH к 176.124.204.53 **сбрасывается** со стороны сервера (см. §7),
поэтому backup/применение правок/тесты по ролям пока не выполнены. Для продолжения нужно:

1. Разрешить SSH с egress‑IP этого агента: **`3.19.102.191`** (firewall/fail2ban), и
   подтвердить порт SSH (стандартный 22?). Сервер отвечает по 443, но SSH сбрасывает
   до баннера — похоже на IP‑allowlist / гео‑блок / fail2ban.
2. Либо предоставить тестовые учётные записи для каждой роли (USER/MODERATOR/MANAGER/ADMIN),
   либо разрешить создать временные тест‑аккаунты в БД после входа на сервер.

## 7. Диагностика доступа SSH (факты)

- Исходящий SSH из окружения работает: рукопожатие с `github.com:22` проходит.
- К `176.124.204.53:22` TCP‑коннект устанавливается, но соединение сбрасывается
  **до SSH‑баннера** → блокировка на стороне сервера/сети, не ошибка пароля.
- Сайт на `443` доступен из этого окружения. Egress окружения — без ограничений.
