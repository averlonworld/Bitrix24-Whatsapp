#!/usr/bin/env bash
# Restore the database from a backup made by the `backup` service or scripts/export.sh.
#   bash scripts/restore.sh backups/wa-20261114-030000.sql.gz
# The dump's WhatsApp logins only decrypt with the TOKEN_ENC_KEY that was in .env when it was made.
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE="${COMPOSE:-docker compose}"
FILE="${1:-}"

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ -n "$FILE" ] && [ -f "$FILE" ] || die "Usage: bash scripts/restore.sh <backup.sql.gz>"
gzip -t "$FILE" 2>/dev/null || die "$FILE is not a valid .gz file."

if [ "${YES:-}" != 1 ]; then
  read -r -p "This REPLACES all current data with $FILE. Type 'restore' to continue: " ok </dev/tty
  [ "$ok" = restore ] || die "Cancelled."
fi

say "Stopping the app"
$COMPOSE stop app >/dev/null
$COMPOSE up -d postgres >/dev/null
for _ in $(seq 1 30); do $COMPOSE exec -T postgres pg_isready -U wa >/dev/null 2>&1 && break; sleep 2; done

say "Restoring $FILE"
gunzip -c "$FILE" | $COMPOSE exec -T postgres psql -q -v ON_ERROR_STOP=1 -U wa -d wa >/dev/null

say "Starting the app"
$COMPOSE up -d app >/dev/null
echo "Done. Linked numbers reconnect by themselves within a minute."
