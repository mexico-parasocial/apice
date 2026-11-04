# Backup Restore Drill

**Goal:** prove that nightly Postgres backups to SeaweedFS S3 can actually restore
a working stack. Run this quarterly or after any infrastructure change.

**Time:** ~30 minutes.

## Prerequisites

- Production compose stack running (`docker compose -f docker-compose.prod.yml up -d`)
- `mc` (MinIO Client) or `aws` CLI available on the host
- SeaweedFS S3 endpoint accessible (default: `http://localhost:8333`)

## Steps

### 1. List available backups

```bash
# Using mc
mc alias set drill "$SEAWEED_S3_ENDPOINT" "$SEAWEED_ACCESS_KEY" "$SEAWEED_SECRET_KEY"
mc ls drill/apice-backups/apice/backups/ --recursive | tail -5

# Using aws
aws s3 ls s3://apice-backups/apice/backups/ \
  --endpoint-url "$SEAWEED_S3_ENDPOINT" | tail -5
```

Confirm there is at least one `.sql.gz` file from the last 24 hours.

### 2. Download the latest backup

```bash
BACKUP_FILE=$(mc ls drill/apice-backups/apice/backups/ --recursive \
  | grep '\.sql\.gz$' | sort | tail -1 | awk '{print $NF}')

mc cp "drill/apice-backups/apice/backups/${BACKUP_FILE}" /tmp/restore-drill.sql.gz
```

### 3. Spin up a temporary Postgres instance

```bash
docker run -d --name apice-restore-drill \
  -e POSTGRES_USER=apice \
  -e POSTGRES_PASSWORD=restore-drill-test \
  -e POSTGRES_DB=apice_restore \
  -p 5435:5432 \
  postgres:16-alpine
```

Wait for it to be ready:

```bash
until docker exec apice-restore-drill pg_isready -U apice -d apice_restore; do
  sleep 1
done
```

### 4. Restore the dump

```bash
gunzip -c /tmp/restore-drill.sql.gz \
  | docker exec -i apice-restore-drill psql -U apice -d apice_restore
```

### 5. Verify data integrity

Run these checks inside the restored database:

```bash
docker exec -i apice-restore-drill psql -U apice -d apice_restore <<'SQL'
-- Table count (expect 19+)
SELECT count(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'public';

-- Course count (should match production)
SELECT count(*) AS course_count FROM "Course";

-- Lesson count
SELECT count(*) AS lesson_count FROM "CourseLesson";

-- User count
SELECT count(*) AS user_count FROM "User";

-- Most recent migration
SELECT "version" FROM "_prisma_migrations"
WHERE "rolled_back_at" IS NULL
ORDER BY "started_at" DESC LIMIT 1;

-- Certificate count
SELECT count(*) AS certificate_count FROM "Certificate";
SQL
```

**Pass criteria:** all queries return non-zero counts and the migration version
matches production.

### 6. Verify SeaweedFS object access (optional)

If the restore drill database has video references, confirm the SeaweedFS S3
bucket is reachable:

```bash
mc ls drill/apice-videos/ | head -5
```

### 7. Tear down

```bash
docker rm -f apice-restore-drill
rm -f /tmp/restore-drill.sql.gz
mc alias remove drill
```

### 8. Record results

Log the drill in the table below:

| Date | Backup file | Tables | Courses | Lessons | Users | Migration | Verdict |
|------|-------------|--------|---------|---------|-------|-----------|---------|
|      |             |        |         |         |       |           |         |

## Failure modes

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `pg_dump` produces empty file | Postgres connection refused in backup container | Check `BACKUP_POSTGRES_HOST` and container networking |
| S3 upload fails silently | Missing `aws`/`mc` in backup container | Install CLI in backup container or use `curl` with S3 API |
| Restore has zero tables | Dump was from a schema-only run | Verify `pg_dump` does not use `--schema-only` |
| Migration version mismatch | Backup is from before a migration | Run `prisma migrate deploy` on the restored DB to catch up |

## Automation

To run this drill automatically monthly, add to the `backups` container crontab:

```bash
0 4 1 * * /usr/local/bin/restore-drill-check.sh
```

The check script should download the latest backup, restore to a temporary
container, run the queries above, and alert via the same webhook used for
health checks if any query fails.
