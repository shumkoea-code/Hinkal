# Samsung sidebar + роли + IP/блокировки

Дата: 2026-08-10  
Прод: https://young.idivles.ru  
Образ: `sochi-portal_web:samsung-roles-security`

## Сделано

### Гость
- В шапке «Вход» + «Регистрация» (без колокольчика/кабинета).
- Placeholder загрузки — 2 слота, не 5 «фейковых» иконок.
- Блок мероприятий: класс `event-card-guest-safe` (меньше личных бейджей).

### Боковое меню админки (Samsung / One UI)
- Группы Обзор / Контент / Операции / Система.
- Активный пункт: фон + синяя полоска слева.
- Сворачивание (иконки) + localStorage.
- Mobile: FAB + drawer с затемнением.

### Роли / ACL
- `/admin/security` доступен ADMIN и MODERATOR с `moderation`.
- Блокировка пользователей — также модераторам с `moderation`.
- Хелпер `role-visibility.ts` для UI-матрицы.

### Анти-мульт и IP
- `RegistrationAttempt` + soft-check по IP/fingerprint (`registration-guard.ts`).
- Раздел **/admin/security**: горячие IP, подозрительные, отказы регистрации, поиск по IP.
- `User.suspiciousFlag`, история `UserBlockEvent`.
- Причины блокировок (жёсткие/мягкие) в карточке пользователя.

## QA
- Guest auth buttons: PASS  
- Admin sidebar expand/collapse + mobile drawer: PASS  
- `/admin/security`: PASS  
- Ban reason chips: PASS  
