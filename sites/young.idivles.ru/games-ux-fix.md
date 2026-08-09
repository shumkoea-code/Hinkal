# Games UX fix (2026-08-09)

## Bug
Пятнашки (и риск для шашек/памяти): поле схлопывалось в тонкую колонку.
Причина: `container-type: size` + `width: min(..., 100cqh, ...)` → `cqh≈0` → ширина 0.

## Fix
- Убран size-containment / `100cqh` для игровых досок; размер через `vmin`.
- Стили `.game-diff-row` (кнопки 3×3/4×4/5×5).
- Mobile: поле выше рейтинга (`order`), компактный HUD/HOF.
- PC: боковой Top-N без изменения.

Образ: `sochi-portal_web:games-ux-fix`.
