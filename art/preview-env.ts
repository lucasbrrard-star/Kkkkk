import * as E from './env';
import * as P from './props';
import { writePNG } from './png';
import { newImage, Image } from './rt';
const out = process.argv[2];
const which = process.argv[3] ?? 'a';
const list: [string, () => Promise<E.Sprite> | E.Sprite][] = which === 'a' ? [
  ['casa1', E.houseCasa1], ['casa2', E.houseCasa2], ['casa3', E.houseCasa3], ['cafe', E.cafe],
] : which === 'b' ? [
  ['palm', () => P.palm(1, 0, 4, 7)], ['ipe', () => P.bloomTree('ipe-rosa', 1, 5.5)], ['jac', () => P.bloomTree('jacaranda', 2, 5)], ['ama', () => P.bloomTree('ipe-amarelo', 3, 5)],
  ['boug', () => E.bougainvillea(3)], ['flw', () => P.flowerClump(1, 'rosa')], ['lamp', P.streetLamp], ['bench', () => P.bench(0)], ['fount', () => P.fountain(0)],
  ['table', E.cafeTable], ['bed', () => E.flowerBed(3, 'x', 2)], ['hedge', () => E.hedgeBlock(3, 'x', 4, '#f07fa8')],
] : [
  ['ferris', () => E.ferrisWheel(0, 8)], ['light', P.lighthouse], ['boat', () => P.sailboat(30)], ['stop', () => P.busStop(90)], ['umb', () => P.umbrella(0, 0)], ['loung', () => P.lounger(0, [80, 170, 220])],
  ['pool', () => E.pool(5, 3.5, 0)], ['pier', () => E.pier(10, 2.4)], ['island', () => E.distantIsland(3, 16, 10, 6, true)], ['bus1', () => E.bus(1)], ['bus3', () => E.bus(3)],
];
const imgs: Image[] = [];
for (const [k, f] of list) {
  const t = Date.now();
  const s = await f();
  console.log(k, Date.now() - t, 'ms', s.img.w, 'x', s.img.h);
  // compõe sobre fundo com sombra
  const sh = s.shadow;
  const W = Math.max(s.img.w, sh ? sh.w + (s.img.ox - sh.ox) : 0) + 20, H = s.img.h + 20;
  const c = newImage(W, H);
  for (let i = 0; i < W * H; i++) c.data.set([196, 178, 140, 255], i * 4);
  const put = (im: Image, dx: number, dy: number) => { for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const si = (y * im.w + x) * 4, a = im.data[si + 3] / 255; if (!a) continue; const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const di = (Y * W + X) * 4; for (let q = 0; q < 3; q++) c.data[di + q] = c.data[di + q] * (1 - a) + im.data[si + q] * a; } };
  if (sh) put(sh, 10 + s.img.ox - sh.ox, 10 + s.img.oy - sh.oy);
  put(s.img, 10, 10);
  imgs.push(c);
}
const Wt = imgs.reduce((s, i) => s + i.w, 0), Ht = Math.max(...imgs.map((i) => i.h));
const sheet = newImage(Wt, Ht); let x = 0;
for (const im of imgs) { for (let y = 0; y < im.h; y++) for (let xx = 0; xx < im.w; xx++) sheet.data.set(im.data.subarray((y * im.w + xx) * 4, (y * im.w + xx) * 4 + 4), ((Ht - im.h + y) * Wt + x + xx) * 4); x += im.w; }
writePNG(out, sheet, 1);
