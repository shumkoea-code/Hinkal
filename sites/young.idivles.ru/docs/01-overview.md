# 01. Обзор портала

## Назначение

Официальный молодёжный портал Сочи: афиша и запись на события, клубы и проекты, пространства и брони, новости, галерея, вакансии, конкурсы, портфолио, личный кабинет с рейтингами (эко / социум / авторитет), друзья, сообщения, мини-игры, реферальная программа.

## Роли

| Роль | Код | Куда попадает после входа | Суть |
|------|-----|---------------------------|------|
| Гость | — | публичные страницы | Без сессии |
| Пользователь | `USER` | `/dashboard` | Базовый кабинет |
| Участник | `PARTICIPANT` | `/dashboard` | Активный участник мероприятий |
| Модератор | `MODERATOR` | `/admin` | Панель по выданным правам (ACL) |
| Администратор | `ADMIN` | `/admin` | Полная админ-панель |
| Сканер | `SCANNER` | `/scanner` | Только сканирование билетов |
| Техслужба | `TECH` | `/ops` | Kill-switch модулей, обход техработ |

## Карта публичных разделов

| URL | Раздел | Модуль kill-switch |
|-----|--------|--------------------|
| `/` | Главная | — |
| `/events` | Афиша | `events` |
| `/places` | Куда сходить | `places` |
| `/projects` | Проекты | `projects` |
| `/clubs` | Клубы | `clubs` |
| `/spaces` | Пространства | `spaces` |
| `/news` | Новости | `news` |
| `/gallery` | Галерея | `gallery` |
| `/grants`, `/dobro`, `/self-gov` | Программы | `programs` |
| `/vacancies` | Вакансии | `vacancies` |
| `/contests` | Конкурсы | `contests` |
| `/games` | Игры | `games` |
| `/friends` | Друзья | `friends` |
| `/messages` | Сообщения | `messaging` |
| `/portfolio/*` | Портфолио | `portfolio` |
| `/register` | Регистрация | `registration` |
| `/login` | Вход | — |
| `/contacts`, `/rules`, `/privacy`, `/terms` | Юр./инфо | — |
| `/p/[slug]` | CMS-страницы | — |
| `/unavailable` | Раздел выключен TECH | — |
| `/maintenance` | Режим техработ | `maintenance` |

## Кабинеты

| URL | Кто |
|-----|-----|
| `/dashboard` | USER, PARTICIPANT (+ админы могут зайти) |
| `/admin` | ADMIN, MODERATOR |
| `/ops` | только TECH |
| `/scanner` | SCANNER, ADMIN, MOD с правом `scanner` |
| `/change-password` | все авторизованные; **обязательно** если `mustChangePassword` |

## Стек (кратко)

- Next.js 16 (App Router), Prisma, PostgreSQL, Redis  
- Docker Compose: `web` + `db` + `redis`  
- Путь: `/opt/sochi-portal`  
- Сборка: `next build --webpack` (нужно для Proxy / kill-switch)
