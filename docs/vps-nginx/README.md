# VPS idivles — сайт + скрытый VPN на 443

## Документы

| Документ | Описание |
| --- | --- |
| **[USER-GUIDE.md](./USER-GUIDE.md)** | Как подключаться (4 профиля на 443) |
| **[FULL-WORK-REPORT.md](./FULL-WORK-REPORT.md)** | Полный отчёт + верификация |
| [DIAGNOSTICS-AND-SETUP.md](./DIAGNOSTICS-AND-SETUP.md) | Первичная диагностика (этап A) |
| [live/](./live/) | Актуальные nginx-конфиги с сервера |
| [logs/](./logs/) | Сырые логи диагностики и тестов |

## Сейчас на сервере

| Что | URL / профиль |
| --- | --- |
| Сайт | https://tyoung.idivles.ru/ |
| Маска | https://v1.idivles.ru/ |
| VPN **телефон** | **Mobile-TLS-WS** (TLS+WS на `v1.idivles.ru`) + gRPC TLS |
| VPN основной (ПК) | Reality + XHTTP, SNI Cloudflare |
| VPN скорость | Reality + TCP Vision, SNI Apple |
| VPN Alt | Reality + XHTTP, SNI Samsung |
| VPN legacy | gRPC none (`:443`) |
| Панель | https://v1.idivles.ru:444/… |
| Подписка | `https://v1.idivles.ru:2096/sub/pepewtfa/<subId>` |

## GitHub

https://github.com/shumkoea-code/Hinkal/tree/cursor/cursor-subscription-limits-ru-docs-59b1/docs/vps-nginx
