// Personagens 3D com esqueleto (Rigify/Mixamo) vindos do BlenderKit:
// pose procedural por direção de ossos + skinning linear → malha estática
// pronta para o renderizador HD. Os quadros finais são pixel art (art/hd.ts).

import { NodeIO, Node as GNode } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { Mesh, MeshMat, Tex, computeBounds } from './mesh';
import { V3 } from './rt';

// ---------------------------------------------------------------- matemática 4×4 (coluna principal) e quatérnios
type M4 = Float64Array;
const I4 = (): M4 => { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
function mul4(a: ArrayLike<number>, b: ArrayLike<number>): M4 {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
function inv4(m: ArrayLike<number>): M4 {
  const a = Array.from(m), o = new Float64Array(16);
  const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4];
  const b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
  const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12];
  const b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return I4();
  det = 1 / det;
  o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det;
  o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det;
  o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det;
  o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det;
  o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det;
  o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det;
  o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det;
  o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det;
  return o;
}
const tf = (m: ArrayLike<number>, p: ArrayLike<number>, w = 1): V3 => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12] * w,
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13] * w,
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14] * w,
];
type Q = [number, number, number, number]; // x y z w
const qId = (): Q => [0, 0, 0, 1];
function qAxis(ax: V3, ang: number): Q { const s = Math.sin(ang / 2), l = Math.hypot(...ax) || 1; return [ax[0] / l * s, ax[1] / l * s, ax[2] / l * s, Math.cos(ang / 2)]; }
function qMul(a: Q, b: Q): Q {
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
function qRot(q: Q, v: V3): V3 {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
function qFromTo(a: V3, b: V3): Q {
  const la = Math.hypot(...a), lb = Math.hypot(...b);
  const u: V3 = [a[0] / la, a[1] / la, a[2] / la], v: V3 = [b[0] / lb, b[1] / lb, b[2] / lb];
  const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  if (d < -0.9999) { const ax: V3 = Math.abs(u[0]) < 0.9 ? [0, -u[2], u[1]] : [-u[2], 0, u[0]]; return qAxis(ax, Math.PI); }
  const c: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const q: Q = [c[0], c[1], c[2], 1 + d]; const l = Math.hypot(...q);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
function qSlerp(a: Q, b: Q, t: number): Q {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = d < 0 ? (b.map((x) => -x) as Q) : b; d = Math.abs(d);
  if (d > 0.9995) { const r = a.map((x, i) => x + (bb[i] - x) * t) as Q; const l = Math.hypot(...r); return r.map((x) => x / l) as Q; }
  const th = Math.acos(d), s = Math.sin(th);
  return a.map((x, i) => (x * Math.sin((1 - t) * th) + bb[i] * Math.sin(t * th)) / s) as Q;
}
function qMat(q: Q): M4 {
  const [x, y, z, w] = q, m = I4();
  m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y + z * w); m[2] = 2 * (x * z - y * w);
  m[4] = 2 * (x * y - z * w); m[5] = 1 - 2 * (x * x + z * z); m[6] = 2 * (y * z + x * w);
  m[8] = 2 * (x * z + y * w); m[9] = 2 * (y * z - x * w); m[10] = 1 - 2 * (x * x + y * y);
  return m;
}
const T4 = (t: V3): M4 => { const m = I4(); m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; return m; };
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const nrm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---------------------------------------------------------------- dados do rig
interface Prim3 { pos: Float32Array; nrm: Float32Array; uv: Float32Array; idx: Uint32Array; joints?: Uint16Array; weights?: Float32Array; mat: number; skin?: { joints: number[]; ibm: Float64Array[] }; node: number }
export interface Rig {
  prims: Prim3[];
  mats: MeshMat[];
  nodes: { name: string; rest: M4; parent: number; isJoint: boolean }[];
  byName: Map<string, number>;   // nomes de ossos → índice (prefere juntas)
  forward: V3;              // frente do modelo (pés → biqueira)
  height: number;
}

async function decodeTex(img: Uint8Array | null): Promise<Tex | null> {
  if (!img) return null;
  const { data, info } = await sharp(Buffer.from(img)).ensureAlpha().resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, data: new Uint8Array(data) };
}

export async function loadRig(file: string, opt: { hideUnderClothes?: RegExp; skinMat?: RegExp } = {}): Promise<Rig> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
  const doc = await io.read(file);
  const root = doc.getRoot();
  const all = root.listNodes();
  const jointSet = new Set<GNode>(); for (const sk of root.listSkins()) for (const j of sk.listJoints()) jointSet.add(j);
  const nodes = all.map((n) => ({ name: n.getName(), rest: Float64Array.from(n.getWorldMatrix()), parent: n.getParentNode() ? all.indexOf(n.getParentNode()!) : -1, isJoint: jointSet.has(n) }));
  const byName = new Map<string, number>();
  nodes.forEach((n, i) => { if (!byName.has(n.name) || n.isJoint) byName.set(n.name, i); });
  const mats: MeshMat[] = []; const matIdx = new Map<unknown, number>();
  const prims: Prim3[] = [];
  for (const n of root.listNodes()) {
    const mesh = n.getMesh(); if (!mesh) continue;
    const skin = n.getSkin();
    let skinData: Prim3['skin'];
    if (skin) {
      const ibmA = skin.getInverseBindMatrices();
      const joints = skin.listJoints().map((j) => all.indexOf(j));
      const ibm = joints.map((_, i) => { const t = new Array(16).fill(0); ibmA?.getElement(i, t); return Float64Array.from(t); });
      skinData = { joints, ibm };
    }
    for (const p of mesh.listPrimitives()) {
      if (p.getMode() !== 4) continue;
      const m = p.getMaterial();
      if (!matIdx.has(m)) {
        const tcI = m?.getBaseColorTextureInfo()?.getTexCoord() ?? 0;
        matIdx.set(m, mats.length);
        mats.push({
          name: m?.getName() ?? 'default', color: (m?.getBaseColorFactor() as [number, number, number, number]) ?? [0.8, 0.8, 0.8, 1],
          tex: await decodeTex(m?.getBaseColorTexture()?.getImage() ?? null), alphaMode: (m?.getAlphaMode() as MeshMat['alphaMode']) ?? 'OPAQUE',
          cutoff: m?.getAlphaCutoff() ?? 0.5, emissive: [0, 0, 0], emissiveTex: null, ...({ _tc: tcI } as object),
        });
      }
      const mi = matIdx.get(m)!;
      const tc = (mats[mi] as unknown as { _tc: number })._tc;
      const pa = p.getAttribute('POSITION')!, na = p.getAttribute('NORMAL'), ta = p.getAttribute(`TEXCOORD_${tc}`) ?? p.getAttribute('TEXCOORD_0');
      const ja = p.getAttribute('JOINTS_0'), wa = p.getAttribute('WEIGHTS_0'), ia = p.getIndices();
      const nV = pa.getCount();
      const pos = new Float32Array(nV * 3), nr = new Float32Array(nV * 3), uv = new Float32Array(nV * 2);
      const jo = ja ? new Uint16Array(nV * 4) : undefined, we = wa ? new Float32Array(nV * 4) : undefined;
      const t: number[] = [0, 0, 0, 0];
      for (let i = 0; i < nV; i++) {
        pa.getElement(i, t); pos.set([t[0], t[1], t[2]], i * 3);
        if (na) { na.getElement(i, t); nr.set([t[0], t[1], t[2]], i * 3); }
        if (ta) { ta.getElement(i, t); uv.set([t[0], t[1]], i * 2); }
        if (ja && jo) { ja.getElement(i, t); jo.set([t[0], t[1], t[2], t[3]], i * 4); }
        if (wa && we) { wa.getElement(i, t); we.set([t[0], t[1], t[2], t[3]], i * 4); }
      }
      const idx = ia ? Uint32Array.from({ length: ia.getCount() }, (_, i) => ia.getScalar(i)) : Uint32Array.from({ length: nV }, (_, i) => i);
      prims.push({ pos, nrm: nr, uv, idx, joints: jo, weights: we, mat: mi, skin: skin && ja ? skinData : undefined, node: all.indexOf(n) });
    }
  }
  // descarta vértices com ligação incoerente (malha em pose diferente do esqueleto)
  for (const p of prims) {
    if (!p.skin || !p.joints || !p.weights) continue;
    const nV = p.pos.length / 3;
    const bad = new Uint8Array(nV);
    // distância de cada osso até seus filhos (tamanho aproximado do osso)
    for (let v = 0; v < nV; v++) {
      let b = 0, bw = -1;
      for (let k = 0; k < 4; k++) if (p.weights[v * 4 + k] > bw) { bw = p.weights[v * 4 + k]; b = k; }
      const ji = p.joints[v * 4 + b];
      const jn = p.skin.joints[ji];
      const m = mul4(nodes[jn].rest, p.skin.ibm[ji]);
      const q = tf(m, p.pos.subarray(v * 3, v * 3 + 3));
      const r = nodes[jn].rest;
      const d = Math.hypot(q[0] - r[12], q[1] - r[13], q[2] - r[14]);
      if (d > 0.42) bad[v] = 1;
      // pele coberta pela roupa (evita "vazamento" do corpo pelo tecido ao dobrar)
      if (opt.hideUnderClothes && opt.skinMat?.test(mats[p.mat].name) && opt.hideUnderClothes.test(nodes[jn].name)) bad[v] = 1;
    }
    const keep: number[] = [];
    for (let t = 0; t < p.idx.length; t += 3) if (!bad[p.idx[t]] && !bad[p.idx[t + 1]] && !bad[p.idx[t + 2]]) keep.push(p.idx[t], p.idx[t + 1], p.idx[t + 2]);
    p.idx = Uint32Array.from(keep);
  }
  // frente: do calcanhar à ponta do pé
  const g = (n: string) => { const i = byName.get(n); const r = i !== undefined ? nodes[i].rest : null; return r ? ([r[12], r[13], r[14]] as V3) : null; };
  const foot = g('DEF-foot.L') ?? g('LeftFoot'), toe = g('DEF-toe.L') ?? g('LeftToeBase');
  let forward: V3 = [0, 0, 1];
  if (foot && toe) { const d = sub(toe, foot); forward = nrm([d[0], 0, d[2]]); }
  let h = 0; for (const p of prims) if (!p.skin) continue; else for (let i = 1; i < p.pos.length; i += 3) h = Math.max(h, p.pos[i]);
  return { prims, mats, nodes, byName, forward, height: h };
}

