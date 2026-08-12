# Инструкция: как подключаться после стелс-апгрейда

**Сервер:** `v1.idivles.ru` (`77.110.125.241`)  
**Панель:** https://v1.idivles.ru:444/t0HAtL75Ph0mDWoZPq/  
**Дата:** 12 августа 2026 (обновлено)

---

## Что изменилось для пользователей

Раньше основной профиль был **VLESS + gRPC без TLS** на порту 443.

Сейчас в одной подписке **четыре** рабочих линка на `:443` (в таком порядке):

| # | Профиль в подписке | Тип | SNI | Когда брать |
| --- | --- | --- | --- | --- |
| 1 | **Stealth-Reality-XHTTP** | Reality + **XHTTP** | `www.cloudflare.com` | **Основной** — скрытнее всего |
| 2 | **Speed-Reality-TCP-Vision** | Reality + **TCP + Vision** | `www.apple.com` | Если нужен максимум скорости / XHTTP тупит |
| 3 | **Alt-Reality-XHTTP-Samsung** | Reality + **XHTTP** | `www.samsung.com` | Если режут Cloudflare/Apple SNI |
| 4 | **LEGACY-gRPC-none** | gRPC + `none` (+ PQ) | — | Временный запас, пока не обновились клиенты |

Все идут на `v1.idivles.ru:443` вместе с сайтами — **не** на порты `10443–10446` (это только localhost).

---

## Что сделать клиентам

1. Обновить подписку / заново импортировать:
   ```text
   https://v1.idivles.ru:2096/sub/pepewtfa/<ваш_subId>
   ```
   JSON: `https://v1.idivles.ru:2096/json/pepefa/<subId>`  
   Clash: `https://v1.idivles.ru:2096/clash/<subId>`
2. Выбрать **Stealth** (`type=xhttp`, `security=reality`, SNI Cloudflare). Если не коннектится — **Speed**, потом **Alt**.
3. Клиент на **Xray-core ≥ 26.3.27** (свежий v2rayN / Hiddify / Streisand / Happ).
4. Не указывать порт `10443` / `10444` / `10445` / `10446` вручную.

### Как выглядят правильные URI

```text
# основной
vless://…@v1.idivles.ru:443?type=xhttp&security=reality&sni=www.cloudflare.com&fp=chrome&pbk=…&sid=…&path=/…

# скорость
vless://…@v1.idivles.ru:443?type=tcp&security=reality&flow=xtls-rprx-vision&sni=www.apple.com&fp=chrome&pbk=…&sid=…

# запасной SNI
vless://…@v1.idivles.ru:443?type=xhttp&security=reality&sni=www.samsung.com&fp=chrome&pbk=…&sid=…&path=/…
```

`type=grpc` + `security=none` — это legacy. Работает, но лучше Reality.

---

## Сайты

| URL | Назначение |
| --- | --- |
| https://tyoung.idivles.ru/ | Портал «Центр развития молодежи Сочи» |
| https://v1.idivles.ru/ | Маскировочная страница инфраструктуры |

Оба на том же `:443`, что и VPN.

---

## Запасные порты (не 443)

| Remark | Порт | Тип | Кому |
| --- | --- | --- | --- |
| BACKUP-Reality-TCP-10000 | 10000 | Reality + TCP + Vision | тестовые клиенты в панели |
| BACKUP-Reality-XHTTP-20000 | 20000 | Reality + XHTTP | тестовые клиенты в панели |

Менее скрытные (non-443 Reality). В обычной пользовательской подписке их нет.

---

## Админу

| Inbound | id | listen | Назначение |
| --- | --- | --- | --- |
| Stealth-Reality-XHTTP | 15 | `127.0.0.1:10444` | основной |
| Speed-Reality-TCP-Vision | 16 | `127.0.0.1:10445` | скорость |
| Alt-Reality-XHTTP-Samsung | 17 | `127.0.0.1:10446` | отдельный Alt-SNI |
| LEGACY-gRPC-none | 1 | `127.0.0.1:10443` | legacy |

Порядок в подписке задаётся `inbounds.sub_sort_index` (10 / 20 / 30 / 90).

Полный отчёт: [FULL-WORK-REPORT.md](./FULL-WORK-REPORT.md)

---

## Быстрая самопроверка

```bash
curl -I https://tyoung.idivles.ru/
curl -I https://v1.idivles.ru/
curl -sk https://v1.idivles.ru:2096/sub/pepewtfa/<subId> | base64 -d
```
