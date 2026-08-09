#!/usr/bin/env bash
# Run ON VPS as root from /opt/sochi-portal after uploading this directory.
set -euo pipefail
ROOT="${1:-/opt/sochi-portal}"
PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

MSG_CSS="src/app/messages/messages.css"
if [[ ! -f "$MSG_CSS" ]]; then
  # fallback: css may live next to page or only in globals
  MSG_CSS="$(find src -name 'messages.css' | head -1 || true)"
fi
GLOB="src/app/globals.css"

if [[ -n "${MSG_CSS}" && -f "$MSG_CSS" ]]; then
  if ! grep -q 'messages-ux-overflow' "$MSG_CSS"; then
    {
      echo ""
      echo "/* messages-ux-overflow */"
      cat "$PATCH_DIR/messages-overflow.css"
    } >> "$MSG_CSS"
    echo "patched $MSG_CSS"
  fi
else
  echo "WARN: messages.css not found — append messages-overflow.css into globals instead"
  if ! grep -q 'messages-ux-overflow' "$GLOB"; then
    {
      echo ""
      echo "/* messages-ux-overflow (messages.css missing) */"
      cat "$PATCH_DIR/messages-overflow.css"
    } >> "$GLOB"
  fi
fi

if ! grep -q 'messages-ux-overflow' "$GLOB"; then
  {
    echo ""
    echo "/* messages-ux-overflow */"
    cat "$PATCH_DIR/globals-overflow.css"
  } >> "$GLOB"
  echo "patched $GLOB"
fi

echo "CSS done. Apply TS patches manually per api-messages-membership.md and page-longpress-membership.notes.md"
echo "Then: docker-compose build web && docker-compose up -d web"
