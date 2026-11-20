// Transfere clipes de animação (Mixamo) entre esqueletos humanoides com os mesmos
// nomes de ossos (com ou sem o prefixo "mixamorig:"), compensando diferenças de
// orientação de repouso: G_alvo(t) = G_fonte(t) · G_fonte_repouso⁻¹ · G_alvo_repouso.
import { Document, NodeIO, Node as GNode, AnimationSampler } from '@gltf-transform/core';

type Q = [number, number, number, number];
type M = number[];
const qMul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qInv = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]];
const qNorm = (q: Q): Q => { const l = Math.hypot(...q) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };
function qSlerp(a: Q, b: Q, t: number): Q {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = d < 0 ? (b.map((x) => -x) as Q) : b; d = Math.abs(d);
  if (d > 0.9995) return qNorm(a.map((x, i) => x + (bb[i] - x) * t) as Q);
  const th = Math.acos(d), s = Math.sin(th);
  return a.map((x, i) => (x * Math.sin((1 - t) * th) + bb[i] * Math.sin(t * th)) / s) as Q;
}
function qFromMat(m: M): Q {
  // remove escala das colunas
  const sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
  const r = [m[0] / sx, m[1] / sx, m[2] / sx, m[4] / sy, m[5] / sy, m[6] / sy, m[8] / sz, m[9] / sz, m[10] / sz];
  const [m00, m10, m20, m01, m11, m21, m02, m12, m22] = r;
  const tr = m00 + m11 + m22;
  let q: Q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]; }
  return qNorm(q);
}
function inv4(a: M): M {
  const o = new Array(16).fill(0);
  const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4];
  const b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
  const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12];
  const b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
  const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
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
const tfP = (m: M, p: number[]) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

export const canon = (n: string) => n.replace(/^mixamorig\d*:/, '').replace(/^Armature\|/, '');

function sampler(s: AnimationSampler, t: number, comps: number, isRot: boolean): number[] {
  const inp = s.getInput()!, out = s.getOutput()!;
  const n = inp.getCount();
  const tm: number[] = [0];
  let lo = 0;
  inp.getElement(0, tm); if (t <= tm[0]) { const v = new Array(comps).fill(0); out.getElement(0, v); return v; }
  inp.getElement(n - 1, tm); if (t >= tm[0]) { const v = new Array(comps).fill(0); out.getElement(n - 1, v); return v; }
  let hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; inp.getElement(mid, tm); if (tm[0] <= t) lo = mid; else hi = mid; }
  const t0: number[] = [0], t1: number[] = [0]; inp.getElement(lo, t0); inp.getElement(hi, t1);
  const a = new Array(comps).fill(0), b = new Array(comps).fill(0);
  out.getElement(lo, a); out.getElement(hi, b);
  const f = (t - t0[0]) / Math.max(1e-6, t1[0] - t0[0]);
  if (s.getInterpolation() === 'STEP') return a;
  if (isRot) return qSlerp(a as Q, b as Q, f);
  return a.map((x, i) => x + (b[i] - x) * f);
}

interface Src { doc: Document; nodes: GNode[] }

