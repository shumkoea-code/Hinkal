# Games UI fix (2026-08-09)

## Проблема
Раздел `/games` («Офлайн-игры») рендерил карточки и табы, но **`games.css` нигде не импортировался**. В бандле не было классов `.games-hub*`, поэтому на мобильном всё сливалось в одну текстовую кашу. Компонент `GamesTopbar` и обёртка `.games-root` тоже не монтировались.

## Исправление
1. `src/app/games/layout.tsx` — `import './games.css'`, обёртка `games-root` + `GamesTopbar` + `games-main`.
2. Хаб: иконки игр, кнопка «Играть», более читаемые карточки (mobile row / desktop tiles).
3. Образец патча: `sites/young.idivles.ru/code/games-ui-fix/`.

## Деплой
`docker-compose build web && docker-compose up -d web` на VPS. Тег отката: `sochi-portal_web:pre-games-ui`.

## QA
- `/games` — тёмный игровой chrome, табы, сетка карточек, кнопка «Играть»
- `/games/snake` (и др.) — topbar-свитчер игр, shell со стилями
- Site nav/footer скрыты внутри `/games/*`
