#!/bin/bash
# amplia os quadros renderizados (432x768) para 1080x1920 (lanczos + nitidez leve) para a composição
cd "$(dirname "$0")/.."
for f in build/frames/f_*.png; do
  n=$(basename "$f" .png); n=${n#f_}
  out=remotion/public/frames/u_$n.jpg
  if [ ! -f "$out" ] || [ "$f" -nt "$out" ]; then
    ffmpeg -loglevel error -y -i "$f" -vf "scale=1080:1920:flags=lanczos,unsharp=5:5:0.55:5:5:0" -q:v 2 "$out"
  fi
done
