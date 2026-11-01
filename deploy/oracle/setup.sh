#!/usr/bin/env bash
# Tappy API server setup for an Ubuntu 22.04 / 24.04 VM (built for Oracle Cloud Always Free Ampere/Arm; works on x86 too).
#
# Run on the server, from a clone of the repo:
#   sudo bash deploy/oracle/setup.sh                      # install / update everything
#   sudo CLOUDFLARE_TUNNEL_TOKEN=xxxx bash deploy/oracle/setup.sh   # also connect the Cloudflare Tunnel
#   sudo bash deploy/oracle/setup.sh --no-import          # skip the first data import
#
# Safe to re-run: it updates the code, dependencies and services in place and never overwrites /etc/tappy/tappy.env.
set -euo pipefail

APP_DIR=/opt/tappy
DATA_DIR=/var/lib/tappy
ENV_FILE=/etc/tappy/tappy.env
APP_USER=tappy
NODE_MAJOR=22
NODE_MIN_MINOR=18 # node:sqlite unflagged + TypeScript type stripping
RUN_IMPORT=1
for arg in "$@"; do
  case "$arg" in
    --no-import) RUN_IMPORT=0 ;;
    -h | --help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0 $*" >&2
  exit 1
fi
if ! grep -qi ubuntu /etc/os-release; then
  warn "This script is written for Ubuntu. Continuing anyway."
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ ! -f "$REPO_DIR/server/package.json" ]]; then
  echo "Run this from inside a clone of the Tappy repo (server/package.json not found next to deploy/)." >&2
  exit 1
fi

say "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git rsync sqlite3 >/dev/null

# ---------- Node.js ----------
need_node=1
if command -v node >/dev/null 2>&1; then
  ver="$(node -v | sed 's/^v//')"
  major="${ver%%.*}"
  minor="$(echo "$ver" | cut -d. -f2)"
  if ((major > NODE_MAJOR || (major == NODE_MAJOR && minor >= NODE_MIN_MINOR))); then need_node=0; fi
fi
if ((need_node)); then
  say "Installing Node.js $NODE_MAJOR"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
say "Node $(node -v) at $(command -v node)"
if [[ "$(command -v node)" != /usr/bin/node ]]; then
  ln -sf "$(command -v node)" /usr/bin/node # systemd units call /usr/bin/node
fi

# ---------- user + directories ----------
say "Creating the '$APP_USER' service user and directories"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$DATA_DIR" "$DATA_DIR/data" "$DATA_DIR/data/raw" "$DATA_DIR/uploads" "$DATA_DIR/backups"
install -d -o root -g "$APP_USER" -m 750 /etc/tappy

# ---------- code ----------
say "Installing app code into $APP_DIR"
install -d -o root -g root -m 755 "$APP_DIR"
# Copy only what the server needs; secrets, databases and node_modules are excluded.
rsync -a --delete \
  --exclude node_modules --exclude '/data/' --exclude '.env' --exclude '*.db*' \
  "$REPO_DIR/server/" "$APP_DIR/server/"
cp "$REPO_DIR/NOTICE.md" "$APP_DIR/" 2>/dev/null || true
cd "$APP_DIR/server"
say "Installing server dependencies (production only)"
npm ci --omit=dev --no-audit --no-fund --loglevel=error
chown -R root:root "$APP_DIR"

# ---------- config ----------
if [[ ! -f "$ENV_FILE" ]]; then
  say "Creating $ENV_FILE"
  cat >"$ENV_FILE" <<EOF
# Tappy server config. Edit, then: sudo systemctl restart tappy-api
HOST=127.0.0.1
PORT=8787
TRUST_PROXY=true
DATABASE_PATH=$DATA_DIR/data/tappy.db
RAW_DATA_DIR=$DATA_DIR/data/raw
UPLOADS_DIR=$DATA_DIR/uploads

# Required for front-of-package and ingredient-panel photos
ANTHROPIC_API_KEY=
VISION_MODEL=claude-haiku-5-5
VISION_ESCALATION_MODEL=claude-sonnet-5-5

# Live Open Food Facts fallback for barcodes missing locally
OFF_LIVE_LOOKUP=false
OFF_USER_AGENT=Tappy/1.0 (you@example.com)

