#!/usr/bin/env bash
# shellcheck shell=bash
# SSH helpers — password or key

ask_vps_connection() {
  banner "Подключение к VPS"
  prompt YP_SSH_HOST "IP или hostname VPS"
  prompt YP_SSH_PORT "SSH порт" "22"
  prompt YP_SSH_USER "Логин" "root"
  echo "Аутентификация:"
  echo "  1) пароль"
  echo "  2) приватный ключ"
  read -r -p "Способ [1/2]: " auth
  YP_SSH_AUTH="$auth"
  if [[ "$auth" == "2" ]]; then
    prompt YP_SSH_KEY "Путь к приватному ключу" "$HOME/.ssh/id_ed25519"
    [[ -f "$YP_SSH_KEY" ]] || die "Ключ не найден: $YP_SSH_KEY"
    YP_SSH_PASS=""
  else
    prompt_secret YP_SSH_PASS "Пароль SSH"
    YP_SSH_KEY=""
    require_cmd sshpass
  fi
  export YP_SSH_HOST YP_SSH_PORT YP_SSH_USER YP_SSH_PASS YP_SSH_KEY YP_SSH_AUTH
}

_ssh_base() {
  local opts=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -p "$YP_SSH_PORT")
  if [[ -n "${YP_SSH_KEY:-}" ]]; then
    opts+=(-i "$YP_SSH_KEY" -o IdentitiesOnly=yes -o PreferredAuthentications=publickey)
    ssh "${opts[@]}" "${YP_SSH_USER}@${YP_SSH_HOST}" "$@"
  else
    opts+=(-o PreferredAuthentications=password -o PubkeyAuthentication=no -o NumberOfPasswordPrompts=1)
    sshpass -p "$YP_SSH_PASS" ssh "${opts[@]}" "${YP_SSH_USER}@${YP_SSH_HOST}" "$@"
  fi
}

remote() { _ssh_base "$@"; }

remote_bash() {
  # run bash -s with stdin script
  _ssh_base bash -s
}

scp_to() {
  # scp_to local remote_path
  local src="$1" dst="$2"
  local opts=(-o StrictHostKeyChecking=accept-new -P "$YP_SSH_PORT")
  if [[ -n "${YP_SSH_KEY:-}" ]]; then
    opts+=(-i "$YP_SSH_KEY" -o IdentitiesOnly=yes)
    scp "${opts[@]}" "$src" "${YP_SSH_USER}@${YP_SSH_HOST}:$dst"
  else
    sshpass -p "$YP_SSH_PASS" scp "${opts[@]}" -o PreferredAuthentications=password \
      "$src" "${YP_SSH_USER}@${YP_SSH_HOST}:$dst"
  fi
}

rsync_to() {
  local src="$1" dst="$2"
  local rsh
  if [[ -n "${YP_SSH_KEY:-}" ]]; then
    rsh="ssh -i $YP_SSH_KEY -o IdentitiesOnly=yes -p $YP_SSH_PORT -o StrictHostKeyChecking=accept-new"
    rsync -az --delete -e "$rsh" "$src" "${YP_SSH_USER}@${YP_SSH_HOST}:$dst"
  else
    rsh="sshpass -p $YP_SSH_PASS ssh -p $YP_SSH_PORT -o PreferredAuthentications=password -o StrictHostKeyChecking=accept-new"
    rsync -az --delete -e "$rsh" "$src" "${YP_SSH_USER}@${YP_SSH_HOST}:$dst"
  fi
}

verify_ssh() {
  info "Проверка SSH ${YP_SSH_USER}@${YP_SSH_HOST}:${YP_SSH_PORT}…"
  remote 'echo SSH_OK; uname -a; command -v docker || true' | tee /tmp/yp-ssh-check.txt
  grep -q SSH_OK /tmp/yp-ssh-check.txt || die "SSH не отвечает"
  ok "SSH доступен"
}
