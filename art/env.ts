// Cenário "HD" (unidade = 1 tile ≈ 1 m, escala de render K=2 → tile 64×32 px):
// casas brasileiras detalhadas, café, roda-gigante, píer, ilhas ao fundo, ônibus,
// além de props feitos a partir de modelos gratuitos do BlenderKit (art/props.ts).

import { RGB, hex, mix, ramp } from './color';
import { hash2, hash3, vnoise3 } from './noise';
import {
  Box, Capsule, Convex, Cylinder, Ellipsoid, Image, Material, OBox, Prim, ShadeCtx, Sphere, V3, add, dot, gableRoof, hipRoof,
  mat, norm, rotY, trim,
} from './rt';
import { MeshInst, renderHD } from './hd';

export const K_ENV = 2;
export interface Sprite { img: Image; shadow?: Image }

export function R(prims: Prim[], meshes: MeshInst[] = [], o: { shadow?: boolean; colors?: number; ss?: number; ambient?: number; outline?: boolean } = {}): Sprite {
  const r = renderHD(prims, meshes, { scale: K_ENV, ss: o.ss ?? 3, shadow: o.shadow ?? true, colors: o.colors ?? 48, ambient: o.ambient, outline: o.outline });
  return { img: trim(r.img), shadow: r.shadow ? trim(r.shadow) : undefined };
}

// ---------------------------------------------------------------- materiais
const RAMP = (h: string, s = 0.7) => ramp(h, { spread: s });
const WHITE = RAMP('#f3eee4', 0.45);
const CREAM = RAMP('#f0d9a8', 0.55);
const TERRA = RAMP('#c8643c', 0.7);
const WOOD = RAMP('#8a5634', 0.7);
const WOOD_L = RAMP('#c08a55', 0.6);
const IRON = RAMP('#3a3d48', 0.6);
const STONE = RAMP('#b9ab95', 0.55);
const GRAPHITE = RAMP('#55596a', 0.6);
const LIT = RAMP('#ffcf86', 0.35);      // janelas acesas
const LIT2 = RAMP('#ffb35c', 0.35);

function grit(p: V3, seed: number, pct = 0.03): number {
  return hash3(Math.floor(p[0] * 40), Math.floor(p[1] * 40), Math.floor(p[2] * 40), seed) < pct ? -1 : 0;
}

/** material com luz própria (janelas acesas, luminárias) */
function emis(r: RGB[], idx = 3): Material { return () => ({ ramp: r, idx, emissive: true }); }

type Face = 0 | 1 | 4 | 5;
export interface Feat {
  face: Face; a0: number; a1: number; y0: number; y1: number;
  kind: 'win' | 'door' | 'glass' | 'garage' | 'shutter' | 'vent' | 'stone' | 'wood' | 'lamp' | 'sign';
  color?: RGB[]; text?: string;
}

