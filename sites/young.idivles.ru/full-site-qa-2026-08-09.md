# Полный QA сайта young.idivles.ru (2026-08-09)

Инфра: web/redis/db/max — **healthy**. Maintenance **off**. Модули все **enabled**. Деплой после фикса: `sochi-portal_web:qa-contentview-fix`.

## Вердикт
Сайт в целом **работоспособен**. Критических поломок пользовательских сценариев не найдено. Исправлен шум в логах от учёта просмотров.

## Покрытие

### HTTP smoke (публичные страницы)
PASS (~40 URL): `/`, about, contacts, news, events, places, projects, clubs, spaces, gallery, contests, vacancies, documents, games (+6 игр), login/register/forgot/verify/reset, privacy/rules/terms, search, tickets, check-in, dobro, grants, self-gov, maintenance, unavailable.

Защищённые без сессии → редирект на `/login` (dashboard/friends/messages/admin/scanner).

### API
| Проверка | Результат |
|---|---|
| `/api/health`, `/api/public/status` | PASS |
| events/places/contests/vacancies | PASS, данные есть |
| captcha challenge/solve | PASS |
| games leaderboard `?game=` | PASS (без `game` → 400 ожидаемо) |
| register (без почты) → сразу аккаунт | PASS |
| login + session | PASS |
| profile/notifications/achievements/eco/collectibles/games/friends/messages/bookings/referrals | PASS |
| game start snake | PASS |
| change-password + keepAlive | PASS |
| admin APIs от USER | 403 PASS |
| admin login `qa-admin@sochi.ru` + stats/nav/pending/pages | PASS |

### GUI (desktop 1280 + mobile 390)
PASS: главная/бренд, новости+деталка, афиша, места, проекты, about/contacts, все игры (snake/tetris/fifteen/memory/breakout/checkers), клубы/пространства+деталки, contests/vacancies/documents/gallery/search, login/register/forgot, logout, protected redirects, privacy/rules/terms/tickets, мобильные игры и регистрация.

### Админка
PASS страницы: admin, users, settings, pending-users, audit-log, news, moderation, bookings, places, projects, clubs, spaces, contests, vacancies, documents, backup, stats, applications, portfolios, rkn, about-team, pages, scanner.

## Найденное / исправленное
1. **`contentView.create` unique** — спамило `prisma:error` при повторных просмотрах. Заменено на `createMany({ skipDuplicates: true })`. После деплоя ошибок 0.
2. Ложный FAIL: `/events/{bookingId}` 404 — **отдельной страницы нет by design**; афиша работает карточками + ссылка на `/spaces/...`.

## Известные ограничения (не блокер)
- Исходящая почта не настроена → OTP/forgot skip (уже так задумано).
- OAuth Yandex/VK в providers сейчас только credentials.
- Галерея может быть пустой (контент).
- В логах ранее встречался редкий `TypeError: transformAlgorithm` (не воспроизведён как блокер UI).

## Артефакты
- Патч: `code/qa-fixes/page-views.ts`
- GUI screenshots: `/tmp/computer-use/` на агенте
