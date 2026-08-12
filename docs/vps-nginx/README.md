# Подкаталог docs/vps-nginx — документация по сосуществованию сайта и VPN на VPS idivles.

## Читать в таком порядке

1. **[DIAGNOSTICS-AND-SETUP.md](./DIAGNOSTICS-AND-SETUP.md)** — полный журнал диагностики и настройки с пояснениями (главный документ).
2. **[live/](./live/)** — актуальные nginx-конфиги, снятые с сервера после правок.
3. Логи сырой диагностики: **[logs/](./logs/)**.

## Как устроено в двух словах

На `:443` стоит не «просто сайт» и не «просто VPN», а **SNI-роутер** (nginx stream):

- `tyoung.idivles.ru` → сайт портала Сочи  
- `v1.idivles.ru` → маскировочная страница (+ запасной gRPC `/gun`)  
- клиенты VLESS без TLS → Xray на `127.0.0.1:10443`

Подписка должна указывать **порт 443**, не 10443.

## Быстрая проверка

```bash
curl -I https://tyoung.idivles.ru/
curl -I https://v1.idivles.ru/
# VPN: обновить подписку https://v1.idivles.ru:2096/sub/pepewtfa/<subId>
```

Старый файл `v1.idivles.ru.conf` / `apply-on-server.sh` описывал упрощённую схему «один HTTP-сервер на 443» — на этом VPS она **не используется**. Реальная схема — SNI stream, см. `DIAGNOSTICS-AND-SETUP.md` и `live/`.
