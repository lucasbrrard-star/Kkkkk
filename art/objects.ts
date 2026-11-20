// Modelos 3D dos objetos do mundo (casas, vegetação, mobiliário urbano, ônibus)
// renderizados como sprites isométricos com sombra projetada separada.

import { RGB, hex, mix, ramp } from './color';
import { renderHD } from './hd';
import { hash3, vnoise3, hash2 } from './noise';
import {
  Box, Capsule, Cylinder, Ellipsoid, Image, Material, OBox, Prim, ShadeCtx, Sphere, V3, add, gableRoof, hipRoof,
  mat, mul, newImage, norm, render, rotY, setPx, trim,
} from './rt';

export interface Sprite { img: Image; shadow?: Image }

// ------------------------------------------------------------------ fachadas
type Face = 1 | 5 | 0 | 4;
interface Feat { face: Face; a0: number; a1: number; y0: number; y1: number; kind: 'win' | 'door' | 'glass' | 'garage' | 'plainwin' | 'vent' | 'sign' }

const GLASS = ramp('#5e93b3', { spread: 0.9 });
const GLASS_DARK = ramp('#3c5f7a', { spread: 0.8 });
const WHITE = ramp('#f2efe8', { spread: 0.45 });
const WOOD = ramp('#8a5634', { spread: 0.7 });
const WOOD_LIGHT = ramp('#b98451', { spread: 0.6 });
const METAL = ramp('#4a4f5c', { spread: 0.6 });
const GOLD = ramp('#e2b64a', { spread: 0.5 });

function grit(p: V3, seed: number, pct = 0.025): number {
  return hash3(Math.floor(p[0] * 22), Math.floor(p[1] * 20), Math.floor(p[2] * 22), seed) < pct ? -1 : 0;
}

function facade(base: RGB[], feats: Feat[], o: { shutter?: RGB[]; barra?: RGB[]; barraH?: number; seed?: number; frame?: RGB[]; siding?: boolean } = {}): Material {
  const frame = o.frame ?? WHITE;
  return mat(base, (c: ShadeCtx) => {
    const f = c.face;
    const a = f === 5 || f === 4 ? c.local[0] : c.local[2];
    const y = c.local[1];
    for (const ft of feats) {
      if (ft.face !== f) continue;
      const { a0, a1, y0, y1 } = ft;
      if (ft.kind === 'win' || ft.kind === 'plainwin') {
        const sw = ft.kind === 'win' ? 0.24 : 0;
        if (y >= y0 && y <= y1 && a >= a0 - sw && a <= a1 + sw) {
          if (a < a0 || a > a1) {
            // venezianas
            const slat = (y * 18) % 1 < 0.35 ? -1 : 0;
            return { ramp: o.shutter ?? ramp('#3d7db0'), shift: slat + (Math.abs(a - a0) < 0.03 || Math.abs(a - a1) < 0.03 ? -1 : 0) };
          }
          const fw = 0.07;
          if (a < a0 + fw || a > a1 - fw || y < y0 + fw || y > y1 - fw) return { ramp: frame, shift: 0 };
          const mid = (a0 + a1) / 2;
          if (Math.abs(a - mid) < 0.035) return { ramp: frame, shift: -1 };
          if (Math.abs(y - (y0 + (y1 - y0) * 0.55)) < 0.03) return { ramp: frame, shift: -1 };
          const refl = ((a - y * 0.7) * 2.2 % 1 + 1) % 1 < 0.16 ? 2 : 0;
          return { ramp: y > y1 - 0.25 ? GLASS_DARK : GLASS, shift: refl - (c.level > 2 ? 1 : 0) };
        }
        if (y < y0 && y > y0 - 0.07 && a > a0 - 0.1 && a < a1 + 0.1) return { ramp: frame, shift: 1 };
      }
      if (ft.kind === 'glass' && y >= y0 && y <= y1 && a >= a0 && a <= a1) {
        const fw = 0.05;
        const n = Math.max(1, Math.round((a1 - a0) / 0.8));
        const seg = (a - a0) / ((a1 - a0) / n);
        const fs = seg % 1;
        if (a < a0 + fw || a > a1 - fw || y < y0 + fw || y > y1 - fw || fs < 0.04 || fs > 0.96) return { ramp: METAL, shift: 0 };
        const refl = ((a - y * 0.8) * 1.6 % 1 + 1) % 1;
        const warm = y < y0 + (y1 - y0) * 0.35 && hash2(Math.floor(seg), 1, 3) > 0.5;
        if (warm) return { ramp: ramp('#e9cf98', { spread: 0.5 }), shift: 0 };
        return { ramp: GLASS, shift: refl < 0.12 ? 2 : refl < 0.2 ? 1 : -1 };
      }
      if (ft.kind === 'door' && y >= y0 && y <= y1 && a >= a0 - 0.08 && a <= a1 + 0.08) {
        if (a < a0 || a > a1 || y > y1 - 0.08) return { ramp: frame, shift: 0 };
        if (Math.abs(a - (a1 - 0.14)) < 0.05 && Math.abs(y - 0.85) < 0.05) return { ramp: GOLD, shift: 1 };
        const pa = (a - a0) / (a1 - a0), py = (y - y0) / (y1 - y0);
        const inPanel = (pa > 0.18 && pa < 0.82) && ((py > 0.1 && py < 0.45) || (py > 0.55 && py < 0.88));
        const edge = inPanel && (pa < 0.23 || pa > 0.77 || Math.abs(py - 0.1) < 0.04 || Math.abs(py - 0.55) < 0.04);
        return { ramp: WOOD, shift: edge ? -1 : inPanel ? 0 : 1 };
      }
      if (ft.kind === 'garage' && y >= y0 && y <= y1 && a >= a0 && a <= a1) {
        if (a < a0 + 0.06 || a > a1 - 0.06 || y > y1 - 0.06) return { ramp: METAL, shift: -1 };
        return { ramp: ramp('#b9bcc4', { spread: 0.5 }), shift: (y * 9) % 1 < 0.25 ? -1 : 0 };
      }
      if (ft.kind === 'vent' && y >= y0 && y <= y1 && a >= a0 && a <= a1) {
        return { ramp: frame, shift: (y * 25) % 1 < 0.4 ? -1 : 0 };
      }
    }
    if (o.barra && y < (o.barraH ?? 0.28)) return { ramp: o.barra, shift: y > (o.barraH ?? 0.28) - 0.05 ? 1 : 0 };
    if (o.siding) return { shift: (y * 6) % 1 < 0.12 ? -1 : 0 };
    return grit(c.p, o.seed ?? 1);
  });
}

