# Расписание и ротация

## Рекомендуемая матрица

| Объект | Ежедневно | Еженедельно | Ежемесячно |
| --- | --- | --- | --- |
| Linux smart dumps | ✓ | | |
| Windows System State | ✓ (AD) | | |
| Hyper-V critical VMs export | ✓ | | |
| Hyper-V all VMs | | ✓ | |
| Полный образ диска / Clonezilla / хостер snapshot | | | ✓ |
| Offsite копия | ✓ (инкремент) | ✓ (полная) | |

## Ротация

- Дневные: хранить **7–14**
- Недельные: **4–8**
- Месячные: **6–12**

Скрипты: Linux `--keep N`, Windows/Hyper-V `-Keep N`.

## Мониторинг

- Linux: `systemctl status vps-backup.service` + `OnFailure=` mailto/unit
- Windows: код выхода задачи + Event Log
- Проверка места: алерт если свободно &lt; 20% на BackupTarget
