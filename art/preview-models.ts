import { loadGLB, transformMesh, BVH } from './mesh';
import { renderHD } from './hd';
import { writePNG } from './png';
import { trim, newImage } from './rt';
const specs: [string, any][] = JSON.parse(process.argv[3]);
const out = process.argv[2];
const imgs = [];
for (const [k, tf] of specs) {
  const t0 = Date.now();
  const raw = await loadGLB(`tools/models/${k}.glb`);
  const mesh = transformMesh(raw, tf);
  const r = renderHD([], [{ mesh, bvh: new BVH(mesh), group: 1 }], { scale: 2, ss: 2, shadow: true, colors: 40 });
  console.log(k, 'tris', raw.pos.length / 9, 'ms', Date.now() - t0, 'mats', raw.mats.map((m) => m.name + (m.alphaMode !== 'OPAQUE' ? '(' + m.alphaMode + ')' : '')).slice(0, 12).join(', '));
  const W = r.img.w, H = r.img.h, comp = newImage(W, H);
  for (let i = 0; i < W * H; i++) {
    let c = [205, 196, 170];
    const sa = r.shadow!.data[i * 4 + 3] / 255; c = c.map((v, q) => v * (1 - sa) + r.shadow!.data[i * 4 + q] * sa);
    const a = r.img.data[i * 4 + 3] / 255; c = c.map((v, q) => v * (1 - a) + r.img.data[i * 4 + q] * a);
    comp.data.set([c[0], c[1], c[2], 255], i * 4);
  }
  imgs.push(comp);
}
const Wt = imgs.reduce((s, i) => s + i.w + 4, 0), Ht = Math.max(...imgs.map((i) => i.h));
const sheet = newImage(Wt, Ht); let x = 0;
for (const im of imgs) { for (let y = 0; y < im.h; y++) for (let xx = 0; xx < im.w; xx++) sheet.data.set(im.data.subarray((y * im.w + xx) * 4, (y * im.w + xx) * 4 + 4), ((Ht - im.h + y) * Wt + x + xx) * 4); x += im.w + 4; }
writePNG(out, sheet, 1);
void trim;
