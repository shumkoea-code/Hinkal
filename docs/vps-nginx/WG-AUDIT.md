# Учёт WireGuard: куда ходят и экономия места (ID ресурсов)

**Статус:** внедрено и проверено на VPS (12.08.2026)  
**Идея:** WireGuard сам сайты не логирует → смотрим **DNS-запросы** клиентов туннеля и храним домены в словаре с числовыми ID.

---

## 1. Почему не «просто логировать WG»

| Что даёт WG | Чего не даёт |
| --- | --- |
| Handshake peer’а | Имена сайтов |
| Байты up/down на peer | URL, поиск, содержимое HTTPS |
| Endpoint IP роутера | Различие устройств за NAT роутера |

Поэтому контроль «куда ходит пользователь» на практике = **DNS и/или потоки IP**, а не пакеты WG.

---

## 2. Как устроено у нас

```text
Keenetic/MikroTik (DNS=10.0.8.1)
        │
        ▼
   dnsmasq на wg0 (:53, только 10.0.8.1)
        │ log-queries
        ▼
 /var/log/wg-audit/dns.log
        │
        ▼
 wg-audit-collect.py  ──►  SQLite /var/lib/wg-audit/audit.db
```

### Схема БД (сжатие)

**`resources`** — уникальный ресурс один раз:

| id | kind | value | hits |
| --- | --- | --- | --- |
| 1 | dns | example.com | 2 |
| 3 | dns | youtube.com | 2 |

**`events`** — факты обращений (без повторного длинного имени):

| ts | peer_id | resource_id | qtype |
| --- | --- | --- | --- |
| … | 1 (keenetic) | 3 | A |

Повторный визит на тот же домен: `hits += 1`, в events снова тот же `resource_id`.

**`peers`:**

| id | name | vpn_ip |
| --- | --- | --- |
| 1 | keenetic | 10.0.8.2 |
| 2 | mikrotik | 10.0.8.3 |

### Проверка дедупа (лабораторная)

Два запроса `youtube.com` → одна запись `resources.id=3` с `hits=2`. Подтверждено скриптом на сервере.

---

## 3. Команды админа

```bash
# состояние туннеля
wg show wg0

# отчёт: peers, топ доменов, последние события
wg-audit-report

# сервисы
systemctl status dnsmasq wg-audit-collect wg-quick@wg0

# сырой DNS-лог
tail -f /var/log/wg-audit/dns.log

# SQL вручную
sqlite3 /var/lib/wg-audit/audit.db \
  'SELECT id,value,hits FROM resources ORDER BY hits DESC LIMIT 20;'
```

---

## 4. Что нужно на роутере

В клиентском WG-конфиге обязательно:

```ini
DNS = 10.0.8.1
```

Если оставить `1.1.1.1` / DoH в браузере — **аудит будет пустым** (запросы не проходят через наш dnsmasq).

На MikroTik: DNS сервера = `10.0.8.1`, LAN через DHCP получает DNS роутера (или сразу 10.0.8.1).

---

## 5. Ограничения и развитие

| Сейчас | Можно добавить позже |
| --- | --- |
| Только DNS-имена | `resources.kind='ip'` из conntrack/nflog |
| Нет путей URL | TLS SNI (сложнее, не всё видно при ECH) |
| Peer = весь роутер (NAT) | Отдельные WG-пиры на устройство |
| SQLite локально | Экспорт/ротация events старше N дней |

Рекомендуемая ротация events (пример раз в неделю):

```bash
sqlite3 /var/lib/wg-audit/audit.db \
  "DELETE FROM events WHERE ts < strftime('%s','now','-30 day'); VACUUM;"
```

Словарь `resources` можно оставлять — он как раз экономит место.

---

## 6. Приватность

Это журнал **администратора своего VPS**. Не публикуйте `audit.db` и `dns.log`.  
Пользователей (если это не только вы) лучше предупредить о DNS-учёте.

---

## 7. Файлы на сервере

| Путь | Роль |
| --- | --- |
| `/etc/dnsmasq.d/wg-audit.conf` | DNS только на wg0 |
| `/var/log/wg-audit/dns.log` | сырой лог |
| `/var/lib/wg-audit/audit.db` | сжатое хранилище |
| `/usr/local/sbin/wg-audit-collect.py` | сборщик |
| `/usr/local/sbin/wg-audit-report` | отчёт |
| `/etc/systemd/system/wg-audit-collect.service` | автозапуск |
