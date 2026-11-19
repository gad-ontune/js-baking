# Backup image: pg_dump + AES-256 encryption + optional off-site sync via rclone.
FROM postgres:16-alpine

RUN apk add --no-cache gnupg rclone ca-certificates

COPY deploy/backup-entrypoint.sh /usr/local/bin/backup-entrypoint.sh
COPY deploy/backup.sh /usr/local/bin/backup.sh
COPY deploy/restore.sh /usr/local/bin/restore.sh
RUN chmod 0755 /usr/local/bin/backup-entrypoint.sh \
             /usr/local/bin/backup.sh \
             /usr/local/bin/restore.sh

VOLUME /backups
ENTRYPOINT ["backup-entrypoint.sh"]
