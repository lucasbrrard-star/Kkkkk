// Downloads CC0 PBR textures from Poly Haven and packs them for the game:
//   <name>_color.webp  RGB = albedo, A = roughness
//   <name>_normal.webp RGB = OpenGL normal map
import sharp from 'sharp';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const SETS = [['asphalt_02', 'asphalt'], ['concrete_floor_02', 'concrete']];
const RAW = 'tools/raw/tex';
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync('public/textures', { recursive: true });
for (const [src, dst] of SETS) {
  for (const k of ['diff', 'nor_gl', 'rough']) {
    const file = `${RAW}/${src}_${k}_1k.jpg`;
    if (!fs.existsSync(file)) {
      execFileSync('curl', ['-s', '--fail', '--max-time', '120', '-o', file,
        `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${src}/${src}_${k}_1k.jpg`]);
    }
  }
  const S = 1024;
  const rough = await sharp(`${RAW}/${src}_rough_1k.jpg`).greyscale().resize(S, S).raw().toBuffer();
  const col = await sharp(`${RAW}/${src}_diff_1k.jpg`).resize(S, S).removeAlpha().raw().toBuffer();
  const rgba = Buffer.alloc(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    rgba[i * 4] = col[i * 3]; rgba[i * 4 + 1] = col[i * 3 + 1]; rgba[i * 4 + 2] = col[i * 3 + 2]; rgba[i * 4 + 3] = rough[i];
  }
  await sharp(rgba, { raw: { width: S, height: S, channels: 4 } }).webp({ quality: 72, alphaQuality: 70 }).toFile(`public/textures/${dst}_color.webp`);
  await sharp(`${RAW}/${src}_nor_gl_1k.jpg`).resize(S, S).webp({ quality: 80 }).toFile(`public/textures/${dst}_normal.webp`);
  console.log('packed', dst);
}
