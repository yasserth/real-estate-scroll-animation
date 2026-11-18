#!/bin/bash
# Prepare YOUR pre-rendered film for scroll scrubbing (re-encode only — no generation).
# Encoding settings follow the scroll-world skill (SKILL.md Step 6 / pipeline.md §5–6):
#   desktop: native res (capped at 1920 wide), crf 20, GOP 8, light sharpen, no audio, faststart
#   mobile : 720p tall, crf 23, GOP 4 (cheaper seeks on phone decoders), same filters
# Usage: tools/prepare-video.sh <input.mp4> [out_dir]
set -euo pipefail
IN="${1:?usage: $0 <input.mp4> [out_dir]}"
OUT="${2:-out}"
mkdir -p "$OUT"

echo "== source"; ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,width,height,r_frame_rate,duration -of default=nw=1 "$IN"

ffmpeg -v error -stats -y -i "$IN" -an \
  -vf "scale='min(1920,iw)':-2:flags=lanczos,unsharp=5:5:0.8:5:5:0.0" \
  -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -profile:v high \
  -g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart "$OUT/film-desktop.mp4"

ffmpeg -v error -stats -y -i "$IN" -an \
  -vf "scale=-2:720:flags=lanczos,unsharp=5:5:0.6:5:5:0.0" \
  -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -profile:v high \
  -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart "$OUT/film-mobile.mp4"

# Posters = the film's own first frame, so there is no flash when the video takes over.
ffmpeg -v error -y -i "$OUT/film-desktop.mp4" -frames:v 1 -q:v 3 "$OUT/poster.jpg"
ffmpeg -v error -y -i "$OUT/film-mobile.mp4"  -frames:v 1 -q:v 4 "$OUT/poster-mobile.jpg"

echo "== output"; ls -lh "$OUT"
echo "Upload film-desktop.mp4 + film-mobile.mp4 to your host, copy the posters to site/assets/media/,"
echo "then set the URLs in site/assets/js/film.config.js."
