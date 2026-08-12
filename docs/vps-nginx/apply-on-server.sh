#!/usr/bin/env bash
# Применить конфиг сайта+gRPC на сервере. Запускать ОТ root по SSH.
set -euo pipefail

CONF_SRC="$(cd "$(dirname "$0")" && pwd)/v1.idivles.ru.conf"
CONF_DST="/etc/nginx/sites-available/v1.idivles.ru.conf"
ENABLED="/etc/nginx/sites-enabled/v1.idivles.ru.conf"

if [[ $EUID -ne 0 ]]; then
  echo "Нужен root: sudo bash $0" >&2
  exit 1
fi

echo "==> текущие слушатели 80/443/10443"
ss -tlnp | grep -E ':80|:443|:10443' || true

echo "==> ищем server-блоки без ssl на 443 (их нужно убрать/заменить)"
grep -RIn --include='*.conf' -E 'listen[[:space:]]+\[?::\]?:?443' /etc/nginx 2>/dev/null | grep -v ssl || true

install -d -m 755 /var/www/v1.idivles.ru
if [[ ! -f /var/www/v1.idivles.ru/index.html ]]; then
  cat > /var/www/v1.idivles.ru/index.html <<'HTML'
<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>v1.idivles.ru</title></head>
<body><h1>v1.idivles.ru</h1><p>Сайт снова на 443. Замените этот файл на свой.</p></body></html>
HTML
fi

cp -a "$CONF_SRC" "$CONF_DST"
ln -sfn "$CONF_DST" "$ENABLED"

# отключить дефолтный сайт, если он тоже слушает 443
if [[ -L /etc/nginx/sites-enabled/default ]]; then
  echo "==> отключаю sites-enabled/default (часто конфликтует с 443)"
  rm -f /etc/nginx/sites-enabled/default
fi

echo "==> nginx -t"
nginx -t

echo "==> reload nginx"
systemctl reload nginx

echo "==> проверка TLS сайта"
curl -sI --max-time 10 https://127.0.0.1/ -H "Host: v1.idivles.ru" --resolve v1.idivles.ru:443:127.0.0.1 | head -5 || true

echo
echo "Готово. Дальше в панели 3X-UI:"
echo "  Hosts → nginx-grpc-443 → Security = tls, SNI = v1.idivles.ru, Fingerprint = chrome"
echo "Клиентам — обновить подписку."
