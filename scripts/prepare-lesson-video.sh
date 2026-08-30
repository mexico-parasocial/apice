#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Normalise a lesson video before it is published to the Streamplace node.
#
# WHY THIS EXISTS
#
# The node transcodes on ingest, but exposes no ladder configuration — it works
# from whatever we hand it, and a transcoder's top rung is capped by its source.
# Hand it a 3.2 Mbps phone capture and every viewer who reaches the top rung
# pays for it. Normalising here is the one lever we actually control.
#
# WHY THESE NUMBERS
#
# Measured against server/fixtures/videos/TESTCLIP.MP4 (1080x1920, 30fps, high motion):
#
#   1080x1920 @ 1.5 Mbps  VMAF 87.7   281 MB per 25-min program
#    720x1280 @ 800 kbps  VMAF 82.0   150 MB
#    540x960  @ 500 kbps  VMAF 74.3    94 MB
#    360x640  @ 280 kbps  VMAF 57.2    52 MB
#   unnormalised source                606 MB
#
# That clip is a moving robot — far more motion and detail than a person
# speaking to camera. Real lesson footage should score meaningfully higher at
# the same bitrate, so treat these as a floor, not a forecast.
#
# CONTEXT THAT DROVE THE CHOICE
#
# The audience is on Mexican prepaid data. 606 MB for one program is a package
# gone; it prices out exactly the people this platform exists to reach. 1.5 Mbps
# is the point where the curve flattens for this content: going higher buys
# little visible quality and doubles the bill.
#
# IMPORTANT: keep text OUT of the video. Legal citations, article numbers and
# slide text stop being legible around the 540 rung, which forces every viewer
# onto an expensive rung just to read. Put that text in the lesson description
# or the transcript, where it costs nothing, is selectable, and is reachable by
# a screen reader.
#
# Usage:
#   ./scripts/prepare-lesson-video.sh entrada.mp4 [salida.mp4]
# ==============================================================================

TARGET_BITRATE="${LESSON_VIDEO_BITRATE:-1500k}"
TARGET_MAXRATE="${LESSON_VIDEO_MAXRATE:-1800k}"
TARGET_BUFSIZE="${LESSON_VIDEO_BUFSIZE:-3000k}"
TARGET_HEIGHT="${LESSON_VIDEO_HEIGHT:-1920}"
AUDIO_BITRATE="${LESSON_AUDIO_BITRATE:-96k}"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <input> [output]" >&2
  exit 1
fi

INPUT="$1"
OUTPUT="${2:-${INPUT%.*}.prepared.mp4}"

if [ ! -f "$INPUT" ]; then
  echo "✖ No such file: $INPUT" >&2
  exit 1
fi

command -v ffmpeg >/dev/null 2>&1 || { echo "✖ ffmpeg is required." >&2; exit 1; }
command -v ffprobe >/dev/null 2>&1 || { echo "✖ ffprobe is required." >&2; exit 1; }

probe() {
  ffprobe -v error -select_streams "$1" -show_entries "$2" \
    -of default=noprint_wrappers=1:nokey=1 "$INPUT" 2>/dev/null | head -1
}

IN_W=$(probe v:0 stream=width)
IN_H=$(probe v:0 stream=height)
IN_BR=$(probe v:0 stream=bit_rate)
IN_SIZE=$(wc -c < "$INPUT" | tr -d ' ')
HAS_AUDIO=$(ffprobe -v error -select_streams a -show_entries stream=index \
  -of csv=p=0 "$INPUT" 2>/dev/null | head -1)

echo "→ Source: ${IN_W}x${IN_H}, $(( ${IN_BR:-0} / 1000 )) kbps, $(( IN_SIZE / 1000000 )) MB"

if [ -z "$HAS_AUDIO" ]; then
  # For a lesson this is almost always a mistake, not a style choice: the
  # spoken track is the teaching. Warn rather than fail — a silent explainer
  # is legitimate, just rare.
  echo "⚠ No audio stream. For a lesson, speech is usually the content — is this right?"
fi

# Never upscale: a 480p original re-encoded to 1080 costs bitrate and adds no
# detail. Scale down to the target height only when the source exceeds it, and
# keep the aspect ratio; -2 rounds width to an even number for yuv420p.
SCALE="scale=-2:'min(${TARGET_HEIGHT},ih)'"

AUDIO_ARGS=(-an)
if [ -n "$HAS_AUDIO" ]; then
  AUDIO_ARGS=(-c:a aac -b:a "$AUDIO_BITRATE" -ac 2)
fi

echo "→ Encoding at ${TARGET_BITRATE} (max ${TARGET_MAXRATE})…"

ffmpeg -y -v error -stats -i "$INPUT" \
  -c:v libx264 -preset slow -profile:v main -level 4.0 -pix_fmt yuv420p \
  -vf "$SCALE" \
  -b:v "$TARGET_BITRATE" -maxrate "$TARGET_MAXRATE" -bufsize "$TARGET_BUFSIZE" \
  -g 60 -keyint_min 60 -sc_threshold 0 \
  "${AUDIO_ARGS[@]}" \
  -movflags +faststart \
  "$OUTPUT"

OUT_SIZE=$(wc -c < "$OUTPUT" | tr -d ' ')
echo
echo "✅ $OUTPUT"
echo "   $(( IN_SIZE / 1000000 )) MB → $(( OUT_SIZE / 1000000 )) MB"
if [ "$IN_SIZE" -gt 0 ] && [ "$OUT_SIZE" -lt "$IN_SIZE" ]; then
  echo "   $(( 100 - (OUT_SIZE * 100 / IN_SIZE) ))% less data for every learner who watches it."
fi
echo
echo "Next: publish this file to the Streamplace node, then attach its AT URI:"
echo "  cd server && pnpm exec ts-node-dev --transpile-only --no-notify --exit-child \\"
echo "    scripts/attach-lesson-video.ts \"at://…/place.stream.video/…\" --first-only"
