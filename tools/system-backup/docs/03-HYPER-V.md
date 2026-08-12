# Hyper-V: бэкап и настройки

## 1. Что считается нормальным бэкапом VM

| Метод | Консистентность | Комментарий |
| --- | --- | --- |
| **Export-VM** | Хорошая (с VSS внутри гостя при Integration Services) | Простой, надёжный для скриптов |
| **Windows Server Backup** с ролью Hyper-V | Хорошая | Bare-metal хоста + VM |
| Checkpoint (снимок) | Не замена бэкапа | Только краткосрочно |
| Копирование VHDX вручную при Running | **Плохо** | Риск повреждения |

Нужны **Hyper-V Module for Windows PowerShell** и права администратора.

## 2. Подготовка хоста

```powershell
Get-WindowsFeature *Hyper-V*
# Integration Services в гостях — включены (по умолчанию на современных OS)
Get-VM | Select Name, State, Path, CheckpointFileLocation
Get-VMSwitch
```

Рекомендации:
- Хранить бэкапы на **другом** диске/NAS, не на том же CSV/volume, что VHDX продакшена.
- Для Linux-гостей: QA-агент / hv_vss_daemon где применимо; иначе file-consistent + дампы БД внутри гостя.
- Не копить цепочку checkpoint’ов месяцами.

## 3. Скрипт Export (этот репозиторий)

```powershell
cd tools\system-backup\hyper-v
.\Get-HyperVInventory.ps1 -OutFile "E:\Backups\inventory-$(Get-Date -Format yyyyMMdd).txt"
.\Backup-HyperV.ps1 -BackupRoot "E:\Backups\Hyper-V" -Keep 5
# только список:
.\Backup-HyperV.ps1 -BackupRoot "E:\Backups\Hyper-V" -VMNames @("dc01","fs01")
```

Что делает `Backup-HyperV.ps1`:
1. Создаёт каталог `BackupRoot\yyyy-MM-dd\`
2. Для каждой VM: `Export-VM -Path ... -CaptureLiveState CaptureCrashConsistentState` или лучше с guest state при поддержке
3. Пишет лог и код возврата
4. Удаляет старые каталоги по `-Keep`

Параметр live state:
- `CaptureSuspend` / guest-aware варианты зависят от версии Hyper-V; в скрипте используется безопасный экспорт с проверкой ошибок.

## 4. Восстановление

```powershell
# Импорт ранее экспортированной VM
Import-VM -Path "E:\Backups\Hyper-V\2026-08-12\dc01"
# при конфликте ID:
Import-VM -Path "..." -Copy -GenerateNewId
```

Проверить vSwitch после импорта (`Get-VMNetworkAdapter` → подключить нужный switch).

## 5. Бэкап хоста Hyper-V целиком

Если нужен сам гипервизор (роль, сеть):
```powershell
wbadmin start backup -backupTarget:E: -include:C: -allCritical -quiet
```
плюс отдельно Export VM (VHDX на другом томе — указать `-include`).

## 6. Расписание

Task Scheduler от SYSTEM, ежедневно в низкую нагрузку:
- Inventory
- Export критичных VM
- Раз в неделю — все VM

Мониторить размер: экспорт ≈ сумма VHDX (сжатие зависит от заполненности).

## 7. Частые ошибки

1. Экспорт на тот же диск → нет защиты от смерти массива.  
2. Checkpoint «навсегда» вместо бэкапа.  
3. Гость без Integration Services → только crash-consistent.  
4. После restore забыли сеть/VLAN/ISO paths.
