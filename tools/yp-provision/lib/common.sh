#!/usr/bin/env bash
# shellcheck shell=bash
# common helpers for yp-provision

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "→ $*"; }
ok() { echo "✓ $*"; }
warn() { echo "WARN: $*" >&2; }

banner() {
  echo
  echo "════════════════════════════════════════"
  echo " $*"
  echo "════════════════════════════════════════"
}

confirm_or_exit() {
  local assume="$1"; shift
  local msg="$*"
  if [[ "$assume" == "1" ]]; then
    info "$msg (auto-yes)"
    return 0
  fi
  read -r -p "$msg [y/N]: " a
  [[ "$a" == "y" || "$a" == "Y" ]] || die "Отменено"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Нужна команда: $1"
}

prompt() {
  # prompt VAR "Question" [default]
  local var="$1" q="$2" def="${3:-}"
  local val
  if [[ -n "$def" ]]; then
    read -r -p "$q [$def]: " val
    val="${val:-$def}"
  else
    read -r -p "$q: " val
    [[ -n "$val" ]] || die "Пустой ответ: $q"
  fi
  printf -v "$var" '%s' "$val"
}

prompt_secret() {
  local var="$1" q="$2"
  local val
  read -r -s -p "$q: " val
  echo
  [[ -n "$val" ]] || die "Пустой секрет: $q"
  printf -v "$var" '%s' "$val"
}

random_secret() {
  openssl rand -hex 24 2>/dev/null || head -c 48 /dev/urandom | xxd -p | head -c 48
}

iso_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
