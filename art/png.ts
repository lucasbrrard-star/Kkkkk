import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import type { Image } from './rt';

export function writePNG(file: string, img: Image, scale = 1, bg?: [number, number, number]) {
  const W = img.w * scale, H = img.h * scale;
  const png = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const si = (Math.floor(y / scale) * img.w + Math.floor(x / scale)) * 4;
    const di = (y * W + x) * 4;
    let r = img.data[si], g = img.data[si + 1], b = img.data[si + 2], a = img.data[si + 3];
    if (bg) { const t = a / 255; r = r * t + bg[0] * (1 - t); g = g * t + bg[1] * (1 - t); b = b * t + bg[2] * (1 - t); a = 255; }
    png.data[di] = r; png.data[di + 1] = g; png.data[di + 2] = b; png.data[di + 3] = a;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png, { colorType: 6 }));
}
