# Games static layout + icon topbar (2026-08-09)

## Changes
- Topbar: 6 game **icons** in a fixed grid (fit on mobile ~390px), labels via `aria-label`/`title`.
- Stage: `game-stage__board` + fixed `aspect-ratio` for canvas wraps (snake 16/22, tetris 10/20, breakout 420/560) and square boards.
- Shell always reserves HOF / over-message slots; pads hidden so idle→play no longer jumps.
- Shared icons: `src/lib/game-icons.tsx`.

## Deploy
Image tag: `sochi-portal_web:games-static-icons`. Patch mirror: `code/games-ui-fix/`.
