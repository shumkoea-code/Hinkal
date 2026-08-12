#!/usr/bin/env bash
# Universal Linux backup toolkit — entrypoint
# Supports: Debian / Ubuntu / Astra Linux / RED OS (RHEL-like) and others.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/lib/db.sh"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/lib/docker.sh"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/lib/services.sh"

usage() {
  cat <<'EOF'
usage:
  backup.sh [options]

Modes:
  --mode smart|full|disk     smart=consistent dumps+configs (default)
                             full=smart + large trees (/var/lib/docker optional)
                             disk=raw block device image (dd|gzip) — stop I/O heavy apps first

Options:
  --out DIR                  output directory (default: /var/backups/vps-backup)
  --name NAME                backup name prefix (default: hostname)
  --profile FILE             conf file with EXTRA_PATHS / SKIP_PATHS / DOCKER_COMPOSE etc.
  --include-docker-volumes   copy docker named volumes (heavy)
  --include-docker-images    docker save images (very heavy)
  --no-stop-xui              do not briefly stop x-ui for sqlite consistency
  --keep N                   keep last N archives in --out (default: 5)
  --dry-run                  print plan only
  -h, --help

Examples:
  sudo ./backup.sh --mode smart
  sudo ./backup.sh --mode smart --profile examples/idivles.conf
  sudo ./backup.sh --mode full --include-docker-volumes
  sudo ./backup.sh --mode disk --out /mnt/usb

Consistency notes:
  - SQLite: online .backup API, or short service stop + copy (+WAL)
  - PostgreSQL/MySQL: logical dump (pg_dump / mysqldump) — safe while running
  - Naive cp of live DB files can be CORRUPT — this script avoids that
EOF
}

MODE="smart"
OUT_ROOT="/var/backups/vps-backup"
sanitize_name() { printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '_' | sed 's/_\+$//;s/^_\+//;s/__\+/_/g'; }
NAME="$(sanitize_name "$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo vps)")"
[[ -n "$NAME" ]] || NAME="vps"
PROFILE=""
INCLUDE_DOCKER_VOLUMES=0
INCLUDE_DOCKER_IMAGES=0
STOP_XUI=1
KEEP=5
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --out) OUT_ROOT="${2:-}"; shift 2 ;;
    --name) NAME="$(sanitize_name "${2:-}")"; shift 2 ;;
    --profile) PROFILE="${2:-}"; shift 2 ;;
    --include-docker-volumes) INCLUDE_DOCKER_VOLUMES=1; shift ;;
    --include-docker-images) INCLUDE_DOCKER_IMAGES=1; shift ;;
    --no-stop-xui) STOP_XUI=0; shift ;;
    --keep) KEEP="${2:-5}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown arg: $1" ;;
  esac
done

[[ "$MODE" =~ ^(smart|full|disk)$ ]] || die "bad --mode: $MODE"
require_root

detect_os
log "OS family=$OS_FAMILY id=$OS_ID pretty=$OS_PRETTY backup_name=$NAME"

STAMP="$(date +%Y%m%d-%H%M%S)"
WORK="$OUT_ROOT/${NAME}-${MODE}-${STAMP}"
ARCHIVE="$OUT_ROOT/${NAME}-${MODE}-${STAMP}.tar.gz"
META="$WORK/META.txt"

if [[ -n "$PROFILE" ]]; then
  [[ -f "$PROFILE" ]] || die "profile not found: $PROFILE"
  # shellcheck disable=SC1090
  source "$PROFILE"
fi

# defaults from profile or empty
EXTRA_PATHS="${EXTRA_PATHS:-}"
SKIP_PATHS="${SKIP_PATHS:-}"
DOCKER_COMPOSE_FILES="${DOCKER_COMPOSE_FILES:-}"
CUSTOM_PRE_HOOK="${CUSTOM_PRE_HOOK:-}"
CUSTOM_POST_HOOK="${CUSTOM_POST_HOOK:-}"

mkdir -p "$OUT_ROOT"
if [[ "$DRY_RUN" -eq 1 ]]; then
  log "DRY-RUN mode=$MODE out=$WORK archive=$ARCHIVE"
  log "would backup detected services + dumps"
  exit 0
