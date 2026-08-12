#!/usr/bin/env bash
# Service/config collectors.

backup_common_configs() {
  local out="$1"
  mkdir -p "$out"
  local paths=(
    /etc/nginx
    /etc/caddy
    /etc/haproxy
    /etc/ssh
    /etc/ufw
    /etc/fail2ban
    /etc/sysctl.conf
    /etc/sysctl.d
    /etc/security
    /etc/sudoers
    /etc/sudoers.d
    /etc/systemd/system
    /etc/letsencrypt
    /etc/ssl
    /etc/wireguard
    /etc/dnsmasq.d
    /etc/dnsmasq.conf
    /etc/netplan
    /etc/network
    /etc/NetworkManager
    /etc/hosts
    /etc/hostname
    /etc/fstab
    /etc/passwd
    /etc/group
    /etc/shadow
    /etc/gshadow
  )
  for p in "${paths[@]}"; do
    [[ -e "$p" ]] || continue
    log "config $p"
    safe_copy "$p" "$out/$(path_slug "$p")"
  done
}

_xui_stop_start() {
  local stop="$1"
  if [[ "$stop" -eq 1 ]] && service_active x-ui; then
    log "briefly stopping x-ui for sqlite quiesce"
    systemctl stop x-ui || true
    # checkpoint WAL if possible
    if cmd_exists sqlite3 && [[ -f /etc/x-ui/x-ui.db ]]; then
      sqlite3 /etc/x-ui/x-ui.db "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null 2>&1 || true
    fi
    XUI_WAS_STOPPED=1
  else
    XUI_WAS_STOPPED=0
  fi
}

_xui_restart_if_needed() {
  if [[ "${XUI_WAS_STOPPED:-0}" -eq 1 ]]; then
    log "starting x-ui back"
    systemctl start x-ui || warn "failed to start x-ui"
  fi
}

backup_detected_services() {
  local out="$1"
  local stop_xui="$2"
  mkdir -p "$out"
  XUI_WAS_STOPPED=0

  # WireGuard
  if [[ -d /etc/wireguard ]]; then
    mkdir -p "$out/wireguard"
    safe_copy /etc/wireguard "$out/wireguard/etc"
    cmd_exists wg && wg show >"$out/wireguard/wg-show.txt" 2>/dev/null || true
  fi
  [[ -d /root/keenetic-wg ]] && safe_copy /root/keenetic-wg "$out/keenetic-wg"
  [[ -d /var/lib/wg-audit ]] && safe_copy /var/lib/wg-audit "$out/wg-audit"

  # WG Panel
  if [[ -d /opt/wg-panel ]]; then
    mkdir -p "$out/wg-panel"
    # Prefer online sqlite dump; also copy app code/config
    safe_copy /opt/wg-panel "$out/wg-panel/tree"
    if [[ -f /opt/wg-panel/panel.db ]]; then
      sqlite_online_backup /opt/wg-panel/panel.db "$out/wg-panel/panel.db.consistent"
    fi
  fi

  # 3X-UI / Xray
  if [[ -d /etc/x-ui || -d /usr/local/x-ui ]]; then
    mkdir -p "$out/x-ui"
    _xui_stop_start "$stop_xui"
    [[ -d /etc/x-ui ]] && safe_copy /etc/x-ui "$out/x-ui/etc"
    [[ -d /usr/local/x-ui ]] && safe_copy /usr/local/x-ui "$out/x-ui/usr-local"
    if [[ -f /etc/x-ui/x-ui.db ]]; then
      sqlite_online_backup /etc/x-ui/x-ui.db "$out/x-ui/x-ui.db.consistent"
    fi
    _xui_restart_if_needed
  fi

  # certs commonly used on this stack
  [[ -d /root/cert ]] && safe_copy /root/cert "$out/root-cert"
  [[ -d /etc/letsencrypt ]] && safe_copy /etc/letsencrypt "$out/letsencrypt"

  # sochi / app trees
  [[ -d /opt/sochi-portal ]] && safe_copy /opt/sochi-portal "$out/sochi-portal"

  # netdata config (not metrics DB — can be huge)
  [[ -d /etc/netdata ]] && safe_copy /etc/netdata "$out/netdata-etc"

  # fail2ban jail local
  [[ -d /etc/fail2ban ]] && safe_copy /etc/fail2ban "$out/fail2ban"
}
