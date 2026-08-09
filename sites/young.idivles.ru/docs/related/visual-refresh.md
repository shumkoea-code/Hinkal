# Visual refresh — young.idivles.ru (2026-08-09)

Обновлены обложки и hero-изображения портала «Центр развития молодежи Сочи» в единой палитре море / горы / солнце (teal–cyan–amber), без текстовых плейсхолдеров на SVG.

## Что заменено (prod VPS `/opt/sochi-portal`)

| Зона | Пути | Примечание |
|------|------|------------|
| Hero фон | `public/hero-bg.jpg` | Фотореалистичный пейзаж Сочи (море + горы, golden hour) |
| Hero cover / About | `public/brand/hero-cover.jpg` | Сцена фестиваля у моря на закате |
| OG | `public/brand/og-cover.jpg` | Соцпревью (новый файл) |
| Логотип SVG | `public/brand/logo.svg` | Тот же знак M+C, палитра ближе к морю |
| Afisha week | `public/brand/afisha-week.svg` | Градиент events |
| Section / afisha templates | `public/brand/templates/*.svg` (18) | Единый генератор мотивов |
| Каталог covers | `public/covers/*.svg` (34) | Вшиты в Docker-образ → `docker cp` |
| Uploads covers | `public/uploads/covers/*.svg` (58) | Bind-mount, сразу live |
| Seed projects | `public/uploads/projects/projects-{0,1,2}-*.jpg` | Eco / media / campus |
| Seed spaces | `public/uploads/spaces/spaces-{6,7,8}-*.jpg` | Cowork / pavilion / hall |
| VK decor | `public/brand/vk-decor/pattern.svg` | Волны + акценты бренда |

`SiteSettings`: `logoUrl=/brand/logo-mark.png`, `heroImageUrl=/brand/hero-cover.jpg`, `heroVideoUrl=/brand/hero-cover.mp4` — URL не менялись, обновился файл hero-cover.

## Деплой

1. Сгенерировать SVG: `python3 visuals/generate_sochi_covers.py` (локально /tmp на агенте).
2. Залить на хост (`tar`/`scp` в `/opt/sochi-portal/public/...`).
3. Для путей **не** в volume (`covers/`, `brand/`, `hero-bg.jpg`):  
   `docker cp … sochi-portal_web_1:/app/public/...`
4. Uploads (`uploads/covers`, `uploads/projects`, `uploads/spaces`) достаточно обновить на хосте.

Полный rebuild образа не требуется, пока не нужна персистентность без `docker cp` после recreate контейнера. Рекомендуется включить эти ассеты в следующий `docker compose build web`.

## QA

Проверено в браузере: главная, `/projects`, `/events`, прямые URL hero/SVG — PASS. Скриншоты: `visuals/qa-screens/`.

## Образцы в репозитории

См. `sites/young.idivles.ru/visuals/` (hero, sample SVG, seed JPG, генератор).
