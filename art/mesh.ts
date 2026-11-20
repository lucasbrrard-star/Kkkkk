// Carregamento de modelos glTF/GLB (BlenderKit, Poly Haven…) e interseção por BVH.
// Os modelos são usados SOMENTE como base de produção: são renderizados em pixel
// art pelo pipeline (art/hd.ts) — o jogo nunca carrega os modelos 3D.

import { NodeIO, Document, Primitive, Node as GNode, Texture } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { V3 } from './rt';

export interface Tex { w: number; h: number; data: Uint8Array } // RGBA
export interface MeshMat {
  name: string;
  color: [number, number, number, number];   // baseColorFactor (linear 0..1)
  tex: Tex | null;
  alphaMode: 'OPAQUE' | 'MASK' | 'BLEND';
  cutoff: number;
  emissive: [number, number, number];
  emissiveTex: Tex | null;
  // ajustes do pipeline
  tint?: [number, number, number];   // multiplicador de cor (recolorir)
  hue?: number;                       // rotação de matiz em graus
  sat?: number;                       // multiplicador de saturação
  glass?: boolean;                    // vidro: reflexo/luz interna
  glow?: boolean;                     // emissivo forte (lâmpadas)
  hidden?: boolean;
  fn?: (p: V3, n: V3) => [number, number, number]; // cor (0..255) procedural por posição
}

export interface Mesh {
  pos: Float32Array;   // 9 por triângulo
  nrm: Float32Array;   // 9 por triângulo
  uv: Float32Array;    // 6 por triângulo
  mat: Uint16Array;    // material por triângulo
  mats: MeshMat[];
  min: V3; max: V3;
}

let io: NodeIO | null = null;
async function getIO() {
  if (io) return io;
  io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });
  return io;
}

async function decodeTex(doc: Document, tex: Texture | null, cache: Map<unknown, Tex>): Promise<Tex | null> {
  if (!tex) return null;
  if (cache.has(tex)) return cache.get(tex)!;
  const img = tex.getImage();
  if (!img) return null;
  // reduz texturas grandes (os sprites são pequenos)
  const s = sharp(Buffer.from(img)).ensureAlpha().resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true });
  const { data, info } = await s.raw().toBuffer({ resolveWithObject: true });
  const t = { w: info.width, h: info.height, data: new Uint8Array(data) };
  cache.set(tex, t);
  void doc;
  return t;
}

function mulMat(m: number[], p: number[], w = 1): V3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12] * w,
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13] * w,
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14] * w,
  ];
}

export async function loadGLB(path: string): Promise<Mesh> {
  const doc = await (await getIO()).read(path);
  const root = doc.getRoot();
  const matIndex = new Map<unknown, number>();
  const mats: MeshMat[] = [];
  const texCache = new Map<unknown, Tex>();
  const P: number[] = [], N: number[] = [], U: number[] = [], M: number[] = [];

  const getMat = async (prim: Primitive) => {
    const m = prim.getMaterial();
    if (matIndex.has(m)) return matIndex.get(m)!;
    const mm: MeshMat = {
      name: m?.getName() ?? 'default',
      color: (m?.getBaseColorFactor() as [number, number, number, number]) ?? [0.8, 0.8, 0.8, 1],
      tex: m ? await decodeTex(doc, m.getBaseColorTexture(), texCache) : null,
      alphaMode: (m?.getAlphaMode() as MeshMat['alphaMode']) ?? 'OPAQUE',
      cutoff: m?.getAlphaCutoff() ?? 0.5,
      emissive: (m?.getEmissiveFactor() as [number, number, number]) ?? [0, 0, 0],
      emissiveTex: m ? await decodeTex(doc, m.getEmissiveTexture(), texCache) : null,
    };
    const idx = mats.length;
    mats.push(mm); matIndex.set(m, idx);
    return idx;
  };

  const visit = async (node: GNode) => {
    const mesh = node.getMesh();
    if (mesh) {
      const W = node.getWorldMatrix() as unknown as number[];
      for (const prim of mesh.listPrimitives()) {
        if (prim.getMode() !== 4) continue; // só TRIANGLES
        const pa = prim.getAttribute('POSITION');
        if (!pa) continue;
        const na = prim.getAttribute('NORMAL');
        const tcIdx = prim.getMaterial()?.getBaseColorTextureInfo()?.getTexCoord() ?? 0;
        const ta = prim.getAttribute(`TEXCOORD_${tcIdx}`) ?? prim.getAttribute('TEXCOORD_0');
        const ia = prim.getIndices();
        const mi = await getMat(prim);
        const count = ia ? ia.getCount() : pa.getCount();
        const tmp: number[] = [0, 0, 0];
        for (let i = 0; i < count; i++) {
          const vi = ia ? ia.getScalar(i) : i;
          pa.getElement(vi, tmp); const p = mulMat(W, tmp, 1); P.push(p[0], p[1], p[2]);
          if (na) { na.getElement(vi, tmp); const n = mulMat(W, tmp, 0); const l = Math.hypot(n[0], n[1], n[2]) || 1; N.push(n[0] / l, n[1] / l, n[2] / l); } else N.push(0, 0, 0);
          if (ta) { const t2: number[] = [0, 0]; ta.getElement(vi, t2); U.push(t2[0], t2[1]); } else U.push(0, 0);
          if (i % 3 === 2) M.push(mi);
        }
      }
    }
    for (const c of node.listChildren()) await visit(c);
  };
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  for (const n of scene.listChildren()) await visit(n);

  const pos = new Float32Array(P), nrm = new Float32Array(N);
  // normais ausentes → normal da face
  for (let t = 0; t < pos.length / 9; t++) {
    if (nrm[t * 9] === 0 && nrm[t * 9 + 1] === 0 && nrm[t * 9 + 2] === 0) {
      const a = [pos[t * 9], pos[t * 9 + 1], pos[t * 9 + 2]], b = [pos[t * 9 + 3], pos[t * 9 + 4], pos[t * 9 + 5]], c = [pos[t * 9 + 6], pos[t * 9 + 7], pos[t * 9 + 8]];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      for (let k = 0; k < 3; k++) { nrm[t * 9 + k * 3] = n[0] / l; nrm[t * 9 + k * 3 + 1] = n[1] / l; nrm[t * 9 + k * 3 + 2] = n[2] / l; }
    }
  }
  const mesh: Mesh = { pos, nrm, uv: new Float32Array(U), mat: new Uint16Array(M), mats, min: [0, 0, 0], max: [0, 0, 0] };
  computeBounds(mesh);
  return mesh;
}

