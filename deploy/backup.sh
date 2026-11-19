#!/bin/sh
# Create an encrypted, checksummed PostgreSQL backup and apply retention.
# Runs inside the backup container. Off-site sync is required in production
# unless ALLOW_LOCAL_ONLY_BACKUPS=true is explicitly set.
set -eu

umask 077
BACKUP_DIR=${BACKUP_DIR:-/backups}
DAILY_DIR="$BACKUP_DIR/daily"
WEEKLY_DIR="$BACKUP_DIR/weekly"
MONTHLY_DIR="$BACKUP_DIR/monthly"
KEEP_DAILY=${BACKUP_KEEP_DAILY:-14}
KEEP_WEEKLY=${BACKUP_KEEP_WEEKLY:-8}
KEEP_MONTHLY=${BACKUP_KEEP_MONTHLY:-12}
PASSFILE=$(mktemp /tmp/jsbh-backup-pass.XXXXXX)
DUMPFILE=$(mktemp /tmp/jsbh-backup-dump.XXXXXX)

cleanup() { rm -f "$PASSFILE" "$DUMPFILE"; }
trap cleanup EXIT INT TERM

_passphrase() {
  if [ -n "${BACKUP_PASSPHRASE_FILE:-}" ] && [ -f "$BACKUP_PASSPHRASE_FILE" ]; then
    cat "$BACKUP_PASSPHRASE_FILE"
  else
    printf '%s' "${BACKUP_PASSPHRASE:-}"
  fi
}

_offsite() {
  [ -n "${RCLONE_REMOTE:-}" ] || return 0
  rclone copy "$BACKUP_DIR/daily" "$RCLONE_REMOTE/daily" --no-traverse
  if [ -n "$(ls -A "$WEEKLY_DIR" 2>/dev/null)" ]; then
    rclone copy "$WEEKLY_DIR" "$RCLONE_REMOTE/weekly" --no-traverse
  fi
  if [ -n "$(ls -A "$MONTHLY_DIR" 2>/dev/null)" ]; then
    rclone copy "$MONTHLY_DIR" "$RCLONE_REMOTE/monthly" --no-traverse
  fi
  rclone check "$BACKUP_DIR/daily" "$RCLONE_REMOTE/daily" --one-way
}

# Fail closed: an encrypted copy that only exists beside the database is not a
# backup. Operators must configure rclone or explicitly accept local-only use.
if [ -z "${RCLONE_REMOTE:-}" ] && [ "${ALLOW_LOCAL_ONLY_BACKUPS:-false}" != 'true' ]; then
  echo '[jsbh backup] Refusing to run: set RCLONE_REMOTE or ALLOW_LOCAL_ONLY_BACKUPS=true.' >&2
  exit 2
fi

passphrase=$(_passphrase)
if [ "${#passphrase}" -lt 20 ]; then
  echo '[jsbh backup] BACKUP_PASSPHRASE must contain at least 20 characters.' >&2
  exit 2
fi
printf '%s\n' "$passphrase" > "$PASSFILE"
unset passphrase

mkdir -p "$DAILY_DIR" "$WEEKLY_DIR" "$MONTHLY_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
NAME="jsbh-${STAMP}.gpg"
DEST="$DAILY_DIR/$NAME"

echo '[jsbh backup] Dumping database...'
PGPASSWORD="$BACKUP_DB_PASSWORD" pg_dump \
  --host "$BACKUP_DB_HOST" \
  --port "${BACKUP_DB_PORT:-5432}" \
  --username "$BACKUP_DB_USER" \
  --dbname "$BACKUP_DB_NAME" \
  --format=custom --no-owner --no-acl --compress=6 \
  --file "$DUMPFILE"

echo '[jsbh backup] Encrypting with AES-256...'
gpg --batch --yes --quiet --symmetric --cipher-algo AES256 \
  --passphrase-file "$PASSFILE" --output "$DEST" "$DUMPFILE"

sha256sum "$DEST" > "$DEST.sha256"
(cd "$DAILY_DIR" && sha256sum -c "${NAME}.sha256" >/dev/null)
# Verify the ciphertext can actually be decrypted before reporting success.
gpg --batch --quiet --decrypt --passphrase-file "$PASSFILE" "$DEST" >/dev/null

if [ "$(date -u +%u)" = '7' ]; then cp "$DEST" "$WEEKLY_DIR/$NAME"; fi
if [ "$(date -u +%d)" = '01' ]; then cp "$DEST" "$MONTHLY_DIR/$NAME"; fi

keep_newest() {
  directory=$1
  keep=$2
  ls -1t "$directory"/*.gpg 2>/dev/null | tail -n "+$((keep + 1))" | while IFS= read -r old; do
    rm -f "$old" "$old.sha256"
  done
}
keep_newest "$DAILY_DIR" "$KEEP_DAILY"
keep_newest "$WEEKLY_DIR" "$KEEP_WEEKLY"
keep_newest "$MONTHLY_DIR" "$KEEP_MONTHLY"

_offsite

echo "[jsbh backup] Created $NAME (AES-256, checksum verified)."
