- 2026-08-09: VPS provisioner — greenfield + HA clone, админка репликации (`vps-provision-ha.md`, `tools/yp-provision/`)
- 2026-08-09: навбар — анти-наложение иконок/бейджа (`code/navbar-overlap/`)
- 2026-08-09: сообщения — фильтр членства, long-press меню, overflow (blocked on SSH; `messages-ux-overflow.md`)
- 2026-08-09: публичный профиль `/u/…` — рейтинги в ряд, компактный гайд, navbar → publicCode (`public-profile-display.md`, tag `public-profile-display`)
- 2026-08-09: профиль компактнее, фикс иконок рейтингов, тосты по порядку (`profile-ui-compact.md`, tag `profile-ui-compact`)
- 2026-08-09: полный QA сайта + фикс contentView duplicates (`full-site-qa-2026-08-09.md`, tag `qa-contentview-fix`)
- 2026-08-09: если почта не настроена — skip OTP/писем (`email-skip-when-unconfigured.md`, tag `email-skip`)
- 2026-08-09: полный аудит auth — keepAlive на смене пароля, hardening reset/login/register (`auth-full-audit.md`, tag `auth-hardening`)
# Связанные материалы проекта

Документы в `sites/young.idivles.ru/` (и копия в `/opt/sochi-portal/docs/related/` при упаковке):

| Файл | Тема |
|------|------|
| `ops-admin-qa.md` | QA ролей и kill-switch |
| `referrals-onboarding.md` | Рефералы и инструктаж |
| `hardening-ops.md` | CSP, VPS, watchdog, нагрузка |
| `security-plan.md` / `audit-results.md` | Безопасность |
| `telegram-*.md` | Telegram / MAX / модерация |
| `profile-ratings-backup.md` | Рейтинги, бэкап-фраза |
| `eco-cards-fifteen.md` | Эко / карточки / fifteen |
| `ui-scanner-profile.md` | Сканер и профиль |
| `code/` | Снапшоты ключевого кода |

Код приложения: `/opt/sochi-portal` (не входит целиком в docs-архив без отдельного согласия — секреты и node_modules исключаются).

## 2026-08-09 — Visual refresh

- Hero JPG, brand templates, covers SVG, seed project/space photos updated on prod.
- Doc: [visual-refresh.md](related/visual-refresh.md)

## 2026-08-09 — Games UI fix

- Подключён `games.css`, обёртка `games-root` + topbar; карточки хаба.
- Doc: [games-ui-fix.md](../games-ui-fix.md)

## 2026-08-09 — Games static layout + icon topbar

- Иконки в топбаре, фиксированные игровые области.
- Doc: [games-static-layout.md](../games-static-layout.md)

## 2026-08-09 — Games UX (fifteen collapse)

- Фикс схлопывания пятнашек; mobile/PC UX.
- Doc: [games-ux-fix.md](../games-ux-fix.md)

## 2026-08-09 — Admin password reset + audit + pending activate

- Doc: [admin-password-audit.md](../admin-password-audit.md)
