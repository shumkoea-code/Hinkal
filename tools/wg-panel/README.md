# WireGuard Admin Panel

Исходники веб-панели для управления `wg0` на VPS idivles.

**Документация (RU):** [../../docs/vps-nginx/WG-PANEL.md](../../docs/vps-nginx/WG-PANEL.md)

## Состав

| Путь | Назначение |
| --- | --- |
| `app.py` | Flask-приложение |
| `templates/` | UI (логин, дашборд, пир, share, инструкция) |
| `deploy/` | nginx, systemd, `install.sh` |
| `requirements.txt` | flask, qrcode, Pillow, waitress |

## Локальный запуск (только для отладки UI)

```bash
cd tools/wg-panel
pip install -r requirements.txt
WG_PANEL_DIR=/tmp/wg-panel-dev PORT=8787 python3 app.py
```

На проде команды `wg` / доступ к `/etc/wireguard` обязательны — используйте `deploy/install.sh` на VPS.
