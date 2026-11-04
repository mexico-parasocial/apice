#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose run --rm --no-deps --entrypoint /bin/sh seaweed-create-buckets -ec '
  mc alias set seaweed "$SEAWEED_S3_ENDPOINT" "$SEAWEED_ACCESS_KEY" "$SEAWEED_SECRET_KEY" --api S3v4 >/dev/null
  attempts=0
  until mc ls seaweed/apice-videos >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    [ "$attempts" -lt 30 ] || { echo "SeaweedFS S3 did not become ready" >&2; exit 1; }
    sleep 2
  done
  mc ls seaweed/apice-assets >/dev/null
  mc ls seaweed/apice-backups >/dev/null
  printf "apice-seaweed-roundtrip\n" > /tmp/source
  mc cp /tmp/source seaweed/apice-assets/doctor-roundtrip.txt >/dev/null
  mc cp seaweed/apice-assets/doctor-roundtrip.txt /tmp/result >/dev/null
  test "$(cat /tmp/source)" = "$(cat /tmp/result)"
  mc rm seaweed/apice-assets/doctor-roundtrip.txt >/dev/null
  echo "SeaweedFS buckets and write/read/delete: PASS"
'
