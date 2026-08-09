# VPS: новый сайт и резервный клон

Краткая витринная страница. Полная инструкция: [docs/ops/vps-provision-and-ha.md](docs/ops/vps-provision-and-ha.md).

## Два режима (`tools/yp-provision`)

1. **Greenfield** — чистый портал для другой организации (домен/название/админ с нуля).  
2. **HA clone** — standby-копия young.idivles.ru: `pg_dump` + `rsync uploads`, systemd timers, `yp-ha-promote`, опциональный heartbeat в админку.

```bash
./tools/yp-provision/bin/yp-provision
```

Мастер сначала спрашивает IP/порт/логин/пароль (или ключ) VPS, затем параметры сайта или primary.

## Админка

Заготовки UI/API: `tools/yp-provision/admin-stubs/` → раздел **Система → Репликация** (секрет, peer, статус sync/heartbeat, failover mode).

## Навбар (скриншоты с наложением)

Патч: `code/navbar-overlap/` — иконки/бейдж уведомлений не должны перекрывать пункты меню; hamburger раньше на узких desktop-ширинах. Деплой на прод — после восстановления SSH.
