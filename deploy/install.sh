#!/usr/bin/env bash
# One-command installer for a fresh Ubuntu/Debian VPS.
#   curl -fsSL https://raw.githubusercontent.com/averlonworld/bitrix24-whatsapp/feature/whatsapp-qr-connector/deploy/install.sh | sudo bash
# Installs Docker, downloads the app, asks for your Bitrix24 app credentials and starts everything
# with HTTPS. Without your own domain it uses <your-ip>.sslip.io, which gets a real certificate.
set -euo pipefail

REPO="${REPO:-https://github.com/averlonworld/bitrix24-whatsapp.git}"
BRANCH="${BRANCH:-feature/whatsapp-qr-connector}"
DIR="${DIR:-/opt/bitrix24-whatsapp}"

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
ask() { local prompt="$1" var; read -r -p "$prompt" var </dev/tty; printf '%s' "$var"; }

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)."; exit 1; }

if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
command -v git >/dev/null 2>&1 || { apt-get update -y && apt-get install -y git; }

say "Downloading the app to $DIR"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch --depth 1 origin "$BRANCH" && git -C "$DIR" checkout -B "$BRANCH" FETCH_HEAD
else
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"

if [ ! -f .env ]; then
  IP="$(curl -fsSL https://api.ipify.org || curl -fsSL https://ifconfig.me)"
  DEFAULT_DOMAIN="$(echo "$IP" | tr '.' '-').sslip.io"
  DOMAIN="$(ask "Domain for this server [$DEFAULT_DOMAIN]: ")"
  DOMAIN="${DOMAIN:-$DEFAULT_DOMAIN}"

  cat <<MSG

------------------------------------------------------------------------
 Now create the app in Bitrix24 (in another tab):
   Your portal -> Developer resources -> Other -> Local application
     Type:                       Server-side, uses the user interface
     Your handler path:          https://$DOMAIN/
     Initial installation path:  https://$DOMAIN/install
     Menu item text:             WhatsApp
     Permissions:                imconnector, imopenlines, im, crm,
                                 placement, bizproc, messageservice
   Save it, then copy the Application ID (client_id) and key (client_secret).
------------------------------------------------------------------------
MSG
  CLIENT_ID="$(ask "Bitrix24 client_id: ")"
  CLIENT_SECRET="$(ask "Bitrix24 client_secret: ")"
  [ -n "$CLIENT_ID" ] && [ -n "$CLIENT_SECRET" ] || { echo "Both values are required."; exit 1; }

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
  say "Saved settings to $DIR/.env (keep a backup: TOKEN_ENC_KEY decrypts the WhatsApp logins)"
fi

say "Building and starting (first build takes a few minutes)"
docker compose up -d --build

DOMAIN="$(grep '^DOMAIN=' .env | cut -d= -f2)"
say "Waiting for https://$DOMAIN/health"
for _ in $(seq 1 60); do
  if curl -fsS "https://$DOMAIN/health" >/dev/null 2>&1; then
    say "Running at https://$DOMAIN"
    echo "Open your Bitrix24 portal -> the new 'WhatsApp' app (left menu, or Applications) to install it."
    echo "Logs:   cd $DIR && docker compose logs -f app"
    exit 0
  fi
  sleep 5
done
echo "Not reachable over HTTPS yet. Check that ports 80 and 443 are open, then: docker compose logs caddy app"
exit 1
