// Gera todos os assets de pixel art do jogo em public/assets:
//  - tiles.png (tileset isométrico) + índice em meta.json
//  - objects.png/objects.json (atlas JSON-hash com âncoras "anchor")
//  - player.png / npc.png (spritesheets 8 direções)
// Execute: npm run art

import fs from 'node:fs';
import path from 'node:path';
import { writePNG } from './png';
import { Image, newImage } from './rt';
import * as T from './tiles';
import * as O from './objects';
import { renderSheet, PLAYER_LOOK, NPC_LOOK, FRAME_W, FRAME_H, ANCHOR_X, ANCHOR_Y, DIRS } from './character';

const OUT = path.resolve('public/assets');
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();

// ---------------------------------------------------------------- tileset
const tiles: { name: string; img: Image }[] = [];
const addT = (name: string, img: Image) => tiles.push({ name, img });
for (let v = 0; v < 4; v++) for (let m = 0; m < 16; m++) addT(`grass_${v}_${m}`, T.grassTile(v, m));
for (let v = 0; v < 2; v++) addT(`grassf_${v}`, T.grassTile(v + 4, 0, true));
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
const trows = Math.ceil(tiles.length / TCOLS);
const tsImg = newImage(TCOLS * T.TILE_W, trows * T.TILE_H);
const tileIndex: Record<string, number> = {};
tiles.forEach((t, i) => {
  tileIndex[t.name] = i;
  blit(tsImg, t.img, (i % TCOLS) * T.TILE_W, Math.floor(i / TCOLS) * T.TILE_H);
});
writePNG(path.join(OUT, 'tiles.png'), tsImg);

// ---------------------------------------------------------------- objetos (atlas)
interface Entry { name: string; img: Image }
const entries: Entry[] = [];
const add = (name: string, s: O.Sprite) => {
  entries.push({ name, img: s.img });
  if (s.shadow && s.shadow.w > 1) entries.push({ name: name + '__sh', img: s.shadow });
};
/** frames animados: recorte uniforme para manter a mesma âncora */
const addAnim = (name: string, frames: O.Sprite[]) => {
  const u = uniform(frames.map((f) => f.img));
  u.forEach((img, i) => entries.push({ name: `${name}_${i}`, img }));
  if (frames[0].shadow) {
    const us = uniform(frames.map((f) => f.shadow!));
    us.forEach((img, i) => entries.push({ name: `${name}__sh_${i}`, img }));
  }
};

add('house_popular', O.housePopular());
add('house_modern', O.houseModern());
add('house_beach', O.houseBeach());
for (let s = 0; s < 3; s++) addAnim(`palm${s}`, [0, 1, 2, 3].map((f) => O.palm(f, 4, s + 1, 3.1 + s * 0.35)));
for (let s = 0; s < 2; s++) addAnim(`ipe${s}`, [0, 1].map((f) => O.tree('ipe', f, s + 3)));
for (let s = 0; s < 2; s++) addAnim(`tree${s}`, [0, 1].map((f) => O.tree('green', f, s + 7)));
add('bush0', O.bush(1));
add('bush1', O.bush(2, '#f07fa8'));
add('bush2', O.bush(3, '#f3d14e'));
add('hedge_x', O.hedge(2, 'x', 4));
add('hedge_z', O.hedge(2, 'z', 5));
add('lamp', O.lamp(true));
add('bench_x', O.bench('x'));
add('bench_z', O.bench('z'));
add('trash', O.trashBin());
add('busstop', O.busStop());
add('streetsign', O.streetSign());
add('lotsign', O.lotSign());
add('stake', O.stake());
add('fence_x', O.fenceSeg(2, 'x'));
add('fence_z', O.fenceSeg(2, 'z'));
add('wall_x', O.lowWall(2, 'x', '#e9d9b0'));
add('wall_z', O.lowWall(2, 'z', '#e9d9b0'));
add('mailbox', O.mailbox());
add('pot0', O.flowerPot('#e8506e', 3));
add('pot1', O.flowerPot('#f6d04d', 4));
addAnim('umbrella0', [0, 1].map((f) => O.umbrella('#e4473c', f)));
addAnim('umbrella1', [0, 1].map((f) => O.umbrella('#2c8fd0', f)));
addAnim('umbrella2', [0, 1].map((f) => O.umbrella('#f2b632', f)));
add('chair0', O.beachChair('#2c8fd0'));
add('chair1', O.beachChair('#e4473c'));
add('towel0', O.towel('#e85d75'));
add('towel1', O.towel('#3aa3c9'));
add('rock0', O.rock(1, 1));
add('rock1', O.rock(4, 0.7));
add('rock2', O.rock(7, 1.4));
addAnim('fountain', [0, 1, 2].map((f) => O.fountain(f)));
add('cart', O.kioskCart());
for (let d = 0; d < 8; d++) add(`bus_${d}`, O.bus(d));
for (let f = 0; f < 4; f++) entries.push({ name: `gull_${f}`, img: O.seagull(f) });
for (let f = 0; f < 3; f++) entries.push({ name: `marker_${f}`, img: O.marker(f) });
entries.push({ name: 'glow', img: O.glow(22, '#ffd27a') });
entries.push({ name: 'shadow_blob', img: O.blobShadow(18, 8) });

