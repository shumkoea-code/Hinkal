#!/usr/bin/env bash
# Wrapper: Linux backup via tools/vps-backup
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VB="$ROOT/tools/vps-backup"
[[ -f "$VB/backup.sh" ]] || VB="$(cd "$(dirname "$0")/../../vps-backup" && pwd)"
PROFILE="${BACKUP_PROFILE:-}"
ARGS=(--mode "${BACKUP_MODE:-smart}" --name "${BACKUP_NAME:-$(hostname -s 2>/dev/null || echo linux)}" --keep "${BACKUP_KEEP:-7}")
if [[ -n "$PROFILE" ]]; then
  ARGS+=(--profile "$PROFILE")
elif [[ -f /etc/vps-backup.conf ]]; then
  ARGS+=(--profile /etc/vps-backup.conf)
elif [[ -f "$VB/examples/generic.conf" ]]; then
  ARGS+=(--profile "$VB/examples/generic.conf")
fi
exec bash "$VB/backup.sh" "${ARGS[@]}" "$@"
