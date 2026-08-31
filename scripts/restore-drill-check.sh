#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Automated backup restore check — downloads latest backup, restores to a
# temporary Postgres container, runs integrity queries, and alerts on failure.
# Designed for cron: 0 4 1 * * /usr/local/bin/restore-drill-check.sh
#
# Environment:
#   POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB — production credentials
#   SEAWEED_S3_ENDPOINT, SEAWEED_ACCESS_KEY, SEAWEED_SECRET_KEY — S3 access
#   SEAWEED_BACKUPS_BUCKET                       — bucket name (default: apice-backups)
#   ALERT_WEBHOOK                                — optional Slack/Discord webhook
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER_NAME="apice-restore-drill-$(date +%s)"
DUMP_FILE="/tmp/restore-drill-$(date +%s).sql.gz"
PORT=5435
PASS="restore-drill-test-$(date +%s)"

SEAWEED_BACKUPS_BUCKET="${SEAWEED_BACKUPS_BUCKET:-apice-backups}"

alert() {
  local message="$1"
  echo "RESTORE DRILL FAILED: $message"
  if [ -n "${ALERT_WEBHOOK:-}" ]; then
    curl -sf -X POST "$ALERT_WEBHOOK" \
      -H "Content-Type: application/json" \
      -d "{\"text\": \"Restore drill FAILED: $message\"}" \
      > /dev/null 2>&1 || true
  fi
  cleanup
  exit 1
}

cleanup() {
  docker rm -f "$CONTAINER_NAME" > /dev/null 2>&1 || true
  rm -f "$DUMP_FILE"
}

trap cleanup EXIT

# 1. Find latest backup
echo "Finding latest backup..."
if command -v mc > /dev/null 2>&1; then
  mc alias set drill-restore "${SEAWEED_S3_ENDPOINT}" "${SEAWEED_ACCESS_KEY}" "${SEAWEED_SECRET_KEY}" > /dev/null 2>&1
  BACKUP_KEY=$(mc ls "drill-restore/${SEAWEED_BACKUPS_BUCKET}/apice/backups/" --recursive 2>/dev/null \
    | grep '\.sql\.gz$' | sort | tail -1 | awk '{print $NF}')
  [ -n "$BACKUP_KEY" ] || alert "No backups found in s3://${SEAWEED_BACKUPS_BUCKET}/apice/backups/"
  mc cp "drill-restore/${SEAWEED_BACKUPS_BUCKET}/apice/backups/${BACKUP_KEY}" "$DUMP_FILE" > /dev/null 2>&1 \
    || alert "Failed to download backup ${BACKUP_KEY}"
elif command -v aws > /dev/null 2>&1; then
  LATEST=$(aws s3 ls "s3://${SEAWEED_BACKUPS_BUCKET}/apice/backups/" \
    --endpoint-url "$SEAWEED_S3_ENDPOINT" 2>/dev/null \
    | grep '\.sql\.gz$' | sort | tail -1 | awk '{print $4}')
  [ -n "$LATEST" ] || alert "No backups found"
  aws s3 cp "s3://${SEAWEED_BACKUPS_BUCKET}/apice/backups/${LATEST}" "$DUMP_FILE" \
    --endpoint-url "$SEAWEED_S3_ENDPOINT" > /dev/null 2>&1 \
    || alert "Failed to download backup ${LATEST}"
else
  alert "No S3 CLI (mc or aws) available"
fi

echo "Downloaded: $(basename "$DUMP_FILE") ($(du -h "$DUMP_FILE" | cut -f1))"

# 2. Start temporary Postgres
echo "Starting temporary Postgres..."
docker run -d --name "$CONTAINER_NAME" \
  -e POSTGRES_USER="$POSTGRES_USER" \
  -e POSTGRES_PASSWORD="$PASS" \
  -e POSTGRES_DB=apice_restore \
  -p "${PORT}:5432" \
  postgres:16-alpine > /dev/null 2>&1 \
  || alert "Failed to start temporary Postgres container"

until docker exec "$CONTAINER_NAME" pg_isready -U "$POSTGRES_USER" -d apice_restore > /dev/null 2>&1; do
  sleep 1
done

# 3. Restore
echo "Restoring backup..."
gunzip -c "$DUMP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d apice_restore > /dev/null 2>&1 \
  || alert "Failed to restore backup"

# 4. Verify
echo "Running integrity checks..."
RESULT=$(docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d apice_restore -t -A <<'SQL'
SELECT json_build_object(
  'tables', (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'),
  'courses', (SELECT count(*) FROM "Course"),
  'lessons', (SELECT count(*) FROM "CourseLesson"),
  'users', (SELECT count(*) FROM "User"),
  'certificates', (SELECT count(*) FROM "Certificate"),
  'migration', (SELECT "version" FROM "_prisma_migrations" WHERE "rolled_back_at" IS NULL ORDER BY "started_at" DESC LIMIT 1)
)
SQL
)

echo "Result: $RESULT"

TABLES=$(echo "$RESULT" | jq -r '.tables')
COURSES=$(echo "$RESULT" | jq -r '.courses')

if [ "$TABLES" -lt 10 ]; then
  alert "Too few tables restored: $TABLES (expected 19+)"
fi

if [ "$COURSES" -lt 1 ]; then
  alert "No courses found in restored database"
fi

echo "Restore drill PASSED — tables: $TABLES, courses: $COURSES"
