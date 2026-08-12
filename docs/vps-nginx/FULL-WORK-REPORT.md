# Полный отчёт о проделанной работе

**Объект:** VPS `v1.idivles.ru` / `77.110.125.241`  
**Стек:** Debian 12, nginx 1.22.1, 3X-UI 3.6.0, Xray 26.7.28, Docker (sochi-portal)  
**Период работ:** 12 августа 2026  
**Исполнитель:** Cursor Cloud Agent  

> Пароли и секреты в этот документ **не включены**.

---

## 0. Цель работ

1. Понять, почему «не работает порт 10443 / VPN».
2. Совместить **сайт на 443** и **VPN на 443**.
3. Прокачать 3X-UI/Xray: сделать быстрее, скрытнее, на актуальных технологиях.
4. Всё задокументировать с пояснениями.

---

## 1. Исходная проблема (диагностика)

### 1.1. Симптомы

- Клиенты с портом **10443** не подключались (TCP RST).
- `https://v1.idivles.ru/` в браузере ломался (`wrong version number`).
- При этом сайт **https://tyoung.idivles.ru/** открывался нормально.
- На панели inbound «Telegram» был enable, Xray running, трафик исторически большой (~175 ГБ).

### 1.2. Корневая причина

На `:443` уже стоял **nginx stream SNI-мультиплексор** (`ssl_preread`), а не обычный HTTP-сайт «в лоб»:

```text
SNI tyoung.idivles.ru  → 127.0.0.1:8443  (HTTPS портал Next.js)
default / без TLS      → 127.0.0.1:10443 (Xray VLESS+gRPC security=none)
```

Xray inbound слушал **только** `127.0.0.1:10443`.  
Публичная точка входа — **443**. В подписке же фигурировал порт **10443** → клиенты били мимо входа.

gRPC без TLS на default-SNI при этом работал (проверено официальным Xray-клиентом на `:443`).

Подробный журнал первичной диагностики: [DIAGNOSTICS-AND-SETUP.md](./DIAGNOSTICS-AND-SETUP.md).

---

## 2. Этап A — восстановление сосуществования сайта и VPN

### Сделано

1. **3X-UI Host** `nginx-grpc-443`: адрес `v1.idivles.ru`, порт **443**, `security=none`.
2. В stream-карту добавлен `v1.idivles.ru` → `127.0.0.1:8445` (маскировочная HTTPS-страница + `location /gun`).
3. Открыты в UFW порты запасных inbound’ов `10000/20000/30001`.
4. Проверены сайт tyoung, маска v1, VPN gRPC на 443.

### Результат этапа A

| Проверка | Итог |
| --- | --- |
| tyoung.idivles.ru | 200 |
| v1.idivles.ru | 200 (маска) |
| VLESS gRPC `:443` | OK |
| Reality TCP/XHTTP backup | OK после открытия UFW |

---

## 3. Этап B — стелс-апгрейд (лучшие практики 2026)

### 3.1. Почему меняли основной транспорт

| Было | Минусы |
| --- | --- |
| VLESS + **gRPC** + `security=none` | gRPC в Xray **deprecated**; без TLS/REALITY хорошо детектится DPI; `authority=max.ru` + PQ mlkem — тяжёлый и специфичный отпечаток |

| Стало (основное) | Плюсы |
| --- | --- |
| VLESS + **XHTTP** + **REALITY** на `:443` | Актуальный транспорт; TLS-подобный хендшейк под Cloudflare; тот же порт, что у сайта; быстрее/устойчивее на сетях с DPI |

### 3.2. Что внедрено

#### Новый основной inbound

| Поле | Значение |
| --- | --- |
| id | **15** |
| remark | `Stealth-Reality-XHTTP` |
| listen | `127.0.0.1:10444` |
| protocol | vless |
| network | **xhttp** (mode auto) |
| security | **reality** |
| target | `www.cloudflare.com:443` |
| serverNames | cloudflare + apple |
| fingerprint | chrome |
| clients | **все 33** скопированы с legacy inbound #1 (те же UUID) |

#### Host для подписки

- remark: `stealth-reality-443`
- address: `v1.idivles.ru`
- port: **443**
- security: **reality**
- sni: `www.cloudflare.com`
- fingerprint: `chrome`
- Порядок hosts: **stealth первым**, legacy вторым.

#### nginx stream (актуально)

```nginx
map $ssl_preread_server_name $yp_backend {
    tyoung.idivles.ru   127.0.0.1:8443;   # сайт
    v1.idivles.ru       127.0.0.1:8445;   # маска
    www.cloudflare.com  127.0.0.1:10444;  # STEALTH Reality
    cloudflare.com      127.0.0.1:10444;
    www.apple.com       127.0.0.1:10444;
    apple.com           127.0.0.1:10444;
    default             127.0.0.1:10443;  # LEGACY gRPC
}
```

Клиент Reality подключается к IP `v1.idivles.ru:443`, но в TLS ClientHello ставит SNI `www.cloudflare.com` → stream отдаёт на Reality-inbound. Снаружи это похоже на HTTPS к Cloudflare.

#### Прочие изменения inbound’ов

