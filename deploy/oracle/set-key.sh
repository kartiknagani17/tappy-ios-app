#!/usr/bin/env bash
# Set one secret in /etc/tappy/tappy.env and restart the API. The value is read without echo,
# so it never appears on screen or in shell history.
#
#   sudo bash deploy/oracle/set-key.sh REVENUECAT_SECRET_KEY
set -euo pipefail

ENV_FILE=/etc/tappy/tappy.env
NAME="${1:-}"
case "$NAME" in
  REVENUECAT_SECRET_KEY | ANTHROPIC_API_KEY | RESEND_API_KEY) ;;
  *)
    echo "Usage: sudo bash $0 REVENUECAT_SECRET_KEY|ANTHROPIC_API_KEY|RESEND_API_KEY" >&2
    exit 1
    ;;
esac
[[ $EUID -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }

read -rsp "Paste $NAME and press Enter: " VALUE
echo
# Terminals wrap pastes in bracketed-paste codes (ESC[200~ … ESC[201~); drop them and any other control characters.
VALUE="$(printf '%s' "$VALUE" | sed -e 's/\x1b\[20[01]~//g' | tr -d '[:space:][:cntrl:]')"
[[ -n "$VALUE" ]] || { echo "Nothing entered; no change." >&2; exit 1; }
[[ "$VALUE" =~ ^[A-Za-z0-9_.:-]+$ ]] || { echo "That doesn't look like a key; no change." >&2; exit 1; }
# Some terminals drop the first pasted character; catch it here instead of saving a broken key.
case "$NAME" in
  REVENUECAT_SECRET_KEY) PREFIX=sk_ ;;
  ANTHROPIC_API_KEY) PREFIX=sk-ant- ;;
  RESEND_API_KEY) PREFIX=re_ ;;
esac
[[ "$VALUE" == "$PREFIX"* ]] || { echo "$NAME should start with $PREFIX; no change. Try pasting again." >&2; exit 1; }

if grep -q "^$NAME=" "$ENV_FILE"; then
  sed -i "s|^$NAME=.*|$NAME=$VALUE|" "$ENV_FILE"
else
  printf '%s=%s\n' "$NAME" "$VALUE" >>"$ENV_FILE"
fi
systemctl restart tappy-api
sleep 2
if journalctl -u tappy-api --since "-10s" --no-pager | grep -q "$NAME is not set"; then
  echo "Saved, but the API still reports $NAME as missing. Check $ENV_FILE." >&2
  exit 1
fi
echo "Saved $NAME and restarted the API."
