#!/usr/bin/env bash
# shellcheck shell=bash

log()  { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '[%s] WARN %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die()  { printf '[%s] ERROR %s\n' "$(date +%H:%M:%S)" "$*" >&2; exit 1; }

require_root() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || die "run as root"
}

detect_os() {
  OS_ID=unknown
  OS_ID_LIKE=""
  OS_PRETTY=unknown
  OS_FAMILY=unknown
  OS_NAME=unknown
  if [[ -f /etc/os-release ]]; then
    # Do not leak NAME=/VERSION= from os-release into caller scope incorrectly:
    # save and restore critical locals by reading with awk instead of sourcing.
    OS_ID="$(awk -F= '/^ID=/{gsub(/"/,"",$2);print $2;exit}' /etc/os-release)"
    OS_ID_LIKE="$(awk -F= '/^ID_LIKE=/{gsub(/"/,"",$2);print $2;exit}' /etc/os-release)"
    OS_PRETTY="$(awk -F= '/^PRETTY_NAME=/{gsub(/"/,"",$2);print $2;exit}' /etc/os-release)"
    OS_NAME="$(awk -F= '/^NAME=/{gsub(/"/,"",$2);print $2;exit}' /etc/os-release)"
    OS_ID="${OS_ID:-unknown}"
    OS_PRETTY="${OS_PRETTY:-$OS_ID}"
  fi
  local blob
  blob="$(echo "$OS_ID $OS_ID_LIKE $OS_PRETTY $OS_NAME" | tr '[:upper:]' '[:lower:]')"
  if echo "$blob" | grep -Eq 'debian|ubuntu|astra|linuxmint|kali'; then
    OS_FAMILY=debian
  elif echo "$blob" | grep -Eq 'rhel|centos|rocky|alma|fedora|redos|red os|oracle'; then
    OS_FAMILY=rhel
  elif echo "$blob" | grep -Eq 'suse|opensuse'; then
    OS_FAMILY=suse
  elif echo "$blob" | grep -Eq 'arch|manjaro'; then
    OS_FAMILY=arch
  else
    OS_FAMILY=unknown
  fi
  if echo "$OS_ID $OS_ID_LIKE" | tr '[:upper:]' '[:lower:]' | grep -Eq 'astra'; then
    if echo "$OS_ID_LIKE" | grep -Eq 'debian|ubuntu'; then
      OS_FAMILY=debian
    fi
  fi
  if echo "$OS_ID $OS_PRETTY $OS_NAME" | tr '[:upper:]' '[:lower:]' | grep -Eq 'redos|red os'; then
    OS_FAMILY=rhel
  fi
}

path_slug() {
  echo "$1" | sed 's#^/##' | tr '/' '_'
}

