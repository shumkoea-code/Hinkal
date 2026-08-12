# Восстановление (кратко)

## Linux smart-архив

```bash
mkdir -p /root/restore && tar -xzf HOST-smart-DATE.tar.gz -C /root/restore
# конфиги
# БД:
#   gunzip -c databases/postgres/pg_dumpall.sql.gz | sudo -u postgres psql
#   sqlite .consistent файлы → на место
# docker compose up -d + SQL dumps из docker/db-dumps
systemctl daemon-reload && systemctl restart nginx x-ui wg-panel || true
```

Полный диск: `gunzip -c disk.img.gz | dd of=/dev/vdX` (размер ≥ исходного).

## Windows

- WinRE / установочный носитель → **Repair** → восстановление из Windows Server Backup  
- или `wbadmin get versions` / `wbadmin start sysrecovery`

## Hyper-V

```powershell
Import-VM -Path "E:\Backups\Hyper-V\date\vmname" -Copy -GenerateNewId
Connect-VMNetworkAdapter -VMName vmname -SwitchName "External"
Start-VM vmname
```

## Проверка после restore

1. Сеть / DNS / время  
2. Службы и БД  
3. Тестовый вход пользователей  
4. Запись контрольной суммы/даты восстановления в журнал
