#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Validate the video encoding ladder configuration.
#
# Checks that the bitrate ladder, script defaults, and documentation are
# consistent. If a sample video is provided, encodes it at each rung and
# reports the actual file sizes for comparison against the documented targets.
#
# Usage:
#   ./infra/scripts/video/validate-encoding-ladder.sh [sample-video.mp4]
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

PASS=0
FAIL=0

check() {
  local desc="$1"
  shift
  if "$@" > /dev/null 2>&1; then
    echo "  ✅ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "═══════════════════════════════════════════════════════════════"
echo " Video Encoding Ladder Validation"
echo "═══════════════════════════════════════════════════════════════"
echo

# 1. Tool availability
echo "1. Tool availability"
check "ffmpeg installed" command -v ffmpeg
check "ffprobe installed" command -v ffprobe
echo

# 2. Script defaults match the ladder
echo "2. prepare-lesson-video.sh defaults"
PREPARE_SCRIPT="$ROOT_DIR/infra/scripts/video/prepare-lesson-video.sh"
if [ -f "$PREPARE_SCRIPT" ]; then
  DEFAULT_BITRATE=$(grep 'LESSON_VIDEO_BITRATE' "$PREPARE_SCRIPT" | grep -o '[0-9]*k' | head -1)
  DEFAULT_HEIGHT=$(grep 'LESSON_VIDEO_HEIGHT' "$PREPARE_SCRIPT" | grep -o '[0-9]*' | head -1)

  if [ "$DEFAULT_BITRATE" = "1500k" ]; then
    echo "  ✅ Default video bitrate: $DEFAULT_BITRATE (matches ladder)"
    PASS=$((PASS + 1))
  else
    echo "  ❌ Default video bitrate: $DEFAULT_BITRATE (expected 1500k)"
    FAIL=$((FAIL + 1))
  fi

  if [ "$DEFAULT_HEIGHT" = "1920" ]; then
    echo "  ✅ Default target height: $DEFAULT_HEIGHT (matches ladder)"
    PASS=$((PASS + 1))
  else
    echo "  ❌ Default target height: $DEFAULT_HEIGHT (expected 1920)"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ⚠ prepare-lesson-video.sh not found"
fi
echo

# 3. Documentation consistency
echo "3. Documentation consistency"
ENCODING_DOC="$ROOT_DIR/docs/research/video-encoding.md"
if [ -f "$ENCODING_DOC" ]; then
  for entry in "1080x1920:1.5 Mbps" "720x1280:800 kbps" "540x960:500 kbps" "360x640:280 kbps"; do
    res="${entry%%:*}"
    br="${entry##*:}"
    if grep -q "$br" "$ENCODING_DOC" 2>/dev/null; then
      echo "  ✅ ${res} @ ${br} kbps documented"
      PASS=$((PASS + 1))
    else
      echo "  ❌ ${res} @ ${br} kbps NOT found in docs"
      FAIL=$((FAIL + 1))
    fi
  done
else
  echo "  ⚠ docs/research/video-encoding.md not found"
fi
echo

# 4. Encode test (if sample video provided)
if [ $# -ge 1 ] && [ -f "$1" ]; then
  SAMPLE="$1"
  echo "4. Encode test against: $(basename "$SAMPLE")"
  echo "   (encoding at each rung — this may take a while)"
  echo

  for entry in "1080:1920:1500:1800" "720:1280:800:960" "540:960:500:600" "360:640:280:336"; do
    IFS=':' read -r w h br maxrate <<< "$entry"
    outfile="/tmp/validate-ladder-${w}x${h}.mp4"

    echo -n "  ${w}x${h} @ ${br} kbps → "

    ffmpeg -y -v error -stats -i "$SAMPLE" \
      -c:v libx264 -preset fast -profile:v main -pix_fmt yuv420p \
      -vf "scale=-2:'min(${h},ih)'" \
      -b:v "${br}k" -maxrate "${maxrate}k" -bufsize "$(( br * 2 ))k" \
      -g 60 -keyint_min 60 -sc_threshold 0 \
      -c:a aac -b:a "96k" -ac 2 \
      -movflags +faststart \
      "$outfile" 2>/dev/null

    if [ -f "$outfile" ]; then
      size=$(stat -f%z "$outfile" 2>/dev/null || stat -c%s "$outfile" 2>/dev/null)
      size_mb=$(( size / 1000000 ))
      echo "${size_mb} MB"
      rm -f "$outfile"
    else
      echo "FAILED"
      FAIL=$((FAIL + 1))
    fi
  done
  echo
else
  echo "4. Encode test: skipped (no sample video provided)"
  echo "   Usage: $0 <sample-video.mp4>"
  echo
fi

# Summary
echo "═══════════════════════════════════════════════════════════════"
echo " Results: ${PASS} passed, ${FAIL} failed"
echo "═══════════════════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
