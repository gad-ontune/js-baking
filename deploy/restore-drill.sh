#!/bin/sh
# Rehearse a restore into a throwaway database and compare it with production.
# Run from the repository root with a reachable Compose stack:
#
#   deploy/restore-drill.sh [backup-file.gpg]
#
# Configure the target stack with BACKUP_ENV_FILE (default .env) and optional
# BACKUP_EXTRA_FILES (for example "-f docker-compose.demo.yml").
set -eu

ENV_FILE=${BACKUP_ENV_FILE:-.env}
EXTRA_FILES=${BACKUP_EXTRA_FILES:-}
compose() {
  # Splitting EXTRA_FILES is intentional: it contains compose -f arguments.
  # shellcheck disable=SC2086
  docker compose --env-file "$ENV_FILE" -f docker-compose.yml $EXTRA_FILES "$@"
}

DB_USER=$(compose exec -T db sh -c 'printf %s "$POSTGRES_USER"')
DB_PASS=$(compose exec -T db sh -c 'printf %s "$POSTGRES_PASSWORD"')
DB_NAME=$(compose exec -T db sh -c 'printf %s "$POSTGRES_DB"')
DRILL_DB=jsbh_restore_drill

cleanup() { compose exec -T db psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DRILL_DB;" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

if [ -z "${1:-}" ]; then
  # Take a fresh point-in-time backup so the row-count comparison is valid.
  # An explicitly supplied file is still supported for testing older backups.
  echo '[jsbh drill] Creating a fresh encrypted backup for the drill...'
  compose run --rm --entrypoint /usr/local/bin/backup.sh backup
fi
BACKUP_FILE=${1:-$(compose run --rm --entrypoint sh backup -c 'ls -1t /backups/daily/*.gpg | head -1')}
[ -n "$BACKUP_FILE" ] || { echo 'No backup file found.' >&2; exit 1; }
echo "[jsbh drill] Testing backup: $BACKUP_FILE"

cleanup
compose exec -T db psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $DRILL_DB;" >/dev/null

BOOTSTRAP_URL="postgresql://$DB_USER:$DB_PASS@db:5432/$DRILL_DB?sslmode=require"
# The restored tables are owned by the restoring role, so verification uses
# the bootstrap DSN; runtime grants are reapplied by the entrypoint on deploy.
VERIFY_URL="postgresql+psycopg://$DB_USER:$DB_PASS@db:5432/$DRILL_DB?sslmode=require"

compose run --rm --entrypoint sh \
  -e RESTORE_DATABASE_URL="$BOOTSTRAP_URL" \
  -e JSBH_CONFIRM_RESTORE=yes \
  backup -c "/usr/local/bin/restore.sh '$BACKUP_FILE'"

echo '[jsbh drill] Verifying restored audit chain...'
compose run --rm --entrypoint python -e DATABASE_URL="$VERIFY_URL" \
  backend backend/scripts/verify_audit_chain.py

count() { compose exec -T db psql -U "$DB_USER" -d "$1" -tAc "SELECT COUNT(*) FROM $2;" | tr -d '[:space:]'; }
failed=0
for table in users business_records audit_logs sessions; do
  live=$(count "$DB_NAME" "$table")
  restored=$(count "$DRILL_DB" "$table")
  if [ "$live" = "$restored" ]; then
    echo "[PASS] $table: $restored rows"
  else
    echo "[FAIL] $table: live=$live restored=$restored" >&2
    failed=1
  fi
done

if [ "$failed" -eq 0 ]; then
  echo 'Restore drill passed: the encrypted backup restores to a verified copy.'
else
  echo 'Restore drill failed.' >&2
fi
exit "$failed"
