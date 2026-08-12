#!/usr/bin/env bash
# Optional helper: stream a disk image to stdout (pipe to local file via ssh)
# Usage on PC:
#   ssh -p 4488 root@VPS 'bash -s' < tools/vps-backup/disk-image-stream.sh > vps.img.gz
set -euo pipefail
ROOT_SRC="$(findmnt -n -o SOURCE /)"
DISK=""
if command -v lsblk >/dev/null; then
  PK="$(lsblk -no PKNAME "$ROOT_SRC" 2>/dev/null | head -1 || true)"
  [[ -n "$PK" ]] && DISK="/dev/$PK"
fi
if [[ -z "$DISK" ]]; then
  DISK="${ROOT_SRC%%[0-9]*}"
fi
echo "Imaging $DISK ..." >&2
dd if="$DISK" bs=4M status=progress | gzip -1
