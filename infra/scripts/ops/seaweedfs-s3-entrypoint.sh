#!/bin/sh
# Generates s3.json from environment variables and then runs the upstream
# SeaweedFS entrypoint so privilege dropping /data chown is preserved.
set -e

: "${SEAWEED_ACCESS_KEY:?SEAWEED_ACCESS_KEY required}"
: "${SEAWEED_SECRET_KEY:?SEAWEED_SECRET_KEY required}"

mkdir -p /etc/seaweedfs

cat > /etc/seaweedfs/s3.json <<EOF
{
  "identities": [
    {
      "name": "apice-server",
      "credentials": [
        { "accessKey": "${SEAWEED_ACCESS_KEY}", "secretKey": "${SEAWEED_SECRET_KEY}" }
      ],
      "actions": ["Read", "Write", "List"]
    }
  ]
}
EOF

exec /entrypoint.sh s3 -filer=seaweed-filer:8888 -ip.bind=0.0.0.0 -port=8333 -config=/etc/seaweedfs/s3.json "$@"