// ---------------------------------------------------------------- pose
export interface RigPose {
  hipL: number; hipR: number; kneeL: number; kneeR: number;
  shL: number; shR: number; elL: number; elR: number;
  abL?: number; abR?: number; legAbL?: number; legAbR?: number;
  lean: number; twist: number; bob: number; chest: number; headPitch?: number;
  footL?: number; footR?: number; grounded: boolean; lift?: number; sway?: number;
}

const D2R = Math.PI / 180;

/** nomes dos ossos (Rigify) — o lado "a" da pose é o .R do modelo (direita do personagem) */
const B = {
  spine: ['DEF-spine', 'DEF-spine.001', 'DEF-spine.002', 'DEF-spine.003', 'DEF-spine.004', 'DEF-spine.005', 'DEF-spine.006'],
  leg: (s: string) => [`DEF-thigh.${s}`, `DEF-thigh.${s}.001`, `DEF-shin.${s}`, `DEF-shin.${s}.001`, `DEF-foot.${s}`, `DEF-toe.${s}`],
  arm: (s: string) => [`DEF-shoulder.${s}`, `DEF-upper_arm.${s}`, `DEF-upper_arm.${s}.001`, `DEF-forearm.${s}`, `DEF-forearm.${s}.001`, `DEF-hand.${s}`],
};
const ALIAS: Record<string, string> = { head: 'DEF-spine.006', 'MCH-ROT-head': 'DEF-spine.006', neck: 'DEF-spine.004', torso: 'DEF-spine', hips: 'DEF-spine', chest: 'DEF-spine.003' };