function roofTiles(r: RGB[], axis: 'x' | 'z', gable?: RGB[]): Material {
  return mat(r, (c) => {
    const n = c.n;
    if (Math.abs(n[1]) < 0.05) {
      // empena: parede com acabamento branco junto às águas
      if (gable && c.p[1] > 0) return { ramp: gable, shift: 0 };
      return { ramp: WHITE, shift: -1 };
    }
    const along = axis === 'x' ? c.p[0] : c.p[2];
    const row = Math.floor(c.p[1] * 7.5);
    const fr = (c.p[1] * 7.5) % 1;
    const off = row % 2 ? 0.5 : 0;
    const col = (along * 5 + off) % 1;
    let s = 0;
    if (fr < 0.22) s = -1;
    else if (col < 0.14) s = -1;
    else if (fr > 0.75) s = 1;
    if (hash2(row, Math.floor(along * 5 + off), 77) > 0.9) s -= 1;
    return s;
  });
}

function flat(r: RGB[], seed = 0): Material { return mat(r, (c) => grit(c.p, seed, 0.04)); }

/** Escala única de todos os objetos do mundo (1 unidade do modelo = OBJ_SCALE tiles). */
export const OBJ_SCALE = 1.4;

function rs(prims: Prim[], shadow = true, opts: { ambient?: number } = {}): Sprite {
  // pipeline HD (luz de fim de tarde, paleta reduzida); 1 unidade do modelo = OBJ_SCALE tiles de 64×32
  const res = renderHD(prims, [], { scale: 2 * OBJ_SCALE, ss: 3, shadow, colors: 32, ambient: opts.ambient });
  const img = trim(res.img);
  const sh = res.shadow ? trim(res.shadow) : undefined;
  return { img, shadow: sh };
}

// ------------------------------------------------------------------ casas
export function housePopular(): Sprite {
  const W = 4, D = 3, H = 2.3;
  const wall = ramp('#efcf7c', { spread: 0.7 });
  const feats: Feat[] = [
    { face: 5, a0: 0.75, a1: 1.55, y0: 0, y1: 1.75, kind: 'door' },
    { face: 5, a0: 2.3, a1: 3.35, y0: 0.85, y1: 1.7, kind: 'win' },
    { face: 1, a0: 0.75, a1: 1.6, y0: 0.85, y1: 1.7, kind: 'win' },
    { face: 1, a0: 2.15, a1: 2.6, y0: 1.3, y1: 1.75, kind: 'plainwin' },
  ];
  const prims: Prim[] = [];
  prims.push(new Box([0, 0, 0], [W, H, D], facade(wall, feats, { barra: ramp('#c99a55'), barraH: 0.3, shutter: ramp('#3a86b8') })));
  // empena (triângulo) — prisma com material de parede
  const gableWall = gableRoof([0, H, 0], [W, H, D], 1.0, 'x', mat(wall, (c) => grit(c.p, 3)));
  prims.push(gableWall);
  const roof = gableRoof([-0.18, H - 0.06, -0.32], [W + 0.18, H, D + 0.32], 1.22, 'x', roofTiles(ramp('#c4603a', { spread: 0.75 }), 'x', wall));
  // telhado como "casca": desloca para cima levemente
  roof.planes = roof.planes.map((p) => p);
  prims.push(roof);
  // caixa d'água
  prims.push(new Cylinder([W - 1.0, H + 0.6, D * 0.5 - 0.1], 0.32, 0.42, mat(ramp('#3f8fc4', { spread: 0.6 }), (c) => (c.local[1] > 0.36 ? 1 : 0))));
  // calçada da porta + degrau
  prims.push(new Box([0.6, 0, D], [1.7, 0.1, D + 0.35], flat(ramp('#bdb6a8'))));
  // luminária da varanda
  prims.push(new Sphere([1.85, 1.95, D + 0.05], 0.06, mat(ramp('#ffe9a8'), () => 2)));
  return rs(prims);
}

