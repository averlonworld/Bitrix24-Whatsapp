#!/usr/bin/env bash
# Import a bundle made by scripts/export.sh into this server's installation (run install.sh first).
#   sudo bash scripts/import.sh wa-export-<date>.tar.gz
# Afterwards update the two paths in Bitrix24 to this server and open the app once: it re-registers.
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE="${COMPOSE:-docker compose}"
BUNDLE="${1:-}"

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
setenv() { # setenv KEY VALUE (portable in-place edit of .env)
  if grep -q "^$1=" .env; then
    awk -v k="$1" -v v="$2" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} {print}' .env > .env.tmp && mv .env.tmp .env
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}

[ -n "$BUNDLE" ] && [ -f "$BUNDLE" ] || die "Usage: sudo bash scripts/import.sh <wa-export-....tar.gz>"
[ -f .env ] || die "Run scripts/install.sh first, then import."
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
tar -xzf "$BUNDLE" -C "$TMP" db.sql.gz carry.env || die "Not an export bundle."

say "Applying the keys from the old installation"
cp .env ".env.before-import.$(date +%s)"
# Split on the FIRST '=' only: base64 keys end in '=' and `read` with IFS='=' would drop it.
while IFS= read -r line || [ -n "$line" ]; do
  [ -n "$line" ] || continue
  setenv "${line%%=*}" "${line#*=}"
done < "$TMP/carry.env"
# New public address: bump the version so every portal re-registers its connector at the next open.
setenv CONNECTOR_VERSION "$(( $(grep -E '^CONNECTOR_VERSION=' .env | cut -d= -f2-) + 1 ))"
chmod 600 .env

say "Restoring the data"
YES=1 COMPOSE="$COMPOSE" bash scripts/restore.sh "$TMP/db.sql.gz"
# The app container read .env when it started; recreate it so it uses the imported keys.
$COMPOSE up -d --force-recreate app >/dev/null

DOMAIN=$(grep -E '^DOMAIN=' .env | cut -d= -f2-)
say "Imported"
cat <<MSG
Now in Bitrix24 -> Developer resources -> your Local application, set:
  Initial installation path:  https://$DOMAIN/install
  Your handler path:          https://$DOMAIN/
Save, then open the app once. WhatsApp numbers reconnect without a new QR scan.
MSG
