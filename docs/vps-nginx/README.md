# VPS idivles — сайт + скрытый VPN на 443

## Документы (читать отсюда)

| Документ | Описание |
| --- | --- |
| **[USER-GUIDE.md](./USER-GUIDE.md)** | Инструкция: как подключаться после апгрейда |
| **[FULL-WORK-REPORT.md](./FULL-WORK-REPORT.md)** | Полный отчёт о всей проделанной работе |
| [DIAGNOSTICS-AND-SETUP.md](./DIAGNOSTICS-AND-SETUP.md) | Первичная диагностика (этап A) |
| [live/](./live/) | Актуальные nginx-конфиги с сервера |
| [logs/](./logs/) | Сырые логи диагностики и тестов |

## Сейчас на сервере

- **Сайт:** https://tyoung.idivles.ru/
- **Маска:** https://v1.idivles.ru/
- **Основной VPN:** VLESS + REALITY + XHTTP на `:443` (SNI `www.cloudflare.com`)
- **Legacy:** VLESS + gRPC + none на `:443` (временно)
- **Панель:** https://v1.idivles.ru:444/…  
- **Подписка:** `https://v1.idivles.ru:2096/sub/pepewtfa/<subId>`

## GitHub

https://github.com/shumkoea-code/Hinkal/tree/cursor/cursor-subscription-limits-ru-docs-59b1/docs/vps-nginx
