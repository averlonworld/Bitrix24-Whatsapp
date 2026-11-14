#!/usr/bin/env bash
# One-command installer for a fresh Ubuntu / Debian VPS.
#   Private repo:  git clone https://github.com/averlonworld/Bitrix24-Whatsapp.git /opt/bitrix24-whatsapp
#                  sudo bash /opt/bitrix24-whatsapp/scripts/install.sh
#   Public repo:   curl -fsSL https://raw.githubusercontent.com/averlonworld/Bitrix24-Whatsapp/feature/whatsapp-qr-connector/scripts/install.sh | sudo bash
# Re-running it updates the app and keeps your existing settings and secrets.
set -euo pipefail

REPO="https://github.com/averlonworld/Bitrix24-Whatsapp.git"
BRANCH="${BRANCH:-feature/whatsapp-qr-connector}"
# Run from inside a clone (private repo): use that clone. Otherwise clone into /opt.
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." 2>/dev/null && pwd || true)"
if [ -n "$SELF_DIR" ] && [ -f "$SELF_DIR/docker-compose.yml" ] && [ -d "$SELF_DIR/.git" ]; then
  DIR="${DIR:-$SELF_DIR}"
else
  DIR="${DIR:-/opt/bitrix24-whatsapp}"
fi

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
ask() { # ask VAR "Question" "default"
  local __var=$1 __q=$2 __def=${3:-} __ans
  if [ -n "$__def" ]; then read -r -p "$__q [$__def]: " __ans </dev/tty || true; else read -r -p "$__q: " __ans </dev/tty || true; fi
  printf -v "$__var" '%s' "${__ans:-$__def}"
}

[ "$(id -u)" -eq 0 ] || die "Run as root (use sudo)."
command -v apt-get >/dev/null || die "This installer supports Ubuntu / Debian."

say "Installing prerequisites"
apt-get update -qq
apt-get install -y -qq git curl openssl ca-certificates >/dev/null
if ! command -v docker >/dev/null; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose plugin missing - install docker-compose-plugin."

say "Fetching the app ($BRANCH)"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" checkout -q "$BRANCH" && git -C "$DIR" merge -q --ff-only "origin/$BRANCH" \
    || echo "Could not update from GitHub (private repo without credentials?) - using the code already here."
else
  git clone -q -b "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"

if [ -f .env ]; then
  say "Keeping existing settings in $DIR/.env"
  DOMAIN=$(grep -E '^DOMAIN=' .env | cut -d= -f2-)
else
  IP=$(curl -fsS4 https://api.ipify.org || true)
  DEFAULT_DOMAIN=""
  [ -n "$IP" ] && DEFAULT_DOMAIN="${IP//./-}.sslip.io"
  echo
  echo "Public address for this server. No domain? Keep the default: sslip.io maps it to this"
  echo "server's IP for free, and a real HTTPS certificate is issued automatically."
  ask DOMAIN "Domain" "$DEFAULT_DOMAIN"
  [ -n "$DOMAIN" ] || die "A domain is required."
  echo
  echo "From Bitrix24: Developer resources -> Other -> Local application (see README)."
  echo "  Handler path:               https://$DOMAIN/"
  echo "  Initial installation path:  https://$DOMAIN/install"
  echo "  Permissions: imconnector, imopenlines, im, crm, placement, bizproc, messageservice"
  echo
  ask CLIENT_ID "Bitrix24 client_id (application code)"
  ask CLIENT_SECRET "Bitrix24 client_secret (application key)"
  [ -n "$CLIENT_ID" ] && [ -n "$CLIENT_SECRET" ] || die "client_id and client_secret are required."

  umask 077
  cat > .env <<ENV
DOMAIN=$DOMAIN
PUBLIC_URL=https://$DOMAIN
PORT=3000
BITRIX_CLIENT_ID=$CLIENT_ID
BITRIX_CLIENT_SECRET=$CLIENT_SECRET
POSTGRES_PASSWORD=$(openssl rand -hex 24)
TOKEN_ENC_KEY=$(openssl rand -base64 32)
APP_SECRET=$(openssl rand -base64 32)
CONNECTOR_ID=wa_qr_connector
CONNECTOR_NAME=WhatsApp
CONNECTOR_VERSION=1
MEDIA_MAX_AGE_DAYS=7
SEND_MIN_INTERVAL_MS=1500
LOG_LEVEL=info
ENV
  say "Settings saved to $DIR/.env - back this file up: TOKEN_ENC_KEY decrypts the WhatsApp logins"
fi

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
fi

say "Building and starting (first run takes a few minutes)"
docker compose up -d --build

say "Waiting for https://$DOMAIN/health"
for _ in $(seq 1 60); do
  if curl -fsS "https://$DOMAIN/health" >/dev/null 2>&1; then
    say "Running at https://$DOMAIN"
    echo "Next: in Bitrix24 open the app (left menu or Developer resources -> your app -> open),"
    echo "add a WhatsApp number, scan the QR code, choose an Open Line."
    echo "Logs:    cd $DIR && docker compose logs -f app"
    exit 0
  fi
  sleep 5
done
echo
echo "The app did not answer over HTTPS yet. Check:"
echo "  - ports 80 and 443 are open in your VPS provider's firewall"
echo "  - DNS for $DOMAIN points at this server"
echo "  - logs: cd $DIR && docker compose logs app caddy"
exit 1