export function houseModern(): Sprite {
  const W = 5, D = 4;
  const white = ramp('#ecebe6', { spread: 0.5 });
  const gray = ramp('#5b6170', { spread: 0.6 });
  const prims: Prim[] = [];
  const feats1: Feat[] = [
    { face: 5, a0: 0.4, a1: 2.3, y0: 0, y1: 1.95, kind: 'garage' },
    { face: 5, a0: 2.9, a1: 3.55, y0: 0, y1: 2.0, kind: 'door' },
    { face: 1, a0: 0.5, a1: 3.4, y0: 0.15, y1: 2.05, kind: 'glass' },
  ];
  prims.push(new Box([0, 0, 0], [W, 2.4, D], facade(white, feats1, { frame: gray })));
  // revestimento de madeira (volume lateral)
  prims.push(new Box([3.75, 0, D - 0.02], [W, 2.4, D + 0.05], mat(WOOD_LIGHT, (c) => ((c.local[0] * 7) % 1 < 0.14 ? -1 : 0))));
  // laje entre pisos
  prims.push(new Box([-0.1, 2.4, -0.1], [W + 0.25, 2.58, D + 0.25], flat(gray)));
  // pavimento superior (balanço)
  const feats2: Feat[] = [
    { face: 5, a0: 0.5, a1: 3.4, y0: 2.75, y1: 4.25, kind: 'glass' },
    { face: 1, a0: 0.3, a1: 1.6, y0: 2.85, y1: 4.2, kind: 'glass' },
  ];
  prims.push(new Box([0.4, 2.58, 0], [W, 4.5, D - 0.6], facade(white, feats2.map((f) => ({ ...f, y0: f.y0 - 2.58, y1: f.y1 - 2.58 })), { frame: gray })));
  // varanda com guarda-corpo de vidro
  prims.push(new Box([0.4, 2.58, D - 0.6], [W, 2.62, D + 0.1], flat(gray)));
  prims.push(new Box([0.4, 2.62, D + 0.05], [W, 3.3, D + 0.1], mat(ramp('#9cc7d6', { spread: 0.5 }), (c) => (c.local[1] > 0.6 ? -2 : (c.local[0] * 3) % 1 < 0.06 ? -2 : 1))));
  // painel de madeira no andar superior
  prims.push(new Box([3.6, 2.58, 0], [W + 0.02, 4.5, D - 0.6], mat(WOOD_LIGHT, (c) => ((c.local[1] * 7) % 1 < 0.14 ? -1 : 0))));
  // platibanda / cobertura
  prims.push(new Box([0.3, 4.5, -0.1], [W + 0.12, 4.68, D - 0.48], flat(gray)));
  // brise / pergolado sobre a porta
  for (let i = 0; i < 5; i++) prims.push(new Box([2.75 + i * 0.18, 2.1, D], [2.82 + i * 0.18, 2.16, D + 0.6], flat(WOOD)));
  // jardineira
  prims.push(new Box([3.7, 0, D + 0.05], [W - 0.05, 0.35, D + 0.45], flat(gray)));
  for (let i = 0; i < 4; i++) prims.push(new Sphere([3.85 + i * 0.3, 0.42, D + 0.25], 0.17, foliage(ramp('#4f9a48'), 5 + i)));
  return rs(prims);
}

export function houseBeach(): Sprite {
  const W = 3.6, D = 4, H = 2.3;
  const wall = ramp('#f1ece0', { spread: 0.5 });
  const blue = ramp('#2f86b2', { spread: 0.7 });
  const feats: Feat[] = [
    { face: 1, a0: 1.6, a1: 2.4, y0: 0.3, y1: 2.0, kind: 'door' },
    { face: 1, a0: 0.45, a1: 1.15, y0: 1.0, y1: 1.8, kind: 'win' },
    { face: 1, a0: 2.85, a1: 3.55, y0: 1.0, y1: 1.8, kind: 'win' },
    { face: 5, a0: 0.6, a1: 1.5, y0: 1.0, y1: 1.8, kind: 'win' },
    { face: 5, a0: 2.2, a1: 2.8, y0: 1.2, y1: 1.8, kind: 'plainwin' },
  ];
  const prims: Prim[] = [];
  prims.push(new Box([0, 0, 0], [W, 0.3, D], flat(ramp('#9a8f80')))); // embasamento
  prims.push(new Box([0, 0.3, 0], [W, H, D], facade(wall, feats.map((f) => ({ ...f, y0: f.y0 - 0.3, y1: f.y1 - 0.3 })), { shutter: blue, frame: WHITE, siding: true })));
  // varanda (deck de madeira elevado)
  const deck = mat(WOOD_LIGHT, (c) => ((c.p[2] * 6) % 1 < 0.12 ? -1 : 0));
  prims.push(new Box([W, 0, 0.1], [W + 1.4, 0.3, D - 0.1], deck));
  // degraus
  prims.push(new Box([W + 1.4, 0, 1.6], [W + 1.7, 0.15, 2.4], deck));
  // pilares e guarda-corpo
  for (const z of [0.2, 1.55, 2.45, D - 0.2]) prims.push(new Box([W + 1.25, 0.3, z - 0.07], [W + 1.39, H + 0.2, z + 0.07], flat(WHITE)));
  for (const [z0, z1] of [[0.2, 1.55], [2.45, D - 0.2]]) {
    prims.push(new Box([W + 1.27, 0.85, z0], [W + 1.37, 0.92, z1], flat(WHITE)));
    for (let z = z0 + 0.15; z < z1 - 0.05; z += 0.2) prims.push(new Box([W + 1.29, 0.3, z - 0.025], [W + 1.35, 0.85, z + 0.025], flat(WHITE)));
  }
  // telhado de quatro águas cobrindo varanda
  prims.push(hipRoof([-0.25, H + 0.2, -0.3], [W + 1.6, H + 0.2, D + 0.3], 1.2, 1.25, roofTiles(ramp('#cf7445', { spread: 0.75 }), 'x')));
  prims.push(new Box([-0.1, H, -0.1], [W + 1.45, H + 0.2, D + 0.1], flat(WHITE)));
  // rede de descanso e vaso
  prims.push(new Capsule([W + 0.5, 1.2, 0.45], [W + 0.5, 1.2, 1.4], 0.08, mat(ramp('#e35d4f'), (c) => ((c.local[0] * 6) % 1 < 0.5 ? 0 : 1))));
  prims.push(new Cylinder([W + 1.0, 0.3, 3.4], 0.16, 0.3, flat(ramp('#b5603d'))));
  prims.push(new Sphere([W + 1.0, 0.75, 3.4], 0.25, foliage(ramp('#4d9a4a'), 9)));
  return rs(prims);
}

