#!/bin/sh
# Restore an encrypted backup into an explicitly supplied database URL.
# JSBH_CONFIRM_RESTORE=yes is mandatory, so a typo cannot overwrite the live
# database by accident. Used by restore-drill.sh with a throwaway database.
set -eu

umask 077
BACKUP_FILE=${1:-}
[ -n "$BACKUP_FILE" ] || { echo 'Usage: restore.sh <backup.gpg>' >&2; exit 2; }
[ -n "${RESTORE_DATABASE_URL:-}" ] || { echo 'RESTORE_DATABASE_URL is required.' >&2; exit 2; }
[ "${JSBH_CONFIRM_RESTORE:-}" = 'yes' ] || {
  echo 'Refusing to restore without JSBH_CONFIRM_RESTORE=yes.' >&2
  exit 2
}

PASSFILE=$(mktemp /tmp/jsbh-restore-pass.XXXXXX)
DUMPFILE=$(mktemp /tmp/jsbh-restore-dump.XXXXXX)
cleanup() { rm -f "$PASSFILE" "$DUMPFILE"; }
trap cleanup EXIT INT TERM

if [ -n "${BACKUP_PASSPHRASE_FILE:-}" ] && [ -f "$BACKUP_PASSPHRASE_FILE" ]; then
  cat "$BACKUP_PASSPHRASE_FILE" > "$PASSFILE"
else
  printf '%s\n' "${BACKUP_PASSPHRASE:-}" > "$PASSFILE"
fi

(cd "$(dirname "$BACKUP_FILE")" && sha256sum -c "$(basename "$BACKUP_FILE").sha256" >/dev/null)
gpg --batch --yes --quiet --decrypt --passphrase-file "$PASSFILE" --output "$DUMPFILE" "$BACKUP_FILE"

echo '[jsbh restore] Restoring into the explicitly named database...'
pg_restore --no-owner --no-acl --clean --if-exists --exit-on-error \
  --dbname "$RESTORE_DATABASE_URL" "$DUMPFILE"

echo '[jsbh restore] Restore completed.'
