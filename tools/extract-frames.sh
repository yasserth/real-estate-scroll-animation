#!/bin/bash
# Extract the scroll image sequence from the ORIGINAL film. No generation, no
# retouching: real frames, resized only, colour-accurate.
#   - 24 fps (734 frames for the 30.6 s film): continuous motion while scrubbing
#   - 1920×1440: the film's native 4:3 aspect, nothing cropped out of the files
#   - BT.709 → BT.601 matrix conversion, because WebP decoders assume BT.601;
#     without it the frames come out with a slight hue/brightness shift
#   - WebP quality 78, method 6 (~90 KB/frame, ≈40 dB PSNR vs the source)
# Usage: tools/extract-frames.sh <film.mp4> [out_dir=site/assets/frames]
set -euo pipefail
IN="${1:?usage: $0 <film.mp4> [out_dir]}"
OUT="${2:-site/assets/frames}"
FPS="${FPS:-24}"; W="${W:-1920}"; H="${H:-1440}"; Q="${Q:-78}"
mkdir -p "$OUT"; rm -f "$OUT"/f_*.webp
ffmpeg -v error -stats -y -i "$IN" -an \
  -vf "fps=$FPS,scale=$W:$H:flags=lanczos+accurate_rnd+full_chroma_int:in_color_matrix=bt709:out_color_matrix=bt601:in_range=tv:out_range=tv,format=yuv420p" \
  -c:v libwebp -quality "$Q" -compression_level 6 -preset photo -start_number 0 "$OUT/f_%04d.webp"
echo "$(ls "$OUT"/f_*.webp | wc -l) frames, $(du -sh "$OUT" | cut -f1) → set sequence.count in site/assets/js/film.config.js"
