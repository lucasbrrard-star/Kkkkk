// Mini "renderizador de produção" de sprites isométricos.
// Funciona como a etapa Blender → sprite do pipeline: modelamos objetos com
// primitivas 3D simples, renderizamos com câmera ortográfica dimétrica 2:1
// (elevação de 30°), aplicamos iluminação quantizada em rampas de cor
// (cel shading), sombras projetadas, contorno seletivo (sel-out) e linhas
// internas por descontinuidade de profundidade. O resultado é pixel art
// nativa (1 texel = 1 pixel lógico), sem filtros de pixelização.

import { RGB, darken, mix } from './color';

export type V3 = [number, number, number];

// --- Projeção ---------------------------------------------------------------
// Unidade do mundo = 1 tile. Tile = 32×16 px. Altura: 19.6 px por unidade (cos30 · 32/√2).
export const TW = 32;
export const TH = 16;
export const HU = 19.6;

// Câmera configurável: KD = px por unidade de (x+z), KV = px por unidade de altura.
// Padrão = dimétrica 2:1 (elevação 30°). Personagens usam elevação menor (mais frontal).
export const CAM = { KD: TH / 2, KV: HU };
export let VIEW: V3 = norm([-1, -2 * CAM.KD / CAM.KV, -1]);
export function setCameraElevation(deg: number) {
  const s = 32 / Math.SQRT2; // px por unidade no plano de projeção
  const e = deg * Math.PI / 180;
  CAM.KD = (s / Math.SQRT2) * Math.sin(e);
  CAM.KV = s * Math.cos(e);
  VIEW = norm([-1, -2 * CAM.KD / CAM.KV, -1]);
}
export function resetCamera() { CAM.KD = TH / 2; CAM.KV = HU; VIEW = norm([-1, -2 * CAM.KD / CAM.KV, -1]); }

export function project(p: V3): [number, number] {
  // x = eixo tile X (vai para baixo-direita), z = eixo tile Y (vai para baixo-esquerda), y = altura
  return [(p[0] - p[2]) * (TW / 2), (p[0] + p[2]) * CAM.KD - p[1] * CAM.KV];
}

export const LIGHT: V3 = norm([0.23, 0.83, 0.507]);

