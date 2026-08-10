# Кабинет ≠ Настройки + полная проверка

Дата: 2026-08-10  
Прод: https://young.idivles.ru  
Образ: `sochi-portal_web:cabinet-settings-qa`

## Проблема
В мобильном меню «Кабинет» и «Настройки» выглядели одинаково (одинаковые pill-кнопки), неочевидно куда ведут.

## Сделано
- Мобильные действия: карточки с подзаголовками
  - **Мой кабинет** → `/dashboard` («Заявки, билеты, ачивки»), акцент primary
  - **Настройки** → `/dashboard?tab=profile&section=settings` («Безопасность и устройства»)
  - Сообщения / Выйти — с пояснениями
- Десктоп аккаунт-меню: те же подписи («Настройки аккаунта»)
- Длинные имена в карточке профиля — до 2 строк

## QA (прод)

### Кабинет ≠ Настройки
- Mobile: карточки с подзаголовками, разные маршруты: **PASS**
- Desktop аккаунт-меню: **PASS**

### HTTP smoke (guest + session)
Все основные публичные, кабинетные и админ-маршруты отдают **200** (/, events, news, projects, clubs, spaces, places, gallery, vacancies, contests, grants, dobro, self-gov, documents, contacts, games, login, register, search, privacy, rules, terms, tickets, friends, messages, dashboard+tabs, admin/*).

### GUI smoke
- User routes (places…portfolio, messages, public profile, login/register): **PASS**
- Admin (/admin, bots+howto, applications, bookings, moderation, security, users, settings): **PASS**
- Критичных багов не найдено
