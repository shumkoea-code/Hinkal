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
