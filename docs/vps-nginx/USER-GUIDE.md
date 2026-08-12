# Инструкция: как подключаться после стелс-апгрейда

**Сервер:** `v1.idivles.ru` (`77.110.125.241`)  
**Панель:** https://v1.idivles.ru:444/t0HAtL75Ph0mDWoZPq/  
**Дата:** 12 августа 2026

---

## Что изменилось для пользователей

Раньше основной профиль был **VLESS + gRPC без TLS** на порту 443 (устаревший и заметный транспорт).

Теперь основной профиль:

| Параметр | Значение |
| --- | --- |
| Протокол | **VLESS** |
| Транспорт | **XHTTP** (вместо gRPC) |
| Защита | **REALITY** |
| Адрес | `v1.idivles.ru` |
| Порт | **443** |
| SNI | `www.cloudflare.com` |
| Fingerprint | `chrome` |

Трафик выглядит как обычный HTTPS к Cloudflare, идёт через тот же порт, что и сайт.

Старый gRPC-профиль **пока сохранён** (legacy) — чтобы никто не отвалился сразу. В подписке будут **два** рабочих линка на 443: сначала stealth, потом legacy.

---

## Что сделать клиентам (обязательно)

1. Обновить подписку / заново импортировать:
   ```text
   https://v1.idivles.ru:2096/sub/pepewtfa/<ваш_subId>
   ```
2. В списке серверов выбрать профиль с **`security=reality`** и **`type=xhttp`** (не grpc).
3. Нужен клиент на базе **Xray-core ≥ 26.3.27** (v2rayN свежий, Hiddify, Streisand, Happ, и т.п.).
4. **Не** подключаться на порт `10443` — это внутренний backend.

### Как отличить правильный линк

В URI должно быть примерно так:

```text
vless://…@v1.idivles.ru:443?type=xhttp&security=reality&sni=www.cloudflare.com&fp=chrome&pbk=…&sid=…&path=/…
```

Если видите `type=grpc` и `security=none` — это старый legacy. Работает, но лучше перейти на Reality.

---

## Сайты (не трогали бизнес-логику)

| URL | Назначение |
| --- | --- |
| https://tyoung.idivles.ru/ | Портал «Центр развития молодежи Сочи» |
| https://v1.idivles.ru/ | Маскировочная страница инфраструктуры |

Оба открываются по HTTPS на порту 443 одновременно с VPN.

---

## Запасные профили (если Reality на 443 режут)

В панели есть backup-inbound’ы (для тестов/особых случаев):

| Remark | Порт | Тип |
| --- | --- | --- |
| BACKUP-Reality-TCP-10000 | 10000 | Reality + TCP + Vision (быстрый) |
| BACKUP-Reality-XHTTP-20000 | 20000 | Reality + XHTTP |

Они менее скрытные, чем порт 443 (Xray сам предупреждает про non-443 Reality).

---

## Админу: где смотреть

- Панель inbounds: `Stealth-Reality-XHTTP` (id 15) — основной  
- Hosts: `stealth-reality-443` (первый в списке)  
- Legacy: `LEGACY-gRPC-none` + host `LEGACY-grpc-none-443`  
- Полный технический отчёт: [FULL-WORK-REPORT.md](./FULL-WORK-REPORT.md)

---

## Быстрая самопроверка

```bash
# сайты
curl -I https://tyoung.idivles.ru/
curl -I https://v1.idivles.ru/

# подписка отдаёт reality+xhttp
curl -sk https://v1.idivles.ru:2096/sub/pepewtfa/<subId> | base64 -d | head -3
```