// ------------------------------------------------------------------ vegetação
export function foliage(r: RGB[], seed: number, flowers?: RGB[]): Material {
  return mat(r, (c) => {
    const n = vnoise3(c.p[0] * 6, c.p[1] * 6, c.p[2] * 6, seed);
    const m = vnoise3(c.p[0] * 13, c.p[1] * 13, c.p[2] * 13, seed + 9);
    let s = n > 0.62 ? 1 : n < 0.36 ? -1 : 0;
    if (m > 0.7) s += 1;
    if (m < 0.22) s -= 1;
    if (flowers && hash3(Math.floor(c.p[0] * 18), Math.floor(c.p[1] * 18), Math.floor(c.p[2] * 18), seed) > 0.8) {
      return { ramp: flowers, shift: s };
    }
    return s;
  });
}

const BARK = ramp('#7a5536', { spread: 0.7 });

export function palm(frame: number, frames: number, seed: number, height = 3.4): Sprite {
  const prims: Prim[] = [];
  const ph = (frame / frames) * Math.PI * 2;
  const sway = Math.sin(ph) * 0.08;
  const lean = 0.35 + (hash2(seed, 1) - 0.5) * 0.3;
  const leanDir = hash2(seed, 2) * Math.PI * 2;
  const trunkMat = mat(BARK, (c) => ((c.p[1] * 6) % 1 < 0.25 ? -1 : 0));
  const pts: V3[] = [];
  const N = 7;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const bend = (lean * t * t) + sway * t * t;
    pts.push([Math.cos(leanDir) * bend, t * height, Math.sin(leanDir) * bend]);
  }
  for (let i = 0; i < N; i++) prims.push(new Capsule(pts[i], pts[i + 1], 0.13 - i * 0.008, trunkMat).setGroup(1));
  const top = pts[N];
  // cocos
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + seed;
    prims.push(new Sphere(add(top, [Math.cos(a) * 0.12, -0.12, Math.sin(a) * 0.12]), 0.09, flat(ramp('#6d5a2e'))).setGroup(2));
  }
  const leaf = ramp('#4f9a3c', { spread: 0.85 });
  const leafMat = mat(leaf, (c) => {
    const s = Math.sin(c.local[0] * 40);
    return s > 0.6 ? 1 : s < -0.7 ? -1 : 0;
  });
  const NF = 9;
  for (let k = 0; k < NF; k++) {
    const a = (k / NF) * Math.PI * 2 + seed * 0.7 + Math.sin(ph + k) * 0.05;
    const dir: V3 = [Math.cos(a), 0, Math.sin(a)];
    const L = 1.35 + hash2(seed, k) * 0.35;
    const droop = 0.55 + hash2(k, seed) * 0.25 + Math.sin(ph + k * 0.9) * 0.06;
    let prev = add(top, [0, 0.04, 0]);
    const seg = 6;
    for (let i = 1; i <= seg; i++) {
      const t = i / seg;
      const p = add(top, add(mul(dir, L * t), [0, 0.28 * t - droop * t * t * 1.25, 0]));
      const w = 0.27 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.05;
      const mid = mul(add(prev, p), 0.5);
      const fwd = norm(add(p, mul(prev, -1)));
      const side = norm([-fwd[2], 0, fwd[0]]);
      const up = norm([fwd[1] * side[2] - fwd[2] * side[1], fwd[2] * side[0] - fwd[0] * side[2], fwd[0] * side[1] - fwd[1] * side[0]]);
      prims.push(new Ellipsoid(mid, [L / seg * 0.66, 0.05, w], leafMat, [fwd, up[1] < 0 ? mul(up, -1) : up, side]).setGroup(3 + k));
      prev = p;
    }
  }
  return rs(prims, true, { ambient: 0.38 });
}

export function tree(kind: 'ipe' | 'green', frame: number, seed: number): Sprite {
  const prims: Prim[] = [];
  const trunkMat = mat(BARK, (c) => grit(c.p, 5, 0.15));
  const h = kind === 'ipe' ? 1.6 : 1.4;
  prims.push(new Capsule([0, 0, 0], [0.05, h, 0.02], 0.13, trunkMat).setGroup(1));
  prims.push(new Capsule([0.05, h * 0.7, 0.02], [-0.45, h + 0.4, 0.25], 0.07, trunkMat).setGroup(1));
  prims.push(new Capsule([0.05, h * 0.75, 0.02], [0.45, h + 0.45, -0.2], 0.07, trunkMat).setGroup(1));
  const leaves = kind === 'ipe' ? ramp('#d9649a', { spread: 0.8 }) : ramp('#3f8a3e', { spread: 0.85 });
  const flowers = kind === 'ipe' ? ramp('#f3a5c8', { spread: 0.5 }) : undefined;
  const m = foliage(leaves, seed * 3 + frame * 101, flowers);
  const blobs: [V3, number][] = [
    [[0, h + 0.75, 0], 0.85], [[-0.55, h + 0.5, 0.35], 0.62], [[0.55, h + 0.55, -0.3], 0.62],
    [[0.35, h + 0.45, 0.5], 0.58], [[-0.4, h + 0.55, -0.45], 0.58], [[0.1, h + 1.2, 0.1], 0.55],
  ];
  blobs.forEach(([c, r], i) => {
    const jit: V3 = [(hash2(seed, i) - 0.5) * 0.15, Math.sin(frame * Math.PI + i) * 0.025, (hash2(i, seed) - 0.5) * 0.15];
    prims.push(new Sphere(add(c, jit), r, m).setGroup(2));
  });
  return rs(prims, true, { ambient: 0.36 });
}