// fonte bitmap 3×5 para letreiros
const FONT: Record<string, string[]> = {
  C: ['111', '100', '100', '100', '111'], A: ['010', '101', '111', '101', '101'], F: ['111', '100', '110', '100', '100'],
  E: ['111', '100', '110', '100', '111'], É: ['011', '111', '100', '110', '111'], P: ['110', '101', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'], I: ['111', '010', '010', '010', '111'], O: ['111', '101', '101', '101', '111'],
  S: ['111', '100', '111', '001', '111'], V: ['101', '101', '101', '101', '010'], T: ['111', '010', '010', '010', '010'],
  L: ['100', '100', '100', '100', '111'], N: ['101', '111', '111', '111', '101'], ' ': ['000', '000', '000', '000', '000'],
  D: ['110', '101', '101', '101', '110'], M: ['101', '111', '111', '101', '101'], U: ['101', '101', '101', '101', '111'],
};
function textPixel(text: string, u: number, v: number): boolean {
  // u,v ∈ [0,1): grade de (4*len-1) × 5
  const cols = text.length * 4 - 1;
  const cx = Math.floor(u * cols), cy = Math.floor(v * 5);
  const ch = text[Math.floor(cx / 4)];
  const gx = cx % 4;
  if (!ch || gx === 3 || cy < 0 || cy > 4) return false;
  return (FONT[ch] ?? FONT[' '])[cy][gx] === '1';
}

export function facade(base: RGB[], feats: Feat[], o: { barra?: RGB[]; barraH?: number; frame?: RGB[]; siding?: boolean; seed?: number; shutter?: RGB[] } = {}): Material {
  const frame = o.frame ?? WHITE;
  return (c: ShadeCtx) => {
    const f = c.face as Face;
    const a = f === 5 || f === 4 ? c.local[0] : c.local[2];
    const y = c.local[1];
    const L = c.level;
    const R0 = (r: RGB[], s = 0) => ({ ramp: r, idx: Math.max(0, Math.min(4, L + s)) });
    for (const ft of feats) {
      if (ft.face !== f) continue;
      const { a0, a1, y0, y1 } = ft;
      const inA = a >= a0 && a <= a1, inY = y >= y0 && y <= y1;
      if (ft.kind === 'win' || ft.kind === 'shutter') {
        const sw = ft.kind === 'shutter' ? (a1 - a0) * 0.32 : 0;
        if (inY && a >= a0 - sw && a <= a1 + sw) {
          if (a < a0 || a > a1) { // venezianas abertas
            const slat = (y * 14) % 1 < 0.3 ? -1 : 0;
            return R0(ft.color ?? RAMP('#3f7f5a'), slat + (Math.abs(a - a0) < 0.04 || Math.abs(a - a1) < 0.04 ? -1 : 0));
          }
          const fw = 0.08;
          if (a < a0 + fw || a > a1 - fw || y < y0 + fw || y > y1 - fw) return R0(frame, 0);
          const mid = (a0 + a1) / 2;
          if (Math.abs(a - mid) < 0.04) return R0(frame, -1);
          if (Math.abs(y - (y0 + (y1 - y0) * 0.62)) < 0.035) return R0(frame, -1);
          // interior iluminado: cortina nas laterais, luz quente no meio
          const rel = (a - a0) / (a1 - a0);
          const curtain = rel < 0.2 || rel > 0.8;
          const refl = ((a - y * 0.9) * 1.6 % 1 + 1) % 1 < 0.1;
          if (refl) return { ramp: RAMP('#ffe8c8', 0.3), idx: 3, emissive: true };
          return { ramp: curtain ? RAMP('#e8a46a', 0.4) : (hash2(Math.floor(a * 3), Math.floor(y * 2), 5) > 0.7 ? LIT2 : LIT), idx: curtain ? 2 : 3, emissive: true };
        }
        if (y < y0 && y > y0 - 0.1 && a > a0 - 0.12 - sw && a < a1 + 0.12 + sw) return R0(frame, 1); // peitoril
        if (y > y1 && y < y1 + 0.08 && a > a0 - 0.08 && a < a1 + 0.08) return R0(frame, 0);
      }
      if (ft.kind === 'glass' && inA && inY) {
        const fw = 0.06;
        const n = Math.max(1, Math.round((a1 - a0) / 1.1));
        const seg = (a - a0) / ((a1 - a0) / n);
        const fs = seg % 1;
        if (a < a0 + fw || a > a1 - fw || y < y0 + fw || y > y1 - fw || fs < 0.03 || fs > 0.97) return R0(ft.color ?? GRAPHITE, 0);
        const refl = ((a - y * 0.8) * 1.2 % 1 + 1) % 1;
        if (refl < 0.07) return { ramp: RAMP('#ffe6c4', 0.3), idx: 3, emissive: true };
        // interior: luminária pendente, móveis em silhueta
        const ry = (y - y0) / (y1 - y0);
        if (ry < 0.22 && hash2(Math.floor(seg * 3), 2, 9) > 0.5) return { ramp: RAMP('#9a5a3a', 0.5), idx: 2, emissive: true };
        return { ramp: ry > 0.75 ? LIT2 : LIT, idx: ry > 0.75 ? 2 : 3, emissive: true };
      }
      if (ft.kind === 'door' && inY && a >= a0 - 0.1 && a <= a1 + 0.1) {
        if (a < a0 || a > a1 || y > y1 - 0.1) return R0(frame, 0);
        if (Math.abs(a - (a1 - 0.16)) < 0.06 && Math.abs(y - 1.0) < 0.06) return R0(RAMP('#e2b64a', 0.4), 2);
        const pa = (a - a0) / (a1 - a0), py = (y - y0) / (y1 - y0);
        const col = ft.color ?? WOOD;
        if (py > 0.62 && py < 0.9 && pa > 0.2 && pa < 0.8) return { ramp: LIT, idx: 3, emissive: true }; // visor
        const plank = Math.floor(pa * 5) !== Math.floor((pa + 0.02) * 5) ? -1 : 0;
        return R0(col, plank + (py < 0.04 ? -1 : 0));
      }
      if (ft.kind === 'garage' && inA && inY) {
        if (a < a0 + 0.08 || a > a1 - 0.08 || y > y1 - 0.08) return R0(GRAPHITE, -1);
        return R0(ft.color ?? RAMP('#c8c4bb', 0.5), (y * 7) % 1 < 0.18 ? -1 : 0);
      }
      if (ft.kind === 'stone' && inA && inY) {
        const row = Math.floor(y * 6), off = row % 2 ? 0.5 : 0;
        const col = Math.floor(a * 3.5 + off);
        const edge = (y * 6) % 1 < 0.14 || ((a * 3.5 + off) % 1) < 0.07;
        return R0(ft.color ?? STONE, edge ? -2 : (hash2(col, row, 3) > 0.6 ? 1 : hash2(col, row, 4) < 0.25 ? -1 : 0));
      }
      if (ft.kind === 'wood' && inA && inY) {
        return R0(ft.color ?? WOOD_L, (a * 6) % 1 < 0.1 ? -1 : (hash2(Math.floor(a * 6), 0, 2) > 0.6 ? 1 : 0));
      }
      if (ft.kind === 'lamp' && inA && inY) return { ramp: RAMP('#fff0b8', 0.3), idx: 4, emissive: true };
      if (ft.kind === 'vent' && inA && inY) return R0(frame, (y * 20) % 1 < 0.4 ? -1 : 0);
      if (ft.kind === 'sign' && inA && inY) {
        const u = (a - a0) / (a1 - a0), v = 1 - (y - y0) / (y1 - y0);
        const pad = 0.08;
        if (u < pad * 0.5 || u > 1 - pad * 0.5 || v < pad || v > 1 - pad) return R0(RAMP('#3a2a22'), 0);
        if (textPixel(ft.text ?? '', (u - pad) / (1 - 2 * pad), (v - pad * 1.6) / (1 - 3.2 * pad))) return { ramp: RAMP('#fff3cf', 0.3), idx: 4, emissive: true };
        return R0(ft.color ?? RAMP('#2f6b4f'), 0);
      }
    }
    if (o.barra && y < (o.barraH ?? 0.35)) return R0(o.barra, y > (o.barraH ?? 0.35) - 0.06 ? 1 : 0);
    if (o.siding) return R0(base, (y * 5.5) % 1 < 0.14 ? -1 : 0);
    return R0(base, grit(c.p, o.seed ?? 1));
  };
}

export function roofTiles(r: RGB[], gable?: RGB[]): Material {
  return (c) => {
    const n = c.n;
    const L = c.level;
    if (Math.abs(n[1]) < 0.05) return { ramp: gable ?? WHITE, idx: Math.max(0, L - (gable ? 0 : 1)) };
    // telhas capa-canal: fileiras e ondulação
    const along = Math.abs(n[0]) > Math.abs(n[2]) ? c.p[2] : c.p[0];
    const row = Math.floor(c.p[1] * 9);
    const fr = (c.p[1] * 9) % 1;
    const wave = Math.sin((along * 7 + (row % 2) * 0.5) * Math.PI * 2);
    let s = 0;
    if (fr < 0.2) s = -1;
    else if (wave > 0.55) s = 1;
    else if (wave < -0.7) s = -1;
    if (hash2(row, Math.floor(along * 7), 77) > 0.93) s -= 1;
    if (hash2(row, Math.floor(along * 7), 78) > 0.95) s += 1;
    return { ramp: r, idx: Math.max(0, Math.min(4, L + s)) };
  };
}

function shedRoof(x0: number, x1: number, z0: number, z1: number, yHigh: number, yLow: number, th: number, m: Material): Convex {
  // inclinação ao longo de +z (alto em z0, baixo em z1)
  const pl: { n: V3; d: number }[] = [];
  const P = (n: V3, p: V3) => { const nn = norm(n); pl.push({ n: nn, d: dot(nn, p) }); };
  P([-1, 0, 0], [x0, 0, 0]); P([1, 0, 0], [x1, 0, 0]); P([0, 0, -1], [0, 0, z0]); P([0, 0, 1], [0, 0, z1]);
  const dz = z1 - z0, dy = yHigh - yLow;
  P([0, dz, dy], [0, yHigh, z0]);               // superfície de cima
  P([0, -dz, -dy], [0, yHigh - th, z0]);        // superfície de baixo
  return new Convex(pl, [x0, yLow - th, z0], [x1, yHigh, z1], m);
}

const flat = (r: RGB[], seed = 0): Material => mat(r, (c) => grit(c.p, seed, 0.03));

// ---------------------------------------------------------------- casa 1: popular (térrea)
export function houseCasa1(): Sprite {
  const W = 6.4, D = 5.0, H = 2.9;
  const wall = CREAM;
  const green = RAMP('#3f7a5c');
  const feats: Feat[] = [
    { face: 5, a0: 1.25, a1: 2.2, y0: 0.1, y1: 2.2, kind: 'door', color: RAMP('#7a4428') },
    { face: 5, a0: 3.3, a1: 4.7, y0: 1.0, y1: 2.25, kind: 'shutter', color: green },
    { face: 5, a0: 2.35, a1: 2.5, y0: 2.0, y1: 2.15, kind: 'lamp' },
    { face: 1, a0: 1.0, a1: 2.3, y0: 1.0, y1: 2.25, kind: 'shutter', color: green },
    { face: 1, a0: 3.4, a1: 3.95, y0: 1.65, y1: 2.2, kind: 'win' },
  ];
  const prims: Prim[] = [];
  prims.push(new Box([0, 0, 0], [W, H, D], facade(wall, feats, { barra: RAMP('#a98a68', 0.55), barraH: 0.45 })));
  // varanda frontal
  const tile = mat(RAMP('#b5543a', 0.6), (c) => ((Math.floor(c.p[0] * 3) + Math.floor(c.p[2] * 3)) % 2 ? -1 : 0));
  prims.push(new Box([0.5, 0, D], [3.15, 0.2, D + 1.55], tile));
  prims.push(new Box([1.2, 0, D + 1.55], [2.3, 0.1, D + 1.85], flat(STONE)));
  for (const x of [0.62, 3.0]) prims.push(new Box([x, 0.2, D + 1.3], [x + 0.18, H - 0.25, D + 1.48], flat(WHITE)));
  prims.push(shedRoof(0.35, 3.3, D - 0.05, D + 1.75, H - 0.1, H - 0.62, 0.12, roofTiles(TERRA)));
  // telhado de 4 águas
  prims.push(hipRoof([-0.42, H - 0.05, -0.42], [W + 0.42, H, D + 0.42], 1.75, 1.6, roofTiles(TERRA)));
  prims.push(new Box([-0.42, H - 0.2, -0.42], [W + 0.42, H - 0.04, D + 0.42], flat(WHITE))); // beiral
  // caixa d'água azul
  prims.push(new Cylinder([W - 1.7, H + 0.7, 1.3], 0.5, 0.7, mat(RAMP('#3c8fd0', 0.6), (c) => (c.local[1] > 0.62 ? 1 : 0))));
  // ar-condicionado lateral
  prims.push(new Box([W, 1.8, 2.9], [W + 0.3, 2.3, 3.6], flat(WHITE)));
  return R(prims);
}

// ---------------------------------------------------------------- casa 2: moderna (sobrado)
export function houseCasa2(): Sprite {
  const W = 8, D = 6.5;
  const white = RAMP('#efece6', 0.45);
  const prims: Prim[] = [];
  const f1: Feat[] = [
    { face: 5, a0: 0.4, a1: 3.4, y0: 0, y1: 2.55, kind: 'garage', color: RAMP('#8a6a4c', 0.55) },
    { face: 5, a0: 3.6, a1: 4.4, y0: 0, y1: 3.0, kind: 'stone' },
    { face: 5, a0: 4.7, a1: 5.8, y0: 0.1, y1: 2.5, kind: 'door', color: RAMP('#5a3a26') },
    { face: 5, a0: 6.1, a1: 7.7, y0: 0.4, y1: 2.6, kind: 'glass' },
    { face: 1, a0: 0.5, a1: 5.9, y0: 0.25, y1: 2.7, kind: 'glass' },
  ];
  prims.push(new Box([0, 0, 0], [W, 3.0, D], facade(white, f1, {})));
  prims.push(new Box([-0.25, 3.0, -0.2], [W + 0.35, 3.28, D + 0.55], flat(GRAPHITE)));
  // faixa de LED sob a laje
  prims.push(new Box([0.2, 2.96, D + 0.45], [W + 0.2, 3.0, D + 0.53], emis(RAMP('#ffe2a0', 0.3), 4)));
  const f2: Feat[] = [
    { face: 5, a0: 0.7, a1: 5.0, y0: 0.25, y1: 2.7, kind: 'glass' },
    { face: 5, a0: 5.4, a1: 7.6, y0: 0, y1: 3.0, kind: 'wood' },
    { face: 1, a0: 0.4, a1: 3.6, y0: 0.3, y1: 2.6, kind: 'glass' },
  ];
  prims.push(new Box([0.6, 3.28, 0], [W, 6.3, D - 1.1], facade(white, f2, {})));
  // varanda com guarda-corpo de vidro
  const glassRail = (c: ShadeCtx) => ({ ramp: RAMP('#a7d3e0', 0.45), idx: c.local[1] > 0.9 ? 1 : (((c.p[0] - c.p[1]) * 2) % 1 < 0.1 ? 4 : 3) });
  prims.push(new Box([0.6, 3.28, D + 0.42], [W, 4.3, D + 0.5], glassRail));
  prims.push(new Box([0.6, 4.28, D + 0.4], [W, 4.34, D + 0.54], flat(GRAPHITE)));
  // cobertura e platibanda
  prims.push(new Box([0.4, 6.3, -0.2], [W + 0.25, 6.62, D - 0.85], flat(GRAPHITE)));
  // pergolado sobre a entrada
  for (let i = 0; i < 7; i++) prims.push(new Box([4.55 + i * 0.2, 2.62, D], [4.63 + i * 0.2, 2.7, D + 1.3], flat(WOOD)));
  // brise vertical no volume de madeira (andar de cima, lateral)
  for (let i = 0; i < 9; i++) prims.push(new Box([W, 3.5, 3.9 + i * 0.16], [W + 0.12, 6.1, 3.96 + i * 0.16], flat(WOOD_L)));
  // vasos com plantas na varanda
  for (const x of [1.0, 4.6]) {
    prims.push(new Cylinder([x, 3.28, D + 0.05], 0.22, 0.4, flat(GRAPHITE)));
    prims.push(new Sphere([x, 3.95, D + 0.05], 0.36, foliage(RAMP('#3f8d3c', 0.8), 3 + x)));
  }
  return R(prims);
}

// ---------------------------------------------------------------- casa 3: casa de praia
export function houseCasa3(): Sprite {
  const W = 5.8, D = 6.0, H = 3.0;
  const blue = RAMP('#2a72b5', 0.65);
  const prims: Prim[] = [];
  const feats: Feat[] = [
    { face: 1, a0: 2.5, a1: 3.5, y0: 0.45, y1: 2.6, kind: 'door', color: blue },
    { face: 1, a0: 0.7, a1: 1.8, y0: 1.2, y1: 2.4, kind: 'shutter', color: blue },
    { face: 1, a0: 4.2, a1: 5.3, y0: 1.2, y1: 2.4, kind: 'shutter', color: blue },
    { face: 5, a0: 1.0, a1: 2.2, y0: 1.2, y1: 2.4, kind: 'shutter', color: blue },
    { face: 5, a0: 3.4, a1: 4.1, y0: 1.6, y1: 2.3, kind: 'win' },
    { face: 1, a0: 3.7, a1: 3.85, y0: 2.3, y1: 2.45, kind: 'lamp' },
  ];
  prims.push(new Box([0, 0, 0], [W, 0.45, D], flat(RAMP('#8f8172', 0.5))));
  prims.push(new Box([0, 0.45, 0], [W, H, D], facade(WHITE, feats.map((f) => ({ ...f, y0: f.y0 - 0.45, y1: f.y1 - 0.45 })), { siding: true })));
  // varanda de madeira elevada
  const deck = mat(WOOD_L, (c) => ((c.p[2] * 5) % 1 < 0.12 ? -1 : 0));
  prims.push(new Box([W, 0, 0.15], [W + 2.2, 0.45, D - 0.15], deck));
  prims.push(new Box([W + 2.2, 0, 2.4], [W + 2.6, 0.22, 3.6], deck));
  for (const z of [0.25, 2.3, 3.7, D - 0.25]) prims.push(new Box([W + 1.95, 0.45, z - 0.09], [W + 2.13, H + 0.25, z + 0.09], flat(WHITE)));
  for (const [z0, z1] of [[0.25, 2.3], [3.7, D - 0.25]]) {
    prims.push(new Box([W + 1.98, 1.32, z0], [W + 2.1, 1.4, z1], flat(WHITE)));
    for (let z = z0 + 0.2; z < z1 - 0.05; z += 0.24) prims.push(new Box([W + 2.0, 0.45, z - 0.03], [W + 2.08, 1.32, z + 0.03], flat(WHITE)));
  }
  // telhado de 4 águas cobrindo a varanda
  prims.push(hipRoof([-0.35, H + 0.2, -0.4], [W + 2.5, H + 0.2, D + 0.4], 1.6, 1.7, roofTiles(TERRA)));
  prims.push(new Box([-0.2, H, -0.2], [W + 2.35, H + 0.22, D + 0.2], flat(WHITE)));
  // rede listrada
  const rede = mat(RAMP('#e8553f'), (c) => ((c.local[0] * 7) % 1 < 0.5 ? 0 : { ramp: RAMP('#f2c44c'), shift: 0 }));
  prims.push(new Capsule([W + 1.0, 1.35, 0.6], [W + 1.0, 1.35, 2.0], 0.12, rede));
  // lanternas na varanda
  for (const z of [1.3, 4.7]) prims.push(new Sphere([W + 2.0, H - 0.25, z], 0.1, emis(RAMP('#ffe0a0', 0.3), 4)));
  return R(prims);
}

// ---------------------------------------------------------------- café
export function cafe(): Sprite {
  const W = 5.6, D = 4.4, H = 3.2;
  const prims: Prim[] = [];
  const wall = RAMP('#e9b98c', 0.55);
  const feats: Feat[] = [
    { face: 5, a0: 0.4, a1: 3.0, y0: 0.4, y1: 2.5, kind: 'glass', color: RAMP('#2f4f3f') },
    { face: 5, a0: 3.4, a1: 4.4, y0: 0.05, y1: 2.5, kind: 'door', color: RAMP('#2f6b4f') },
    { face: 1, a0: 0.5, a1: 3.9, y0: 0.4, y1: 2.5, kind: 'glass', color: RAMP('#2f4f3f') },
    { face: 5, a0: 0.6, a1: 4.9, y0: 3.2, y1: 3.9, kind: 'sign', text: 'CAFÉ' },
  ];
  prims.push(new Box([0, 0, 0], [W, H, D], facade(wall, feats, { barra: RAMP('#6b4a3a', 0.5), barraH: 0.4 })));
  // platibanda com letreiro
  prims.push(new Box([0, H, 0], [W, H + 0.9, D], facade(wall, feats.map((f) => ({ ...f, y0: f.y0 - H, y1: f.y1 - H })))));
  prims.push(new Box([-0.1, H + 0.9, -0.1], [W + 0.1, H + 1.0, D + 0.1], flat(RAMP('#6b4a3a'))));
  // toldos listrados
  const stripe = (c: ShadeCtx) => {
    const along = Math.abs(c.n[0]) > 0.5 ? c.p[2] : c.p[0];
    const r = Math.floor(along * 3.2) % 2 ? RAMP('#f4efe6', 0.4) : RAMP('#d9483b', 0.6);
    return { ramp: r, idx: c.level };
  };
  prims.push(shedRoof(0.2, W - 0.2, D - 0.02, D + 1.3, 2.95, 2.35, 0.08, stripe));
  // toldo lateral (+x)
  const pl: { n: V3; d: number }[] = [];
  const P = (n: V3, p: V3) => { const nn = norm(n); pl.push({ n: nn, d: dot(nn, p) }); };
  P([0, 0, -1], [0, 0, 0.3]); P([0, 0, 1], [0, 0, D - 0.3]); P([-1, 0, 0], [W - 0.02, 0, 0]); P([1, 0, 0], [W + 1.3, 0, 0]);
  P([0.6, 1.3, 0], [W, 2.95, 0]); P([-0.6, -1.3, 0], [W, 2.87, 0]);
  prims.push(new Convex(pl, [W, 2.2, 0.3], [W + 1.3, 2.95, D - 0.3], stripe));
  // lâmpadas sob o toldo
  for (let i = 0; i < 6; i++) prims.push(new Sphere([0.6 + i * 0.85, 2.3, D + 1.15], 0.06, emis(RAMP('#fff1b8', 0.3), 4)).noCast());
  return R(prims);
}

export function cafeTable(): Sprite {
  const prims: Prim[] = [];
  const iron = flat(IRON);
  prims.push(new Cylinder([0, 0, 0], 0.05, 0.75, iron));
  prims.push(new Cylinder([0, 0.72, 0], 0.42, 0.05, mat(RAMP('#f0ebe0', 0.45), () => 0)));
  prims.push(new Cylinder([0, 0, 0], 0.22, 0.04, iron));
  for (const [x, z] of [[-0.62, 0], [0.62, 0], [0, 0.62]]) {
    prims.push(new Cylinder([x, 0, z], 0.2, 0.45, mat(RAMP('#2f6b4f', 0.6), (c) => (c.local[1] > 0.4 ? 1 : -1))));
  }
  prims.push(new Cylinder([0.1, 0.77, 0.05], 0.06, 0.1, flat(WHITE)));
  return R(prims);
}

// ---------------------------------------------------------------- vegetação procedural
export function foliage(r: RGB[], seed: number, flowers?: RGB[], fDensity = 0.78): Material {
  return (c) => {
    const n = vnoise3(c.p[0] * 5, c.p[1] * 5, c.p[2] * 5, seed);
    const m = vnoise3(c.p[0] * 14, c.p[1] * 14, c.p[2] * 14, seed + 9);
    let s = n > 0.62 ? 1 : n < 0.36 ? -1 : 0;
    if (m > 0.7) s += 1;
    if (m < 0.24) s -= 1;
    if (flowers && hash3(Math.floor(c.p[0] * 22), Math.floor(c.p[1] * 22), Math.floor(c.p[2] * 22), seed) > fDensity) {
      return { ramp: flowers, idx: Math.max(0, Math.min(4, c.level + s + 1)) };
    }
    return { ramp: r, idx: Math.max(0, Math.min(4, c.level + s)) };
  };
}

/** buganvília (primavera): arbusto denso coberto de flores magenta */
export function bougainvillea(seed: number, size = 1, color = '#d6338a'): Sprite {
  const prims: Prim[] = [];
  const m = foliage(RAMP('#3c7f34', 0.8), seed, RAMP(color, 0.7), 0.42);
  for (let i = 0; i < 7; i++) {
    const a = i * 2.39 + seed;
    const r = i === 0 ? 0 : 0.42 * size;
    prims.push(new Sphere([Math.cos(a) * r, (0.55 + (i % 3) * 0.18) * size, Math.sin(a) * r], (0.5 - i * 0.025) * size, m).setGroup(1));
  }
  return R(prims);
}

export function hedgeBlock(len: number, axis: 'x' | 'z', seed: number, flower?: string): Sprite {
  const prims: Prim[] = [];
  const m = foliage(RAMP('#3a7d36', 0.8), seed, flower ? RAMP(flower, 0.6) : undefined, 0.8);
  const n = Math.ceil(len / 0.4);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * (len / n);
    prims.push(new Sphere(axis === 'x' ? [t, 0.42, 0] : [0, 0.42, t], 0.36 + hash2(i, seed) * 0.06, m).setGroup(1));
  }
  return R(prims);
}

