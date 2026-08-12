# Сайт + VLESS/gRPC на одном 443

## В чём сейчас проблема

На сервере `v1.idivles.ru` сейчас так:

| Порт | Что отвечает | Нормально? |
| --- | --- | --- |
| **80** | nginx → редирект на `https://v1.idivles.ru/` | да |
| **443** | **не TLS и не сайт**, а raw HTTP/2 (gRPC для Xray) | **нет** |
| **444** | панель 3X-UI (TLS) | да |
| **2096** | подписка (TLS) | да |
| **10443** | Xray VLESS+gRPC только на `127.0.0.1` | да (это backend) |

Поэтому:

1. Браузер попадает на HTTPS → 443 → «сайт сломан» (`wrong version number`).
2. Клиенты VPN, которым в ссылке написали `:10443`, тоже не работают — снаружи этот порт не входная точка.
3. Клиенты, которым указали `:443` с `security=none`, сейчас ходят в gRPC **напрямую** и проксируется, но сайт при этом мёртв.

Нужно вернуть на 443 нормальный **HTTPS (TLS) + сайт**, а gRPC пускать **через тот же nginx** на backend `127.0.0.1:10443`.

```text
Клиент браузера ──TLS──► :443 nginx ──► файлы сайта / PHP / proxy_pass
Клиент VLESS    ──TLS──► :443 nginx ──grpc_pass──► 127.0.0.1:10443 (Xray)
```

Xray inbound `Telegram` **не трогаем**: он как и был `listen=127.0.0.1`, `security=none`, `network=grpc`, `serviceName=gun`.

---

## Шаг 1. На сервере по SSH — починить nginx

Файлы ниже рассчитаны на Debian/Ubuntu + nginx 1.22 и ваши сертификаты:

- `/root/cert/v1.idivles.ru/fullchain.pem`
- `/root/cert/v1.idivles.ru/privkey.pem`

### 1.1. Найти, что сейчас занимает 443

```bash
ss -tlnp | grep -E ':443|:10443|:80'
ls -la /etc/nginx/sites-enabled/
# или
ls -la /etc/nginx/conf.d/
```

Скорее всего в каком-то server-блоке написано примерно `listen 443 http2;` **без** `ssl` — из‑за этого 443 стал «голым» gRPC и съел сайт.

### 1.2. Поставить конфиг сайта + gRPC

Скопируйте `v1.idivles.ru.conf` в `/etc/nginx/sites-available/` (или `conf.d/`), поправьте `root`/`proxy_pass` под ваш реальный сайт, затем:

```bash
nginx -t && systemctl reload nginx
```

Проверки:

```bash
# Сайт должен отдать HTML по TLS
curl -I https://v1.idivles.ru/

# gRPC backend жив (из localhost)
curl -sI http://127.0.0.1:10443/ | head
```

---

## Шаг 2. В панели 3X-UI — поправить Host

Сейчас Host `nginx-grpc-443` отдаёт клиентам:

- порт `443`
- **`security=none`** ← это под текущий «сломанный» 443 без TLS

После починки nginx нужно сменить на:

| Поле | Значение |
| --- | --- |
| Address / hosts | `v1.idivles.ru` |
| Port | `443` |
| Security | **`tls`** (не `none` и не `same`) |
| SNI | `v1.idivles.ru` |
| Fingerprint | `chrome` |
| ALPN | можно `h2` |

Inbound при этом **не меняем** (внутри по-прежнему `security=none` за nginx).

Клиенты обновляют подписку — в ссылке появится `security=tls&sni=v1.idivles.ru&port=443`.

---

## Шаг 3. Проверка целиком

1. Браузер: `https://v1.idivles.ru/` — открывается сайт.
2. Подписка: `https://v1.idivles.ru:2096/sub/pepewtfa/<subId>` — в ссылках порт 443 и `security=tls`.
3. Клиент (v2rayN / Streisand / Hiddify / Xray) подключается, IP выхода = `77.110.125.241`.

---

## Важные детали по gRPC

- `serviceName=gun` → в nginx location должен быть путь **`/gun`** (у Xray multiMode это `/gun/TunMulti`).
- Заголовок `authority=max.ru` в клиенте — это `:authority` для gRPC, на TLS-сертификат не влияет. SNI для сертификата — `v1.idivles.ru`.
- gRPC в новых версиях Xray **помечен deprecated**, долгосрочно лучше Reality+XHTTP на отдельном порту. Но схема «сайт + gRPC за nginx» рабочая и сейчас нормальна.

---

## Альтернатива (часто проще и надёжнее)

Если не хотите мешать сайт и прокси на одном порту:

1. **443** — только сайт (обычный nginx + TLS).
2. Прокси — отдельный inbound **VLESS + Reality + TCP/XHTTP** на порту вроде `10000` (уже создан в панели).
3. В firewall/security group облака открыть этот порт.

Тогда сайт и VPN вообще не пересекаются.

---

## Что уже сделано в панели

- Host `nginx-grpc-443` → ссылки смотрят на `v1.idivles.ru:443` (сейчас ещё `security=none`).
- Inbound Telegram на `127.0.0.1:10443` — backend, его не нужно «открывать наружу».
- Доп. варианты: Reality-TCP `:10000`, Reality-XHTTP `:20000`, WS-TLS `:30001` (нужно открыть в firewall, если будете ими пользоваться).

После того как на сервере примените nginx из этого каталога — напишите, переключу Host на `security=tls` и прогоню тест сайт+прокси.
