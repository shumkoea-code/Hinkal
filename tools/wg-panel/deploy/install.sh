#!/usr/bin/env bash
# Install / update WG Panel on the VPS (run as root).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${WG_PANEL_DIR:-/opt/wg-panel}"
VENV="$DEST/venv"

echo "==> Install packages"
apt-get update -qq
apt-get install -y -qq python3-pip python3-venv python3-full wireguard-tools rsync >/dev/null

echo "==> Copy app to $DEST"
mkdir -p "$DEST/peers" "$DEST/templates" "$DEST/static" "$DEST/deploy"
install -m 0644 "$SRC_DIR/app.py" "$DEST/app.py"
install -m 0644 "$SRC_DIR/requirements.txt" "$DEST/requirements.txt"
rsync -a --delete "$SRC_DIR/templates/" "$DEST/templates/"
if [[ -d "$SRC_DIR/static" ]]; then
  rsync -a "$SRC_DIR/static/" "$DEST/static/"
fi
rsync -a "$SRC_DIR/deploy/" "$DEST/deploy/"

echo "==> Python venv + deps"
if [[ ! -d "$VENV" ]]; then
  python3 -m venv "$VENV"
fi
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q -r "$DEST/requirements.txt"

echo "==> systemd"
install -m 0644 "$SRC_DIR/deploy/wg-panel.service" /etc/systemd/system/wg-panel.service
# ensure ExecStart uses venv
sed -i "s|^ExecStart=.*|ExecStart=$VENV/bin/python /opt/wg-panel/app.py|" /etc/systemd/system/wg-panel.service
systemctl daemon-reload
systemctl enable --now wg-panel.service
systemctl restart wg-panel.service

echo "==> nginx"
install -m 0644 "$SRC_DIR/deploy/nginx-wg-panel-limit.conf" /etc/nginx/conf.d/wg-panel-limit.conf
install -m 0644 "$SRC_DIR/deploy/nginx-wg-panel.conf" /etc/nginx/sites-available/wg-panel
ln -sfn /etc/nginx/sites-available/wg-panel /etc/nginx/sites-enabled/wg-panel
nginx -t
systemctl reload nginx

echo "==> UFW (idempotent)"
if command -v ufw >/dev/null; then
  ufw allow 8447/tcp comment 'wg-panel' || true
fi

echo "==> Done"
echo "URL: https://v1.idivles.ru:8447/"
if [[ -f "$DEST/admin.bootstrap" ]]; then
  echo "Bootstrap credentials: $DEST/admin.bootstrap (chmod 600) — сохраните и удалите файл."
fi
systemctl --no-pager --full status wg-panel | head -20