# Returns 0 if path should be skipped (exact match or under a SKIP_PATHS prefix).
should_skip_path() {
  local target="$1"
  local s
  [[ -z "${SKIP_PATHS:-}" ]] && return 1
  # Always skip backup output and junk archives when set later
  for s in $SKIP_PATHS; do
    [[ -z "$s" ]] && continue
    if [[ "$target" == "$s" || "$target" == "$s"/* || "$target" == "$s"/ ]]; then
      return 0
    fi
    # also skip if src is parent and would pull skipped child via rsync of dir —
    # handled by rsync --exclude when copying directories
  done
  return 1
}

safe_copy() {
  local src="$1" dst="$2"
  if should_skip_path "$src"; then
    warn "skip (SKIP_PATHS): $src"
    return 0
  fi
  mkdir -p "$(dirname "$dst")"
  if command -v rsync >/dev/null 2>&1; then
    local -a ex=()
    local s
    for s in ${SKIP_PATHS:-}; do
      [[ -z "$s" ]] && continue
      # If copying a tree that contains skipped paths, exclude them
      if [[ "$s" == "$src" || "$s" == "$src"/* ]]; then
        local rel="${s#"$src"/}"
        if [[ "$rel" == "$s" ]]; then
          ex+=(--exclude="$(basename "$s")")
        else
          ex+=(--exclude="/$rel" --exclude="/$rel/**")
        fi
      elif [[ "$src" == "$s" || "$src" == "$s"/* ]]; then
        warn "skip (SKIP_PATHS): $src"
        return 0
      else
        # basename patterns for known junk archives
        case "$s" in
          *.tar.gz|*.tgz|*.img.gz)
            ex+=(--exclude="$(basename "$s")")
            ;;
        esac
      fi
    done
    # Always exclude backup out dir name patterns inside trees
    ex+=(--exclude='vps-backup/' --exclude='**/vps-backup/**' --exclude='junk/' --exclude='**/junk/**')
    rsync -aHAX --numeric-ids "${ex[@]}" "$src" "$dst"
  else
    cp -a "$src" "$dst"
  fi
}

cmd_exists() { command -v "$1" >/dev/null 2>&1; }

service_active() {
  local unit="$1"
  if cmd_exists systemctl; then
    systemctl is-active --quiet "$unit" 2>/dev/null
  else
    return 1
  fi
}

find_root_disk() {
  local src majmin disk
  src="$(findmnt -n -o SOURCE / 2>/dev/null || true)"
  [[ -n "$src" ]] || return 0
  # /dev/vda2 -> /dev/vda ; /dev/mapper/... harder — fallback to lsblk PKNAME
  if [[ -b "$src" ]]; then
    majmin="$(lsblk -no PKNAME "$src" 2>/dev/null | head -1)"
    if [[ -n "$majmin" ]]; then
      echo "/dev/$majmin"
      return 0
    fi
  fi
  # strip partition number for typical names
  if [[ "$src" =~ ^/dev/[sv]d[a-z][0-9]+$ ]]; then
    echo "${src%%[0-9]*}"
    return 0
  fi
  if [[ "$src" =~ ^/dev/nvme[0-9]+n[0-9]+p[0-9]+$ ]]; then
    echo "${src%p*}"
    return 0
  fi
  if [[ "$src" =~ ^/dev/vd[a-z][0-9]+$ ]]; then
    echo "${src%%[0-9]*}"
    return 0
  fi
  echo "$src"
}

rotate_keep() {
  local dir="$1" prefix="$2" keep="$3"
  [[ -d "$dir" ]] || return 0
  mapfile -t files < <(ls -1t "$dir"/${prefix}*.tar.gz 2>/dev/null || true)
  local i=0
  for f in "${files[@]:-}"; do
    i=$((i + 1))
    if [[ "$i" -gt "$keep" ]]; then
      log "rotate remove $f"
      rm -f "$f" "${f}.sha256"
    fi
  done
}

backup_system_inventory() {
  local d="$1"
  mkdir -p "$d"
  {
    uname -a
    echo "---"
    cat /etc/os-release 2>/dev/null || true
  } >"$d/uname-os-release.txt"
  df -hT >"$d/df.txt" 2>/dev/null || true
  lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT >"$d/lsblk.txt" 2>/dev/null || true
  ip -br a >"$d/ip.txt" 2>/dev/null || true
  ip r >"$d/routes.txt" 2>/dev/null || true
  if cmd_exists systemctl; then
    systemctl list-units --type=service --state=running --no-pager >"$d/services-running.txt" 2>/dev/null || true
    systemctl list-unit-files --state=enabled --no-pager >"$d/services-enabled.txt" 2>/dev/null || true
  fi
  if cmd_exists dpkg; then
    dpkg --get-selections >"$d/packages-dpkg.txt" 2>/dev/null || true
  fi
  if cmd_exists rpm; then
    rpm -qa >"$d/packages-rpm.txt" 2>/dev/null || true
  fi
  if cmd_exists ufw; then
    ufw status verbose >"$d/ufw.txt" 2>/dev/null || true
  fi
  if cmd_exists firewall-cmd; then
    firewall-cmd --list-all >"$d/firewalld.txt" 2>/dev/null || true
  fi
  ss -tulnp >"$d/listeners.txt" 2>/dev/null || true
  crontab -l >"$d/root-crontab.txt" 2>/dev/null || true
  cp -a /etc/crontab "$d/etc-crontab" 2>/dev/null || true
  cp -a /etc/cron.d "$d/cron.d" 2>/dev/null || true
}
