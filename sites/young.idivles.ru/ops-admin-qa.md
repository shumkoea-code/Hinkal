# QA: роли, kill-switch модулей, панель Ops / Admin (2026-08-09)

## Вердикт

- Роли **GUEST / USER / PARTICIPANT / MODERATOR / ADMIN / TECH** проверены на живом `young.idivles.ru`.
- Kill-switch модулей **не работал на уровне edge**: `next build` (Turbopack по умолчанию в 16.2) фактически не активировал Proxy — редиректы на `/unavailable` не шли.
- Исправлено: `package.json` → `next build --webpack` (в логе сборки есть `ƒ Proxy (Middleware)`), self-fetch статуса через `127.0.0.1:3000`, page/layout guards `requireModulePage`.
- После деплоя: выключение `events`/`gallery` даёт **307 → `/unavailable?m=…`**; TECH bypass сохраняется.
- Панель **Ops** и **Admin** (поиск, группы, графики, TECH→`/ops`) улучшены.

Образ: `sochi-portal_web:ops-qa-ux`.

## Матрица доступа (API — источник истины)

| Роль | `/api/ops/flags` | `/api/admin/stats` | `/api/admin/nav-counts` | `/ops` UI | `/admin` UI |
|------|------------------|--------------------|-------------------------|-----------|-------------|
| GUEST | — | — | — | редирект `/` | логин |
| USER / PARTICIPANT | 404 | 403 | 403 | редирект `/` | редирект кабинет |
| MODERATOR | 404 | 200* | 200 | редирект `/` | да (по ACL) |
| ADMIN | 404 | 200 | 200 | редирект `/` | да |
| TECH | 200 | 200** | 403 | да | сервер редиректит на кабинет; прокси пускает, UI блокирует |

\* зависит от permissions модератора  
\*\* TECH может читать stats API; UI админки для TECH не предназначен — рабочая панель `/ops`

Публичные разделы (`/events`, `/gallery`, `/news`, …) для гостя открыты, пока модуль включён.

## Kill-switch (TECH)

Панель: `/ops` (только TECH). API: `GET/POST /api/ops/flags`.

Поведение после фикса:

1. TECH выключает модуль (например `events` / `gallery` / `registration`).
2. Гость и обычный пользователь получают редирект на `/unavailable?m=<key>` (edge) или тот же guard на странице.
3. TECH продолжает видеть разделы (bypass в `isModuleEnabled` + proxy/middleware).
4. `allPublic: false/true` — массовое выключение/включение публичных модулей (с confirm в UI).
5. `maintenance` зеркалит `SiteSettings.maintenanceMode` (false в флаге = техработы включены).

Кэш флагов: Redis `yp:module-flags:v1` + in-memory ~20s; сброс при сохранении из Ops.

## UX Ops / Admin

**Ops**

- Группы модулей, поиск, фильтр «только выключенные»
- Confirm перед «выключить всё публичное»
- Статус-чипы Вкл/Выкл, счётчик выключенных
- Загрузка/сохранение текста техработ и ETA; кнопка «Очистить ETA»
- Ссылки на сайт и кабинет

**Admin**

- Поиск по пунктам сайдбара
- Графики: empty-state для бара регистраций; в карточке проходов — уникальные гости
- Подсказка по периоду аналитики

**Navbar**

- Для TECH кнопка панели ведёт на `/ops`

## Проверка после деплоя

```bash
# как TECH выключить events, затем:
curl -sSI https://young.idivles.ru/events | head
# ожидается 307/302 → /unavailable?m=events

curl -sS https://young.idivles.ru/api/public/status | jq '.modules.events'
# false

# вернуть:
# POST /api/ops/flags { "allPublic": true }
```

## Замечание по HTML 200

Раньше страницы часто отдавали `200` с контентом раздела, даже когда модуль «выключен» в БД, потому что middleware не регистрировался. После фикса ожидаются редиректы edge; page guards — запасной контур.