export function flowerBed(len: number, axis: 'x' | 'z', seed: number): Sprite {
  const prims: Prim[] = [];
  const soil = flat(RAMP('#6b4632', 0.5));
  prims.push(axis === 'x' ? new Box([0, 0, -0.35], [len, 0.22, 0.35], mat(STONE, () => 0)) : new Box([-0.35, 0, 0], [0.35, 0.22, len], mat(STONE, () => 0)));
  prims.push(axis === 'x' ? new Box([0.06, 0.22, -0.29], [len - 0.06, 0.26, 0.29], soil) : new Box([-0.29, 0.22, 0.06], [0.29, 0.26, len - 0.06], soil));
  const cols = ['#e8457a', '#f6d04d', '#f4f0f4', '#b26de0', '#ff8a4c'];
  for (let i = 0; i < len * 7; i++) {
    const t = 0.15 + hash2(i, seed) * (len - 0.3), w = (hash2(seed, i) - 0.5) * 0.45;
    const c = cols[Math.floor(hash2(i, i + seed) * cols.length)];
    const p: V3 = axis === 'x' ? [t, 0.38, w] : [w, 0.38, t];
    prims.push(new Sphere(p, 0.1, hash2(i, 3) > 0.45 ? flat(RAMP(c, 0.6)) : foliage(RAMP('#3f8d3c', 0.8), i)).setGroup(1));
  }
  return R(prims);
}

