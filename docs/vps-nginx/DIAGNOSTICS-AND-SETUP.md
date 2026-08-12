# Диагностика и настройка: сайт + VPN на 443

**Сервер:** `v1.idivles.ru` / `77.110.125.241`  
**Дата работ:** 12 августа 2026  
**Панель:** 3X-UI 3.6.0, Xray 26.7.28  

> В этом документе **нет паролей**. Доступы храните отдельно.

---

## 1. Краткий вердикт

На порту 443 уже была правильная идея — **SNI-мультиплексор** (nginx `stream` + `ssl_preread`):

| Кто стучится на :443 | Куда уходит | Результат до правок | После правок |
| --- | --- | --- | --- |
| Браузер, SNI=`tyoung.idivles.ru` | `127.0.0.1:8443` → Next.js портал | Сайт работал | Работает |
| Браузер, SNI=`v1.idivles.ru` | `default` → Xray `:10443` | Сайт «сломан» | Маскировочная страница |
| VLESS-клиент **без TLS** (`security=none`) | `default` → Xray `:10443` | Работал, но ссылки указывали на `:10443` | Работает через `:443` |
| Прямой заход на `:10443` с интернета | Xray только на localhost / RST | Не работал | Так и должно быть (backend) |

**Главная ошибка в клиентских ссылках:** в подписке был порт **10443**, хотя публичная точка входа — **443**.

---

## 2. Диагностика (что смотрели и зачем)

### 2.1. Снаружи (до SSH)

1. `TCP :10443` открывается, но любой TLS/HTTP → **RST**.
2. `TCP :443` отвечает **cleartext HTTP/2** (SETTINGS-фрейм) — это Xray gRPC за stream-default.
3. TLS на `:443` с SNI `v1.idivles.ru` → `wrong version number` (трафик попадал в Xray, а не в HTTPS-сайт).
4. TLS на `:443` с SNI `tyoung.idivles.ru` → **сайт 200 OK** («Центр развития молодежи Сочи»).
5. Официальный Xray-клиент:
   - `vless + grpc + security=none @ :10443` → FAIL  
   - тот же конфиг `@ :443` → **OK**, выход `ip=77.110.125.241`

### 2.2. На сервере по SSH (`:4488`)

Слушатели:

```text
nginx  0.0.0.0:80, 0.0.0.0:443
nginx  127.0.0.1:8443   (HTTPS портала tyoung)
nginx  127.0.0.1:8445   (после правок: HTTPS v1)
xray   127.0.0.1:10443  (VLESS gRPC backend)
xray   *:10000 / *:20000 / *:30001  (доп. варианты)
x-ui   *:444 (панель), *:2096 (подписка)
sshd   *:4488
```

Ключевой файл (был):

```nginx
# /etc/nginx/stream.d/tyoung-sni.conf (ДО)
map $ssl_preread_server_name $yp_backend {
    tyoung.idivles.ru 127.0.0.1:8443;
    default           127.0.0.1:10443;
}
server {
    listen 443 reuseport;
    ssl_preread on;
    proxy_pass $yp_backend;
}
```

Пояснение схемы:

- `ssl_preread` читает **только SNI** из ClientHello, не расшифровывая TLS.
- Если клиент пришёл **без TLS** (как VLESS `security=none` + gRPC/h2c) — SNI пустой → `default` → Xray.
- Если браузер открыл `https://tyoung.idivles.ru` — SNI совпал → локальный HTTPS на `:8443`.

Именно поэтому «сайт на 443» (tyoung) и VPN могли сосуществовать. Ломалось:

1. ссылки VPN на порт 10443;
2. заход на `https://v1.idivles.ru` (попадал в Xray вместо страницы).

### 2.3. Firewall (UFW)

Были открыты: `80, 443, 444, 2096, 4488, 10443, 2053, 33333, …`  
**Не были открыты:** `10000, 20000, 30001` — поэтому Reality-варианты снаружи не работали, пока Xray их уже слушал.

---

## 3. Что сделано

### 3.1. Панель 3X-UI

- Добавлен Host `nginx-grpc-443`:
  - address `v1.idivles.ru`
  - port **443**
  - security **`none`** (осознанно: клиенты без TLS попадают в `default` → Xray)
- Все клиентские ссылки / подписка теперь отдают `:443`, не `:10443`.
- Созданы доп. inbound’ы:
  - `VLESS-Reality-TCP-10000`
  - `VLESS-Reality-XHTTP-20000` (dest Reality сменён с microsoft → **cloudflare**, иначе RST)
  - `VLESS-WS-TLS-30001`

### 3.2. nginx на сервере

**Бэкап:** `/etc/nginx/stream.d/tyoung-sni.conf.bak.YYYYMMDDHHMMSS`

**Новая stream-карта:**

```nginx
map $ssl_preread_server_name $yp_backend {
    tyoung.idivles.ru 127.0.0.1:8443;   # сайт портала
    v1.idivles.ru     127.0.0.1:8445;   # маска v1 + опциональный /gun
    default           127.0.0.1:10443;  # VLESS security=none
}
```

**Новый HTTP vhost:** `/etc/nginx/sites-available/v1-idivles-ssl`  
слушает только `127.0.0.1:8445` (снаружи напрямую не виден):