# Accounts. APPLE_BUNDLE_ID must match ios.bundleIdentifier in app.json (Sign in with Apple).
APPLE_BUNDLE_ID=company.tappy.app
# Password reset emails (https://resend.com, free tier). Empty = "Forgot password?" hidden in the app.
RESEND_API_KEY=
EMAIL_FROM=Tappy <no-reply@tappy.company>
SUPPORT_EMAIL=kartiknagani17@gmail.com

MATCH_AUTO_CONFIRM_THRESHOLD=0.85
MATCH_CHOOSE_THRESHOLD=0.5
DAILY_FREE_SCANS=25
DAILY_FREE_PHOTO_SCANS=10
RATE_LIMIT_PER_MINUTE=30
EOF
  chown root:"$APP_USER" "$ENV_FILE"
  chmod 640 "$ENV_FILE"
  NEW_ENV=1
else
  NEW_ENV=0
  say "Keeping existing $ENV_FILE"
fi

# ---------- database schema ----------
say "Applying database migrations"
runuser -u "$APP_USER" -- env TAPPY_ENV_FILE="$ENV_FILE" \
  node --disable-warning=ExperimentalWarning src/cli.ts migrate

# ---------- systemd ----------
say "Installing systemd services"
install -m 644 "$REPO_DIR"/deploy/systemd/tappy-*.service "$REPO_DIR"/deploy/systemd/tappy-*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tappy-api.service
systemctl restart tappy-api.service
systemctl enable --now tappy-import.timer tappy-backup.timer

for _ in $(seq 1 20); do
  curl -fsS http://127.0.0.1:8787/api/health >/dev/null 2>&1 && break
  sleep 0.5
done
if curl -fsS http://127.0.0.1:8787/api/health >/dev/null 2>&1; then
  say "API is up on 127.0.0.1:8787"
else
  warn "API did not answer yet. Check: journalctl -u tappy-api -n 50"
fi

# ---------- Cloudflare Tunnel ----------
say "Installing cloudflared"
if ! command -v cloudflared >/dev/null 2>&1; then
  install -d -m 755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
    >/etc/apt/sources.list.d/cloudflared.list
  apt-get update -qq
  apt-get install -y -qq cloudflared >/dev/null
fi
if [[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]]; then
  if systemctl list-unit-files | grep -q '^cloudflared.service'; then
    say "cloudflared service already installed (to change tunnels: sudo cloudflared service uninstall, then re-run)"
  else
    say "Connecting Cloudflare Tunnel"
    cloudflared service install "$CLOUDFLARE_TUNNEL_TOKEN"
  fi
fi

# ---------- first data import ----------
products="$(sqlite3 "$DATA_DIR/data/tappy.db" 'SELECT count(*) FROM products' 2>/dev/null || echo 0)"
if ((RUN_IMPORT)) && [[ "$products" == "0" ]]; then
  say "Starting the first data import in the background (about 30 min for USDA, longer for Open Food Facts)"
  systemctl start --no-block tappy-import.service
  echo "   Follow it with: journalctl -fu tappy-import"
  echo "   The API already works while it runs; products appear as they are imported."
else
  say "Database has $products products; skipping the first import (monthly refresh timer is on)"
fi

# ---------- summary ----------
cat <<EOF

Done.
  API:          http://127.0.0.1:8787 (local only)      logs: journalctl -u tappy-api -f
  Config:       $ENV_FILE                                then: sudo systemctl restart tappy-api
  Data:         $DATA_DIR/data/tappy.db                   backups: $DATA_DIR/backups (weekly)
  Import:       sudo systemctl start tappy-import          logs: journalctl -fu tappy-import
EOF
if ((NEW_ENV)); then
  warn "Add your ANTHROPIC_API_KEY to $ENV_FILE (photo scanning), then: sudo systemctl restart tappy-api"
fi
if [[ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]] && ! systemctl is-active --quiet cloudflared 2>/dev/null; then
  cat <<'EOF'

  Not public yet. Either:
    - Permanent HTTPS address (needs a domain on Cloudflare): create a tunnel in the Cloudflare dashboard
      (Zero Trust > Networks > Tunnels), point a public hostname at http://localhost:8787, then
      re-run this script with CLOUDFLARE_TUNNEL_TOKEN=<token>.
    - Quick test (random https://*.trycloudflare.com address, changes on every restart):
      cloudflared tunnel --url http://localhost:8787
EOF
fi