// ---------------------------------------------------------------- piscina (objeto rente ao chão)
export function pool(w: number, d: number, frame: number): Sprite {
  const prims: Prim[] = [];
  const coping = flat(RAMP('#e9e1d2', 0.45));
  prims.push(new Box([0, 0, 0], [w, 0.12, 0.3], coping), new Box([0, 0, d - 0.3], [w, 0.12, d], coping));
  prims.push(new Box([0, 0, 0], [0.3, 0.12, d], coping), new Box([w - 0.3, 0, 0], [w, 0.12, d], coping));
  const water = (c: ShadeCtx) => {
    const u = c.p[0], v = c.p[2];
    const k = Math.sin(u * 5 + frame * 1.6 + Math.sin(v * 4)) + Math.sin(v * 6 - frame * 1.2 + Math.sin(u * 3));
    const r = RAMP('#2fb7d6', 0.55);
    return { ramp: r, idx: k > 1.2 ? 4 : k > 0.4 ? 3 : 2, emissive: true };
  };
  prims.push(new Box([0.3, 0, 0.3], [w - 0.3, 0.06, d - 0.3], water));
  return R(prims, [], { shadow: false });
}

// ---------------------------------------------------------------- roda-gigante (8 quadros)
export function ferrisWheel(frame: number, frames: number): Sprite {
  const prims: Prim[] = [];
  const steel = flat(RAMP('#e9e6e0', 0.45));
  const C: V3 = [0, 7.6, 0];
  const Rr = 5.4;
  const ang0 = (frame / frames) * (Math.PI * 2 / 8); // período = 2 cabines (padrão de cor)
  // estrutura de apoio (A)
  for (const z of [-1.3, 1.3]) {
    prims.push(new Capsule([-2.6, 0, z], [0, C[1], z * 0.45], 0.14, steel));
    prims.push(new Capsule([2.6, 0, z], [0, C[1], z * 0.45], 0.14, steel));
    prims.push(new Capsule([-1.6, 3.2, z * 0.8], [1.6, 3.2, z * 0.8], 0.08, steel));
  }
  prims.push(new Capsule([0, C[1], -0.75], [0, C[1], 0.75], 0.3, flat(RAMP('#8c8f99'))));
  // aros e raios (no plano x–y)
  const N = 72;
  for (const z of [-0.45, 0.45]) {
    for (let i = 0; i < N; i++) {
      const a1 = (i / N) * Math.PI * 2 + ang0, a2 = ((i + 1) / N) * Math.PI * 2 + ang0;
      prims.push(new Capsule([Math.cos(a1) * Rr, C[1] + Math.sin(a1) * Rr, z], [Math.cos(a2) * Rr, C[1] + Math.sin(a2) * Rr, z], 0.07, steel).setGroup(2));
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + ang0;
      prims.push(new Capsule([0, C[1], z * 0.6], [Math.cos(a) * Rr, C[1] + Math.sin(a) * Rr, z], 0.035, steel).setGroup(2));
    }
  }
  // lâmpadas no aro
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2 + ang0;
    prims.push(new Sphere([Math.cos(a) * (Rr + 0.05), C[1] + Math.sin(a) * (Rr + 0.05), 0.5], 0.07, emis(RAMP(i % 2 ? '#ffd36e' : '#ff7ab0', 0.3), 4)).noCast());
  }
  // cabines (sempre na vertical)
  const cabCols = ['#e2453c', '#2f8fd0'];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + ang0;
    const px = Math.cos(a) * Rr, py = C[1] + Math.sin(a) * Rr;
    const col = RAMP(cabCols[i % 2], 0.6);
    prims.push(new Capsule([px, py, 0], [px, py - 0.35, 0], 0.03, steel));
    prims.push(new Ellipsoid([px, py - 0.75, 0], [0.42, 0.38, 0.42], (c) => ({ ramp: Math.abs(c.p[1] - (py - 0.72)) < 0.12 ? LIT : col, idx: Math.abs(c.p[1] - (py - 0.72)) < 0.12 ? 3 : c.level, emissive: Math.abs(c.p[1] - (py - 0.72)) < 0.12 })).setGroup(3 + i));
    prims.push(new Ellipsoid([px, py - 0.42, 0], [0.32, 0.08, 0.32], flat(WHITE)).setGroup(3 + i));
  }
  // plataforma
  prims.push(new Box([-3.2, 0, -1.8], [3.2, 0.3, 1.8], flat(RAMP('#8a6a52'))));
  return R(prims, [], { colors: 56 });
}

