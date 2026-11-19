#!/bin/sh
# Runs one backup at startup (so a fresh deployment is immediately covered)
# and then follows BACKUP_CRON, for example "0 2 * * *".
set -eu

if [ "${BACKUP_ON_START:-true}" = 'true' ]; then
  /usr/local/bin/backup.sh
fi

if [ -n "${BACKUP_CRON:-}" ]; then
  printf '%s /usr/local/bin/backup.sh >> /var/log/cron.log 2>&1\n' "$BACKUP_CRON" | crontab -
  exec crond -f -d 8
fi

exec sleep infinity
