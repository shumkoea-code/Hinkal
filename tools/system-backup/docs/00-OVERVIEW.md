# Обзор стратегий бэкапа

## 1. Три уровня

| Уровень | Что даёт | Когда |
| --- | --- | --- |
| **A. Логический (smart)** | Конфиги + дампы БД + файлы приложений | Ежедневно, на горячую |
| **B. Файловый / образ раздела** | Быстрый откат ОС/данных | Еженедельно |
| **C. Полный диск / VM / хост** | 1:1 железо или гипервизор | Ежемесячно / перед изменениями |

Для «кармана» обычно: **A каждый день + C раз в месяц** (или снапшот у хостера/Hyper-V).

## 2. Золотые правила

1. **3-2-1:** 3 копии, 2 носителя, 1 offsite (другой офис/облако/HDD дома).
2. Бэкап **проверяют** (restore test), иначе это надежда, не бэкап.
3. Живые БД не копировать слепым `cp`/`xcopy` — только dump/VSS/snapshot.
4. Секреты (пароли, ключи, LUKS, BitLocker) хранить **отдельно и зашифрованно**.
5. Расписание + ротация + мониторинг ошибок (письмо/лог/exit code).

## 3. Что обязательно включать

### Linux VPS / сервер
- `/etc`, SSH, firewall, nginx/caddy
- БД: Postgres/MySQL/SQLite dumps
- Docker compose + volume dumps
- WireGuard / VPN панели / сертификаты
- Список пакетов и enabled services

### Windows Server
- System State (AD/DNS/DHCP роли — особенно важно)
- Данные приложений и SQL (отдельный dump)
- Состояние загрузчика / EFI при image backup

### Hyper-V
- Конфиг VM + VHDX/VHD (через Export или WSB)
- Inventory (VM list, vSwitch, VLAN)
- Не полагаться только на checkpoint как на бэкап

## 4. Популярные в РФ ОС

| ОС | Семейство | Инструмент в этом наборе |
| --- | --- | --- |
| Debian / Ubuntu | deb | `tools/vps-backup` + `linux/backup-linux.sh` |
| Astra Linux | deb-like | то же (`--profile`) |
| RED OS | RHEL-like | то же (rpm inventory) |
| ALT Linux | rpm/apt гибрид | smart + свои EXTRA_PATHS |
| Rosa / РЕД ОС рабочие станции | rpm | файловый rsync + home |
| Windows 10/11 / Server 2016–2022/2025 | NT | `windows/*.ps1` |
| Hyper-V Server / роль Hyper-V | NT | `hyper-v/*.ps1` |

## 5. Горячий vs холодный бэкап

- **Горячий:** dumps + VSS (Windows) + LVM/ZFS snapshot (Linux) — сервис работает.
- **Холодный:** Live USB / выключенная VM — самый чистый образ дисков.

Автоматизация в проде почти всегда **горячая (A)** + периодический **холодный/образ (C)**.
