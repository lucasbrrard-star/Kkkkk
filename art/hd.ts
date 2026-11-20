// Renderizador "HD pixel art": combina primitivas procedurais (rt.ts) e malhas
// reais (glTF do BlenderKit) num único raio ortográfico isométrico, com:
//  - supersampling por pixel (evita serrilhado em folhas finas),
//  - luz de fim de tarde (sol quente, sombras arroxeadas) em faixas (cel shading),
//  - sombras projetadas com teste de alfa (folhagem gera sombra rendada),
//  - redução de paleta por k-means (aparência de pixel art, não de foto),
//  - contorno seletivo e linhas internas por descontinuidade de profundidade.

import { RGB } from './color';
import { BVH, Mesh, MeshMat, sampleTex } from './mesh';
import { CAM, Image, Prim, V3, add, dot, mul, newImage, norm, sceneBounds, lightLevel } from './rt';

export const SUN: V3 = norm([0.3, 0.6, 0.78]);
const SUN_TINT: RGB = [1.1, 0.98, 0.84];
const SHADE_TINT: RGB = [0.5, 0.48, 0.74];
const SKY: RGB = [255, 196, 150];

export interface MeshInst { mesh: Mesh; bvh: BVH; group: number; cast?: boolean }

export interface HDOpts {
  scale: number;           // px por unidade (1 = 16 px por unidade em x−z)
  ss?: number;             // supersampling (lado)
  colors?: number;         // tamanho da paleta (k-means)
  outline?: boolean;
  shadow?: boolean;
  ambient?: number;
  width?: number; height?: number; ox?: number; oy?: number;
  innerLines?: boolean;
  shadowAlpha?: number;
  bands?: number;          // faixas de luz para malhas
  exposure?: number;
}

interface Sample { c: RGB; d: number; g: number }

function rgb2hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}
function hsv2rgb(h: number, s: number, v: number): RGB {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m];
}

function albedo(mm: MeshMat, mesh: Mesh, tri: number, u: number, v: number, p?: V3, n?: V3): [number, number, number, number] {
  let r = mm.color[0] * 255, g = mm.color[1] * 255, b = mm.color[2] * 255, a = mm.color[3];
  if (mm.fn && p && n) { const c = mm.fn(p, n); r = c[0]; g = c[1]; b = c[2]; }
  else if (mm.tex) {
    const w = 1 - u - v;
    const tu = mesh.uv[tri * 6] * w + mesh.uv[tri * 6 + 2] * u + mesh.uv[tri * 6 + 4] * v;
    const tv = mesh.uv[tri * 6 + 1] * w + mesh.uv[tri * 6 + 3] * u + mesh.uv[tri * 6 + 5] * v;
    const t = sampleTex(mm.tex, tu, tv);
    r *= t[0] / 255; g *= t[1] / 255; b *= t[2] / 255; a *= t[3] / 255;
  }
  if (mm.hue || mm.sat) {
    const [h, s, vv] = rgb2hsv(r / 255, g / 255, b / 255);
    const [nr, ng, nb] = hsv2rgb((h + (mm.hue ?? 0) + 360) % 360, Math.min(1, s * (mm.sat ?? 1)), vv);
    r = nr * 255; g = ng * 255; b = nb * 255;
  }
  if (mm.tint) { r *= mm.tint[0]; g *= mm.tint[1]; b *= mm.tint[2]; }
  return [r, g, b, a];
}

function alphaOK(inst: MeshInst) {
  const m = inst.mesh;
  return (tri: number, u: number, v: number) => {
    const mm = m.mats[m.mat[tri]];
    if (mm.hidden) return false;
    if (mm.alphaMode === 'OPAQUE' || !mm.tex || mm.fn) return true;
    const a = albedo(mm, m, tri, u, v)[3];
    return a >= (mm.alphaMode === 'MASK' ? mm.cutoff : 0.5);
  };
}