// ---------------------------------------------------------------- píer de madeira
export function pier(len: number, w: number): Sprite {
  const prims: Prim[] = [];
  const planks = mat(WOOD_L, (c) => ((c.p[0] * 4) % 1 < 0.1 ? -2 : hash2(Math.floor(c.p[0] * 4), 1, 5) > 0.7 ? 1 : 0));
  prims.push(new Box([0, 0.35, 0], [len, 0.5, w], planks));
  for (let x = 0.3; x < len; x += 1.6) for (const z of [0.15, w - 0.15]) {
    prims.push(new Cylinder([x, -0.6, z], 0.11, 1.0, flat(WOOD)));
    prims.push(new Cylinder([x, 0.5, z], 0.06, 0.85, flat(WOOD)));
  }
  for (const z of [0.15, w - 0.15]) prims.push(new Box([0, 1.25, z - 0.05], [len, 1.33, z + 0.05], flat(WOOD)));
  for (let x = 2.0; x < len; x += 3.2) prims.push(new Sphere([x, 1.42, 0.15], 0.07, emis(RAMP('#ffe0a0', 0.3), 4)).noCast());
  return R(prims);
}

// ---------------------------------------------------------------- ilha distante com vilarejo
export function distantIsland(seed: number, w: number, d: number, h: number, village: boolean): Sprite {
  const prims: Prim[] = [];
  // tudo abaixo do nível do mar é descartado (a água do mapa aparece por baixo)
  const grassM: Material = (c) => (c.p[1] < 0.35 ? (c.p[1] < 0 ? null : { ramp: RAMP('#e2c894', 0.5), idx: c.level }) : { ramp: RAMP('#6f9f45', 0.7), idx: Math.max(0, Math.min(4, c.level + (vnoise3(c.p[0] * 1.5, c.p[1] * 1.5, c.p[2] * 1.5, seed) > 0.6 ? 1 : 0))) });
  const rock = mat(RAMP('#8f8274', 0.65), (c) => (c.p[1] < 0 ? null : vnoise3(c.p[0] * 2, c.p[1] * 2, c.p[2] * 2, seed) > 0.55 ? 1 : 0));
  const sand = mat(RAMP('#e2c894', 0.5), (c) => (c.p[1] < 0 ? null : 0));
  const rx = w * 0.5, rz = d * 0.5;
  prims.push(new Ellipsoid([0, -0.2, 0], [rx * 1.04, 0.5, rz * 1.04], sand));
  prims.push(new Ellipsoid([0, 0, 0], [rx, h, rz], grassM));
  // altura do terreno sobre a elipse (para assentar objetos)
  const top = (x: number, z: number) => h * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2 - (z / rz) ** 2));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + seed;
    prims.push(new Ellipsoid([Math.cos(a) * rx * 0.95, 0.2, Math.sin(a) * rz * 0.95], [1.2, 0.9, 1.0], rock));
  }
  const greens = ['#3f7f36', '#4f8f3e', '#2f6f34', '#5a9a40'];
  for (let i = 0; i < 46; i++) {
    const ang = hash2(i, seed) * Math.PI * 2, rr = Math.sqrt(hash2(seed, i)) * 0.85;
    const x = Math.cos(ang) * rx * rr, z = Math.sin(ang) * rz * rr;
    if (village && z > rz * 0.05 && Math.abs(x) < rx * 0.55) continue; // espaço do vilarejo (frente)
    const r = 0.7 + hash2(i, 9) * 0.6;
    const pink = hash2(i, 4) > 0.85;
    prims.push(new Sphere([x, top(x, z) + r * 0.55, z], r, foliage(RAMP(pink ? '#d6609a' : greens[i % 4], 0.8), seed + i)).setGroup(2));
  }
  if (village) {
    const cols = ['#f3eee4', '#f2d38a', '#f0b6a0', '#a8d8e0', '#f6e3c8', '#e9c0d8'];
    let k = 0;
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 2.0 + (row % 2) * 0.8 - 0.4, z = rz * (0.2 + row * 0.22);
      const y = top(x + 0.6, z + 0.5) - 0.15;
      const bw = 1.3, bd = 1.1, bh = 1.3 + hash2(k, 5) * 0.6;
      prims.push(new Box([x, y - 0.6, z], [x + bw, y + bh, z + bd], facade(RAMP(cols[k % cols.length], 0.5), [
        { face: 5, a0: 0.25, a1: 0.6, y0: 0.9, y1: 1.3, kind: 'win' }, { face: 5, a0: 0.8, a1: 1.1, y0: 0.6, y1: 1.4, kind: 'door', color: RAMP('#2a72b5') },
        { face: 1, a0: 0.3, a1: 0.7, y0: 0.9, y1: 1.3, kind: 'win' }])));
      prims.push(hipRoof([x - 0.12, y + bh, z - 0.12], [x + bw + 0.12, y + bh, z + bd + 0.12], 0.6, 0.55, roofTiles(TERRA)));
      k++;
    }
    // igrejinha
    const cx = 0.8, cz = rz * 0.05, cy = top(cx, cz);
    prims.push(new Box([cx, cy - 0.5, cz], [cx + 1.6, cy + 2.2, cz + 2.4], facade(WHITE, [{ face: 5, a0: 0.55, a1: 1.05, y0: 0.5, y1: 1.8, kind: 'door', color: RAMP('#2a72b5') }])));
    prims.push(gableRoof([cx - 0.1, cy + 2.2, cz - 0.1], [cx + 1.7, cy + 2.2, cz + 2.5], 0.9, 'z', roofTiles(TERRA)));
    prims.push(new Box([cx + 0.45, cy + 2.2, cz + 2.0], [cx + 1.15, cy + 4.0, cz + 2.6], facade(WHITE, [{ face: 5, a0: 0.2, a1: 0.5, y0: 1.0, y1: 1.5, kind: 'win' }])));
    prims.push(hipRoof([cx + 0.4, cy + 4.0, cz + 1.95], [cx + 1.2, cy + 4.0, cz + 2.65], 0.9, 0.4, roofTiles(TERRA)));
  }
  return R(prims, [], { shadow: false, colors: 48 });
}

