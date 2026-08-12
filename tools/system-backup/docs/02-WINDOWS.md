# Windows / Windows Server: бэкап

## 1. Встроенные средства

| Инструмент | Назначение |
| --- | --- |
| **Windows Server Backup (wbadmin)** | Bare-metal / тома / System State |
| **VSS** | Теневые копии для согласованности |
| **PowerShell** | Автоматизация расписания |
| BitLocker | Шифрование носителя с бэкапом |

Установка роли (Server):
```powershell
Install-WindowsFeature Windows-Server-Backup -IncludeManagementTools
```

## 2. Скрипты этого набора

```powershell
# Запуск от Администратора
cd tools\system-backup\windows
.\Backup-Windows.ps1 -BackupTarget "E:\Backups" -IncludeSystemState
.\Backup-SystemState.ps1 -BackupTarget "E:\Backups"
```

`Backup-Windows.ps1`:
- создаёт каталог с датой
- `wbadmin start backup` для указанных томов
- опционально System State
- ротация старых каталогов (`-Keep 7`)
- лог в `BackupTarget\logs`

## 3. Типовые сценарии

### Файловый сервер
```powershell
.\Backup-Windows.ps1 -BackupTarget "\\NAS\backups\fs01" -Volumes "D:" -Keep 14
```

### Контроллер домена / DNS
Обязателен **System State** (ежедневно):
```powershell
.\Backup-SystemState.ps1 -BackupTarget "E:\Backups\AD"
```

### SQL Server
Дополнительно (не заменяет image):
```powershell
# пример — полный бэкап всех пользовательских БД
Get-SqlDatabase -ServerInstance localhost | Where-Object { -not $_.IsSystemObject } |
  ForEach-Object {
    Backup-SqlDatabase -ServerInstance localhost -Database $_.Name \
      -BackupFile "E:\Backups\SQL\$($_.Name)_$(Get-Date -Format yyyyMMdd).bak"
  }
```
Нужен модуль SqlServer / sqlcmd.

## 4. Расписание

Task Scheduler → задание от SYSTEM / Админ:
- Триггер: ежедневно 02:00
- Действие: `powershell.exe -ExecutionPolicy Bypass -File C:\Backup\Backup-Windows.ps1 ...`
- При ошибке — email/Event Log

Или:
```powershell
$a = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File C:\Backup\Backup-Windows.ps1 -BackupTarget E:\Backups -IncludeSystemState"
$t = New-ScheduledTaskTrigger -Daily -At 2am
Register-ScheduledTask -TaskName "NightlyBackup" -Action $a -Trigger $t -User "SYSTEM" -RunLevel Highest
```

## 5. Важные настройки

1. Диск назначения **не** тот же, что единственный системный (иначе нет смысла при смерти диска).
2. Для bare-metal restore нужен backup **включая System Reserved/EFI** (wbadmin делает при backup всего critical).
3. Антивирус: исключить каталог бэкапа на время окна, если режет VSS.
4. Проверять: `Get-WBBackupSet` / пробный restore на лабораторной VM.

## 6. Ограничения wbadmin

- На Desktop Windows набор функций уже, чем на Server.
- Для больших ферм часто дополняют Veeam/Кибер Бэкап/Acronis — скрипты остаются полезны как базовый контур.