export function renderHD(prims: Prim[], meshes: MeshInst[], o: HDOpts): { img: Image; shadow?: Image } {
  for (const p of prims) p.computeBound();
  const K = o.scale, SS = o.ss ?? 3, amb = o.ambient ?? 0.36, bands = o.bands ?? 4, expo = o.exposure ?? 1;
  // limites
  const fake: Prim[] = [...prims];
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, ymax = 0;
  const projectK = (p: V3) => [(p[0] - p[2]) * 16 * K, ((p[0] + p[2]) * CAM.KD - p[1] * CAM.KV) * K];
  if (fake.length) { const sb = sceneBounds(fake); bx0 = sb.x0 * K; by0 = sb.y0 * K; bx1 = sb.x1 * K; by1 = sb.y1 * K; ymax = sb.ymax; }
  for (const mi of meshes) {
    const { min, max } = mi.mesh;
    for (let i = 0; i < 8; i++) {
      const c: V3 = [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]];
      const [sx, sy] = projectK(c);
      bx0 = Math.min(bx0, sx); bx1 = Math.max(bx1, sx); by0 = Math.min(by0, sy); by1 = Math.max(by1, sy);
    }
    ymax = Math.max(ymax, max[1]);
  }
  let W: number, H: number, OX: number, OY: number;
  if (o.width) { W = o.width; H = o.height!; OX = o.ox!; OY = o.oy!; }
  else {
    // a sombra se estende na direção oposta ao sol: amplia o quadro
    const shLen = o.shadow ? ymax / Math.max(0.2, SUN[1]) : 0;
    const shx = -SUN[0] * shLen, shz = -SUN[2] * shLen;
    const [dsx, dsy] = projectK([shx, 0, shz]);
    bx0 = Math.min(bx0, bx0 + Math.min(0, dsx)); bx1 = Math.max(bx1, bx1 + Math.max(0, dsx));
    by1 = Math.max(by1, by1 + Math.max(0, dsy)); by0 = Math.min(by0, by0 + Math.min(0, dsy));
    OX = Math.ceil(-bx0) + 3; OY = Math.ceil(-by0) + 3;
    W = Math.ceil(bx1 - bx0) + 7; H = Math.ceil(by1 - by0) + 7;
  }
  const Y0 = ymax + 2;
  const VIEW: V3 = norm([-1, -2 * CAM.KD / CAM.KV, -1]);
  const tests = meshes.map(alphaOK);

  // ---- aceleração: grade em espaço de tela (raios primários) e no espaço da luz (sombras)
  const CELL = 12;
  const sgrid = new Map<number, Prim[]>();
  const LU = norm([SUN[2], 0, -SUN[0]]);
  const LV = norm([SUN[1] * LU[2] - SUN[2] * LU[1], SUN[2] * LU[0] - SUN[0] * LU[2], SUN[0] * LU[1] - SUN[1] * LU[0]]);
  const LC = 0.35;
  const lgrid = new Map<number, Prim[]>();
  const lkey = (q: V3) => (Math.floor(dot(q, LV) / LC) + 4096) * 8192 + Math.floor(dot(q, LU) / LC) + 4096;
  for (const pr of prims) {
    const [a, b] = pr.aabb();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const c: V3 = [i & 1 ? b[0] : a[0], i & 2 ? b[1] : a[1], i & 4 ? b[2] : a[2]];
      const [sx, sy] = projectK(c);
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      const u = dot(c, LU), v = dot(c, LV);
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    for (let cy = Math.floor((y0 + OY - 1) / CELL); cy <= Math.floor((y1 + OY + 1) / CELL); cy++)
      for (let cx = Math.floor((x0 + OX - 1) / CELL); cx <= Math.floor((x1 + OX + 1) / CELL); cx++) {
        const k = cy * 4096 + cx; let l = sgrid.get(k); if (!l) sgrid.set(k, (l = [])); l.push(pr);
      }
    if (pr.cast) for (let cv = Math.floor(v0 / LC); cv <= Math.floor(v1 / LC); cv++)
      for (let cu = Math.floor(u0 / LC); cu <= Math.floor(u1 / LC); cu++) {
        const k = (cv + 4096) * 8192 + cu + 4096; let l = lgrid.get(k); if (!l) lgrid.set(k, (l = [])); l.push(pr);
      }
  }
  let curPrims: Prim[] = [];

  const trace = (orig: V3): { t: number; n: V3; prim?: Prim; mi?: number; tri?: number; u?: number; v?: number; local?: V3; face?: number } | null => {
    let best: ReturnType<typeof trace> = null;
    for (const p of curPrims) {
      if (p.quickReject(orig, VIEW)) continue;
      const h = p.hit(orig, VIEW);
      if (h && (!best || h.t < best.t)) best = { t: h.t, n: h.n, prim: p, local: h.local, face: h.face };
    }
    meshes.forEach((m, i) => {
      const h = m.bvh.intersect(orig, VIEW, tests[i], false, best ? best.t : Infinity);
      if (h && (!best || h.t < best.t)) {
        const N = m.mesh.nrm, b = h.tri * 9, w = 1 - h.u - h.v;
        const n = norm([N[b] * w + N[b + 3] * h.u + N[b + 6] * h.v, N[b + 1] * w + N[b + 4] * h.u + N[b + 7] * h.v, N[b + 2] * w + N[b + 5] * h.u + N[b + 8] * h.v]);
        best = { t: h.t, n, mi: i, tri: h.tri, u: h.u, v: h.v };
      }
    });
    return best;
  };
  const occluded = (p: V3): boolean => {
    for (const pr of lgrid.get(lkey(p)) ?? []) {
      if (!pr.cast || pr.quickReject(p, SUN)) continue;
      if (pr.hit(p, SUN)) return true;
    }
    for (let i = 0; i < meshes.length; i++) {
      if (meshes[i].cast === false) continue;
      if (meshes[i].bvh.intersect(p, SUN, tests[i], true)) return true;
    }
    return false;
  };

  const N = W * H;
  const outC = new Float32Array(N * 3), cover = new Float32Array(N), depth = new Float32Array(N).fill(Infinity);
  const grp = new Int32Array(N).fill(-1), emis = new Uint8Array(N), shadowF = new Float32Array(N);
  const samples: Sample[] = [];
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    samples.length = 0;
    let sh = 0, gCount = new Map<number, number>(), e = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const fx = px + (sx + 0.5) / SS - OX, fy = py + (sy + 0.5) / SS - OY;
      const a = fx / (16 * K), b = (fy + Y0 * CAM.KV * K) / (CAM.KD * K);
      const orig: V3 = [(a + b) / 2, Y0, (b - a) / 2];
      curPrims = sgrid.get(Math.floor(py / CELL) * 4096 + Math.floor(px / CELL)) ?? [];
      const r = trace(orig);
      if (r) {
        const p = add(orig, mul(VIEW, r.t));
        let n = r.n;
        if (dot(n, VIEW) > 0) n = mul(n, -1);
        let lam = Math.max(0, dot(n, SUN));
        if (lam > 0 && occluded(add(p, mul(n, 0.015)))) lam = 0;
        const L = Math.min(1, amb + (1 - amb) * lam + 0.08 * Math.max(0, n[1]));
        let c: RGB;
        let emissive = false;
        if (r.prim) {
          const lvl = lightLevel(L);
          const out = r.prim.mat({ p, n, level: lvl, light: L, lit: lam > 0, local: r.local!, face: r.face! });
          if (!out) continue;
          const base = out.ramp[out.idx];
          emissive = !!out.emissive;
          const t = emissive ? 1 : (lvl / 4);
          c = emissive ? [base[0], base[1], base[2]] : [
            base[0] * (0.86 + (1.08 - 0.86) * t), base[1] * (0.84 + (0.99 - 0.84) * t), base[2] * (1.02 + (0.88 - 1.02) * t)];
          samples.push({ c, d: r.t, g: r.prim.group });
        } else {
          const inst = meshes[r.mi!];
          const mm = inst.mesh.mats[inst.mesh.mat[r.tri!]];
          const al = albedo(mm, inst.mesh, r.tri!, r.u!, r.v!, p, n);
          if (mm.glow) {
            c = [255, 226, 150]; emissive = true;
          } else if (mm.glass) {
            // vidro: reflexo do céu ao entardecer + luz interna quente
            const f = Math.pow(1 - Math.abs(dot(n, VIEW)), 2);
            const warm: RGB = [255, 200, 120];
            const k = 0.55 + 0.45 * f;
            c = [warm[0] * (1 - k) * 0.9 + SKY[0] * k * 0.75, warm[1] * (1 - k) * 0.9 + SKY[1] * k * 0.7, warm[2] * (1 - k) * 0.8 + SKY[2] * k * 0.9];
            emissive = true;
          } else {
            const Lq = Math.round(Math.pow(L, 1.1) * bands) / bands;
            const tint: RGB = [
              SHADE_TINT[0] + (SUN_TINT[0] - SHADE_TINT[0]) * Lq,
              SHADE_TINT[1] + (SUN_TINT[1] - SHADE_TINT[1]) * Lq,
              SHADE_TINT[2] + (SUN_TINT[2] - SHADE_TINT[2]) * Lq,
            ];
            const k = (0.62 + 0.62 * Lq) * expo;
            c = [al[0] * tint[0] * k, al[1] * tint[1] * k, al[2] * tint[2] * k];
            if (mm.emissive[0] + mm.emissive[1] + mm.emissive[2] > 0.3) { c = [255, 220, 150]; emissive = true; }
          }
          samples.push({ c, d: r.t, g: 100 + inst.group });
        }
        if (emissive) e++;
      } else if (o.shadow) {
        const a = fx / (16 * K), b = (fy + Y0 * CAM.KV * K) / (CAM.KD * K);
        const orig: V3 = [(a + b) / 2, Y0, (b - a) / 2];
        const t = -orig[1] / VIEW[1];
        const g = add(orig, mul(VIEW, t));
        if (occluded(add(g, [0, 0.002, 0]))) sh++;
      }
    }
    const i = py * W + px;
    const tot = SS * SS;
    shadowF[i] = sh / tot;
    if (samples.length / tot >= 0.42) {
      let r = 0, g = 0, b = 0, d = Infinity;
      for (const s of samples) { r += s.c[0]; g += s.c[1]; b += s.c[2]; if (s.d < d) d = s.d; gCount.set(s.g, (gCount.get(s.g) ?? 0) + 1); }
      outC[i * 3] = r / samples.length; outC[i * 3 + 1] = g / samples.length; outC[i * 3 + 2] = b / samples.length;
      cover[i] = 1; depth[i] = d;
      let bg = -1, bc = -1; gCount.forEach((v, k) => { if (v > bc) { bc = v; bg = k; } }); grp[i] = bg;
      emis[i] = e * 2 > samples.length ? 1 : 0;
      gCount = new Map();
    }
  }

  // linhas internas: escurece o pixel mais distante numa descontinuidade
  if (o.innerLines !== false) {
    const dk: number[] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!cover[i] || emis[i]) continue;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j < 0 || !cover[j]) continue;
        if (depth[i] - depth[j] > 0.45 && grp[i] !== grp[j]) { dk.push(i); break; }
      }
    }
    for (const i of dk) { outC[i * 3] *= 0.7; outC[i * 3 + 1] *= 0.66; outC[i * 3 + 2] *= 0.78; }
  }

  // paleta por k-means
  const K_COLORS = o.colors ?? 40;
  const pts: number[] = [];
  for (let i = 0; i < N; i++) if (cover[i]) pts.push(i);
  const pal = kmeans(pts.map((i) => [clamp(outC[i * 3]), clamp(outC[i * 3 + 1]), clamp(outC[i * 3 + 2])] as RGB), K_COLORS);
  const img = newImage(W, H, OX, OY);
  for (const i of pts) {
    const c = nearest(pal, [clamp(outC[i * 3]), clamp(outC[i * 3 + 1]), clamp(outC[i * 3 + 2])]);
    img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
  }
  // contorno seletivo (sel-out)
  if (o.outline !== false) {
    const src = new Uint8ClampedArray(img.data);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (cover[i]) continue;
      let s = -1;
      for (const j of [y < H - 1 ? i + W : -1, y > 0 ? i - W : -1, x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1]) if (j >= 0 && cover[j] && !emis[j]) { s = j; break; }
      if (s < 0) continue;
      img.data[i * 4] = src[s * 4] * 0.32 + 14; img.data[i * 4 + 1] = src[s * 4 + 1] * 0.26 + 10; img.data[i * 4 + 2] = src[s * 4 + 2] * 0.34 + 24; img.data[i * 4 + 3] = 255;
    }
  }
  let shadow: Image | undefined;
  if (o.shadow) {
    shadow = newImage(W, H, OX, OY);
    const A = Math.round((o.shadowAlpha ?? 0.42) * 255);
    for (let i = 0; i < N; i++) {
      const f = shadowF[i];
      if (f < 0.34) continue;
      shadow.data[i * 4] = 46; shadow.data[i * 4 + 1] = 28; shadow.data[i * 4 + 2] = 86;
      shadow.data[i * 4 + 3] = f > 0.66 ? A : Math.round(A * 0.6);
    }
  }
  return { img, shadow };
}

