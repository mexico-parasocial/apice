#!/bin/sh
# Copy backups off the machine.
#
# The nightly pg_dump lands in SeaweedFS on the same box it was taken on —
# a first working store, but a machine failure (or a filer-metadata loss,
# since filer metadata lives in the same PostgreSQL) destroys it together
# with the thing it is backing up. This job mirrors the backup bucket plus
# the app data buckets to a SECOND, off-machine S3-compatible target, so a
# restore is always possible from somewhere else.
#
# Runs nightly from the backups container (see docker-compose.prod.yml).
# The target can be any S3-compatible endpoint: another SeaweedFS/MinIO on
# a different server, or a cloud store (Backblaze B2, Hetzner, Wasabi, ...).
#
# Required environment:
#   SEAWEED_S3_ENDPOINT, SEAWEED_ACCESS_KEY, SEAWEED_SECRET_KEY — source
#   SEAWEED_BACKUPS_BUCKET                                     — source
#   OFFSITE_S3_ENDPOINT, OFFSITE_ACCESS_KEY, OFFSITE_SECRET_KEY — target
#   OFFSITE_BUCKET                                             — target
# Optional:
#   OFFSITE_BUCKET_LIST     — default: backups + assets + private buckets
#   OFFSITE_RETENTION_DAYS  — prune offsite dumps older than this (30)
set -eu

: "${SEAWEED_S3_ENDPOINT:?required}"
: "${SEAWEED_ACCESS_KEY:?required}"
: "${SEAWEED_SECRET_KEY:?required}"
: "${SEAWEED_BACKUPS_BUCKET:?required}"

# Fail loudly rather than silently skipping: an unconfigured offsite copy
# is exactly the gap this job exists to close.
: "${OFFSITE_S3_ENDPOINT:?OFFSITE_S3_ENDPOINT is required — backups must have an off-machine copy}"
: "${OFFSITE_ACCESS_KEY:?required}"
: "${OFFSITE_SECRET_KEY:?required}"
: "${OFFSITE_BUCKET:?required}"

OFFSITE_RETENTION_DAYS="${OFFSITE_RETENTION_DAYS:-30}"
OFFSITE_BUCKET_LIST="${OFFSITE_BUCKET_LIST:-$SEAWEED_BACKUPS_BUCKET apice-assets apice-private}"

mc alias set source "$SEAWEED_S3_ENDPOINT" "$SEAWEED_ACCESS_KEY" "$SEAWEED_SECRET_KEY" --api S3v4 >/dev/null
mc alias set offsite "$OFFSITE_S3_ENDPOINT" "$OFFSITE_ACCESS_KEY" "$OFFSITE_SECRET_KEY" --api S3v4 >/dev/null

# Bucket names must exist on the source; create the target root if missing.
mc mb --ignore-existing "offsite/$OFFSITE_BUCKET" >/dev/null

for bucket in $OFFSITE_BUCKET_LIST; do
  if ! mc stat "source/$bucket" >/dev/null 2>&1; then
    echo "WARNING: source bucket '$bucket' does not exist — skipping" >&2
    continue
  fi
  mc mirror --overwrite "source/$bucket" "offsite/$OFFSITE_BUCKET/$bucket"
  echo "Mirrored: $bucket"
done

# Prune stale dumps on the target so the offsite copy stays bounded.
# Retention is deliberately longer on the offsite copy than on-source.
mc rm --recursive --force --older-than "${OFFSITE_RETENTION_DAYS}d" \
  "offsite/$OFFSITE_BUCKET/$SEAWEED_BACKUPS_BUCKET" || true

echo "Offsite copy complete: ${OFFSITE_BUCKET_LIST} -> ${OFFSITE_S3_ENDPOINT}/${OFFSITE_BUCKET}"