- `/` → маскировочная страница `/var/www/v1.idivles.ru/`
- `/gun` → `grpc_pass grpc://127.0.0.1:10443` (запасной путь для клиентов с `security=tls`)

### 3.3. UFW

Открыты порты доп. вариантов:

```bash
ufw allow 10000/tcp   # Reality TCP
ufw allow 20000/tcp   # Reality XHTTP
ufw allow 30001/tcp   # WS+TLS
```

---

## 4. Итоговая архитектура

```text
                    Интернет
                       │
              ┌────────┴────────┐
              │   :443 nginx    │  stream + ssl_preread
              │   SNI switch    │
              └────────┬────────┘
         ┌─────────────┼──────────────┐
         │             │              │
 SNI tyoung      SNI v1.idivles    нет TLS / иной SNI
         │             │              │
         ▼             ▼              ▼
   127.0.0.1:8443  127.0.0.1:8445  127.0.0.1:10443
   HTTPS портал    HTTPS маска     Xray VLESS gRPC
   → :3000 Docker  + location /gun     security=none
                   → grpc Xray
```

Дополнительно (мимо 443):

| Порт | Назначение | Статус теста |
| --- | --- | --- |
| 444 | 3X-UI панель | OK |
| 2096 | Подписка | OK |
| 10000 | Reality + TCP + Vision | OK |
| 20000 | Reality + XHTTP | OK (после смены dest на Cloudflare) |
| 30001 | VLESS + WS + TLS | OK |
| 4488 | SSH | OK |

---

## 5. Проверки после настройки

Выполнено с рабочей станции агента:

| # | Проверка | Результат |
| --- | --- | --- |
| 1 | `https://tyoung.idivles.ru/` | HTTP 200, title портала Сочи |
| 2 | `https://v1.idivles.ru/` | HTTP 200, маскировочная страница |
| 3 | VLESS gRPC `security=none` → `:443` | OK, `ip=77.110.125.241` |
| 4 | Reality TCP `:10000` | OK |
| 5 | Reality XHTTP `:20000` | OK |
| 6 | WS+TLS `:30001` | OK |
| 7 | Панель `:444` | HTTP 200 |

---

## 6. Как пользоваться

### Основной VPN (рекомендуется всем клиентам)

1. Обновить подписку: `https://v1.idivles.ru:2096/sub/pepewtfa/<subId>`
2. В ссылке должно быть **`@v1.idivles.ru:443`** и **`security=none`**, `type=grpc`, `serviceName=gun`, `authority=max.ru`.
3. **Не** подключаться на порт 10443.

### Сайт

- Публичный портал: https://tyoung.idivles.ru/
- Маска на VPN-домене: https://v1.idivles.ru/

### Запасные профили (из панели, inbound’ы 12–14)

Имеет смысл для клиентов, у которых режут gRPC. Нужен современный Xray ≥ 26.3.27.

---

## 7. Почему Host оставлен как `security=none`

В этой SNI-схеме это **правильно**:

- клиент без TLS → пустой SNI → `default` → Xray;
- браузер с TLS и SNI сайта → отдельный backend.

Если переключить Host на `security=tls`, клиенты начнут слать TLS+SNI=`v1.idivles.ru` и попадут на `:8445`, где gRPC доступен только в `location /gun`. Это тоже можно, но тогда нужно менять ссылки/`serviceName` и переучивать клиентов. Текущий рабочий путь — `none` на `:443`.

---

## 8. Откат

```bash
# вернуть старую stream-карту
cp -a /etc/nginx/stream.d/tyoung-sni.conf.bak.* /etc/nginx/stream.d/tyoung-sni.conf
# выбрать нужный бэкап по дате
rm -f /etc/nginx/sites-enabled/v1-idivles-ssl
nginx -t && systemctl reload nginx
```

В панели Host `nginx-grpc-443` можно отключить — ссылки снова возьмут порт listen (10443), что **ломает** клиентов.

---

## 9. Файлы на сервере (изменённые)

| Путь | Назначение |
| --- | --- |
| `/etc/nginx/stream.d/tyoung-sni.conf` | SNI-роутер :443 |
| `/etc/nginx/stream.d/tyoung-sni.conf.bak.*` | бэкап до правок |
| `/etc/nginx/sites-available/v1-idivles-ssl` | HTTPS v1 на 127.0.0.1:8445 |
| `/etc/nginx/sites-enabled/v1-idivles-ssl` | symlink |
| `/var/www/v1.idivles.ru/index.html` | маскировочная страница |
| `/root/cert/v1.idivles.ru/*.pem` | сертификат v1 (без изменений) |
| `/etc/nginx/sites-available/tyoung-portal-ssl` | портал на 127.0.0.1:8443 (без изменений) |

Логи диагностики агента: `docs/vps-nginx/logs/` в этом репозитории.

---

## 10. Рекомендации на потом

1. gRPC в Xray помечен deprecated — постепенно переводить клиентов на **Reality + XHTTP/TCP**.
2. Reality лучше держать ближе к 443; не-443 порты Xray сам помечает как более заметные для блокировок.
3. Не светить `:10443` в UFW наружу без нужды — это только backend.
4. Деплой sochi-portal не должен перезаписывать `stream.d/tyoung-sni.conf` без строки `v1.idivles.ru`.