/** Gera a malha posada (espaço do modelo, frente = forward do rig). */
export function poseRig(rig: Rig, P: RigPose): Mesh {
  const has = (n: string) => rig.byName.has(n);
  const rest = (n: string): V3 => { const r = rig.nodes[rig.byName.get(n)!].rest; return [r[12], r[13], r[14]]; };
  // base do personagem: frente F, direita R (convenção da pose antiga: lado +1 = direita)
  const F = rig.forward, UP: V3 = [0, 1, 0];
  const right: V3 = nrm([F[1] * UP[2] - F[2] * UP[1], F[2] * UP[0] - F[0] * UP[2], F[0] * UP[1] - F[1] * UP[0]]); // F × UP
  const pitch = (ang: number): Q => qAxis(right, ang); // leva o vetor "baixo" para a frente
  const ctrl = new Map<string, { q: Q; head: V3 }>();
  const qPelvis = qAxis(UP, -P.twist * 0.5 * D2R);
  const qTorso = qMul(qAxis(UP, P.twist * D2R), qAxis(right, -P.lean * D2R));
  const hipsRest = rest(B.spine[0]);
  const hipsHead = add(add(hipsRest, [0, P.bob + (P.lift ?? 0), 0]), scl(right, (P.sway ?? 0) * 1.4));
  // coluna
  const sp = B.spine.filter((n) => has(n));
  let prevHead = hipsHead, prevRest = hipsRest, prevQ = qPelvis;
  sp.forEach((n, i) => {
    let q: Q;
    if (i === 0) q = qPelvis;
    else if (i <= 3) q = qSlerp(qPelvis, qTorso, i / 3);
    else q = qMul(qAxis(right, -(P.headPitch ?? 0) * D2R * ((i - 3) / (sp.length - 4 || 1))), qTorso);
    const head = i === 0 ? hipsHead : add(prevHead, qRot(prevQ, sub(rest(n), prevRest)));
    ctrl.set(n, { q, head });
    prevHead = head; prevRest = rest(n); prevQ = q;
  });
  const chest = sp[Math.min(3, sp.length - 1)];
  // pernas: pose "L" → lado .R (direita) e "R" → .L, para manter a oposição braço/perna
  const legChain = (side: 'L' | 'R', hip: number, knee: number, foot: number, ab: number) => {
    const s = side === 'L' ? 'R' : 'L';
    const [th, th1, sh, sh1, ft, toe] = B.leg(s);
    if (!has(th)) return;
    const sideSign = s === 'R' ? 1 : -1;
    const abQ = qAxis(F, -sideSign * ab * D2R);
    const qTh = qMul(abQ, qMul(pitch(hip * D2R), qPelvis));
    const qSh = qMul(abQ, qMul(pitch((hip - knee) * D2R), qPelvis));
    const qFt = qMul(qAxis(right, -foot * D2R), qSh);
    const hTh = add(hipsHead, qRot(qPelvis, sub(rest(th), hipsRest)));
    ctrl.set(th, { q: qTh, head: hTh });
    const hTh1 = add(hTh, qRot(qTh, sub(rest(th1), rest(th)))); ctrl.set(th1, { q: qTh, head: hTh1 });
    const hSh = add(hTh1, qRot(qTh, sub(rest(sh), rest(th1)))); ctrl.set(sh, { q: qSh, head: hSh });
    const hSh1 = add(hSh, qRot(qSh, sub(rest(sh1), rest(sh)))); ctrl.set(sh1, { q: qSh, head: hSh1 });
    const hFt = add(hSh1, qRot(qSh, sub(rest(ft), rest(sh1)))); ctrl.set(ft, { q: qFt, head: hFt });
    if (has(toe)) ctrl.set(toe, { q: qFt, head: add(hFt, qRot(qFt, sub(rest(toe), rest(ft)))) });
  };
  legChain('L', P.hipL, P.kneeL, P.footL ?? 0, P.legAbL ?? 2);
  legChain('R', P.hipR, P.kneeR, P.footR ?? 0, P.legAbR ?? 2);
  // braços: direção desejada a partir do ombro
  const armChain = (side: 'L' | 'R', sh: number, el: number, ab: number) => {
    const s = side === 'L' ? 'R' : 'L';
    const [shd, ua, ua1, fa, fa1, hand] = B.arm(s);
    if (!has(ua)) return;
    const out = s === 'R' ? right : scl(right, -1);
    const cq = ctrl.get(chest)!;
    const hShd = add(cq.head, qRot(cq.q, sub(rest(shd), rest(chest))));
    ctrl.set(shd, { q: cq.q, head: hShd });
    const hUa = add(hShd, qRot(cq.q, sub(rest(ua), rest(shd))));
    const a = sh * D2R, abr = ab * D2R;
    const DOWN: V3 = [0, -1, 0];
    const d1 = nrm(add(add(scl(DOWN, Math.cos(a) * Math.cos(abr)), scl(F, Math.sin(a))), scl(out, Math.sin(abr))));
    const restUa = sub(rest(fa), rest(ua));
    const qUa = qMul(qFromTo(qRot(cq.q, restUa), qRot(cq.q, d1)), cq.q);
    ctrl.set(ua, { q: qUa, head: hUa });
    const hUa1 = add(hUa, qRot(qUa, sub(rest(ua1), rest(ua)))); ctrl.set(ua1, { q: qUa, head: hUa1 });
    const a2 = (sh + el) * D2R;
    const d2 = nrm(add(add(scl(DOWN, Math.cos(a2) * Math.cos(abr * 0.6)), scl(F, Math.sin(a2))), scl(out, Math.sin(abr * 0.6))));
    const hFa = add(hUa1, qRot(qUa, sub(rest(fa), rest(ua1))));
    const restFa = sub(rest(hand), rest(fa));
    const qFa = qMul(qFromTo(qRot(qUa, restFa), d2), qUa);
    ctrl.set(fa, { q: qFa, head: hFa });
    const hFa1 = add(hFa, qRot(qFa, sub(rest(fa1), rest(fa)))); ctrl.set(fa1, { q: qFa, head: hFa1 });
    ctrl.set(hand, { q: qFa, head: add(hFa1, qRot(qFa, sub(rest(hand), rest(fa1)))) });
  };
  armChain('L', P.shL, P.elL, P.abL ?? 8);
  armChain('R', P.shR, P.elR, P.abR ?? 8);

  // matriz posada (mundo) por nó: ossos controlados recebem a pose; os demais seguem um osso controlado
  const ctrlDelta = new Map<string, M4>();
  for (const [n, c] of ctrl) ctrlDelta.set(n, mul4(T4(c.head), mul4(qMat(c.q), T4(scl(rest(n), -1)))));
  const ctrlNames = [...ctrl.keys()];
  const sideOf = (n: string) => (/\.L(\.\d+)?$/.test(n) ? 'L' : /\.R(\.\d+)?$/.test(n) ? 'R' : '');
  const follow = (name: string, pos: V3): string => {
    if (ctrl.has(name)) return name;
    const sd = sideOf(name);
    const low = name.toLowerCase();
    if (/thumb|f_index|f_middle|f_ring|f_pinky|palm|finger|hand/.test(low) && sd && ctrl.has(`DEF-hand.${sd}`)) return `DEF-hand.${sd}`;
    if (/toe|heel|foot/.test(low) && sd && ctrl.has(`DEF-foot.${sd}`)) return `DEF-foot.${sd}`;
    if (/forearm/.test(low) && sd && ctrl.has(`DEF-forearm.${sd}`)) return `DEF-forearm.${sd}`;
    if (/upper_arm/.test(low) && sd && ctrl.has(`DEF-upper_arm.${sd}`)) return `DEF-upper_arm.${sd}`;
    if (/shin/.test(low) && sd && ctrl.has(`DEF-shin.${sd}`)) return `DEF-shin.${sd}`;
    if (/thigh/.test(low) && sd && ctrl.has(`DEF-thigh.${sd}`)) return `DEF-thigh.${sd}`;
    if (/jaw|lip|ear|nose|lid|brow|cheek|teeth|tongue|eye|forehead|temple|chin|head|face|hair/.test(low)) return sp[sp.length - 1];
    if (/breast|chest|shoulder/.test(low)) return sd && ctrl.has(`DEF-shoulder.${sd}`) && /shoulder/.test(low) ? `DEF-shoulder.${sd}` : chest;
    if (/pelvis|hips|torso|root/.test(low)) return sp[0];
    // espacial: osso controlado mais próximo do mesmo lado
    let best = sp[0], bd = Infinity;
    for (const c of ctrlNames) {
      if (sd && sideOf(c) && sideOf(c) !== sd) continue;
      const r = rest(c), d = Math.hypot(r[0] - pos[0], r[1] - pos[1], r[2] - pos[2]);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
  const deltaIdx = new Map<number, M4>();
  const deltaOf = (i: number): M4 => {
    if (deltaIdx.has(i)) return deltaIdx.get(i)!;
    const nd = rig.nodes[i];
    let d: M4;
    if (nd.isJoint || ctrl.has(nd.name)) { const f = follow(nd.name, [nd.rest[12], nd.rest[13], nd.rest[14]]); d = ctrlDelta.get(f)!; }
    else {
      // malha presa a um osso (cabelo, olhos…): usa o primeiro ancestral que seja junta
      let pi = nd.parent; d = I4();
      while (pi >= 0 && !rig.nodes[pi].isJoint && !/head|neck/i.test(rig.nodes[pi].name)) pi = rig.nodes[pi].parent;
      if (pi >= 0) { const pn = rig.nodes[pi]; d = ctrlDelta.get(follow(pn.name, [pn.rest[12], pn.rest[13], pn.rest[14]]))!; }
      else d = ctrlDelta.get(sp[0])!;
    }
    deltaIdx.set(i, d);
    return d;
  };

  // skinning
  const P_: number[] = [], N_: number[] = [], U_: number[] = [], M_: number[] = [];
  for (const p of rig.prims) {
    const nV = p.pos.length / 3;
    const outP = new Float32Array(nV * 3), outN = new Float32Array(nV * 3);
    if (p.skin && p.joints && p.weights) {
      const jm = p.skin.joints.map((j, i) => mul4(deltaOf(j), mul4(rig.nodes[j].rest, p.skin!.ibm[i])));
      for (let v = 0; v < nV; v++) {
        let x = 0, y = 0, z = 0, nx = 0, ny = 0, nz = 0, ws = 0;
        for (let k = 0; k < 4; k++) {
          const w = p.weights[v * 4 + k]; if (w <= 0) continue;
          const m = jm[p.joints[v * 4 + k]];
          const q = tf(m, p.pos.subarray(v * 3, v * 3 + 3)), n = tf(m, p.nrm.subarray(v * 3, v * 3 + 3), 0);
          x += q[0] * w; y += q[1] * w; z += q[2] * w; nx += n[0] * w; ny += n[1] * w; nz += n[2] * w; ws += w;
        }
        if (ws > 0) { x /= ws; y /= ws; z /= ws; }
        outP.set([x, y, z], v * 3); outN.set(nrm([nx, ny, nz]), v * 3);
      }
    } else {
      const m = mul4(deltaOf(p.node), rig.nodes[p.node].rest);
      for (let v = 0; v < nV; v++) { outP.set(tf(m, p.pos.subarray(v * 3, v * 3 + 3)), v * 3); outN.set(nrm(tf(m, p.nrm.subarray(v * 3, v * 3 + 3), 0)), v * 3); }
    }
    for (let i = 0; i < p.idx.length; i++) {
      const v = p.idx[i];
      P_.push(outP[v * 3], outP[v * 3 + 1], outP[v * 3 + 2]); N_.push(outN[v * 3], outN[v * 3 + 1], outN[v * 3 + 2]); U_.push(p.uv[v * 2], p.uv[v * 2 + 1]);
      if (i % 3 === 2) M_.push(p.mat);
    }
  }
  const mesh: Mesh = { pos: new Float32Array(P_), nrm: new Float32Array(N_), uv: new Float32Array(U_), mat: new Uint16Array(M_), mats: rig.mats, min: [0, 0, 0], max: [0, 0, 0] };
  computeBounds(mesh);
  // apoio no chão
  const ground = P.grounded ? mesh.min[1] - (P.lift ?? 0) : 0;
  const cx = hipsRest[0], cz = hipsRest[2];
  for (let i = 0; i < mesh.pos.length; i += 3) { mesh.pos[i] -= cx; mesh.pos[i + 1] -= ground; mesh.pos[i + 2] -= cz; }
  computeBounds(mesh);
  return mesh;
}

export { qAxis, qRot };