// --- Vetores ----------------------------------------------------------------
export function add(a: V3, b: V3): V3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function sub(a: V3, b: V3): V3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function mul(a: V3, s: number): V3 { return [a[0] * s, a[1] * s, a[2] * s]; }
export function dot(a: V3, b: V3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function len(a: V3): number { return Math.hypot(a[0], a[1], a[2]); }
export function norm(a: V3): V3 { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

// --- Materiais --------------------------------------------------------------
export interface ShadeCtx {
  p: V3;          // ponto de impacto (mundo)
  n: V3;          // normal
  level: number;  // nível de luz quantizado 0..4
  light: number;  // luz contínua 0..1
  lit: boolean;   // não está em sombra
  local: V3;      // ponto em coordenadas locais da primitiva
  face: number;   // face (caixas: 0..5)
}

export interface ShadeOut { ramp: RGB[]; idx: number; emissive?: boolean }

export type Material = (c: ShadeCtx) => ShadeOut | null;

/** Material simples a partir de uma rampa (com padrão opcional que desloca o tom). */
export function mat(r: RGB[], pattern?: (c: ShadeCtx) => number | RGB[] | { ramp?: RGB[]; shift?: number } | null): Material {
  return (c) => {
    let rr = r;
    let shift = 0;
    if (pattern) {
      const res = pattern(c);
      if (res === null) return null;
      if (typeof res === 'number') shift = res;
      else if (Array.isArray(res)) rr = res as RGB[];
      else { if (res.ramp) rr = res.ramp; if (res.shift) shift = res.shift; }
    }
    return { ramp: rr, idx: Math.max(0, Math.min(rr.length - 1, c.level + shift)) };
  };
}

// --- Primitivas -------------------------------------------------------------
export interface HitRec { t: number; n: V3; local: V3; face: number }

export abstract class Prim {
  mat: Material;
  group = 0;
  cast = true;          // projeta sombra
  receive = true;       // recebe sombra
  outlineBias = 0;
  boundC: V3 = [0, 0, 0];
  boundR = 0;
  constructor(m: Material) { this.mat = m; }
  abstract hit(o: V3, d: V3): HitRec | null;
  abstract aabb(): [V3, V3];
  setGroup(g: number) { this.group = g; return this; }
  noCast() { this.cast = false; return this; }
  computeBound() {
    const [a, b] = this.aabb();
    this.boundC = mul(add(a, b), 0.5);
    this.boundR = len(sub(b, a)) / 2 + 1e-3;
  }
  quickReject(o: V3, d: V3): boolean {
    const oc = sub(o, this.boundC);
    const b = dot(oc, d);
    const c = dot(oc, oc) - this.boundR * this.boundR;
    return b * b - c < 0;
  }
}

export class Sphere extends Prim {
  constructor(public c: V3, public r: number, m: Material) { super(m); }
  hit(o: V3, d: V3): HitRec | null {
    const oc = sub(o, this.c);
    const b = dot(oc, d);
    const c = dot(oc, oc) - this.r * this.r;
    const h = b * b - c;
    if (h < 0) return null;
    const t = -b - Math.sqrt(h);
    if (t < 1e-4) return null;
    const p = add(o, mul(d, t));
    const l = sub(p, this.c);
    return { t, n: mul(l, 1 / this.r), local: l, face: 0 };
  }
  aabb(): [V3, V3] { const r = this.r; return [sub(this.c, [r, r, r]), add(this.c, [r, r, r])]; }
}

/** Elipsoide orientado: base ortonormal (u,v,w) com raios (a,b,c). */
export class Ellipsoid extends Prim {
  u: V3; v: V3; w: V3;
  constructor(public c: V3, public rad: V3, m: Material, basis?: [V3, V3, V3]) {
    super(m);
    [this.u, this.v, this.w] = basis ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  }
  hit(o: V3, d: V3): HitRec | null {
    const oc = sub(o, this.c);
    const lo: V3 = [dot(oc, this.u) / this.rad[0], dot(oc, this.v) / this.rad[1], dot(oc, this.w) / this.rad[2]];
    const ld: V3 = [dot(d, this.u) / this.rad[0], dot(d, this.v) / this.rad[1], dot(d, this.w) / this.rad[2]];
    const a = dot(ld, ld);
    const b = dot(lo, ld);
    const c = dot(lo, lo) - 1;
    const h = b * b - a * c;
    if (h < 0) return null;
    const t = (-b - Math.sqrt(h)) / a;
    if (t < 1e-4) return null;
    const lp = add(lo, mul(ld, t));
    const nl: V3 = [lp[0] / this.rad[0], lp[1] / this.rad[1], lp[2] / this.rad[2]];
    const n = norm(add(add(mul(this.u, nl[0]), mul(this.v, nl[1])), mul(this.w, nl[2])));
    return { t, n, local: [lp[0] * this.rad[0], lp[1] * this.rad[1], lp[2] * this.rad[2]], face: 0 };
  }
  aabb(): [V3, V3] {
    const m = Math.max(...this.rad);
    return [sub(this.c, [m, m, m]), add(this.c, [m, m, m])];
  }
}

/** Cápsula entre a e b com raio r (fórmula de I. Quilez). */
export class Capsule extends Prim {
  constructor(public a: V3, public b: V3, public r: number, m: Material) { super(m); }
  hit(ro: V3, rd: V3): HitRec | null {
    const pa = this.a, pb = this.b, ra = this.r;
    const ba = sub(pb, pa), oa = sub(ro, pa);
    const baba = dot(ba, ba), bard = dot(ba, rd), baoa = dot(ba, oa);
    const rdoa = dot(rd, oa), oaoa = dot(oa, oa);
    const a = baba - bard * bard;
    let b = baba * rdoa - baoa * bard;
    let c = baba * oaoa - baoa * baoa - ra * ra * baba;
    let h = b * b - a * c;
    let t = -1;
    if (h >= 0 && a > 1e-9) {
      t = (-b - Math.sqrt(h)) / a;
      const y = baoa + t * bard;
      if (!(y > 0 && y < baba)) t = -1;
    }
    if (t < 0) {
      // tampas esféricas
      const oc = h >= 0 || a <= 1e-9 ? null : null;
      void oc;
      const tryCap = (cen: V3) => {
        const o2 = sub(ro, cen);
        const bb = dot(rd, o2);
        const cc = dot(o2, o2) - ra * ra;
        const hh = bb * bb - cc;
        if (hh < 0) return -1;
        return -bb - Math.sqrt(hh);
      };
      const t1 = tryCap(pa), t2 = tryCap(pb);
      t = Infinity;
      if (t1 > 1e-4) t = t1;
      if (t2 > 1e-4 && t2 < t) t = t2;
      if (!isFinite(t)) return null;
    }
    if (t < 1e-4) return null;
    const p = add(ro, mul(rd, t));
    const pa2 = sub(p, pa);
    const hcl = Math.max(0, Math.min(1, dot(pa2, ba) / baba));
    const n = norm(sub(pa2, mul(ba, hcl)));
    return { t, n, local: [hcl, p[1] - pa[1], 0], face: 0 };
    void b; void c; void h;
  }
  aabb(): [V3, V3] {
    const r = this.r;
    return [
      [Math.min(this.a[0], this.b[0]) - r, Math.min(this.a[1], this.b[1]) - r, Math.min(this.a[2], this.b[2]) - r],
      [Math.max(this.a[0], this.b[0]) + r, Math.max(this.a[1], this.b[1]) + r, Math.max(this.a[2], this.b[2]) + r],
    ];
  }
}

/** Caixa alinhada aos eixos (min, max). face: 0 -x,1 +x,2 -y,3 +y,4 -z,5 +z. local = p - min */
export class Box extends Prim {
  constructor(public min: V3, public max: V3, m: Material) { super(m); }
  hit(o: V3, d: V3): HitRec | null {
    let tmin = -Infinity, tmax = Infinity, face = -1;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (o[i] < this.min[i] || o[i] > this.max[i]) return null;
        continue;
      }
      let t1 = (this.min[i] - o[i]) / d[i];
      let t2 = (this.max[i] - o[i]) / d[i];
      let f1 = i * 2, f2 = i * 2 + 1;
      if (t1 > t2) { [t1, t2] = [t2, t1]; [f1, f2] = [f2, f1]; }
      if (t1 > tmin) { tmin = t1; face = f1; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    if (tmin < 1e-4) return null;
    const n: V3 = [0, 0, 0];
    n[face >> 1] = face & 1 ? 1 : -1;
    const p = add(o, mul(d, tmin));
    return { t: tmin, n, local: sub(p, this.min), face };
  }
  aabb(): [V3, V3] { return [this.min, this.max]; }
}

/** Poliedro convexo definido por planos (n·p <= d dentro). */
export class Convex extends Prim {
  constructor(public planes: { n: V3; d: number }[], public bmin: V3, public bmax: V3, m: Material) { super(m); }
  hit(o: V3, dir: V3): HitRec | null {
    let tn = -Infinity, tf = Infinity, nn: V3 = [0, 1, 0], fi = 0;
    for (let i = 0; i < this.planes.length; i++) {
      const pl = this.planes[i];
      const denom = dot(pl.n, dir);
      const dist = pl.d - dot(pl.n, o);
      if (Math.abs(denom) < 1e-9) { if (dist < 0) return null; continue; }
      const t = dist / denom;
      if (denom < 0) { if (t > tn) { tn = t; nn = pl.n; fi = i; } }
      else if (t < tf) tf = t;
      if (tn > tf) return null;
    }
    if (tn < 1e-4) return null;
    const p = add(o, mul(dir, tn));
    return { t: tn, n: nn, local: sub(p, this.bmin), face: fi };
  }
  aabb(): [V3, V3] { return [this.bmin, this.bmax]; }
}

/** Cilindro vertical (eixo y) com base em c, raio r, altura h. */
export class Cylinder extends Prim {
  constructor(public c: V3, public r: number, public h: number, m: Material) { super(m); }
  hit(o: V3, d: V3): HitRec | null {
    const ox = o[0] - this.c[0], oz = o[2] - this.c[2];
    const a = d[0] * d[0] + d[2] * d[2];
    const b = ox * d[0] + oz * d[2];
    const c = ox * ox + oz * oz - this.r * this.r;
    let best: HitRec | null = null;
    if (a > 1e-9) {
      const h = b * b - a * c;
      if (h >= 0) {
        const t = (-b - Math.sqrt(h)) / a;
        const y = o[1] + d[1] * t;
        if (t > 1e-4 && y >= this.c[1] && y <= this.c[1] + this.h) {
          const px = ox + d[0] * t, pz = oz + d[2] * t;
          best = { t, n: [px / this.r, 0, pz / this.r], local: [px, y - this.c[1], pz], face: 0 };
        }
      }
    }
    // tampa superior
    if (Math.abs(d[1]) > 1e-9) {
      const t = (this.c[1] + this.h - o[1]) / d[1];
      if (t > 1e-4 && (!best || t < best.t)) {
        const px = ox + d[0] * t, pz = oz + d[2] * t;
        if (px * px + pz * pz <= this.r * this.r) best = { t, n: [0, 1, 0], local: [px, this.h, pz], face: 1 };
      }
    }
    return best;
  }
  aabb(): [V3, V3] {
    return [[this.c[0] - this.r, this.c[1], this.c[2] - this.r], [this.c[0] + this.r, this.c[1] + this.h, this.c[2] + this.r]];
  }
}

// Telhado de duas águas: cumeeira ao longo de `axis` ('x' ou 'z').
export function gableRoof(min: V3, max: V3, ridgeH: number, axis: 'x' | 'z', m: Material): Convex {
  const [x0, y0, z0] = min; const [x1, , z1] = max;
  const planes: { n: V3; d: number }[] = [];
  const pl = (n: V3, p: V3) => { const nn = norm(n); planes.push({ n: nn, d: dot(nn, p) }); };
  pl([0, -1, 0], [0, y0, 0]);
  if (axis === 'x') {
    const zc = (z0 + z1) / 2, hw = (z1 - z0) / 2;
    pl([-1, 0, 0], [x0, 0, 0]); pl([1, 0, 0], [x1, 0, 0]);
    pl([0, hw, ridgeH], [0, y0, z1]);   // inclinação +z
    pl([0, hw, -ridgeH], [0, y0, z0]);  // inclinação -z
    void zc;
  } else {
    pl([0, 0, -1], [0, 0, z0]); pl([0, 0, 1], [0, 0, z1]);
    const hw = (x1 - x0) / 2;
    pl([ridgeH, hw, 0], [x1, y0, 0]);
    pl([-ridgeH, hw, 0], [x0, y0, 0]);
  }
  return new Convex(planes, [x0, y0, z0], [x1, y0 + ridgeH, z1], m);
}

/** Telhado de quatro águas (hip roof). */
export function hipRoof(min: V3, max: V3, h: number, inset: number, m: Material): Convex {
  const [x0, y0, z0] = min; const [x1, , z1] = max;
  const planes: { n: V3; d: number }[] = [];
  const pl = (n: V3, p: V3) => { const nn = norm(n); planes.push({ n: nn, d: dot(nn, p) }); };
  pl([0, -1, 0], [0, y0, 0]);
  pl([h, inset, 0], [x1, y0, 0]);
  pl([-h, inset, 0], [x0, y0, 0]);
  pl([0, inset, h], [0, y0, z1]);
  pl([0, inset, -h], [0, y0, z0]);
  return new Convex(planes, [x0, y0, z0], [x1, y0 + h, z1], m);
}

// --- Renderização ------------------------------------------------------------
export interface RenderOpts {
  outline?: boolean;          // contorno externo (sel-out)
  innerLines?: boolean;       // linhas internas por profundidade
  shadow?: boolean;           // renderizar sombra projetada separada
  selfShadow?: boolean;
  width?: number; height?: number; ox?: number; oy?: number; // canvas fixo
  outlineDark?: number;
  outlineMix?: number;
  scale?: number;
  innerDark?: number;               // escala do objeto em relação ao mundo
  ambient?: number;
  extraPost?: (img: Image, info: { group: Int32Array; ramps: (RGB[] | null)[]; W: number; H: number }) => void;
  shadowAlpha?: number;
}

export interface Image {
  w: number; h: number; data: Uint8ClampedArray; ox: number; oy: number;
}

export function newImage(w: number, h: number, ox = 0, oy = 0): Image {
  return { w, h, data: new Uint8ClampedArray(w * h * 4), ox, oy };
}

export interface RenderResult { img: Image; shadow?: Image }

export function sceneBounds(prims: Prim[]): { x0: number; y0: number; x1: number; y1: number; ymax: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, ymax = 0;
  for (const p of prims) {
    const [a, b] = p.aabb();
    for (let i = 0; i < 8; i++) {
      const c: V3 = [i & 1 ? b[0] : a[0], i & 2 ? b[1] : a[1], i & 4 ? b[2] : a[2]];
      const [sx, sy] = project(c);
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      ymax = Math.max(ymax, c[1]);
    }
  }
  return { x0, y0, x1, y1, ymax };
}

function traceClosest(prims: Prim[], o: V3, d: V3): { h: HitRec; p: Prim } | null {
  let best: HitRec | null = null, bp: Prim | null = null;
  for (const p of prims) {
    if (p.quickReject(o, d)) continue;
    const h = p.hit(o, d);
    if (h && (!best || h.t < best.t)) { best = h; bp = p; }
  }
  return best && bp ? { h: best, p: bp } : null;
}

function occluded(prims: Prim[], o: V3, d: V3, skip?: Prim): boolean {
  for (const p of prims) {
    if (!p.cast || p === skip) continue;
    if (p.quickReject(o, d)) continue;
    if (p.hit(o, d)) return true;
  }
  return false;
}

export function lightLevel(light: number): number {
  // limiares de quantização (cel shading)
  if (light < 0.40) return 0;
  if (light < 0.55) return 1;
  if (light < 0.72) return 2;
  if (light < 0.86) return 3;
  return 4;
}

export function render(prims: Prim[], opts: RenderOpts = {}): RenderResult {
  for (const p of prims) p.computeBound();
  const ambient = opts.ambient ?? 0.32;
  let W: number, H: number, OX: number, OY: number;
  const K = opts.scale ?? 1;
  const sb0 = sceneBounds(prims);
  const sb = { x0: sb0.x0 * K, y0: sb0.y0 * K, x1: sb0.x1 * K, y1: sb0.y1 * K, ymax: sb0.ymax };
  if (opts.width) {
    W = opts.width; H = opts.height!; OX = opts.ox!; OY = opts.oy!;
  } else {
    OX = Math.ceil(-sb.x0) + 2; OY = Math.ceil(-sb.y0) + 2;
    W = Math.ceil(sb.x1 - sb.x0) + 5; H = Math.ceil(sb.y1 - sb.y0) + 5;
  }
  const Y0 = sb.ymax + 2;
  const N = W * H;
  const depth = new Float32Array(N).fill(Infinity);
  const group = new Int32Array(N).fill(-1);
  const rampRef: (RGB[] | null)[] = new Array(N).fill(null);
  const idx = new Int8Array(N);
  const emis = new Uint8Array(N);

  // sombra projetada: canvas ampliado na direção da sombra
  const doShadow = !!opts.shadow;
  const shadowMask = doShadow ? new Uint8Array(N) : null;

  const sunDir = LIGHT;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const sx = px + 0.5 - OX, sy = py + 0.5 - OY;
      const a = sx / (16 * K), b = (sy + Y0 * CAM.KV * K) / (CAM.KD * K);
      const o: V3 = [(a + b) / 2, Y0, (b - a) / 2];
      const r = traceClosest(prims, o, VIEW);
      const i = py * W + px;
      if (r) {
        const p = add(o, mul(VIEW, r.h.t));
        let n = r.h.n;
        if (dot(n, VIEW) > 0) n = mul(n, -1);
        let lam = Math.max(0, dot(n, sunDir));
        let lit = true;
        if (opts.selfShadow !== false && lam > 0 && r.p.receive) {
          if (occluded(prims, add(p, mul(n, 0.02)), sunDir, undefined)) { lit = false; }
        }
        if (!lit) lam = 0;
        const sky = 0.06 * Math.max(0, n[1]);
        const light = Math.min(1, ambient + (1 - ambient) * lam + sky);
        const level = lightLevel(light);
        const out = r.p.mat({ p, n, level, light, lit, local: r.h.local, face: r.h.face });
        if (out) {
          depth[i] = r.h.t;
          group[i] = r.p.group;
          rampRef[i] = out.ramp;
          idx[i] = out.idx;
          emis[i] = out.emissive ? 1 : 0;
          continue;
        }
      }
      if (shadowMask) {
        // raio atinge o chão y=0?
        const t = (0 - o[1]) / VIEW[1];
        const g = add(o, mul(VIEW, t));
        if (occluded(prims, add(g, [0, 0.001, 0]), sunDir)) shadowMask[i] = 1;
      }
    }
  }

  // linhas internas: pixel mais distante numa descontinuidade escurece
  if (opts.innerLines !== false) {
    const thr = 0.35;
    const toDark: number[] = [];
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const i = py * W + px;
      if (!rampRef[i] || emis[i]) continue;
      const nb = [px > 0 ? i - 1 : -1, px < W - 1 ? i + 1 : -1, py > 0 ? i - W : -1, py < H - 1 ? i + W : -1];
      for (const j of nb) {
        if (j < 0 || !rampRef[j]) continue;
        if (group[j] !== group[i] && depth[i] - depth[j] > thr) { toDark.push(i); break; }
      }
    }
    for (const i of toDark) idx[i] = Math.max(0, idx[i] - (opts.innerDark ?? 2));
  }

  const img = newImage(W, H, OX, OY);
  for (let i = 0; i < N; i++) {
    const rr = rampRef[i];
    if (!rr) continue;
    const c = rr[idx[i]];
    img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
  }

  if (opts.outline !== false) {
    const dark = opts.outlineDark ?? 0.55;
    const out = new Uint8ClampedArray(img.data);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const i = py * W + px;
      if (rampRef[i]) continue;
      let src = -1;
      // prioridade: vizinho de baixo/acima/lados
      const cand = [py > 0 ? i - W : -1, py < H - 1 ? i + W : -1, px > 0 ? i - 1 : -1, px < W - 1 ? i + 1 : -1];
      for (const j of cand) if (j >= 0 && rampRef[j] && !emis[j]) { src = j; break; }
      if (src < 0) continue;
      const base = rampRef[src]![0];
      const c = mix(darken(base, dark), [26, 18, 30], opts.outlineMix ?? 0.55);
      out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
    }
    img.data.set(out);
  }

  if (opts.extraPost) opts.extraPost(img, { group, ramps: rampRef, W, H });

  let shadow: Image | undefined;
  if (shadowMask) {
    shadow = newImage(W, H, OX, OY);
    const a = Math.round((opts.shadowAlpha ?? 0.32) * 255);
    for (let i = 0; i < N; i++) if (shadowMask[i]) {
      shadow.data[i * 4] = 20; shadow.data[i * 4 + 1] = 18; shadow.data[i * 4 + 2] = 48; shadow.data[i * 4 + 3] = a;
    }
  }
  return { img, shadow };
}

