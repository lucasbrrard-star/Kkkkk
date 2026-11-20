// Gera todos os assets de pixel art HD do jogo em public/assets:
//  - tiles.png  (tileset isométrico 64×32) + índice em meta.json
//  - objects.json + objects{N}.png (multiatlas com âncoras "anchor")
//  - player.png / npc*.png (spritesheets 8 direções)
// Pré-requisito: ./tools/fetch-models.sh (modelos gratuitos do BlenderKit).
// Execute: npm run art

import fs from 'node:fs';
import path from 'node:path';
import { writePNG } from './png';
import { Image, newImage } from './rt';
import * as T from './tiles';
import * as O from './objects';
import * as E from './env';
import * as P from './props';
import { renderSheet, PLAYER_LOOK, NPC_LOOK, NPC_LOOKS, FRAME_W, FRAME_H, ANCHOR_X, ANCHOR_Y, DIRS } from './character';

const OUT = path.resolve('public/assets');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^(objects\d*\.(png|json)|npc.*\.png)$/.test(f)) fs.rmSync(path.join(OUT, f));
const t0 = Date.now();
const only = process.argv[2]; // opcional: 'tiles' | 'objects' | 'chars'
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

// ---------------------------------------------------------------- tileset
if (!only || only === 'tiles') {
  const tiles: { name: string; img: Image }[] = [];
  const addT = (name: string, img: Image) => tiles.push({ name, img });
  for (let v = 0; v < 4; v++) for (let m = 0; m < 16; m++) addT(`grass_${v}_${m}`, T.grassTile(v, m));
  for (let v = 0; v < 3; v++) addT(`grassf_${v}`, T.grassTile(v + 4, 0, true));
  for (let v = 0; v < 2; v++) addT(`lot_${v}`, T.lotTile(v));
  for (let v = 0; v < 3; v++) for (let m = 0; m < 16; m++) addT(`sand_${v}_${m}`, T.sandTile(v, m));
  addT('sanddeco_1', T.sandTile(0, 0, 1));
  addT('sanddeco_2', T.sandTile(1, 0, 2));
  const WF = 4;
  for (let d = 0; d < 3; d++) for (let f = 0; f < WF; f++) addT(`water_${d}_${f}`, T.waterTile(d as 0 | 1 | 2, f, WF));
  for (let m = 1; m < 16; m++) for (let f = 0; f < WF; f++) addT(`foam_${m}_${f}`, T.foamTile(m, f, WF));
  for (let v = 0; v < 4; v++) addT(`asphalt_${v}`, T.asphaltTile(v));
  for (const m of [1, 2, 4, 8]) addT(`asphalt_line_${m}`, T.asphaltTile(0, m));
  addT('center_x', T.asphaltTile(0, 0, null, 0, 'x'));
  addT('center_y', T.asphaltTile(2, 0, null, 0, 'y'));
  addT('cross_x', T.asphaltTile(1, 0, 'x'));
  addT('cross_y', T.asphaltTile(1, 0, 'y'));
  for (let v = 0; v < 2; v++) for (let m = 0; m < 16; m++) addT(`side_${v}_${m}`, T.sidewalkTile(v, m));
  for (let m = 0; m < 16; m++) addT(`board_${m}`, T.boardwalkTile(m));
  for (let v = 0; v < 2; v++) addT(`pave_${v}`, T.paverTile(v));
  const TCOLS = 16;
  const ts = newImage(TCOLS * T.TILE_W, Math.ceil(tiles.length / TCOLS) * T.TILE_H);
  const index: Record<string, number> = {};
  tiles.forEach((t, i) => { index[t.name] = i; blit(ts, t.img, (i % TCOLS) * T.TILE_W, Math.floor(i / TCOLS) * T.TILE_H); });
  writePNG(path.join(OUT, 'tiles.png'), ts);
  writeMeta({ tile: { w: T.TILE_W, h: T.TILE_H, cols: TCOLS, count: tiles.length, index, waterFrames: WF } });
  log(`tiles: ${tiles.length}`);
}