export function bush(seed: number, flowers?: string): Sprite {
  const prims: Prim[] = [];
  const m = foliage(ramp('#478f3f', { spread: 0.8 }), seed, flowers ? ramp(flowers, { spread: 0.5 }) : undefined);
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + seed;
    prims.push(new Sphere([Math.cos(a) * 0.18, 0.28 + (i % 2) * 0.08, Math.sin(a) * 0.18], 0.3 - i * 0.02, m).setGroup(1));
  }
  return rs(prims);
}

export function hedge(len: number, axis: 'x' | 'z', seed: number): Sprite {
  const prims: Prim[] = [];
  const m = foliage(ramp('#3f8a3a', { spread: 0.8 }), seed);
  const n = Math.ceil(len / 0.32);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * (len / n);
    const c: V3 = axis === 'x' ? [t, 0.3, 0] : [0, 0.3, t];
    prims.push(new Sphere(c, 0.26 + hash2(i, seed) * 0.05, m).setGroup(1));
  }
  return rs(prims);
}

// ------------------------------------------------------------------ mobiliário urbano
export function lamp(on: boolean): Sprite {
  const pole = flat(ramp('#3b4a46', { spread: 0.6 }));
  const prims: Prim[] = [];
  prims.push(new Cylinder([0, 0, 0], 0.09, 0.18, pole));
  prims.push(new Cylinder([0, 0, 0], 0.05, 2.7, pole));
  prims.push(new Capsule([0, 2.7, 0], [0.12, 2.92, 0.12], 0.035, pole));
  prims.push(new Capsule([0.12, 2.92, 0.12], [0.42, 2.92, 0.42], 0.035, pole));
  prims.push(new Ellipsoid([0.44, 2.86, 0.44], [0.17, 0.08, 0.17], pole));
  prims.push(new Ellipsoid([0.44, 2.8, 0.44], [0.11, 0.05, 0.11], mat(ramp(on ? '#ffe7a0' : '#d8d3c0', { spread: 0.4 }), () => (on ? 3 : 1))).noCast());
  return rs(prims);
}

export function bench(axis: 'x' | 'z'): Sprite {
  const prims: Prim[] = [];
  const wood = mat(WOOD_LIGHT, (c) => grit(c.p, 2, 0.08));
  const iron = flat(ramp('#2f3640'));
  const L = 1.2;
  const B = (a: V3, b: V3, m: Material) => {
    prims.push(axis === 'x' ? new Box(a, b, m) : new Box([a[2], a[1], a[0]], [b[2], b[1], b[0]], m));
  };
  for (const x of [0.12, L - 0.12]) { B([x - 0.04, 0, -0.18], [x + 0.04, 0.4, 0.18], iron); B([x - 0.04, 0.4, -0.2], [x + 0.04, 0.8, -0.14], iron); }
  for (let i = 0; i < 3; i++) B([0, 0.38, -0.18 + i * 0.12], [L, 0.44, -0.08 + i * 0.12], wood);
  for (let i = 0; i < 2; i++) B([0, 0.52 + i * 0.14, -0.22], [L, 0.62 + i * 0.14, -0.16], wood);
  return rs(prims);
}

export function trashBin(): Sprite {
  const prims: Prim[] = [];
  prims.push(new Cylinder([0, 0, 0], 0.05, 0.5, flat(METAL)));
  prims.push(new Cylinder([0, 0.35, 0], 0.2, 0.5, mat(ramp('#e07b2f', { spread: 0.6 }), (c) => (c.local[1] > 0.43 ? 1 : c.local[1] < 0.06 ? -1 : 0))));
  prims.push(new Cylinder([0, 0.82, 0], 0.15, 0.03, flat(ramp('#3a3a42'))));
  return rs(prims);
}

export function busStop(): Sprite {
  // abrigo alinhado ao eixo z (paralelo à avenida); frente voltada para -x (rua)
  const prims: Prim[] = [];
  const steel = flat(ramp('#59656f', { spread: 0.6 }));
  const L = 2.2;
  for (const z of [0.1, L - 0.1]) prims.push(new Box([0.5, 0, z - 0.05], [0.6, 2.2, z + 0.05], steel));
  prims.push(new Box([-0.15, 2.2, -0.1], [0.75, 2.32, L + 0.1], mat(ramp('#2f8f7f', { spread: 0.6 }), (c) => (c.local[1] > 0.09 ? 1 : 0))));
  // painel de vidro traseiro
  prims.push(new Box([0.62, 0.35, 0.15], [0.66, 2.1, L - 0.15], mat(ramp('#a9d2df', { spread: 0.45 }), (c) => (((c.local[2] - c.local[1]) * 2) % 1 < 0.1 ? 2 : 0))));
  // banco
  prims.push(new Box([0.3, 0.42, 0.25], [0.6, 0.5, L - 0.25], flat(WOOD_LIGHT)));
  for (const z of [0.35, L - 0.35]) prims.push(new Box([0.4, 0, z - 0.04], [0.48, 0.42, z + 0.04], steel));
  // placa "P" de parada
  prims.push(new Cylinder([-0.1, 0, L + 0.35], 0.04, 2.3, steel));
  prims.push(new Box([-0.14, 1.8, L + 0.15], [-0.06, 2.3, L + 0.55], mat(ramp('#2d6fb5', { spread: 0.6 }), (c) => {
    const a = c.local[2], y = c.local[1];
    if (a < 0.04 || a > 0.36 || y < 0.04 || y > 0.46) return { ramp: WHITE, shift: 1 };
    // letra P simplificada
    const x = (a - 0.12) / 0.16, yy = (y - 0.1) / 0.3;
    if (x >= 0 && x <= 1 && yy >= 0 && yy <= 1) {
      if (x < 0.3) return { ramp: WHITE, shift: 2 };
      if (yy > 0.5 && (yy > 0.82 || yy < 0.62 || x > 0.75)) return { ramp: WHITE, shift: 2 };
    }
    return 0;
  })));
  return rs(prims);
}

