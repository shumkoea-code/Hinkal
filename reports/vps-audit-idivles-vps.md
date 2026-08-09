# VPS security audit — vless.dikcn.online

- Дата: 2026-08-09 06:24:52 UTC
- Оценка: **F (43/100)** — высокие: 3, средние: 2, низкие: 0

| Уровень | Проверка | Детали |
|---|---|---|
| INFO | OS | Debian GNU/Linux 12 (bookworm) \| kernel 6.1.0-26-amd64 |
| INFO | Uptime/Load | 09:24:41 up  9:22,  0 user,  load average: 0.37, 0.39, 0.45 |
| INFO | CPU/RAM | cores=1 \| mem 958Mi/1.9Gi avail 1.0Gi |
| OK | Swap | 2047MB |
| OK | Диск / | 62% used, 12G free |
| HIGH | Обновления безопасности | 12 security-пакетов ждут установки (всего 17) |
| OK | unattended-upgrades | установлен |
| OK | UID 0 | только root |
| OK | Пустые пароли | нет |
| OK | sudo NOPASSWD | не найдено |
| HIGH | PermitRootLogin | yes (прямой вход root по паролю) |
| MED | PasswordAuthentication | yes (пароли включены — рекомендуются ключи) |
| OK | SSH-порт | 4488 (нестандартный) |
| OK | ufw | active |
| OK | fail2ban | работает, jails: 3x-ipl, sshd |
| MED | Публичные порты | 9 портов слушают на всех интерфейсах — проверьте необходимость |
| OK | Privileged-контейнеры | нет |
| OK | docker.sock | не проброшен в контейнеры |
| INFO | docker.sock права | 660 |
| OK | World-writable файлы | не найдено (вне tmp) |
| OK | .env права | нет .env, читаемых всеми |
| INFO | cron задания | 22 строк (crontab+/etc/cron.*) |
| INFO | systemd timers | 10 |
| OK | net.ipv4.conf.all.rp_filter | 1 |
| OK | net.ipv4.tcp_syncookies | 1 |
| OK | kernel.randomize_va_space | 2 |
| OK | net.ipv4.conf.all.accept_redirects | 0 |
| OK | TLS max.idivles.ru | ещё 87 дн |
| OK | TLS rtb.idivles.ru | ещё 86 дн |
| HIGH | TLS shumko.tech | истёк (Jul  7 16:46:26 2026 GMT) |
| OK | TLS test.dikcn.online | ещё 82 дн |
| OK | TLS xvideos.idivles.ru | ещё 83 дн |
| OK | TLS xxxtik.idivles.ru | ещё 83 дн |
| OK | TLS young.idivles.ru | ещё 83 дн |
| INFO | Журналы | auth.log недоступен (может использоваться journald) |

> Аудит только читал состояние системы и ничего не менял.
