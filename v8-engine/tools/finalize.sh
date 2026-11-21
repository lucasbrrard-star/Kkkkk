#!/usr/bin/env bash
# Composite (Remotion) -> final export (FFmpeg) -> QA report.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/out"
mkdir -p "$OUT"
BROWSER=${BROWSER:-/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell}

n=$(ls "$ROOT/render/frames"/f*.png | wc -l)
[ "$n" -eq 900 ] || { echo "faltam quadros: $n/900"; exit 1; }
find "$ROOT/render/frames" -name 'f*.png' -size -2k | grep . && { echo 'quadros vazios/placeholder'; exit 1; } || true

cp "$ROOT/cache/audio/mix.wav" "$ROOT/remotion/public/mix.wav"
cd "$ROOT/remotion"
npx remotion render src/index.ts V8Preview "$OUT/V8_raw.mp4" \
  --browser-executable="$BROWSER" --concurrency=4 --codec=h264 --crf=14 \
  --pixel-format=yuv420p --audio-codec=aac --audio-bitrate=320k --color-space=bt709 --log=error

ffmpeg -y -v error -i "$OUT/V8_raw.mp4" -t 30 \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -r 30 \
  -af "loudnorm=I=-14:TP=-1:LRA=11,aresample=48000" -c:a aac -b:a 192k -ar 48000 \
  -movflags +faststart "$OUT/V8_ENGINE_PREVIEW_30S.mp4"

F="$OUT/V8_ENGINE_PREVIEW_30S.mp4"
echo '== ffprobe'
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,pix_fmt,color_primaries,sample_rate,channels -show_entries format=duration,bit_rate,size -of compact "$F"
echo '== decode errors'
ffmpeg -v error -i "$F" -f null - 2>&1 | head -5
echo '== frame count'
ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$F"
echo '== loudness'
ffmpeg -hide_banner -nostats -i "$F" -af loudnorm=print_format=summary -f null - 2>&1 | grep -E 'Input Integrated|Input True Peak|Input LRA'
ffmpeg -hide_banner -nostats -i "$F" -af volumedetect -f null - 2>&1 | grep max_volume
echo '== black frames'
ffmpeg -hide_banner -nostats -i "$F" -vf blackdetect=d=0.1:pix_th=0.05 -an -f null - 2>&1 | grep black_start || echo 'nenhum'
echo '== freezes'
ffmpeg -hide_banner -nostats -i "$F" -vf freezedetect=n=0.003:d=1 -an -f null - 2>&1 | grep freeze_start || echo 'nenhum'
ffmpeg -v error -y -i "$F" -vf "fps=1,scale=270:-1,tile=6x5" -frames:v 1 "$OUT/contact_sheet.png"
ffmpeg -v error -y -ss 00:00:27.5 -i "$F" -frames:v 1 "$OUT/thumb.jpg"
echo DONE