export function streetSign(): Sprite {
  const prims: Prim[] = [];
  prims.push(new Cylinder([0, 0, 0], 0.04, 2.1, flat(ramp('#5a6068'))));
  const plate = mat(ramp('#2f7d4f', { spread: 0.6 }), (c) => {
    const y = c.local[1];
    if (y < 0.03 || y > 0.21) return { ramp: WHITE, shift: 1 };
    const a = c.face === 5 || c.face === 4 ? c.local[0] : c.local[2];
    return hash2(Math.floor(a * 18), Math.floor(y * 30), 3) > 0.6 && y > 0.08 && y < 0.16 ? { ramp: WHITE, shift: 2 } : 0;
  });
  prims.push(new Box([-0.05, 1.85, -0.5], [0.05, 2.09, 0.5], plate));
  prims.push(new Box([-0.5, 1.6, -0.05], [0.5, 1.84, 0.05], plate));
  return rs(prims);
}

export function lotSign(): Sprite {
  const prims: Prim[] = [];
  const wood = flat(WOOD);
  prims.push(new Box([-0.38, 0, -0.04], [-0.3, 1.3, 0.04], wood));
  prims.push(new Box([0.3, 0, -0.04], [0.38, 1.3, 0.04], wood));
  prims.push(new Box([-0.48, 0.65, -0.02], [0.48, 1.25, 0.04], mat(ramp('#f1ede2', { spread: 0.4 }), (c) => {
    const a = c.local[0], y = c.local[1];
    if (a < 0.05 || a > 0.91 || y < 0.05 || y > 0.55) return { ramp: ramp('#2e9a5c'), shift: 0 };
    // ícone de casa
    const x = a - 0.48, yy = y - 0.12;
    if (yy > 0.18 && yy < 0.36 && Math.abs(x) < 0.2 - (yy - 0.18)) return { ramp: ramp('#2e9a5c'), shift: 0 };
    if (yy >= 0.02 && yy <= 0.18 && Math.abs(x) < 0.13) return Math.abs(x) < 0.04 && yy < 0.12 ? { ramp: WHITE, shift: 1 } : { ramp: ramp('#2e9a5c'), shift: 0 };
    return 1;
  })));
  return rs(prims);
}

export function stake(): Sprite {
  const prims: Prim[] = [];
  prims.push(new Box([-0.05, 0, -0.05], [0.05, 0.45, 0.05], mat(WOOD_LIGHT, (c) => (c.local[1] > 0.35 ? { ramp: ramp('#e8553e'), shift: 0 } : 0))));
  return rs(prims);
}

export function fenceSeg(len: number, axis: 'x' | 'z', color = '#f0ebe0'): Sprite {
  const prims: Prim[] = [];
  const m = flat(ramp(color, { spread: 0.5 }));
  const n = Math.max(2, Math.round(len / 0.22));
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * len;
    const a: V3 = axis === 'x' ? [t - 0.035, 0, -0.035] : [-0.035, 0, t - 0.035];
    prims.push(new Box(a, add(a, [0.07, 0.62 + (i % 2 ? 0 : 0.05), 0.07]), m));
  }
  for (const y of [0.2, 0.48]) prims.push(axis === 'x' ? new Box([0, y, -0.02], [len, y + 0.06, 0.03], m) : new Box([-0.02, y, 0], [0.03, y + 0.06, len], m));
  return rs(prims);
}

export function lowWall(len: number, axis: 'x' | 'z', color: string): Sprite {
  const prims: Prim[] = [];
  const m = mat(ramp(color, { spread: 0.6 }), (c) => (c.local[1] > 0.52 ? 1 : grit(c.p, 4)));
  prims.push(axis === 'x' ? new Box([0, 0, -0.08], [len, 0.6, 0.08], m) : new Box([-0.08, 0, 0], [0.08, 0.6, len], m));
  return rs(prims);
}

export function mailbox(): Sprite {
  const prims: Prim[] = [];
  prims.push(new Box([-0.03, 0, -0.03], [0.03, 0.8, 0.03], flat(WOOD)));
  prims.push(new Box([-0.12, 0.8, -0.16], [0.12, 1.05, 0.16], flat(ramp('#d9483b'))));
  return rs(prims);
}

export function flowerPot(color: string, seed: number): Sprite {
  const prims: Prim[] = [];
  prims.push(new Cylinder([0, 0, 0], 0.17, 0.28, mat(ramp('#b9603e'), (c) => (c.local[1] > 0.22 ? 1 : 0))));
  prims.push(new Sphere([0, 0.42, 0], 0.22, foliage(ramp('#4c9444'), seed, ramp(color, { spread: 0.5 }))));
  return rs(prims);
}

export function umbrella(color: string, frame: number): Sprite {
  const prims: Prim[] = [];
  prims.push(new Capsule([0, 0, 0], [0.08, 1.75, 0.04], 0.03, flat(ramp('#e9e2d5'))));
  const c1 = ramp(color, { spread: 0.65 }), c2 = ramp('#f4f1ea', { spread: 0.45 });
  const top: V3 = [0.08, 1.95 + (frame % 2) * 0.015, 0.04];
  prims.push(new Ellipsoid(add(top, [0, -0.2, 0]), [0.95, 0.32, 0.95], mat(c1, (c) => {
    const ang = Math.atan2(c.p[2] - top[2], c.p[0] - top[0]);
    if (c.p[1] < top[1] - 0.42) return null;
    return Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 2 ? c2 : 0;
  })));
  return rs(prims, true, { ambient: 0.4 });
}

