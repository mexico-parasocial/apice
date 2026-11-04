#!/usr/bin/env bash
set -euo pipefail
: "${VLPDS_BIN:?Set VLPDS_BIN to the pinned vlpds executable}"
exec "$VLPDS_BIN" --dev-mode --spaces --plc-mode unregistered \
  --listen 127.0.0.1:2593 --public-url http://127.0.0.1:2593 \
  --handle-domain pilot.test --s3-endpoint "${PILOT_S3_ENDPOINT:-http://127.0.0.1:2595}" \
  --s3-bucket apice-pilot-pds --prefix apice-pilot-v1 \
  --s3-access-key apice-pilot-only --s3-secret-key apice-pilot-test-secret \
  --shards 2 --workers 2 --io-threads 2 --memory-budget-mb 2048 \
  --firehose-ring-mb 16 --firehose-merge-queue-mb 16 --live-ring-mb 16 \
  --backfill-cache-mb 16 --backfill-readahead-mb 1 --firehose-max-backfills 1 \
  --max-exports 1 --lazy-mst-node-cache-mb 16
