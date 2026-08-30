#!/bin/sh
# Creates the filemeta table that SeaweedFS filer needs when using Postgres.
# Runs inside the postgres:16-alpine image before the filer starts.
set -e

: "${SEAWEED_FILER_POSTGRES_HOST:?required}"
: "${SEAWEED_FILER_POSTGRES_PORT:?required}"
: "${SEAWEED_FILER_POSTGRES_USER:?required}"
: "${SEAWEED_FILER_POSTGRES_PASSWORD:?required}"
: "${SEAWEED_FILER_POSTGRES_DATABASE:?required}"

export PGPASSWORD="$SEAWEED_FILER_POSTGRES_PASSWORD"

psql -h "$SEAWEED_FILER_POSTGRES_HOST" -p "$SEAWEED_FILER_POSTGRES_PORT" -U "$SEAWEED_FILER_POSTGRES_USER" -d "$SEAWEED_FILER_POSTGRES_DATABASE" -c "
CREATE TABLE IF NOT EXISTS filemeta (
  dirhash     BIGINT,
  name        VARCHAR(65535),
  directory   VARCHAR(65535),
  meta        bytea,
  PRIMARY KEY (dirhash, name)
);
" || { echo "Failed to create SeaweedFS filer metadata table"; exit 1; }

echo "SeaweedFS filer metadata table ready."