/** Recorta bordas transparentes preservando a âncora. */
export function trim(img: Image, pad = 0): Image {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.data[(y * img.w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  if (x1 < 0) return newImage(1, 1, img.ox, img.oy);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(img.w - 1, x1 + pad); y1 = Math.min(img.h - 1, y1 + pad);
  const out = newImage(x1 - x0 + 1, y1 - y0 + 1, img.ox - x0, img.oy - y0);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const si = (y * img.w + x) * 4, di = ((y - y0) * out.w + (x - x0)) * 4;
    out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1]; out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = img.data[si + 3];
  }
  return out;
}

export function setPx(img: Image, x: number, y: number, c: RGB, a = 255) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (y * img.w + x) * 4;
  if (a < 255) {
    const t = a / 255, ia = img.data[i + 3] / 255;
    img.data[i] = img.data[i] * (1 - t) + c[0] * t;
    img.data[i + 1] = img.data[i + 1] * (1 - t) + c[1] * t;
    img.data[i + 2] = img.data[i + 2] * (1 - t) + c[2] * t;
    img.data[i + 3] = Math.round(255 * Math.min(1, ia + t * (1 - ia)));
    return;
  }
  img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
}

export function getA(img: Image, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return 0;
  return img.data[(y * img.w + x) * 4 + 3];
}

/** Rotação em torno de y (ângulo em rad) */
export function rotY(v: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

/** Caixa orientada (rotação em torno de y, ângulo `yaw`) centrada em `c` com meias-extensões `h`. local = ponto local + h */
export class OBox extends Prim {
  private inner: Box;
  constructor(public c: V3, public h: V3, public yaw: number, m: Material) {
    super(m);
    this.inner = new Box([-h[0], -h[1], -h[2]], [h[0], h[1], h[2]], m);
  }
  hit(o: V3, d: V3): HitRec | null {
    const lo = rotY(sub(o, this.c), -this.yaw);
    const ld = rotY(d, -this.yaw);
    const r = this.inner.hit(lo, ld);
    if (!r) return null;
    return { t: r.t, n: rotY(r.n, this.yaw), local: r.local, face: r.face };
  }
  aabb(): [V3, V3] {
    const m = Math.hypot(this.h[0], this.h[2]);
    return [[this.c[0] - m, this.c[1] - this.h[1], this.c[2] - m], [this.c[0] + m, this.c[1] + this.h[1], this.c[2] + m]];
  }
}
