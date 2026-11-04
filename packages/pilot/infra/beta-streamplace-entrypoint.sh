#!/bin/sh
set -eu
export SP_S3_ACCESS_KEY_ID="$(cat /run/secrets/s3_access)"
export SP_S3_SECRET_ACCESS_KEY="$(cat /run/secrets/s3_secret)"
exec /app/streamplace "$@"
