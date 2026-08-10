# mobile-bots-compact-029d

## Fixes
- Mobile full-width / compact: settings tabs stack, dashboard profile `maxWidth` removed, glass padding reduced
- Rating chips: labels Уровень / Авторитет / Социум / Эко + values without truncation
- Badge save: `PUT` (+ `PATCH` alias) on `/api/user/profile` — fixes «Не удалось сохранить значки»
- Safer JSON parse on EcoPoolHint / ConsentBanner / ProfileHeroCard (HTML error pages no longer throw Unexpected token)
- Session devices: wrap labels instead of ellipsis truncate
- Admin menu **Боты** with tabs MAX + Telegram: token, webhook, MinCifry cert guidance, capabilities, recipients from profiles, tests
- Profile: users add Telegram chat ID / MAX user ID under «Мессенджеры для ботов»

## Deploy
Image tag: `sochi-portal_web:mobile-bots-compact`

## Verified (2026-08-10)
- Settings groups stack; СИСТЕМА labels fully visible (Эко-баллы, Репликация…)
- Rating chips: Уровень / Авторитет / Социум / Эко with full values
- `/admin/bots` MAX + Telegram tabs live; cert OK; webhook/recipients/test
- Profile PATCH/PUT showcase badges OK
- Image: `sochi-portal_web:mobile-bots-compact`

## Follow-up
- Hardened dashboard/profile JSON parsing to avoid Unexpected token toast when API returns HTML
- Email label → «Электронная почта»
