#!/usr/bin/env bash
# Uso: tools/encode.sh <pasta_de_quadros> <audio_premaster.wav> <saida.mp4>
# Grão sutil, conversão BT.709, H.264 High + AAC 48 kHz, áudio masterizado em -14 LUFS / -1 dBTP (2 passadas).
set -euo pipefail
FR="$1"; AU="$2"; OUT="$3"
M=$(ffmpeg -hide_banner -nostats -i "$AU" -af loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json -f null - 2>&1 | sed -n '/{/,/}/p')
get() { echo "$M" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
LN="loudnorm=I=-14:TP=-1.0:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true,alimiter=limit=0.84:attack=2:release=60:level=disabled,aresample=48000"
ffmpeg -y -hide_banner -loglevel error -framerate 30 -i "$FR/element-${PAD:-%03d}.png" -i "$AU" \
  -filter_complex "[0:v]noise=c0s=4:c0f=t+u,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v];[1:a]${LN}[a]" \
  -map "[v]" -map "[a]" \
  -c:v libx264 -profile:v high -level 4.2 -preset slow -crf 17 -pix_fmt yuv420p \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart -shortest "$OUT"
echo "ok -> $OUT"