// ---------------------------------------------------------------- objetos
if (!only || only === 'objects') {
  interface Entry { name: string; img: Image }
  const entries: Entry[] = [];
  const add = (name: string, s: E.Sprite) => {
    entries.push({ name, img: s.img });
    if (s.shadow && s.shadow.w > 1) entries.push({ name: name + '__sh', img: s.shadow });
  };
  const addAnim = (name: string, frames: E.Sprite[]) => {
    uniform(frames.map((f) => f.img)).forEach((img, i) => entries.push({ name: `${name}_${i}`, img }));
    if (frames[0].shadow) uniform(frames.map((f) => f.shadow!)).forEach((img, i) => entries.push({ name: `${name}__sh_${i}`, img }));
  };
  const seq = async <X>(n: number, f: (i: number) => Promise<X> | X): Promise<X[]> => { const out: X[] = []; for (let i = 0; i < n; i++) out.push(await f(i)); return out; };

  // casas e construções
  add('casa1', E.houseCasa1()); add('casa2', E.houseCasa2()); add('casa3', E.houseCasa3()); add('cafe', E.cafe());
  log('casas');
  addAnim('pool', await seq(3, (f) => E.pool(4.6, 3.2, f)));
  addAnim('ferris', await seq(8, (f) => E.ferrisWheel(f, 8)));
  log('roda-gigante');
  add('pier', E.pier(12, 2.6));
  add('island_a', E.distantIsland(3, 20, 13, 4.5, true));
  add('island_b', E.distantIsland(8, 13, 9, 3.6, false));
  add('lighthouse', await P.lighthouse());
  add('boat_a', await P.sailboat(20)); add('boat_b', await P.sailboat(200));
  for (let d = 0; d < 8; d++) add(`bus_${d}`, E.bus(d));
  log('marcos, ônibus');
  // vegetação (BlenderKit + procedural)
  for (let v = 0; v < 3; v++) addAnim(`palm${v}`, await seq(4, (f) => P.palm(v + 1, f, 4, 6.4 + v * 0.8)));
  add('ipe0', await P.bloomTree('ipe-rosa', 1, 5.6)); add('ipe1', await P.bloomTree('ipe-rosa', 4, 4.8));
  add('jac0', await P.bloomTree('jacaranda', 2, 5.2)); add('ama0', await P.bloomTree('ipe-amarelo', 3, 5.0));
  log('árvores');
  add('boug0', E.bougainvillea(3, 1, '#d6338a')); add('boug1', E.bougainvillea(5, 0.9, '#f0653f')); add('boug2', E.bougainvillea(7, 1.1, '#c23ab5'));
  add('flw_rosa', await P.flowerClump(1, 'rosa')); add('flw_lilas', await P.flowerClump(2, 'lilas')); add('flw_amarela', await P.flowerClump(3, 'amarela'));
  add('bed_x', E.flowerBed(3, 'x', 2)); add('bed_z', E.flowerBed(3, 'z', 5));
  add('hedge_x', E.hedgeBlock(3, 'x', 4, '#f07fa8')); add('hedge_z', E.hedgeBlock(3, 'z', 6, '#f3d14e'));
  // mobiliário urbano
  add('lamp', await P.streetLamp());
  add('bench_x', await P.bench(0)); add('bench_z', await P.bench(90));
  addAnim('fountain', await seq(3, (f) => P.fountain(f)));
  add('busstop', await P.busStop(90));
  add('umb0', await P.umbrella(0, 0)); add('umb1', await P.umbrella(40, 150)); add('umb2', await P.umbrella(80, 210));
  add('lounger0', await P.lounger(0, [72, 168, 222])); add('lounger1', await P.lounger(0, [236, 104, 92])); add('lounger2', await P.lounger(90, [242, 196, 70]));
  add('cafetable', E.cafeTable());
  log('mobiliário');
  add('trash', O.trashBin()); add('streetsign', O.streetSign()); add('lotsign', O.lotSign()); add('stake', O.stake());
  add('fence_x', O.fenceSeg(2, 'x')); add('fence_z', O.fenceSeg(2, 'z'));
  add('wall_x', O.lowWall(2, 'x', '#e9d9b0')); add('wall_z', O.lowWall(2, 'z', '#e9d9b0'));
  add('mailbox', O.mailbox()); add('pot0', O.flowerPot('#e8506e', 3)); add('pot1', O.flowerPot('#f6d04d', 4));
  add('rock0', O.rock(1, 1)); add('rock1', O.rock(4, 0.7)); add('rock2', O.rock(7, 1.4));
  add('cart', O.kioskCart()); add('towel0', O.towel('#e85d75')); add('towel1', O.towel('#3aa3c9'));
  for (let f = 0; f < 4; f++) entries.push({ name: `gull_${f}`, img: E.gull(f).img });
  for (let f = 0; f < 3; f++) entries.push({ name: `marker_${f}`, img: E.marker(f) });
  entries.push({ name: 'glow', img: O.glow(44, '#ffcf7a') });
  entries.push({ name: 'shadow_blob', img: O.blobShadow(30, 13) });
  log(`objetos: ${entries.length}`);

  // multiatlas (páginas de até 4096×4096)
  const pages = packPages(entries.map((e) => e.img), 4096);
  const textures = pages.map((pg, pi) => {
    const img = newImage(pg.w, pg.h);
    const frames = pg.items.map(({ i, x, y }) => {
      const e = entries[i];
      blit(img, e.img, x, y);
      return {
        filename: e.name, frame: { x, y, w: e.img.w, h: e.img.h }, rotated: false, trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: e.img.w, h: e.img.h }, sourceSize: { w: e.img.w, h: e.img.h },
        anchor: { x: e.img.ox / e.img.w, y: e.img.oy / e.img.h },
      };
    });
    writePNG(path.join(OUT, `objects${pi}.png`), img);
    return { image: `objects${pi}.png`, format: 'RGBA8888', size: { w: pg.w, h: pg.h }, scale: 1, frames };
  });
  fs.writeFileSync(path.join(OUT, 'objects.json'), JSON.stringify({ textures, meta: { app: 'cidade-viva art/build.ts' } }));
  log(`atlas: ${pages.map((p) => `${p.w}×${p.h}`).join(', ')}`);
}