fi

mkdir -p "$WORK"/{system,configs,databases,services,docker,logs}
chmod 700 "$WORK"

{
  echo "stamp=$STAMP"
  echo "host=$(hostname)"
  echo "mode=$MODE"
  echo "os_family=$OS_FAMILY"
  echo "os_id=$OS_ID"
  echo "os_pretty=$OS_PRETTY"
  echo "kernel=$(uname -r)"
  echo "started_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >"$META"

if [[ -n "$CUSTOM_PRE_HOOK" && -x "$CUSTOM_PRE_HOOK" ]]; then
  log "pre-hook $CUSTOM_PRE_HOOK"
  "$CUSTOM_PRE_HOOK" "$WORK" || warn "pre-hook failed"
fi

# --- always: system inventory ---
backup_system_inventory "$WORK/system"

# --- configs / services ---
backup_common_configs "$WORK/configs"
backup_detected_services "$WORK/services" "$STOP_XUI"

# --- databases (consistent dumps) ---
backup_all_databases "$WORK/databases"

# --- docker ---
backup_docker "$WORK/docker" "$INCLUDE_DOCKER_VOLUMES" "$INCLUDE_DOCKER_IMAGES" "$DOCKER_COMPOSE_FILES"

# --- extra paths from profile ---
if [[ -n "$EXTRA_PATHS" ]]; then
  mkdir -p "$WORK/extra"
  # shellcheck disable=SC2086
  for p in $EXTRA_PATHS; do
    if [[ -e "$p" ]]; then
      log "extra path $p"
      safe_copy "$p" "$WORK/extra/$(path_slug "$p")"
    else
      warn "extra missing: $p"
    fi
  done
fi

if [[ "$MODE" == "full" ]]; then
  log "full mode: copying large trees (may take time)"
  mkdir -p "$WORK/full"
  # Prefer dumps already done; still copy selected stateful dirs if present
  for p in /var/lib/misc /var/lib/wg-audit /opt; do
    [[ -e "$p" ]] || continue
    # skip huge package caches
    case "$p" in
      /var/cache|/*) continue ;;
    esac
    safe_copy "$p" "$WORK/full/$(path_slug "$p")" || warn "copy failed: $p"
  done
fi

if [[ "$MODE" == "disk" ]]; then
  log "disk mode: creating block image (long, heavy I/O)"
  ROOT_DISK="$(find_root_disk)"
  [[ -n "$ROOT_DISK" ]] || die "cannot detect root disk"
  IMG="$OUT_ROOT/${NAME}-disk-${STAMP}.img.gz"
  log "imaging $ROOT_DISK -> $IMG"
  # Prefer sparse-friendly gzip stream; user should quiesce DBs if possible
  dd if="$ROOT_DISK" bs=4M status=progress | gzip -1 >"$IMG"
  sha256sum "$IMG" >"${IMG}.sha256"
  echo "disk_image=$IMG" >>"$META"
  echo "disk_device=$ROOT_DISK" >>"$META"
  log "disk image done: $IMG"
  # still pack metadata workdir lightly
fi

echo "finished_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$META"
du -sh "$WORK"/* 2>/dev/null | tee "$WORK/logs/sizes.txt" >/dev/null || true

log "packing $ARCHIVE"
tar -C "$OUT_ROOT" -czf "$ARCHIVE" -- "$(basename "$WORK")"
sha256sum "$ARCHIVE" >"${ARCHIVE}.sha256"
chmod 600 "$ARCHIVE" "${ARCHIVE}.sha256"

# cleanup workdir to save space (archive remains)
rm -rf "$WORK"

if [[ -n "$CUSTOM_POST_HOOK" && -x "$CUSTOM_POST_HOOK" ]]; then
  log "post-hook $CUSTOM_POST_HOOK"
  "$CUSTOM_POST_HOOK" "$ARCHIVE" || warn "post-hook failed"
fi

rotate_keep "$OUT_ROOT" "${NAME}-${MODE}-" "$KEEP"

log "OK archive=$ARCHIVE"
log "checksum=$(cat "${ARCHIVE}.sha256")"
echo "$ARCHIVE"
