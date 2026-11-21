#!/bin/bash
# montagem final: amplia quadros -> Remotion (motion graphics + áudio) -> FFmpeg (faststart) -> verificação
set -e
cd "$(dirname "$0")/.."
n=$(ls build/frames/f_*.png | wc -l)
[ "$n" -eq 900 ] || { echo "faltam quadros: $n/900"; exit 1; }
scripts/upscale.sh
cd remotion
npx remotion render src/index.ts V8Preview ../build/remotion_out.mp4 \
  --browser-executable=/opt/pw-browsers/chromium_headless_shell --codec=h264 --crf=17 \
  --audio-codec=aac --audio-bitrate=192k --pixel-format=yuv420p --concurrency=4 --log=error
cd ..
# H.264 High, yuv420p, BT.709, AAC 48 kHz, moov no início
ffmpeg -loglevel error -y -i build/remotion_out.mp4 -map 0:v:0 -map 0:a:0 -c:v libx264 -profile:v high -preset medium -crf 18 \
  -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -r 30 -frames:v 900 \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart -t 30 V8_ENGINE_PREVIEW_30S.mp4
ffprobe -v error -show_entries format=duration,size,bit_rate:stream=codec_name,profile,width,height,r_frame_rate,nb_frames,pix_fmt,sample_rate,channels -of default=nw=1 V8_ENGINE_PREVIEW_30S.mp4
