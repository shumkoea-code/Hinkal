# WG Panel — веб-панель WireGuard (1 клик)

Защищённый HTTPS-интерфейс для создания пиров WireGuard, раздачи `.conf` / QR и ссылок пользователям **без пароля админа**.

| | |
| --- | --- |
| **URL** | `https://v1.idivles.ru:8447/` |
| **Код** | `tools/wg-panel/` |
| **На сервере** | `/opt/wg-panel/` |
| **WG** | `wg0` · UDP `51820` · `10.0.8.0/24` |
| **Пароль** | только на сервере: `/opt/wg-panel/admin.bootstrap` (после первого старта) |

Связано: [WIREGUARD-ROUTERS.md](./WIREGUARD-ROUTERS.md) · [WG-AUDIT.md](./WG-AUDIT.md) · [SECURITY-AND-HARDENING.md](./SECURITY-AND-HARDENING.md)

---

## 1. Зачем

Раньше конфиги Keenetic/MikroTik лежали в `/root/keenetic-wg/` и раздавались через `scp`. Панель даёт:

1. **Один клик** — создать пир (ключ, IP, запись в `wg0`).
2. **Скачать `.conf` / QR** в браузере.
3. **Ссылка для пользователя** (`/s/<token>/page`) с лимитом скачиваний и TTL — без логина админа.
4. **Бан IP**: 2 ошибки входа → блокировка на 1 час.
5. **Nginx rate-limit** + TLS + security headers (анти-абьюз / смягчение DDoS на HTTP-слой).
6. Топ DNS-аудита на дашборде (если включён `wg-audit`).

---

## 2. Быстрый старт для админа

1. Откройте `https://v1.idivles.ru:8447/login`.
2. Логин/пароль: с сервера  
   `cat /opt/wg-panel/admin.bootstrap`  
   (формат `username=` / `password=`). Сохраните пароль и удалите файл.
3. На главной введите имя (`router-home`, `phone1`…) → **Создать WireGuard-конфиг**.
4. Скачайте `.conf`, покажите QR или нажмите **Создать ссылку** и отправьте URL пользователю.
5. Пользователь открывает ссылку → «Скачать .conf» → импорт в Keenetic / MikroTik / приложение WireGuard.

Инструкция внутри UI: `/instructions`.

---

## 3. Безопасность

| Мера | Как |
| --- | --- |
| HTTPS | nginx `:8447`, сертификат `v1.idivles.ru` |
| Отдельный порт | не смешан с сайтом/VPN на `:443` |
| Rate-limit login | `5r/m`, burst 3 |
| Rate-limit общий | `30r/m`, burst 20 |
| Conn limit | 15 соединений с IP |
| Бан после ошибок | **2** неверных логина → бан IP на **3600 с** |
| Сессия | HttpOnly, Secure, SameSite=Lax, ~8 ч |
| Пароль | PBKDF2-HMAC-SHA256, 200k итераций |
| App bind | только `127.0.0.1:8787` |
| Секреты | не в git; `admin.bootstrap`, `secret_key`, `panel.db` только на диске |

Снять бан: в панели «Блокировки IP» → **Снять**, либо:

```bash
sqlite3 /opt/wg-panel/panel.db "DELETE FROM bans; DELETE FROM login_fails;"
```

UFW: `8447/tcp` открыт. UDP `51820` — для самих туннелей WG (не панели).

---

## 4. Установка / обновление на VPS

Из репозитория (на сервере или через `scp` + `install.sh`):

```bash
# пример с рабочей станции
rsync -avz -e 'ssh -p 4488' tools/wg-panel/ root@77.110.125.241:/tmp/wg-panel-src/
ssh -p 4488 root@77.110.125.241 'bash /tmp/wg-panel-src/deploy/install.sh'
```

Скрипт:

- копирует код в `/opt/wg-panel`
- создаёт venv `/opt/wg-panel/venv` и ставит `flask`, `qrcode`, `Pillow`, `waitress`
- включает `wg-panel.service` (ExecStart через venv)
- кладёт nginx site + `limit_req` zones
- `ufw allow 8447/tcp`

Файлы деплоя: `tools/wg-panel/deploy/`.

### Переменные окружения (systemd)

| Переменная | По умолчанию | Смысл |
| --- | --- | --- |
| `WG_PUBLIC_BASE` | `https://v1.idivles.ru:8447` | абсолютные share-ссылки |
| `WG_ENDPOINT` | `77.110.125.241:51820` | Endpoint в клиентском `.conf` |
| `WG_BAN_AFTER` | `2` | ошибок до бана |
| `WG_BAN_SECONDS` | `3600` | длительность бана |
| `WG_CLIENT_DNS` | `10.0.8.1` | DNS в клиентах (аудит) |
| `WG_ADMIN_PASSWORD` | (пусто) | задать до первого старта, иначе bootstrap-файл |

---

## 5. Как устроено

```
Браузер ──TLS:8447──► nginx (rate-limit) ──► 127.0.0.1:8787 (waitress/Flask)
                                                      │
                                                      ├─ SQLite panel.db (пиры, баны, share-токены)
                                                      ├─ /opt/wg-panel/peers/*.conf
                                                      └─ wg syncconf → /etc/wireguard/wg0.conf + runtime wg0
```

- Создание пира: ключи `wg genkey` / `wg pubkey`, следующий свободный IP в `10.0.8.0/24` (начиная с `.2`).
- `persist_wg_conf()` переписывает peer-секции `wg0.conf` из БД и делает `wg-quick strip` + `wg syncconf <iface> <file>` (без даунтайма интерфейса).
- Кнопка **Синхронизировать wg0** — повторный sync, если что-то пошло не так.
- При первом пустом DB импортируются `keenetic` / `mikrotik` из `/root/keenetic-wg/*.conf`, если файлы есть.

Share-токен: TTL 1–168 ч, 1–20 скачиваний. Публичные маршруты: `/s/<token>/page`, `/s/<token>`, `/s/<token>/qr.png`.

---

## 6. Раздача пользователю (инструкция)

1. Админ создаёт пир и ссылку.
2. Пользователь открывает ссылку (логин не нужен).
3. Скачивает `.conf` или сканирует QR.
4. **Keenetic:** Интернет → WireGuard → добавить → импорт файла → включить → маршрут `0.0.0.0/0` при необходимости.  
5. **MikroTik:** WinBox Files → upload → `/import file-name=...` или ручной peer; либо приложение WireGuard.  
6. **Телефон/ПК:** официальный клиент WireGuard → Add tunnel → файл / QR.

Подробно по роутерам: [WIREGUARD-ROUTERS.md](./WIREGUARD-ROUTERS.md).

DNS в конфиге уже `10.0.8.1` — нужен для учёта посещений ([WG-AUDIT.md](./WG-AUDIT.md)).

---

## 7. Проверки

```bash
systemctl status wg-panel --no-pager
curl -sk -o /dev/null -w '%{http_code}\n' https://127.0.0.1:8447/login   # 200
wg show wg0
ufw status | grep 8447
```

После создания пира в `wg show` должен появиться peer с `AllowedIPs = 10.0.8.X/32`.

---

## 8. Ограничения

- Панель управляет **одним** интерфейсом `wg0` (не 3X-UI / не VLESS).
- Запуск от `root` нужен для `wg`/`wg-quick` (можно позже вынести capabilities).
- HTTP anti-DDoS = rate-limit + бан логина; объёмный L3/L4 DDoS на UDP 51820 — отдельная тема (провайдер / fail2ban / Cloudflare Spectrum и т.п.).
- Не публикуйте `admin.bootstrap`, `panel.db`, приватные ключи в git и чаты.