export async function retargetClips(io: NodeIO, target: Document, clips: { name: string; file: string; clip: string }[]): Promise<string[]> {
  const tRoot = target.getRoot();
  const skin = tRoot.listSkins()[0];
  if (!skin) throw new Error('avatar sem esqueleto');
  const tJoints = skin.listJoints();
  const tByCanon = new Map(tJoints.map((j) => [canon(j.getName()), j]));
  const depth = (n: GNode) => { let d = 0, p = n.getParentNode(); while (p) { d++; p = p.getParentNode(); } return d; };
  const tOrder = [...tJoints].sort((a, b) => depth(a) - depth(b));
  const tRestG = new Map<GNode, Q>(tRoot.listNodes().map((n) => [n, qFromMat(n.getWorldMatrix() as unknown as M)]));
  const tHips = tByCanon.get('Hips')!;
  const tHipsRestW = tHips.getWorldTranslation();
  const tHipsParentW = (tHips.getParentNode()?.getWorldMatrix() ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) as unknown as M;
  const tHipsParentInv = inv4(tHipsParentW);
  const tJointSet = new Set(tJoints);

  const cache = new Map<string, Src>();
  const made: string[] = [];
  for (const c of clips) {
    if (!cache.has(c.file)) { const d = await io.read(c.file); cache.set(c.file, { doc: d, nodes: d.getRoot().listNodes() }); }
    const src = cache.get(c.file)!;
    const anim = src.doc.getRoot().listAnimations().find((a) => a.getName() === c.clip);
    if (!anim) { console.warn('clipe ausente', c.clip); continue; }
    // canais por nó
    const rotCh = new Map<GNode, AnimationSampler>(), posCh = new Map<GNode, AnimationSampler>();
    let dur = 0;
    for (const ch of anim.listChannels()) {
      const n = ch.getTargetNode(); const s = ch.getSampler(); if (!n || !s) continue;
      if (ch.getTargetPath() === 'rotation') rotCh.set(n, s);
      if (ch.getTargetPath() === 'translation') posCh.set(n, s);
      dur = Math.max(dur, s.getInput()!.getMax([0])[0]);
    }
    const sSkin = src.doc.getRoot().listSkins()[0];
    const sJoints = sSkin.listJoints();
    const sByCanon = new Map(sJoints.map((j) => [canon(j.getName()), j]));
    const sJointSet = new Set(sJoints);
    const sRestG = new Map<GNode, Q>(src.nodes.map((n) => [n, qFromMat(n.getWorldMatrix() as unknown as M)]));
    const sHips = sByCanon.get('Hips')!;
    const sHipsParentW = (sHips.getParentNode()?.getWorldMatrix() ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) as unknown as M;
    const sHipsRestW = sHips.getWorldTranslation();
    const k = tHipsRestW[1] / sHipsRestW[1];
    const inPlace = /idle|walk|run/i.test(c.name);

    const fps = 30, frames = Math.max(2, Math.round(dur * fps) + 1);
    const times: number[] = [];
    const outRot = new Map<GNode, number[]>(), outPos: number[] = [];
    for (const j of tOrder) outRot.set(j, []);
    for (let f = 0; f < frames; f++) {
      const t = Math.min(dur, f / fps);
      times.push(t);
      // FK da fonte: rotação global por junta
      const sG = new Map<GNode, Q>();
      const gOf = (n: GNode): Q => {
        if (sG.has(n)) return sG.get(n)!;
        let g: Q;
        if (!sJointSet.has(n)) g = sRestG.get(n)!;
        else {
          const local = rotCh.has(n) ? (sampler(rotCh.get(n)!, t, 4, true) as Q) : (n.getRotation() as Q);
          const p = n.getParentNode();
          g = qNorm(p ? qMul(gOf(p), local) : local);
        }
        sG.set(n, g); return g;
      };
      const tG = new Map<GNode, Q>();
      for (const j of tOrder) {
        const sj = sByCanon.get(canon(j.getName()));
        const p = j.getParentNode();
        const pG = p ? (tJointSet.has(p) ? tG.get(p)! : tRestG.get(p)!) : ([0, 0, 0, 1] as Q);
        let g: Q;
        if (sj) g = qNorm(qMul(qMul(gOf(sj), qInv(sRestG.get(sj)!)), tRestG.get(j)!));
        else g = qMul(pG, j.getRotation() as Q);
        tG.set(j, g);
        outRot.get(j)!.push(...qNorm(qMul(qInv(pG), g)));
      }
      // translação do quadril (escala pela altura do quadril)
      const sLocal = posCh.has(sHips) ? sampler(posCh.get(sHips)!, t, 3, false) : (sHips.getTranslation() as number[]);
      const sW = tfP(sHipsParentW, sLocal);
      let dx = (sW[0] - sHipsRestW[0]) * k, dy = (sW[1] - sHipsRestW[1]) * k, dz = (sW[2] - sHipsRestW[2]) * k;
      if (inPlace) { dx = 0; dz = 0; }
      outPos.push(...tfP(tHipsParentInv, [tHipsRestW[0] + dx, tHipsRestW[1] + dy, tHipsRestW[2] + dz]));
    }
    const buf = tRoot.listBuffers()[0] ?? target.createBuffer();
    const input = target.createAccessor().setType('SCALAR').setArray(new Float32Array(times)).setBuffer(buf);
    const a = target.createAnimation(c.name);
    for (const j of tOrder) {
      const out = target.createAccessor().setType('VEC4').setArray(new Float32Array(outRot.get(j)!)).setBuffer(buf);
      const s = target.createAnimationSampler().setInput(input).setOutput(out).setInterpolation('LINEAR');
      a.addSampler(s).addChannel(target.createAnimationChannel().setTargetNode(j).setTargetPath('rotation').setSampler(s));
    }
    const po = target.createAccessor().setType('VEC3').setArray(new Float32Array(outPos)).setBuffer(buf);
    const ps = target.createAnimationSampler().setInput(input).setOutput(po).setInterpolation('LINEAR');
    a.addSampler(ps).addChannel(target.createAnimationChannel().setTargetNode(tHips).setTargetPath('translation').setSampler(ps));
    made.push(c.name);
  }
  return made;
}