// ---------------------------------------------------------------- personagens
if (!only || only === 'chars') {
  const pl = renderSheet(PLAYER_LOOK, ['idle', 'walk', 'run', 'jump']);
  writePNG(path.join(OUT, 'player.png'), pl.img);
  const npcs = [NPC_LOOK, ...NPC_LOOKS];
  let npcLayout = null;
  for (let i = 0; i < npcs.length; i++) {
    const s = renderSheet(npcs[i], ['idle', 'walk']);
    writePNG(path.join(OUT, `npc${i}.png`), s.img);
    npcLayout = { cols: s.cols, layout: s.layout };
  }
  writeMeta({ character: { frameW: FRAME_W, frameH: FRAME_H, anchorX: ANCHOR_X, anchorY: ANCHOR_Y, dirs: DIRS, player: { cols: pl.cols, layout: pl.layout }, npc: npcLayout, npcCount: npcs.length, npcNames: npcs.map((n) => n.name ?? 'pescador') } });
  log('personagens');
}
log('pronto');

// ---------------------------------------------------------------- utilitários
function writeMeta(part: Record<string, unknown>) {
  const f = path.join(OUT, 'meta.json');
  const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  fs.writeFileSync(f, JSON.stringify({ ...cur, ...part }));
}
function blit(dst: Image, src: Image, x0: number, y0: number) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const si = (y * src.w + x) * 4, di = ((y0 + y) * dst.w + x0 + x) * 4;
    dst.data[di] = src.data[si]; dst.data[di + 1] = src.data[si + 1]; dst.data[di + 2] = src.data[si + 2]; dst.data[di + 3] = src.data[si + 3];
  }
}
function uniform(imgs: Image[]): Image[] {
  let l = 0, t = 0, r = 0, b = 0;
  for (const im of imgs) { l = Math.max(l, im.ox); t = Math.max(t, im.oy); r = Math.max(r, im.w - im.ox); b = Math.max(b, im.h - im.oy); }
  return imgs.map((im) => { const out = newImage(l + r, t + b, l, t); blit(out, im, l - im.ox, t - im.oy); return out; });
}
function packPages(imgs: Image[], max: number) {
  const order = imgs.map((_, i) => i).sort((a, b) => imgs[b].h - imgs[a].h);
  const pages: { w: number; h: number; items: { i: number; x: number; y: number }[] }[] = [];
  let pg = { w: 0, h: 0, items: [] as { i: number; x: number; y: number }[] }, x = 0, y = 0, rowH = 0;
  for (const i of order) {
    const im = imgs[i];
    if (x + im.w + 2 > max) { x = 0; y += rowH + 2; rowH = 0; }
    if (y + im.h > max) { pages.push(pg); pg = { w: 0, h: 0, items: [] }; x = 0; y = 0; rowH = 0; }
    pg.items.push({ i, x, y });
    x += im.w + 2; rowH = Math.max(rowH, im.h); pg.w = Math.max(pg.w, x); pg.h = Math.max(pg.h, y + rowH);
  }
  pages.push(pg);
  return pages;
}
