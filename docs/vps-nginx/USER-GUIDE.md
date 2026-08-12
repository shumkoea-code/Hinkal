# Краткая инструкция (шпаргалка)

**Подробный разбор со схемами и FAQ:**  
**[DETAILED-INSTRUCTION.md](./DETAILED-INSTRUCTION.md)** ← читайте её, если нужны пояснения «почему так».

**Сервер:** `v1.idivles.ru` · **Панель:** https://v1.idivles.ru:444/t0HAtL75Ph0mDWoZPq/  
**Подписка:** `https://v1.idivles.ru:2096/sub/pepewtfa/<subId>`

---

## Телефон (LTE)

Оператор часто режет **Reality**. Нужен профиль с **настоящим TLS** на свой домен.

1. Удалить старую подписку → добавить URL выше заново.
2. Включить **Mobile-TLS-WS** (первый в списке).
3. Не помогло → **gRPC-443** с `security=tls` → потом `security=none`.

В URI должно быть `v1.idivles.ru:443`, не `localhost` и не порт `1044x`.

---

## Компьютер / Wi‑Fi

| Приоритет | Профиль |
| --- | --- |
| 1 | Stealth-Reality-XHTTP (SNI Cloudflare) |
| 2 | Speed-Reality-TCP-Vision (SNI Apple) |
| 3 | Alt-Reality-XHTTP-Samsung |
| запас | Mobile-TLS-WS |

Клиент с Xray ≥ 26.3.27.

---

## Сайты

- https://tyoung.idivles.ru/ — портал  
- https://v1.idivles.ru/ — маска  

Оба на том же `:443`, что и VPN.

---

## Полный отчёт

[FULL-WORK-REPORT.md](./FULL-WORK-REPORT.md)
