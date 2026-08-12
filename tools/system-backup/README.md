# System Backup Toolkit

Комплект скриптов и документации для бэкапа:

- **Linux** (Debian, Ubuntu, Astra, RED OS, ALT, Rosa, RHEL-клоны)
- **Windows** / Windows Server (`wbadmin`, файлы, System State)
- **Hyper-V** (экспорт VM, конфигурация, VHDX-aware сценарии)

Связанный Linux toolkit с консистентными БД: [`../vps-backup/`](../vps-backup/).

## Быстрые ссылки

| Документ | Содержание |
| --- | --- |
| [docs/00-OVERVIEW.md](docs/00-OVERVIEW.md) | Выбор стратегии, что бэкапить |
| [docs/01-LINUX.md](docs/01-LINUX.md) | Linux RU-дистрибутивы, настройки, cron/systemd |
| [docs/02-WINDOWS.md](docs/02-WINDOWS.md) | Windows / Server, wbadmin, расписание |
| [docs/03-HYPER-V.md](docs/03-HYPER-V.md) | Hyper-V: экспорт, чекпоинты, ограничения |
| [docs/04-SCHEDULE-AND-RETENTION.md](docs/04-SCHEDULE-AND-RETENTION.md) | Расписание и ротация |
| [docs/05-RESTORE.md](docs/05-RESTORE.md) | Восстановление |
| [docs/06-AD-ACCOUNTS.md](docs/06-AD-ACCOUNTS.md) | Доменные учётные записи: лёгкий CSV + System State / IFM |

## Скрипты

```
linux/backup-linux.sh          → обёртка над tools/vps-backup
windows/Backup-Windows.ps1     → wbadmin + файловые пути
windows/Backup-SystemState.ps1 → System State
windows/Backup-ADAccounts.ps1  → лёгкий экспорт AD users/groups (CSV)
hyper-v/Backup-HyperV.ps1      → экспорт всех/списка VM
hyper-v/Get-HyperVInventory.ps1
```

## Скачать архив

См. корневой README репозитория (ZIP ветки) или файл в релизе/`artifacts`.