| id | Статус | Remark |
| --- | --- | --- |
| 1 | enable, legacy | `LEGACY-gRPC-none` |
| 11 | disable | `router` (битые Reality keys) |
| 12 | enable, backup | `BACKUP-Reality-TCP-10000` |
| 13 | enable, backup | `BACKUP-Reality-XHTTP-20000` |
| 14 | **disable** | WS+TLS (deprecated транспорт) |
| 15 | enable, **main** | `Stealth-Reality-XHTTP` |

#### Xray template (DNS / routing / logs)

Обновлён `xrayTemplateConfig` в `/etc/x-ui/x-ui.db`:

- DNS: DoH `1.1.1.1` / `8.8.8.8`, `queryStrategy=UseIPv4`
- routing: `domainStrategy=IPIfNonMatch`, block private + bittorrent
- log: `access=none`, `dnsLog=false` (меньше следов на диске)

#### Firewall

- Удалён публичный allow на **10443** (backend только localhost).
- Оставлены 443/80/444/2096/4488 + backup Reality ports.

### 3.3. Тесты после стелс-апгрейда

| Проверка | Результат |
| --- | --- |
| Stealth Reality+XHTTP `:443` | **OK** → `ip=77.110.125.241` |
| Legacy gRPC `:443` | **OK** (обратная совместимость) |
| Backup Reality TCP `:10000` | OK |
| https://tyoung.idivles.ru/ | 200 |
| https://v1.idivles.ru/ | 200 |
| Панель `:444` | 200 |
| Xray state | running 26.7.28 |

---

## 4. Итоговая архитектура

```text
                     Интернет :443
                           │
                 nginx stream + ssl_preread
                           │
     ┌──────────┬──────────┼──────────┬──────────┐
     │          │          │          │          │
  SNI tyoung  SNI v1   SNI CF/Apple  (нет TLS)  прочее
     │          │          │          │
     ▼          ▼          ▼          ▼
  :8443      :8445      :10444     :10443
  сайт       маска     STEALTH    LEGACY
  Next.js    +/gun     Reality    gRPC none
                       +XHTTP
```

---

## 5. Файлы на сервере (изменённые / важные)

| Путь | Что |
| --- | --- |
| `/etc/nginx/stream.d/tyoung-sni.conf` | SNI-роутер (stealth edition) |
| `/etc/nginx/stream.d/tyoung-sni.conf.bak*` | бэкапы |
| `/etc/nginx/sites-available/v1-idivles-ssl` | маска v1 + `/gun` |
| `/var/www/v1.idivles.ru/index.html` | маскировочная страница |
| `/etc/x-ui/x-ui.db` | inbounds/hosts/template |
| `/usr/local/x-ui/bin/config.json` | живой конфиг Xray |

Копии конфигов в репозитории: [live/](./live/).

---

## 6. Документация в репозитории

| Документ | Для кого | Ссылка |
| --- | --- | --- |
| **Инструкция пользователям** | клиенты / админ «как подключить» | [USER-GUIDE.md](./USER-GUIDE.md) |
| **Этот полный отчёт** | заказчик / админ | [FULL-WORK-REPORT.md](./FULL-WORK-REPORT.md) |
| **Первичная диагностика** | техдетали этапа A | [DIAGNOSTICS-AND-SETUP.md](./DIAGNOSTICS-AND-SETUP.md) |
| **Оглавление папки** | навигация | [README.md](./README.md) |
| Сырые логи SSH/тестов | аудит | [logs/](./logs/) |

Публичный путь в GitHub (ветка PR):

https://github.com/shumkoea-code/Hinkal/tree/cursor/cursor-subscription-limits-ru-docs-59b1/docs/vps-nginx

Прямые ссылки:

- Инструкция: https://github.com/shumkoea-code/Hinkal/blob/cursor/cursor-subscription-limits-ru-docs-59b1/docs/vps-nginx/USER-GUIDE.md  
- Полный отчёт: https://github.com/shumkoea-code/Hinkal/blob/cursor/cursor-subscription-limits-ru-docs-59b1/docs/vps-nginx/FULL-WORK-REPORT.md  

---

## 7. Рекомендации дальше

1. **Через 1–2 недели** отключить Host `LEGACY-grpc-none-443` и inbound #1, когда все обновят подписку.
2. Следить, чтобы деплой sochi-portal **не затирал** `stream.d/tyoung-sni.conf` (нужны строки Cloudflare/Apple → 10444).
3. Backup Reality на non-443 — только запас; основной всегда 443.
4. Периодически обновлять Xray/3X-UI; минимальная версия клиента для Reality — **v26.3.27**.
5. Не публиковать UUID/pbk/shortId в открытых чатах.

---

## 8. Краткий checklist приёмки

- [x] Сайт tyoung на 443 работает  
- [x] Маска v1 на 443 работает  
- [x] Основной VPN: Reality + XHTTP на 443 работает  
- [x] Legacy gRPC на 443 работает (временная совместимость)  
- [x] WS deprecated отключён  
- [x] DNS DoH + routing ужесточены  
- [x] 10443 убран из публичного UFW  
- [x] Документация и отчёт опубликованы в репозитории  

**Итог:** сайт и VPN сосуществуют на одном 443; основной канал переведён на скрытный и актуальный стек **VLESS + REALITY + XHTTP**; старые клиенты не отрезаны сразу.
