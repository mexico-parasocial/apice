#!/bin/bash
# Postgres init script (runs once, on an empty data directory).
#
# This used to be a .sql file with CREATE DATABASE IF NOT EXISTS — which
# Postgres does not support — so it failed silently on every fresh deploy
# and the streamplace/filer databases never existed.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
SELECT 'CREATE DATABASE apice_streamplace'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'apice_streamplace')\gexec
SELECT 'CREATE DATABASE apice_filer'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'apice_filer')\gexec
GRANT ALL PRIVILEGES ON DATABASE apice_streamplace TO CURRENT_USER;
GRANT ALL PRIVILEGES ON DATABASE apice_filer TO CURRENT_USER;
EOSQL
