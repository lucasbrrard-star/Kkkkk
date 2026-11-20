import { loadGLB, transformMesh, BVH } from './mesh';
import { renderHD } from './hd';
import { writePNG } from './png';
const [file, out, h = '6', rot = '0'] = process.argv.slice(2);
const t0 = Date.now();
const raw = await loadGLB(file);
console.log('tris', raw.pos.length / 9, 'mats', raw.mats.map((m) => `${m.name}:${m.alphaMode}:${m.tex ? m.tex.w : '-'}`).join(' | '), 'bounds', raw.min, raw.max);
const mesh = transformMesh(raw, { fitHeight: +h, rotY: +rot });
const bvh = new BVH(mesh);
console.log('load+bvh ms', Date.now() - t0);
const r = renderHD([], [{ mesh, bvh, group: 1 }], { scale: 2, ss: 3, shadow: true, colors: 40 });
console.log('render ms', Date.now() - t0, r.img.w, r.img.h);
// composição sobre areia com sombra
const W = r.img.w, H = r.img.h;
const comp = { w: W, h: H, ox: 0, oy: 0, data: new Uint8ClampedArray(W * H * 4) };
for (let i = 0; i < W * H; i++) {
  let c = [222, 196, 150];
  const sa = r.shadow!.data[i * 4 + 3] / 255;
  c = c.map((v, k) => v * (1 - sa) + r.shadow!.data[i * 4 + k] * sa);
  const a = r.img.data[i * 4 + 3] / 255;
  c = c.map((v, k) => v * (1 - a) + r.img.data[i * 4 + k] * a);
  comp.data.set([c[0], c[1], c[2], 255], i * 4);
}
writePNG(out, comp, 2);
