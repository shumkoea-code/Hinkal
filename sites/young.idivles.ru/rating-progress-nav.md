# Nav profile live data + rating progress rings

## Problem
- Mobile menu «Профиль» показывал только `session.user.name` + generic icon — без аватара, ника, баллов и актуальных рейтингов.
- Иконки рейтингов (уровень / авторитет / социум / эко) были текстовыми чипами без прогресса; уровень в aside был захардкожен (`repChipStyle(70)`).

## Fix
1. **`NavProfileCard`** — при открытии меню тянет `/api/user/profile` + `/api/user/eco` (`cache: 'no-store'`), показывает аватар, ник/имя, ID и компактные кольца прогресса. Обновляется по focus/visibility.
2. **`RatingProgressIcons` / `RatingProgressChips`** — современные кольца SVG + полоска прогресса; используются в меню, hero профиля и aside кабинета.
3. **Dashboard** — `refreshProfileLive()` при фокусе окна и при вкладке «Профиль»; уровень берётся из `/api/user/eco`.

## Deploy
Image: `sochi-portal_web:rating-progress-nav`  
Site: young.idivles.ru