const packed = pack(entries.map((e) => e.img), 2048);
const atlasImg = newImage(packed.w, packed.h);
const frames: Record<string, unknown> = {};
entries.forEach((e, i) => {
  const r = packed.rects[i];
  blit(atlasImg, e.img, r.x, r.y);
  frames[e.name] = {
    frame: { x: r.x, y: r.y, w: e.img.w, h: e.img.h },
    rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: e.img.w, h: e.img.h },
    sourceSize: { w: e.img.w, h: e.img.h },
    anchor: { x: e.img.ox / e.img.w, y: e.img.oy / e.img.h },
  };
});
writePNG(path.join(OUT, 'objects.png'), atlasImg);
fs.writeFileSync(path.join(OUT, 'objects.json'), JSON.stringify({ frames, meta: { image: 'objects.png', size: { w: packed.w, h: packed.h }, scale: 1 } }));

// ---------------------------------------------------------------- personagens
const pl = renderSheet(PLAYER_LOOK, ['idle', 'walk', 'run', 'jump']);
writePNG(path.join(OUT, 'player.png'), pl.img);
const np = renderSheet(NPC_LOOK, ['idle', 'walk']);
writePNG(path.join(OUT, 'npc.png'), np.img);

const meta = {
  tile: { w: T.TILE_W, h: T.TILE_H, cols: TCOLS, count: tiles.length, index: tileIndex, waterFrames: WF },
  character: { frameW: FRAME_W, frameH: FRAME_H, anchorX: ANCHOR_X, anchorY: ANCHOR_Y, dirs: DIRS, player: { cols: pl.cols, layout: pl.layout }, npc: { cols: np.cols, layout: np.layout } },
};
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta));
console.log(`assets gerados em ${((Date.now() - t0) / 1000).toFixed(1)}s — tiles: ${tiles.length}, sprites: ${entries.length}, atlas ${packed.w}x${packed.h}`);

// ---------------------------------------------------------------- utilitários
function blit(dst: Image, src: Image, x0: number, y0: number) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const si = (y * src.w + x) * 4, di = ((y0 + y) * dst.w + x0 + x) * 4;
    dst.data[di] = src.data[si]; dst.data[di + 1] = src.data[si + 1]; dst.data[di + 2] = src.data[si + 2]; dst.data[di + 3] = src.data[si + 3];
  }
}

function uniform(imgs: Image[]): Image[] {
  // alinha todos os frames pela âncora e usa a união dos retângulos
  let l = 0, t = 0, r = 0, b = 0;
  for (const im of imgs) { l = Math.max(l, im.ox); t = Math.max(t, im.oy); r = Math.max(r, im.w - im.ox); b = Math.max(b, im.h - im.oy); }
  return imgs.map((im) => {
    const out = newImage(l + r, t + b, l, t);
    blit(out, im, l - im.ox, t - im.oy);
    return out;
  });
}

function pack(imgs: Image[], maxW: number) {
  const order = imgs.map((im, i) => i).sort((a, b) => imgs[b].h - imgs[a].h);
  const rects: { x: number; y: number }[] = new Array(imgs.length);
  let x = 0, y = 0, rowH = 0, w = 0;
  for (const i of order) {
    const im = imgs[i];
    if (x + im.w + 1 > maxW) { x = 0; y += rowH + 1; rowH = 0; }
    rects[i] = { x, y };
    x += im.w + 1; rowH = Math.max(rowH, im.h); w = Math.max(w, x);
  }
  return { rects, w, h: y + rowH };
}
