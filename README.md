# Hinkal

Репозиторий: документация VPS/VPN + **WG Panel** (веб-админка WireGuard).

## Скачать проект

| Что | Ссылка |
| --- | --- |
| **ZIP всей ветки (актуально)** | https://github.com/shumkoea-code/Hinkal/archive/refs/heads/cursor/cursor-subscription-limits-ru-docs-59b1.zip |
| Репозиторий | https://github.com/shumkoea-code/Hinkal |
| Ветка с панелью и доками | https://github.com/shumkoea-code/Hinkal/tree/cursor/cursor-subscription-limits-ru-docs-59b1 |
| Только WG Panel | https://github.com/shumkoea-code/Hinkal/tree/cursor/cursor-subscription-limits-ru-docs-59b1/tools/wg-panel |
| **Universal VPS backup** | https://github.com/shumkoea-code/Hinkal/tree/cursor/cursor-subscription-limits-ru-docs-59b1/tools/vps-backup |
| PR | https://github.com/shumkoea-code/Hinkal/pull/12 |

```bash
# клон
git clone -b cursor/cursor-subscription-limits-ru-docs-59b1 https://github.com/shumkoea-code/Hinkal.git
cd Hinkal

# установка панели на сервер
bash tools/wg-panel/deploy/install.sh
```

## Документация

- [Подписка Cursor: лимиты, тарифы и возможности](docs/cursor-subscription-limits-ru.md) — справочник на русском (актуально на 11 августа 2026). Версии для скачивания: [PDF](docs/cursor-subscription-limits-ru.pdf), [HTML](docs/cursor-subscription-limits-ru.html).

Пересобрать HTML и PDF из Markdown:

```bash
pip install markdown
python3 docs/build_pdf.py
```

## VPS idivles (сайт + VPN на 443)

Полный журнал диагностики и настройки: [docs/vps-nginx/DIAGNOSTICS-AND-SETUP.md](docs/vps-nginx/DIAGNOSTICS-AND-SETUP.md).

### Быстрые ссылки VPS

- Подробная разъясняющая инструкция: [docs/vps-nginx/DETAILED-INSTRUCTION.md](docs/vps-nginx/DETAILED-INSTRUCTION.md)
- Keenetic / MikroTik WireGuard: [docs/vps-nginx/WIREGUARD-ROUTERS.md](docs/vps-nginx/WIREGUARD-ROUTERS.md)
- WG Panel (1 клик, HTTPS): [docs/vps-nginx/WG-PANEL.md](docs/vps-nginx/WG-PANEL.md)
- Учёт WG (куда ходят, ID): [docs/vps-nginx/WG-AUDIT.md](docs/vps-nginx/WG-AUDIT.md)
- Keenetic (кратко): [docs/vps-nginx/KEENETIC-ROUTER.md](docs/vps-nginx/KEENETIC-ROUTER.md)
- Краткая шпаргалка: [docs/vps-nginx/USER-GUIDE.md](docs/vps-nginx/USER-GUIDE.md)
- Защита и оптимизация: [docs/vps-nginx/SECURITY-AND-HARDENING.md](docs/vps-nginx/SECURITY-AND-HARDENING.md)
- Полный отчёт: [docs/vps-nginx/FULL-WORK-REPORT.md](docs/vps-nginx/FULL-WORK-REPORT.md)
