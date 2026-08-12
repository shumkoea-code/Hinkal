# VPS idivles — сайт + скрытый VPN на 443

## Документы (с чего начать)

| Документ | Для кого |
| --- | --- |
| **[DETAILED-INSTRUCTION.md](./DETAILED-INSTRUCTION.md)** | **Подробная разъясняющая инструкция** — архитектура, телефон vs ПК, FAQ |
| [USER-GUIDE.md](./USER-GUIDE.md) | Краткая шпаргалка |
| [FULL-WORK-REPORT.md](./FULL-WORK-REPORT.md) | Полный отчёт о работах и тестах |
| [DIAGNOSTICS-AND-SETUP.md](./DIAGNOSTICS-AND-SETUP.md) | Первичная диагностика (этап A) |
| [live/](./live/) | Актуальные nginx-конфиги с сервера |
| [logs/](./logs/) | Журналы проверок |

## Сейчас на сервере

| Что | URL / профиль |
| --- | --- |
| Сайт | https://tyoung.idivles.ru/ |
| Маска | https://v1.idivles.ru/ |
| VPN **телефон** | **Mobile-TLS-WS** + gRPC TLS на `v1.idivles.ru:443` |
| VPN ПК / Wi‑Fi | Reality: Stealth (CF) · Speed (Apple) · Alt (Samsung) |
| VPN legacy | gRPC none на `:443` |
| Панель | https://v1.idivles.ru:444/… |
| Подписка | `https://v1.idivles.ru:2096/sub/pepewtfa/<subId>` |

## GitHub

https://github.com/shumkoea-code/Hinkal/tree/cursor/cursor-subscription-limits-ru-docs-59b1/docs/vps-nginx

Прямая ссылка на подробную инструкцию:  
https://github.com/shumkoea-code/Hinkal/blob/cursor/cursor-subscription-limits-ru-docs-59b1/docs/vps-nginx/DETAILED-INSTRUCTION.md