// ---------------------------------------------------------------- ônibus (8 direções)
export function bus(dirIndex: number): Sprite {
  const vecs: [number, number][] = [[1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
  const [dx, dz] = vecs[dirIndex];
  const yaw = Math.atan2(-dz, dx);
  const Lh = 2.6, Wh = 0.66, Hh = 0.95;
  const body = RAMP('#f3f2ee', 0.45), stripe = RAMP('#1f6fb8', 0.6), yel = RAMP('#f2b632', 0.5);
  const bm: Material = (c) => {
    const lx = c.local[0], ly = c.local[1], lz = c.local[2];
    const f = c.face, L = c.level;
    const S = (r: RGB[], s = 0) => ({ ramp: r, idx: Math.max(0, Math.min(4, L + s)) });
    if (f === 3) return S(body, Math.floor(lx * 1.5) % 2 ? 0 : -1);
    if (f === 1 || f === 0) {
      const front = f === 1;
      if (ly > 0.95 && ly < 1.7 && lz > 0.1 && lz < Wh * 2 - 0.1) return front ? { ramp: RAMP('#ffe6c0', 0.4), idx: 2, emissive: true } : S(RAMP('#2c3446'));
      if (ly > 0.3 && ly < 0.45 && (lz < 0.28 || lz > Wh * 2 - 0.28)) return { ramp: RAMP(front ? '#fff4c0' : '#e2453c', 0.3), idx: 4, emissive: true };
      if (front && ly > 1.74 && ly < 1.84 && lz > 0.25 && lz < Wh * 2 - 0.25) return { ramp: RAMP('#ffb347', 0.3), idx: 4, emissive: true };
      return ly < 0.8 && ly > 0.6 ? S(stripe) : S(body);
    }
    if (ly > 0.95 && ly < 1.65 && lx > 0.3 && lx < Lh * 2 - 0.25) {
      const w = (lx - 0.3) % 0.8;
      if (w < 0.07) return S(body, -1);
      return { ramp: ((lx - ly) * 2.5) % 1 < 0.12 ? RAMP('#ffe8c8', 0.3) : LIT, idx: 3, emissive: true };
    }
    if (f === 5 && lx > Lh * 2 - 0.85 && lx < Lh * 2 - 0.3 && ly > 0.15 && ly < 1.65) return S(GRAPHITE, (lx * 10) % 1 < 0.1 ? -1 : 0);
    if (ly > 0.6 && ly < 0.85) return S(stripe);
    if (ly > 0.5 && ly < 0.6) return S(yel);
    if (ly < 0.2) return S(GRAPHITE);
    return S(body);
  };
  const prims: Prim[] = [new OBox([0, Hh + 0.22, 0], [Lh, Hh, Wh], yaw, bm)];
  for (const lx of [-Lh + 0.65, Lh - 0.75]) for (const lz of [-Wh + 0.05, Wh - 0.05]) {
    prims.push(new Sphere(rotY([lx, 0.3, lz], yaw), 0.3, flat(RAMP('#25262c'))));
  }
  return R(prims, [], { ambient: 0.42 });
}

void add; void mix; void hex; void gableRoof;

// ---------------------------------------------------------------- gaivota (4 quadros de batida de asa)
export function gull(frame: number): Sprite {
  const prims: Prim[] = [];
  const white = flat(RAMP('#f6f4ee', 0.4)), gray = flat(RAMP('#9aa3b0', 0.5)), dark = flat(RAMP('#3a3f4a', 0.5));
  const ang = [0.55, 0.15, -0.35, 0.1][frame % 4];
  prims.push(new Ellipsoid([0, 0, 0], [0.32, 0.1, 0.1], white, [norm([1, 0, -1]), [0, 1, 0], norm([1, 0, 1])]));
  prims.push(new Sphere([0.22, 0.05, -0.22], 0.08, white));
  prims.push(new Capsule([0.28, 0.05, -0.28], [0.36, 0.03, -0.36], 0.025, flat(RAMP('#f2a33a', 0.4))));
  for (const sd of [-1, 1]) {
    const dir = norm([sd * 0.7, Math.sin(ang), sd * 0.7]);
    const c: V3 = [dir[0] * 0.3, dir[1] * 0.3, dir[2] * 0.3];
    prims.push(new Ellipsoid(c, [0.34, 0.025, 0.11], gray, [dir, norm([-dir[0] * dir[1], 1 - dir[1] * dir[1], -dir[2] * dir[1]]), norm([1, 0, -1])]));
    prims.push(new Sphere([dir[0] * 0.6, dir[1] * 0.6, dir[2] * 0.6], 0.05, dark));
  }
  return R(prims, [], { shadow: false, colors: 12, ss: 3 });
}

/** marcador de interação (balão com reticências) — 2D, 30×32 px */
export function marker(frame: number): Image {
  const img: Image = { w: 30, h: 32, ox: 15, oy: 32, data: new Uint8ClampedArray(30 * 32 * 4) };
  const set = (x: number, y: number, c: RGB) => { const i = (y * 30 + x) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255; };
  const ed: RGB = [24, 70, 52], bg: RGB = [255, 255, 255], bg2: RGB = [222, 240, 230], ac: RGB = [43, 182, 115];
  for (let y = 0; y < 24; y++) for (let x = 0; x < 30; x++) {
    const dx = Math.max(0, Math.abs(x - 14.5) - 9), dy = Math.max(0, Math.abs(y - 11.5) - 6);
    const d = Math.hypot(dx, dy);
    if (d < 5.2) set(x, y, d > 4 ? ed : y > 17 ? bg2 : bg);
  }
  for (let i = 0; i < 6; i++) for (let x = 12 + Math.floor(i / 2); x <= 17 - Math.ceil(i / 2); x++) set(x, 24 + i, x === 12 + Math.floor(i / 2) || x === 17 - Math.ceil(i / 2) || i === 5 ? ed : bg2);
  [8, 14, 20].forEach((x, i) => {
    const up = frame === i ? 2 : 0;
    for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) set(x + xx - 1, 11 - up + yy - 1, ac);
  });
  return img;
}
