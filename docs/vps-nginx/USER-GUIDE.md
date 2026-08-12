# Краткая инструкция (шпаргалка)

**Подробно:** [DETAILED-INSTRUCTION.md](./DETAILED-INSTRUCTION.md)  
**Защита сервера:** [SECURITY-AND-HARDENING.md](./SECURITY-AND-HARDENING.md)

**Подписка:** `https://v1.idivles.ru:2096/sub/pepewtfa/<subId>`  
После правок на сервере — **обязательно обновить подписку** в клиенте.

---

## Как читать имена

| Префикс | Куда |
| --- | --- |
| **ТЕЛ+ПК** | Телефон и ПК |
| **ПК·WiFi** | Лучше ПК / домашний Wi‑Fi (на LTE Reality часто режут) |
| **★** | Рекомендуется для телефона |

| Имя | Когда |
| --- | --- |
| **ТЕЛ+ПК · TLS-WS ★** | Телефон / LTE — **первый** |
| **ТЕЛ+ПК · gRPC** (`tls`) | Запас на телефоне |
| **ТЕЛ+ПК · gRPC** (`none`) | Старый рабочий |
| **ПК·WiFi · Stealth Reality** | ПК основной |
| **ПК·WiFi · Speed Vision** | ПК скорость |
| **ПК·WiFi · Alt Samsung** | ПК запасной SNI |

У первого профиля может быть хвост `-логин` — это нормально.

---

## Телефон

1. Удалить старую подписку → добавить URL заново.  
2. Включить **ТЕЛ+ПК · TLS-WS ★**.  
3. Иначе gRPC `tls` → gRPC `none`.  
4. В URI: `v1.idivles.ru:443`, не `localhost` / `1044x`.

---

## ПК / Wi‑Fi

**Stealth** → Speed → Alt → при необходимости TLS-WS.  
Клиент с Xray ≥ 26.3.27.

---

## Сайты

- https://tyoung.idivles.ru/  
- https://v1.idivles.ru/  

---

[FULL-WORK-REPORT.md](./FULL-WORK-REPORT.md)
