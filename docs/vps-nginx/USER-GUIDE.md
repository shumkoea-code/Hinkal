# Инструкция: как подключаться после стелс-апгрейда

**Сервер:** `v1.idivles.ru` (`77.110.125.241`)  
**Панель:** https://v1.idivles.ru:444/t0HAtL75Ph0mDWoZPq/  
**Дата:** 12 августа 2026 (обновлено — фикс для телефона)

---

## Важно для телефона

На мобильных сетях операторы часто **режут Reality** (чужой SNI Cloudflare/Apple/Samsung при IP нашего VPS).  
Поэтому **gRPC без TLS** у вас работал, а три Reality — нет.

Для телефона в подписке теперь **первые** профили — обычный HTTPS на свой домен:

| Порядок | Имя в подписке | Тип | Что это |
| --- | --- | --- | --- |
| 1 | **Mobile-TLS-WS** | WS + **TLS** на `v1.idivles.ru` | **Берите на телефоне в первую очередь** |
| 2 | **gRPC-443** (`security=tls`) | gRPC + **TLS** через `/gun` | Запасной мобильный |
| 3 | **gRPC-443** (`security=none`) | gRPC без TLS | Старый рабочий вариант |
| 4+ | Stealth / Speed / Alt | Reality… | Чаще для Wi‑Fi / ПК; на LTE могут не идти |

Трафик Mobile-TLS выглядит как обычный заход на сайт `https://v1.idivles.ru/…` — DPI это переваривает лучше, чем Reality.

---

## Что сделать на телефоне

1. **Обновить подписку** (удалить старую и добавить заново):
   ```text
   https://v1.idivles.ru:2096/sub/pepewtfa/<ваш_subId>
   ```
2. Включить **Mobile-TLS-WS** (первый в списке).
3. Если не взлетело — второй **gRPC-443** с `security=tls` (не `none`).
4. Клиент свежий: **Hiddify / Happ / v2rayNG / Streisand** с актуальным ядром.
5. Не используйте порты `10443–10447` — только **443**.

### Как отличить мобильный линк

```text
vless://…@v1.idivles.ru:443?type=ws&security=tls&path=/c410aeaf855fdf46bb88…
```

или

```text
vless://…@v1.idivles.ru:443?type=grpc&security=tls&serviceName=gun…
```

Если в URI `localhost` / `127.0.0.1` / порт `10447` — подписка старая или битая, обновите.

---

## Reality-профили (ПК / Wi‑Fi)

| Профиль | Тип | SNI |
| --- | --- | --- |
| Stealth-Reality-XHTTP | Reality + XHTTP | `www.cloudflare.com` |
| Speed-Reality-TCP-Vision | Reality + TCP + Vision | `www.apple.com` |
| Alt-Reality-XHTTP-Samsung | Reality + XHTTP | `www.samsung.com` |

Нужен Xray ≥ 26.3.27. На LTE, если не коннектятся — это ожидаемо при DPI; сидите на **Mobile-TLS-WS**.

---

## Сайты

| URL | Назначение |
| --- | --- |
| https://tyoung.idivles.ru/ | Портал |
| https://v1.idivles.ru/ | Маска (+ пути VPN) |

---

## Запасные порты

| Remark | Порт | Тип |
| --- | --- | --- |
| BACKUP-Reality-TCP-10000 | 10000 | Reality + TCP + Vision |
| BACKUP-Reality-XHTTP-20000 | 20000 | Reality + XHTTP |

---

## Админу

| Inbound | listen | Назначение |
| --- | --- | --- |
| Mobile-TLS-WS (18) | `127.0.0.1:10447` | телефон, WS за nginx TLS |
| gRPC-443 (1) | `127.0.0.1:10443` | gRPC none + gRPC TLS через `/gun` |
| Stealth (15) | `:10444` | Reality XHTTP |
| Speed (16) | `:10445` | Reality TCP Vision |
| Alt (17) | `:10446` | Reality XHTTP Samsung |

SNI-карта: `docs/vps-nginx/live/tyoung-sni.conf`  
Отчёт: [FULL-WORK-REPORT.md](./FULL-WORK-REPORT.md)
