#!/usr/bin/env bash
# Install daily systemd timer for Linux backup
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SCRIPT="$ROOT/tools/system-backup/linux/backup-linux.sh"
[[ -x "$SCRIPT" ]] || chmod +x "$SCRIPT" "$ROOT/tools/vps-backup/backup.sh" || true

cat >/etc/systemd/system/vps-backup.service <<EOF
[Unit]
Description=Smart system backup (vps-backup)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
Environment=BACKUP_MODE=smart
Environment=BACKUP_KEEP=7
ExecStart=/bin/bash $SCRIPT
EOF

cat >/etc/systemd/system/vps-backup.timer <<'EOF'
[Unit]
Description=Daily smart backup timer

[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true
RandomizedDelaySec=10m

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now vps-backup.timer
systemctl status vps-backup.timer --no-pager
echo "OK: timer enabled. Test: systemctl start vps-backup.service"
