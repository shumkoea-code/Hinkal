# Universal VPS / Linux backup

Универсальные скрипты бэкапа для **Debian, Ubuntu, Astra Linux, RED OS** (и других Linux).

## Ответ на вопрос про «живые» базы

| Способ | Безопасно при работающей БД? |
| --- | --- |
| Простой `cp` файлов SQLite/Postgres | **Нет** — можно получить битый файл |
| `sqlite3 '.backup'` / `VACUUM INTO` | **Да** (online API) |
| `pg_dump` / `pg_dumpall` | **Да** (логический снимок) |
| `mysqldump --single-transaction` | **Да** (InnoDB) |
| Краткий stop сервиса + copy | **Да**, если писатели остановлены |
| `dd` всего диска на горячую | **Риск** для БД без дампа; лучше + logical dumps |

Этот toolkit по умолчанию делает **консистентные дампы**, а не слепой `cp`.

---

## Быстрый старт

```bash
cd tools/vps-backup
sudo bash backup.sh --mode smart --profile examples/idivles.conf
```

Архив: `/var/backups/vps-backup/<host>-smart-<stamp>.tar.gz` (+ `.sha256`).

Скачать к себе:

```bash
scp -P 4488 root@VPS_IP:/var/backups/vps-backup/*.tar.gz* .
```

---

## Режимы

| Mode | Что делает |
| --- | --- |
| `smart` (по умолчанию) | Конфиги + сервисы + **consistent DB dumps** + docker compose/dumps |
| `full` | smart + крупные деревья (`/opt`, audit и т.п.) |
| `disk` | образ блочного устройства (`dd \| gzip`) — «полный сервер» |

Флаги:
- `--include-docker-volumes` — tar всех named volumes
- `--include-docker-images` — `docker save` (очень тяжело)
- `--no-stop-xui` — не останавливать 3X-UI (только online sqlite backup)
- `--keep N` — сколько архивов хранить
- `--dry-run` — только план

---

## Поддерживаемые ОС

Автоопределение через `/etc/os-release`:

- **Debian / Ubuntu / Astra (debian-like)**
- **RED OS / RHEL / Rocky / Alma / Fedora**
- частично SUSE / Arch (inventory + общие пути)

Пакеты полезно иметь: `sqlite3`, `rsync`, `gzip`, клиенты `postgresql-client` / `mysql-client` при наличии БД.

---

## Профиль (пример idivles)

См. `examples/idivles.conf` — доп. пути, compose-файлы.

---

## Восстановление (кратко)

1. Развернуть ОС того же семейства (или накатить `disk`-образ).
2. Распаковать архив.
3. Вернуть конфиги (`nginx`, `wireguard`, сертификаты).
4. БД:  
   - SQLite: положить `*.consistent` / `.db` на место  
   - Postgres: `gunzip -c pg_dumpall.sql.gz | sudo -u postgres psql`  
   - MySQL: `gunzip -c all-databases.sql.gz | mysql`  
   - Docker: `docker compose up -d` + restore SQL/volumes
5. `systemctl enable --now ...`

Полный 1:1 без возни — режим `--mode disk` или снимок у хостера.

---

## Структура архива

```
META.txt
system/          # df, пакеты, сервисы, сеть
configs/         # nginx, ssh, ufw, sysctl, ...
databases/       # sqlite/postgres/mysql/redis dumps
services/        # x-ui, wg-panel, wireguard, certs, ...
docker/          # ps, compose, db-dumps, optional volumes
extra/           # EXTRA_PATHS из профиля
```