export function beachChair(color: string): Sprite {
  // espreguiçadeira: armação branca, lona listrada, encosto inclinado
  const prims: Prim[] = [];
  const frameM = flat(ramp('#e9e4da', { spread: 0.5 }));
  const cloth = mat(ramp(color, { spread: 0.6 }), (c) => ((c.p[2] * 7) % 1 < 0.5 ? 0 : { ramp: WHITE, shift: 0 }));
  prims.push(new Box([0, 0.2, 0.05], [0.85, 0.25, 0.5], cloth));
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const x = 0.85 + t * 0.3, y = 0.25 + t * 0.42;
    prims.push(new Capsule([x, y, 0.07], [x, y, 0.48], 0.045, cloth));
  }
  for (const z of [0.05, 0.5]) {
    prims.push(new Capsule([0.02, 0.0, z], [0.02, 0.22, z], 0.025, frameM));
    prims.push(new Capsule([0.8, 0.0, z], [0.8, 0.22, z], 0.025, frameM));
    prims.push(new Capsule([0.0, 0.22, z], [0.85, 0.22, z], 0.025, frameM));
    prims.push(new Capsule([0.85, 0.22, z], [1.17, 0.7, z], 0.025, frameM));
  }
  return rs(prims);
}

export function towel(color: string): Sprite {
  const prims: Prim[] = [];
  prims.push(new Box([0, 0, 0], [1.1, 0.03, 0.55], mat(ramp(color, { spread: 0.5 }), (c) => {
    const x = c.local[0];
    if (x < 0.06 || x > 1.04) return { ramp: WHITE, shift: 0 };
    return Math.floor(x * 6) % 2 ? { ramp: ramp('#f6e7b0', { spread: 0.4 }), shift: 0 } : 0;
  })));
  return rs(prims, false);
}

export function rock(seed: number, size = 1): Sprite {
  const prims: Prim[] = [];
  const m = mat(ramp('#8a8a8c', { spread: 0.75 }), (c) => (vnoise3(c.p[0] * 7, c.p[1] * 7, c.p[2] * 7, seed) > 0.6 ? 1 : 0));
  const n = 3;
  for (let i = 0; i < n; i++) {
    const a = seed + i * 2.2;
    prims.push(new Ellipsoid([Math.cos(a) * 0.25 * size, 0.1 * size, Math.sin(a) * 0.22 * size], [0.38 * size * (1 - i * 0.2), 0.3 * size * (1 - i * 0.2), 0.32 * size], m));
  }
  return rs(prims);
}

export function fountain(frame: number): Sprite {
  const prims: Prim[] = [];
  const stone = mat(ramp('#d8d0c0', { spread: 0.5 }), (c) => grit(c.p, 7, 0.1));
  prims.push(new Cylinder([0, 0, 0], 1.0, 0.42, stone));
  const water = ramp('#4fb2cf', { spread: 0.6 });
  prims.push(new Cylinder([0, 0, 0], 0.86, 0.44, mat(water, (c) => {
    const r = Math.hypot(c.local[0], c.local[2]);
    return Math.sin(r * 22 - frame * 2.1) > 0.6 ? 2 : 0;
  })));
  prims.push(new Cylinder([0, 0.4, 0], 0.12, 0.6, stone));
  prims.push(new Cylinder([0, 1.0, 0], 0.38, 0.1, stone));
  // jato d'água
  const jet = mat(ramp('#bfe8f2', { spread: 0.4 }), () => 1);
  prims.push(new Capsule([0, 1.05, 0], [0, 1.45 + (frame % 2) * 0.06, 0], 0.05, jet).noCast());
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + frame * 0.3;
    prims.push(new Sphere([Math.cos(a) * 0.32, 0.75 - (frame % 3) * 0.08, Math.sin(a) * 0.32], 0.035, jet).noCast());
  }
  return rs(prims);
}

export function kioskCart(): Sprite {
  // carrinho de água de coco
  const prims: Prim[] = [];
  prims.push(new Box([-0.5, 0.35, -0.35], [0.5, 1.0, 0.35], mat(ramp('#3fa14a', { spread: 0.6 }), (c) => (c.local[1] > 0.55 ? { ramp: WHITE, shift: 0 } : 0))));
  for (const z of [-0.36, 0.36]) prims.push(new Cylinder([0, 0, z], 0.2, 0.05, flat(METAL)));
  prims.push(new Ellipsoid([0, 0.38, -0.36], [0.24, 0.24, 0.05], flat(ramp('#2a2a30'))));
  prims.push(new Ellipsoid([0, 0.38, 0.36], [0.24, 0.24, 0.05], flat(ramp('#2a2a30'))));
  for (let i = 0; i < 6; i++) prims.push(new Sphere([-0.3 + (i % 3) * 0.3, 1.1 + Math.floor(i / 3) * 0.1, -0.12 + Math.floor(i / 3) * 0.2], 0.12, flat(ramp('#6fae3e'))));
  prims.push(new Capsule([0.45, 1.0, 0.3], [0.45, 2.0, 0.3], 0.025, flat(ramp('#ddd'))));
  prims.push(new Ellipsoid([0.45, 2.0, 0.3], [0.65, 0.18, 0.65], mat(ramp('#f2c94c'), (c) => (Math.floor(Math.atan2(c.p[2] - 0.3, c.p[0] - 0.45) * 2.5) % 2 ? 1 : -1))));
  return rs(prims);
}

