#!/usr/bin/env bash
# Run the connector on your own computer (macOS, Linux, or Windows via WSL / Git Bash).
# Needs Docker Desktop running. Usage:  bash scripts/local.sh
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.local.yml"

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
setenv() { # setenv KEY VALUE  (portable in-place edit of .env)
  if grep -q "^$1=" .env; then
    awk -v k="$1" -v v="$2" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} {print}' .env > .env.tmp && mv .env.tmp .env
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}
getenv() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2-; }

command -v docker >/dev/null || die "Install Docker Desktop first: https://www.docker.com/products/docker-desktop/"
docker info >/dev/null 2>&1 || die "Docker is not running - start Docker Desktop and try again."
command -v openssl >/dev/null || die "openssl is required (included with Git Bash, macOS and Linux)."

if [ ! -f .env ]; then
  say "First run - creating .env"
  read -r -p "Bitrix24 client_id (Application ID): " CLIENT_ID
  read -r -p "Bitrix24 client_secret (Application key): " CLIENT_SECRET
  [ -n "$CLIENT_ID" ] && [ -n "$CLIENT_SECRET" ] || die "Both values are required."
  umask 077
  cat > .env <<ENV
PUBLIC_URL=https://pending.trycloudflare.com
PORT=3000
BITRIX_CLIENT_ID=$CLIENT_ID
BITRIX_CLIENT_SECRET=$CLIENT_SECRET
POSTGRES_PASSWORD=$(openssl rand -hex 24)
TOKEN_ENC_KEY=$(openssl rand -base64 32)
APP_SECRET=$(openssl rand -base64 32)
CONNECTOR_ID=wa_qr_connector
CONNECTOR_NAME=WhatsApp
CONNECTOR_VERSION=1
SEND_MIN_INTERVAL_MS=1500
LOG_LEVEL=info
ENV
fi

say "Starting the tunnel"
$COMPOSE up -d tunnel
URL=""
for _ in $(seq 1 30); do
  URL=$($COMPOSE logs tunnel 2>/dev/null | grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)
  [ -n "$URL" ] && break
  sleep 2
done
[ -n "$URL" ] || die "No tunnel address yet. See: $COMPOSE logs tunnel"

OLD=$(getenv PUBLIC_URL)
if [ "$OLD" != "$URL" ]; then
  setenv PUBLIC_URL "$URL"
  if [ "$OLD" != "https://pending.trycloudflare.com" ]; then
    # New address: make every portal re-register the connector, tabs and robots at the next app open.
    setenv CONNECTOR_VERSION "$(( $(getenv CONNECTOR_VERSION) + 1 ))"
    CHANGED=1
  fi
fi

say "Building and starting the app (first run takes a few minutes)"
$COMPOSE up -d --build app postgres redis

for _ in $(seq 1 60); do
  curl -fsS "$URL/health" >/dev/null 2>&1 && break
  sleep 3
done

say "Running at $URL"
cat <<MSG

In Bitrix24 -> Developer resources -> your Local application, the paths must be:
  Initial installation path:  $URL/install
  Your handler path:          $URL/

MSG
if [ "${CHANGED:-0}" = 1 ]; then
  printf '\033[1;33m%s\033[0m\n\n' "The address CHANGED since last time (quick tunnels get a new one on every restart)."
  echo "Update both paths in Bitrix24, save, then open the app once - it re-registers itself."
  echo
fi
echo "Logs:  $COMPOSE logs -f app"
echo "Stop:  $COMPOSE down        (your data and WhatsApp logins are kept)"
