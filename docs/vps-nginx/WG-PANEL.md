# WG Panel — веб-панель WireGuard (1 клик)

Защищённый HTTPS-интерфейс для создания пиров WireGuard, раздачи `.conf` / QR и ссылок пользователям **без пароля админа**.

| | |
| --- | --- |
| **База** | `https://v1.idivles.ru:8447/` |
| **Админка** | длинный секретный URL (см. `admin.bootstrap` → `admin_url=`) |
| **Код** | `tools/wg-panel/` |
| **На сервере** | `/opt/wg-panel/` |
| **WG** | `wg0` · UDP `51820` · `10.0.8.0/24` |
| **Пароль / URL** | `/opt/wg-panel/admin.bootstrap`, `/opt/wg-panel/admin_path` |

Связано: [WIREGUARD-ROUTERS.md](./WIREGUARD-ROUTERS.md) · [WG-AUDIT.md](./WG-AUDIT.md) · [SECURITY-AND-HARDENING.md](./SECURITY-AND-HARDENING.md)

---

## 1. Возможности

1. **Секретный длинный путь** админки — корень и `/login` без секрета → **404**.
2. **1 клик** — создать пир (ключи, IP, sync в `wg0`).
3. **Вкл / выкл / удалить**, правка DNS/MTU/Keepalive/AllowedIPs.
4. **Лимит трафика (ГБ)** и **срок 1–24 мес** (или свой) — автовыключение по истечении.
5. **Продление (+N мес)** без смены ключей: клиентский `.conf` тот же, туннель снова работает после включения на сервере.
6. **Статистика** RX/TX, online, прогресс лимита; UI адаптирован под смартфон.
7. **Скачать `.conf` / QR** и **share-ссылка** `/s/<token>/page`.
8. **Настройки**: смена пароля, **TOTP 2FA**, регенерация URL, дефолты пиров.

---

## 2. Быстрый старт

```bash
cat /opt/wg-panel/admin.bootstrap
# username=...
# password=...   (если ещё не удалили)
# admin_url=https://v1.idivles.ru:8447/<длинный_секрет>/login
```

1. Откройте **только** `admin_url` из файла.
2. Войдите (при включённой 2FA — второй шаг с кодом).
3. Создайте пир → скачайте конфиг или share-ссылку.
4. В **Настройки** включите 2FA и при желании смените пароль / URL.

Share-ссылки для пользователей остаются короткими: `https://v1.idivles.ru:8447/s/<token>/page` (секрет админки не нужен).

---

## 3. Безопасность

| Мера | Как |
| --- | --- |
| Секретный URL | ~64 символа, хранится в БД + `admin_path` |
| HTTPS | nginx `:8447` |
| Rate-limit login | `5r/m` на `…/login` |
| Rate-limit общий | `30r/m` |
| Бан | N ошибок (по умолчанию 2) → 1 час |
| 2FA | TOTP (Google Authenticator / Aegis) |
| Пароль | PBKDF2-HMAC-SHA256, 200k |
| App bind | `127.0.0.1:8787` |

Снять бан:

```bash
sqlite3 /opt/wg-panel/panel.db "DELETE FROM bans; DELETE FROM login_fails;"
```

---

## 4. Установка / обновление

```bash
# с рабочей станции
scp -P 4488 -r tools/wg-panel root@77.110.125.241:/tmp/wg-panel-src-pack
# или tar:
tar czf /tmp/wg-panel.tgz tools/wg-panel
scp -P 4488 /tmp/wg-panel.tgz root@77.110.125.241:/tmp/
ssh -p 4488 root@77.110.125.241 'tar xzf /tmp/wg-panel.tgz -C /tmp && bash /tmp/tools/wg-panel/deploy/install.sh'
```

Скрипт ставит venv, systemd, nginx, UFW `8447/tcp`.

После обновления секретный путь **сохраняется** (уже в БД). Новый путь — в Настройках → «Сгенерировать новый URL».

---

## 5. Архитектура

```
Браузер
  ├─ /<secret>/…  → AdminPathMiddleware → Flask (логин, пиры, настройки)
  └─ /s/<token>/… → Flask share (публично)
nginx :8447 → 127.0.0.1:8787 (waitress)
                  ├─ SQLite panel.db
                  └─ wg syncconf → wg0
```

Трафик: счётчики `wg` + накопление `rx_total`/`tx_total` (переживают сброс counters). При превышении лимита или `expires_at` пир `enabled=0` и убирается из `wg0`.

---

## 6. Проверки

```bash
systemctl status wg-panel --no-pager
PATH=$(cat /opt/wg-panel/admin_path)
curl -sk -o /dev/null -w '%{http_code}\n' https://127.0.0.1:8447/          # 404
curl -sk -o /dev/null -w '%{http_code}\n' https://127.0.0.1:8447/login     # 404
curl -sk -o /dev/null -w '%{http_code}\n' https://127.0.0.1:8447/$PATH/login  # 200
wg show wg0
```

---

## 7. Ограничения

- Один интерфейс `wg0` (не 3X-UI).
- HTTP anti-DDoS = rate-limit + бан; объёмный L3/L4 на UDP 51820 — отдельно.
- Не публикуйте `admin.bootstrap`, `admin_path`, `panel.db` в git/чаты.
