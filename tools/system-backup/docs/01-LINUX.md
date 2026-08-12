# Linux: бэкап (Debian, Ubuntu, Astra, RED OS, ALT, Rosa)

## 1. Рекомендуемый инструмент

Основной скрипт: [`../../vps-backup/backup.sh`](../../vps-backup/backup.sh)

```bash
sudo bash tools/vps-backup/backup.sh --mode smart --name "$(hostname -s)" --keep 7
# или
sudo bash tools/system-backup/linux/backup-linux.sh
```

Режимы:
- `smart` — конфиги + **консистентные** дампы БД + docker (на горячую)
- `full` — шире по `/opt` и данным
- `disk` — образ блочного устройства (лучше в maintenance)

## 2. Настройки под дистрибутивы РФ

### Debian / Ubuntu / Astra (Smolensk, debian-like)
```bash
apt-get update
apt-get install -y sqlite3 rsync gzip postgresql-client default-mysql-client
```

### RED OS / Rocky / Alma / CentOS-stream
```bash
dnf install -y sqlite rsync gzip postgresql mysql  # имена пакетов уточнить под релиз
# или yum
```

### ALT Linux
Установить аналоги: `sqlite3`, `rsync`, клиенты БД из синаптик/apt.

### Профиль
Скопировать `tools/vps-backup/examples/generic.conf` → `/etc/vps-backup.conf`:

```bash
EXTRA_PATHS="/etc/nginx /etc/wireguard /opt /var/lib/docker/volumes"
DOCKER_COMPOSE_FILES="/opt/app/docker-compose.yml"
```

## 3. Консистентность БД (проверено практикой)

| СУБД | Команда в toolkit | Примечание |
| --- | --- | --- |
| SQLite | `sqlite3 db '.backup file'` | OK на горячую |
| PostgreSQL | `pg_dumpall` / docker exec | OK на горячую |
| MySQL/MariaDB | `mysqldump --single-transaction` | InnoDB |
| Redis | `BGSAVE` | RDB снимок |
| Слепой `cp` data dir | **не использовать** | риск порчи |

Для 3X-UI скрипт кратко останавливает сервис (можно `--no-stop-xui`).

## 4. Автозапуск (systemd timer) — рекомендуется

Файл юнита ставит `linux/install-linux-timer.sh`.

Ежедневно 03:15:
```
OnCalendar=*-*-* 03:15:00
```

Логи: `journalctl -u vps-backup.service -n 100`

## 5. Несколько дисков на рабочей Linux-машине

- **Онлайн:** smart dumps + `rsync` данных; точный `dd` без LVM-snapshot — риск.
- **С LVM:** `lvcreate -s` → бэкап со снапшота → `lvremove`.
- **Оффлайн / Clonezilla:** идеальная разметка 1:1 по каждому диску.

## 6. Куда складывать

- Локально: `/var/backups/vps-backup/`
- Копия: `rclone` / `scp` на NAS, второй сервер, encrypted USB

```bash
scp /var/backups/vps-backup/*.tar.gz* user@nas:/backups/$(hostname)/
```

## 7. Проверка

```bash
tar -tzf /var/backups/vps-backup/HOST-smart-*.tar.gz | head
sha256sum -c HOST-smart-....tar.gz.sha256
```
