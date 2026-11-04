#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here"
# Native vlpds must be stopped first: a running PDS can acknowledge writes
# after a bucket copy. Container-pds is quiesced with the other services.
if curl -sS --max-time 2 http://127.0.0.1:2593/xrpc/_health >/dev/null 2>&1; then
  echo 'Stop the pilot runtime and native PDS before backup.' >&2
  exit 1
fi
out="${PILOT_BACKUP_DIR:-$here/.local/backups/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$out"
chmod 700 "$out"
out="$(cd "$out" && pwd)"
compose=(docker compose -f infra/compose.yaml)
"${compose[@]}" stop
# All five volumes are durable: Spaces/account keys, SQLite (including WAL),
# filer LevelDB, volume data and master metadata. Never just a repo ZIP.
for suffix in pds_bucket media_master media_volume media_filer streamplace_state; do
  volume="apice-spaces-pilot_${suffix}"
  docker volume inspect "$volume" >/dev/null
  docker run --rm -v "$volume:/source:ro" -v "$out:/backup" alpine:3.20 \
    tar -C /source -czf "/backup/$suffix.tgz" .
done
(cd "$out" && shasum -a 256 ./*.tgz > SHA256SUMS)
echo "Quiesced backup: $out"
echo 'Services remain stopped. Restart infrastructure and the PDS explicitly.'