export function computeBounds(m: Mesh) {
  const mn: V3 = [Infinity, Infinity, Infinity], mx: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], m.pos[i + k]); mx[k] = Math.max(mx[k], m.pos[i + k]); }
  m.min = mn; m.max = mx;
}

/** Transforma a malha: escala uniforme, rotação em y (graus), translação. */
export function transformMesh(m: Mesh, o: { scale?: number; rotY?: number; at?: V3; fitHeight?: number; fitWidth?: number; ground?: boolean; center?: boolean }): Mesh {
  computeBounds(m);
  let s = o.scale ?? 1;
  if (o.fitHeight) s = o.fitHeight / (m.max[1] - m.min[1]);
  if (o.fitWidth) s = o.fitWidth / Math.max(m.max[0] - m.min[0], m.max[2] - m.min[2]);
  const cx = (m.min[0] + m.max[0]) / 2, cz = (m.min[2] + m.max[2]) / 2;
  const a = ((o.rotY ?? 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const at = o.at ?? [0, 0, 0];
  const pos = new Float32Array(m.pos.length), nrm = new Float32Array(m.nrm.length);
  for (let i = 0; i < m.pos.length; i += 3) {
    let x = m.pos[i], y = m.pos[i + 1], z = m.pos[i + 2];
    if (o.center !== false) { x -= cx; z -= cz; }
    if (o.ground !== false) y -= m.min[1];
    x *= s; y *= s; z *= s;
    pos[i] = x * c + z * sn + at[0]; pos[i + 1] = y + at[1]; pos[i + 2] = -x * sn + z * c + at[2];
    const nx = m.nrm[i], ny = m.nrm[i + 1], nz = m.nrm[i + 2];
    nrm[i] = nx * c + nz * sn; nrm[i + 1] = ny; nrm[i + 2] = -nx * sn + nz * c;
  }
  const out: Mesh = { ...m, pos, nrm };
  computeBounds(out);
  return out;
}

// ---------------------------------------------------------------- BVH
export class BVH {
  nodes: Float32Array;      // por nó: min(3) max(3)
  meta: Int32Array;         // por nó: left/first, count (count>0 = folha)
  order: Uint32Array;
  constructor(public mesh: Mesh) {
    const T = mesh.pos.length / 9;
    const cen = new Float32Array(T * 3), bmin = new Float32Array(T * 3), bmax = new Float32Array(T * 3);
    for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) {
      const a = mesh.pos[t * 9 + k], b = mesh.pos[t * 9 + 3 + k], c = mesh.pos[t * 9 + 6 + k];
      bmin[t * 3 + k] = Math.min(a, b, c); bmax[t * 3 + k] = Math.max(a, b, c); cen[t * 3 + k] = (a + b + c) / 3;
    }
    this.order = new Uint32Array(T); for (let i = 0; i < T; i++) this.order[i] = i;
    const nodes: number[] = [], meta: number[] = [];
    const build1 = (start: number, end: number): number => {
      const id = meta.length / 3;
      meta.push(0, 0, 0); nodes.push(0, 0, 0, 0, 0, 0);
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      const cmn = [Infinity, Infinity, Infinity], cmx = [-Infinity, -Infinity, -Infinity];
      for (let i = start; i < end; i++) {
        const t = this.order[i];
        for (let k = 0; k < 3; k++) {
          mn[k] = Math.min(mn[k], bmin[t * 3 + k]); mx[k] = Math.max(mx[k], bmax[t * 3 + k]);
          cmn[k] = Math.min(cmn[k], cen[t * 3 + k]); cmx[k] = Math.max(cmx[k], cen[t * 3 + k]);
        }
      }
      for (let k = 0; k < 3; k++) { nodes[id * 6 + k] = mn[k]; nodes[id * 6 + 3 + k] = mx[k]; }
      const n = end - start;
      if (n <= 4) { meta[id * 3] = start; meta[id * 3 + 1] = n; meta[id * 3 + 2] = -1; return id; }
      let axis = 0; let ext = cmx[0] - cmn[0];
      for (let k = 1; k < 3; k++) if (cmx[k] - cmn[k] > ext) { ext = cmx[k] - cmn[k]; axis = k; }
      const mid = (cmn[axis] + cmx[axis]) / 2;
      let i = start, j = end - 1;
      while (i <= j) {
        if (cen[this.order[i] * 3 + axis] < mid) i++;
        else { const tmp = this.order[i]; this.order[i] = this.order[j]; this.order[j] = tmp; j--; }
      }
      let split = i;
      if (split === start || split === end) split = (start + end) >> 1;
      const l = build1(start, split);
      const r = build1(split, end);
      meta[id * 3] = l; meta[id * 3 + 1] = 0; meta[id * 3 + 2] = r;
      return id;
    };
    build1(0, T);
    this.nodes = new Float32Array(nodes);
    this.meta = new Int32Array(meta);
  }

  private boxHit(i: number, o: V3, inv: V3, tmax: number): number {
    const n = this.nodes;
    let t0 = 0, t1 = tmax;
    for (let k = 0; k < 3; k++) {
      let a = (n[i * 6 + k] - o[k]) * inv[k], b = (n[i * 6 + 3 + k] - o[k]) * inv[k];
      if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) t0 = a; if (b < t1) t1 = b;
      if (t0 > t1) return -1;
    }
    return t0;
  }

  /** Interseção mais próxima. alphaTest(t, u, v, triIdx) → true se o texel é opaco. */
  intersect(o: V3, d: V3, alphaTest: (tri: number, u: number, v: number) => boolean, anyHit = false, tmax = Infinity): { t: number; tri: number; u: number; v: number } | null {
    const inv: V3 = [1 / d[0], 1 / d[1], 1 / d[2]];
    const P = this.mesh.pos;
    let best: { t: number; tri: number; u: number; v: number } | null = null;
    let bt = tmax;
    const stack = [0];
    while (stack.length) {
      const ni = stack.pop()!;
      if (this.boxHit(ni, o, inv, bt) < 0) continue;
      const cnt = this.meta[ni * 3 + 1];
      if (cnt > 0) {
        const first = this.meta[ni * 3];
        for (let k = 0; k < cnt; k++) {
          const t = this.order[first + k];
          const b = t * 9;
          const e1x = P[b + 3] - P[b], e1y = P[b + 4] - P[b + 1], e1z = P[b + 5] - P[b + 2];
          const e2x = P[b + 6] - P[b], e2y = P[b + 7] - P[b + 1], e2z = P[b + 8] - P[b + 2];
          const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
          const det = e1x * px + e1y * py + e1z * pz;
          if (Math.abs(det) < 1e-12) continue;
          const id = 1 / det;
          const tx = o[0] - P[b], ty = o[1] - P[b + 1], tz = o[2] - P[b + 2];
          const u = (tx * px + ty * py + tz * pz) * id;
          if (u < 0 || u > 1) continue;
          const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
          const v = (d[0] * qx + d[1] * qy + d[2] * qz) * id;
          if (v < 0 || u + v > 1) continue;
          const tt = (e2x * qx + e2y * qy + e2z * qz) * id;
          if (tt <= 1e-4 || tt >= bt) continue;
          if (!alphaTest(t, u, v)) continue;
          bt = tt; best = { t: tt, tri: t, u, v };
          if (anyHit) return best;
        }
      } else {
        stack.push(this.meta[ni * 3], this.meta[ni * 3 + 2]);
      }
    }
    return best;
  }
}

export function sampleTex(t: Tex, u: number, v: number): [number, number, number, number] {
  u = u - Math.floor(u); v = v - Math.floor(v);
  const x = Math.min(t.w - 1, Math.floor(u * t.w)), y = Math.min(t.h - 1, Math.floor(v * t.h));
  const i = (y * t.w + x) * 4;
  return [t.data[i], t.data[i + 1], t.data[i + 2], t.data[i + 3]];
}
