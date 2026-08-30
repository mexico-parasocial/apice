#!/bin/sh
# Backup PostgreSQL to SeaweedFS S3-compatible storage.
# Designed to run inside the apice-backups container.
set -e

DATE=$(date +%Y%m%d-%H%M%S)
DUMP_FILE="apice-${POSTGRES_DB}-${DATE}.sql.gz"

PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "/tmp/${DUMP_FILE}"

# Upload to SeaweedFS S3 if credentials are configured.
if [ -n "$SEAWEED_S3_ENDPOINT" ] && [ -n "$SEAWEED_ACCESS_KEY" ] && [ -n "$SEAWEED_SECRET_KEY" ] && [ -n "$SEAWEED_BACKUPS_BUCKET" ]; then
  if command -v aws >/dev/null 2>&1; then
    aws s3 cp "/tmp/${DUMP_FILE}" "s3://${SEAWEED_BACKUPS_BUCKET}/apice/backups/${DUMP_FILE}" \
      --endpoint-url "$SEAWEED_S3_ENDPOINT" \
      --access_key "$SEAWEED_ACCESS_KEY" \
      --secret_key "$SEAWEED_SECRET_KEY" || echo "S3 upload failed; dump kept in /tmp"
  elif command -v mc >/dev/null 2>&1; then
    mc alias set backup "$SEAWEED_S3_ENDPOINT" "$SEAWEED_ACCESS_KEY" "$SEAWEED_SECRET_KEY"
    mc cp "/tmp/${DUMP_FILE}" "backup/${SEAWEED_BACKUPS_BUCKET}/apice/backups/${DUMP_FILE}" || echo "S3 upload failed; dump kept in /tmp"
  else
    echo "No S3 CLI available; dump kept in /tmp/${DUMP_FILE}"
    exit 0
  fi

  rm -f "/tmp/${DUMP_FILE}"
  echo "Backup uploaded: ${DUMP_FILE}"
else
  echo "SeaweedFS S3 backup credentials not configured; dump kept in /tmp/${DUMP_FILE}"
fi

# Local retention cleanup.
find /tmp -name "apice-*.sql.gz" -mtime +${BACKUP_RETENTION_DAYS:-7} -delete