function clamp(v: number) { return Math.max(0, Math.min(255, v)); }

function nearest(pal: RGB[], c: RGB): RGB {
  let best = pal[0], bd = Infinity;
  for (const p of pal) {
    const dr = p[0] - c[0], dg = p[1] - c[1], db = p[2] - c[2];
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

export function kmeans(cols: RGB[], k: number): RGB[] {
  if (cols.length === 0) return [[0, 0, 0]];
  // amostragem para velocidade
  const step = Math.max(1, Math.floor(cols.length / 6000));
  const data = cols.filter((_, i) => i % step === 0);
  k = Math.min(k, data.length);
  // inicialização k-means++ simplificada (por luminância espalhada)
  const sorted = [...data].sort((a, b) => (a[0] * 3 + a[1] * 6 + a[2]) - (b[0] * 3 + b[1] * 6 + b[2]));
  let cent: RGB[] = Array.from({ length: k }, (_, i) => [...sorted[Math.floor((i + 0.5) * sorted.length / k)]] as RGB);
  for (let it = 0; it < 10; it++) {
    const sum = cent.map(() => [0, 0, 0, 0]);
    for (const c of data) {
      let bi = 0, bd = Infinity;
      for (let j = 0; j < cent.length; j++) {
        const dr = cent[j][0] - c[0], dg = cent[j][1] - c[1], db = cent[j][2] - c[2];
        const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
        if (d < bd) { bd = d; bi = j; }
      }
      sum[bi][0] += c[0]; sum[bi][1] += c[1]; sum[bi][2] += c[2]; sum[bi][3]++;
    }
    cent = cent.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c) as RGB);
  }
  return cent.map((c) => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])] as RGB);
}
