# UX + эко-баллы + настройки + графики (2026-08-09)

Deploy tag: `sochi-portal_web:ux-eco-settings` на young.idivles.ru.

## Что сделано

### Профиль / ширина / навбар
- Прогрессивное «Ещё» в навбаре: пункты, не помещающиеся по ширине, уходят в dropdown (`data-nav-overflow`).
- CSS containment для end-cluster + компактные eco/profile блоки.
- Service Worker: не кэширует partial (206) ответы; cache bump `v13`.

### Эко-баллы
- Покупка **сразу надевает** предмет (голос/тема применяются без второго шага) — исправлен баг «язык не меняется».
- Глобальный пул: всего **1 000 000**, у участников / потрачено / осталось (`/api/eco/pool`, `/api/admin/eco`).
- Мягкий счётчик в магазине (`EcoPoolHint`); опционально в футере.
- Админ: вкладка **Эко-баллы**, выдача по коду профиля; на карточке пользователя — блок выдачи.
- Конкурсы: форма **«Наградить эко-баллами»** + API `awardEco`.

### Настройки
- Вкладки сгруппированы: Сайт / Правила / Система / Интеграции.
- Новые вкладки: **Эко-баллы**, **Репликация** (HA config в `replicaJson`).
- Контакты: современные `type="time"` пикеры; часы синхронизируются с окном бронирования и текстом `workHours`.

### Афиша / проекты / картинки
- Тематические SVG-обложки (`/covers/event-*.svg`, copyright-safe originals).
- Слабые placeholder space/project SVG уступают title-based covers.
- `/events`: сетка карточек без дублирующего H2 и без ошибочного carousel (`mode="grid"`).

### Графики
- `ResponsiveContainer` с `minWidth={0}`, debounce, корректные отступы оси Y / legend.

## Ключевые пути на VPS
- `src/lib/eco-points.ts`, `eco-pool.ts`, `replica-config.ts`, `theme-covers.ts`
- `src/app/admin/settings/page.tsx`
- `src/app/api/admin/eco`, `replica`, `contests`
- `src/components/EcoPoolHint.tsx`, `admin/AdminReplicaClient.tsx`, `DashboardCharts.tsx`, `Navbar.tsx`

Снимки кода: `sites/young.idivles.ru/code/ux-eco-settings-charts/`.  
Скрины QA: `sites/young.idivles.ru/visuals/qa-screens/ux-eco/`.