// ------------------------------------------------------------------ ônibus (8 direções)
export function bus(dirIndex: number): Sprite {
  // direção: 0=S(+x+z) … mesma ordem dos DIRS do personagem
  const vecs: [number, number][] = [[1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
  const [dx, dz] = vecs[dirIndex];
  const yaw = Math.atan2(-dz, dx); // rotY: local +x -> (cos, -sin)
  const Lh = 1.7, Wh = 0.48, Hh = 0.62;
  const body = ramp('#f1f1ee', { spread: 0.45 });
  const stripe = ramp('#1f7fbf', { spread: 0.6 });
  const prims: Prim[] = [];
  const bodyMat = mat(body, (c) => {
    const lx = c.local[0], ly = c.local[1], lz = c.local[2];
    const f = c.face;
    if (f === 3) return ly > 0 ? { ramp: body, shift: (Math.floor(lx * 2) % 2 ? 0 : -1) } : 0; // teto
    if (f === 1 || f === 0) {
      // frente/traseira
      const isFront = f === 1;
      const a = lz;
      if (ly > 0.55 && ly < 1.1 && a > 0.08 && a < Wh * 2 - 0.08) return { ramp: isFront ? GLASS : GLASS_DARK, shift: isFront ? 1 : 0 };
      if (ly > 0.22 && ly < 0.34 && (a < 0.2 || a > Wh * 2 - 0.2)) return { ramp: ramp(isFront ? '#fff2b0' : '#d9483b'), shift: 2 };
      if (isFront && ly > 1.12 && ly < 1.2 && a > 0.2 && a < Wh * 2 - 0.2) return { ramp: ramp('#ffb347'), shift: 1 };
      return ly < 0.5 && ly > 0.38 ? { ramp: stripe, shift: 0 } : 0;
    }
    if (f === 5 || f === 4) {
      // laterais: janelas
      if (ly > 0.6 && ly < 1.08 && lx > 0.25 && lx < Lh * 2 - 0.2) {
        const w = (lx - 0.25) % 0.55;
        if (w < 0.06) return { ramp: body, shift: -1 };
        return { ramp: GLASS_DARK, shift: ((lx - ly) * 3) % 1 < 0.15 ? 2 : 0 };
      }
      if (f === 5 && lx > Lh * 2 - 0.55 && lx < Lh * 2 - 0.15 && ly > 0.12 && ly < 1.08) return { ramp: GLASS, shift: -1 }; // porta
      if (ly > 0.32 && ly < 0.5) return { ramp: stripe, shift: 0 };
      if (ly < 0.14) return { ramp: METAL, shift: 0 };
    }
    return 0;
  });
  prims.push(new OBox([0, Hh + 0.14, 0], [Lh, Hh, Wh], yaw, bodyMat));
  // rodas
  const wheel = flat(ramp('#25262c'));
  for (const lx of [-Lh + 0.45, Lh - 0.5]) for (const lz of [-Wh, Wh]) {
    const p = rotY([lx, 0.2, lz], yaw);
    prims.push(new Sphere(p, 0.2, wheel));
  }
  return rs(prims, true, { ambient: 0.4 });
}

// ------------------------------------------------------------------ 2D: pássaros, marcador, brilho
export function seagull(frame: number): Image {
  const img = newImage(13, 7);
  const w = hex('#f5f5f2'), g = hex('#9aa3ad'), d = hex('#3a3f48'), o = hex('#e8a23a');
  const wingY = [[2, 1, 0, 1, 2], [1, 1, 1, 1, 1], [3, 2, 2, 2, 3], [2, 1, 1, 1, 2]][frame % 4];
  // corpo
  for (let x = 5; x <= 8; x++) setPx(img, x, 4, w);
  setPx(img, 9, 3, w); setPx(img, 10, 3, o); setPx(img, 5, 5, g); setPx(img, 6, 5, g);
  // asas
  for (let i = 0; i < 5; i++) {
    setPx(img, 5 - i, 3 - (2 - wingY[i]) + 1, i === 4 ? d : g);
    setPx(img, 7 + i - 1, 3 - (2 - wingY[i]) + 1, i === 4 ? d : w);
  }
  return img;
}

export function marker(frame: number): Image {
  // balão de interação com reticências
  const img = newImage(15, 15);
  const bg = hex('#ffffff'), ed = hex('#1d2433'), ac = hex('#2bb673');
  for (let y = 1; y < 10; y++) for (let x = 1; x < 14; x++) {
    const corner = (x === 1 || x === 13) && (y === 1 || y === 9);
    if (!corner) setPx(img, x, y, bg);
  }
  for (let x = 2; x < 13; x++) { setPx(img, x, 0, ed); setPx(img, x, 10, ed); }
  for (let y = 2; y < 9; y++) { setPx(img, 0, y, ed); setPx(img, 14, y, ed); }
  setPx(img, 1, 1, ed); setPx(img, 13, 1, ed); setPx(img, 1, 9, ed); setPx(img, 13, 9, ed);
  for (let i = 0; i < 3; i++) setPx(img, 6 + i, 11 + i, ed), setPx(img, 7 + i - 1, 10 + i, bg);
  setPx(img, 7, 11, bg);
  const dots = [4, 7, 10];
  dots.forEach((x, i) => {
    const up = frame === i ? 1 : 0;
    setPx(img, x, 5 - up, ac); setPx(img, x + 1, 5 - up, ac); setPx(img, x, 4 - up, ac); setPx(img, x + 1, 4 - up, ac);
  });
  return img;
}

export function glow(radius: number, color: string): Image {
  const s = radius * 2 + 1;
  const img = newImage(s, s);
  const c = hex(color);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.hypot((x - radius) / radius, (y - radius) / (radius * 0.6));
    if (d > 1) continue;
    const a = (1 - d) ** 1.6;
    const q = Math.round(a * 4) / 4; // quantizado para manter estética pixel
    if (q <= 0) continue;
    setPx(img, x, y, mix(c, [255, 255, 255], q * 0.3), Math.round(q * 150));
  }
  return img;
}

export function blobShadow(w: number, h: number): Image {
  const img = newImage(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2));
    if (d > 1) continue;
    setPx(img, x, y, [20, 18, 48], d < 0.7 ? 110 : 70);
  }
  return img;
}
