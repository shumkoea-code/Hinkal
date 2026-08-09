# Портал «Центр развития молодежи Сочи» — документация

**Сайт:** https://young.idivles.ru  
**Проект на сервере:** `/opt/sochi-portal`  
**Дата пакета:** 2026-08-09  

Этот каталог лежит **рядом с проектом** (`/opt/sochi-portal/docs/`) и в репозитории аудита (`sites/young.idivles.ru/docs/`).

## Содержание

| Документ | Для кого |
|----------|----------|
| [01-overview.md](./01-overview.md) | Обзор портала, роли, карта разделов |
| [user/guide.md](./user/guide.md) | Пользователи и гости |
| [admin/guide.md](./admin/guide.md) | Администраторы и модераторы |
| [tech/guide.md](./tech/guide.md) | Техническая учётка (TECH), kill-switch |
| [accounts/test-and-staff.md](./accounts/test-and-staff.md) | Тестовые и служебные учётки, первый вход, смена пароля |
| [ops-modules.md](./ops-modules.md) | Модули сайта (вкл/выкл) |
| [changelog-refs.md](./changelog-refs.md) | Ссылки на связанные отчёты |

## Быстрый старт

1. **Гость** — открывает публичные разделы без входа.  
2. **Пользователь** — регистрируется на `/register`, кабинет `/dashboard`.  
3. **Модератор / Админ** — панель `/admin` (по правам).  
4. **Техслужба** — скрытая панель `/ops` (kill-switch модулей).  
5. **Сканер** — `/scanner` для QR на входе.

## Где лежит

| Место | Путь |
|-------|------|
| Рядом с проектом на VPS | `/opt/sochi-portal/docs/` |
| Архив на VPS | `/opt/sochi-portal-archives/young-idivles-docs-20260809_143103.tar.gz` |
| Симлинк «latest» | `/opt/sochi-portal-archives/young-idivles-docs-latest.tar.gz` |
| Копия в репозитории | `sites/young.idivles.ru/docs/` |
| Копия архива в репо | `sites/young.idivles.ru/archives/` |

Точный путь архива также в [`ARCHIVE_PATH.txt`](./ARCHIVE_PATH.txt).
