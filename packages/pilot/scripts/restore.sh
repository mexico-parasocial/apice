#!/usr/bin/env bash
set -euo pipefail
: "${1:?Usage: bash scripts/restore.sh /absolute/backup/directory}"
source_dir="$(cd "$1" && pwd)"
(cd "$source_dir" && shasum -a 256 -c SHA256SUMS)
# Restoration ALWAYS targets fresh volumes, never the working pilot or any
# legacy deployment. Only a-z/digits/hyphens accepted in Docker names.
project="${PILOT_RESTORE_PROJECT:-apice-spaces-pilot-restore}"
[[ "$project" =~ ^apice-spaces-pilot-restore(-[a-z0-9-]+)?$ ]] || { echo 'Use a fresh apice-spaces-pilot-restore[-suffix] project' >&2; exit 1; }
for suffix in pds_bucket media_master media_volume media_filer streamplace_state; do
  [[ -f "$source_dir/$suffix.tgz" ]] || exit 1
  volume="${project}_${suffix}"
  if docker volume inspect "$volume" >/dev/null 2>&1; then
    echo "Refusing to overwrite existing volume: $volume" >&2
    exit 1
  fi
done
for suffix in pds_bucket media_master media_volume media_filer streamplace_state; do
  volume="${project}_${suffix}"
  docker volume create --label "com.docker.compose.project=$project" \
    --label "com.docker.compose.volume=$suffix" "$volume" >/dev/null
  docker run --rm -v "$volume:/target" -v "$source_dir:/backup:ro" alpine:3.20 \
    tar -C /target -xzf "/backup/$suffix.tgz"
done
echo "Restored five fresh volumes for $project. No services started."
