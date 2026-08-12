#!/usr/bin/env bash
# Full VPS backup for idivles (configs + services + DB dumps + /opt + x-ui + docker volumes/images).
# Run on the VPS as root.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${OUT:-/var/backups/vps-backup}"
PROFILE="${PROFILE:-$SCRIPT_DIR/examples/idivles.conf}"
[[ -f "$PROFILE" ]] || PROFILE="$SCRIPT_DIR/idivles.conf"

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

echo "[*] full backup -> $OUT (profile=$PROFILE)"
df -h /
bash "$SCRIPT_DIR/backup.sh" \
  --mode full \
  --profile "$PROFILE" \
  --out "$OUT" \
  --include-docker-volumes \
  --include-docker-images \
  --keep 3 \
  "$@"

echo "[*] latest archives:"
ls -lht "$OUT"/*.tar.gz 2>/dev/null | head -5
df -h /
