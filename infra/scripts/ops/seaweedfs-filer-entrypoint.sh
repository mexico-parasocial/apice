#!/bin/sh
# Generates filer.toml from environment variables and then runs the upstream
# SeaweedFS entrypoint so privilege dropping /data chown is preserved.
set -e

: "${SEAWEED_FILER_POSTGRES_HOST:?required}"
: "${SEAWEED_FILER_POSTGRES_PORT:?required}"
: "${SEAWEED_FILER_POSTGRES_USER:?required}"
: "${SEAWEED_FILER_POSTGRES_PASSWORD:?required}"
: "${SEAWEED_FILER_POSTGRES_DATABASE:?required}"

mkdir -p /etc/seaweedfs

cat > /etc/seaweedfs/filer.toml <<EOF
[postgres]
enabled = true
hostname = "${SEAWEED_FILER_POSTGRES_HOST}"
port = ${SEAWEED_FILER_POSTGRES_PORT}
username = "${SEAWEED_FILER_POSTGRES_USER}"
password = "${SEAWEED_FILER_POSTGRES_PASSWORD}"
database = "${SEAWEED_FILER_POSTGRES_DATABASE}"
sslmode = "disable"
connection_max_idle = 50
connection_max_open = 100
EOF

exec /entrypoint.sh filer -master=seaweed-master:9333 -ip.bind=0.0.0.0 -port=8888 "$@"
