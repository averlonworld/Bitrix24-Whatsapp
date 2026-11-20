#!/usr/bin/env bash
# Move an existing installation (e.g. the laptop test setup) to a server without re-scanning QR codes.
#   On the old machine:  bash scripts/export.sh            -> wa-export-<date>.tar.gz
#   Copy it to the server, then there:  sudo bash scripts/import.sh wa-export-<date>.tar.gz
# The bundle contains the WhatsApp logins and the keys that decrypt them: treat it like a password.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

if [ -z "${COMPOSE:-}" ]; then
  if [ -f docker-compose.local.yml ] && docker compose -f docker-compose.local.yml ps -q postgres 2>/dev/null | grep -q .; then
    COMPOSE="docker compose -f docker-compose.local.yml"
  else
    COMPOSE="docker compose"
  fi
fi
[ -f .env ] || die "No .env here - nothing to export."
$COMPOSE ps -q postgres | grep -q . || die "The database is not running. Start it first."

OUT="wa-export-$(date +%Y%m%d-%H%M%S).tar.gz"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

say "Stopping the app (a WhatsApp login must never run in two places at once)"
$COMPOSE stop app >/dev/null

say "Dumping the database"
$COMPOSE exec -T postgres pg_dump -U wa --clean --if-exists wa | gzip > "$TMP/db.sql.gz"

# Only what must survive the move. Server-specific values (DOMAIN, PUBLIC_URL, POSTGRES_PASSWORD) stay
# with the new server.
grep -E '^(BITRIX_CLIENT_ID|BITRIX_CLIENT_SECRET|BITRIX_EXTRA_APPS|TOKEN_ENC_KEY|APP_SECRET|CONNECTOR_ID|CONNECTOR_NAME|CONNECTOR_VERSION)=' .env > "$TMP/carry.env"

umask 077
tar -czf "$OUT" -C "$TMP" db.sql.gz carry.env
say "Created $OUT"
echo "The app on this machine is now STOPPED so it does not fight the server for the WhatsApp login."
echo "Next: copy $OUT to the server (e.g. scp $OUT root@SERVER:/opt/bitrix24-whatsapp/)"
echo "      and run there:  sudo bash scripts/import.sh $OUT"
