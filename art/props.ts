// Props a partir de modelos gratuitos do BlenderKit (ver CREDITS.md).
// Cada modelo é normalizado (escala/rotação), recolorido quando necessário e
// renderizado como pixel art pelo pipeline HD.

import fs from 'node:fs';
import { BVH, Mesh, loadGLB, transformMesh } from './mesh';
import { MeshInst } from './hd';
import { Prim, V3 } from './rt';
import { R, Sprite } from './env';
import { hash3, vnoise3 } from './noise';

const cache = new Map<string, Mesh>();
export async function model(key: string): Promise<Mesh> {
  if (!cache.has(key)) {
    const f = `tools/models/${key}.glb`;
    if (!fs.existsSync(f)) throw new Error(`Modelo ausente: ${f} — rode ./tools/fetch-models.sh`);
    cache.set(key, await loadGLB(f));
  }
  // cópia rasa dos materiais para permitir recolorir por uso
  const m = cache.get(key)!;
  return { ...m, mats: m.mats.map((x) => ({ ...x })) };
}

export function inst(mesh: Mesh, group = 1, cast = true): MeshInst { return { mesh, bvh: new BVH(mesh), group, cast }; }

/** Curva o modelo (vento) proporcionalmente à altura². */
export function bend(m: Mesh, amt: number, dir: [number, number]): Mesh {
  const h = m.max[1] - m.min[1];
  const pos = new Float32Array(m.pos);
  for (let i = 0; i < pos.length; i += 3) {
    const t = Math.max(0, (pos[i + 1] - m.min[1]) / h);
    const k = amt * t * t;
    pos[i] += dir[0] * k; pos[i + 2] += dir[1] * k;
  }
  return { ...m, pos };
}

export async function palm(seed: number, frame: number, frames: number, height: number): Promise<Sprite> {
  let m = transformMesh(await model('palm_b'), { fitHeight: height, rotY: seed * 67 });
  for (const mm of m.mats) {
    if (/Leaves/i.test(mm.name)) { mm.sat = 1.35; mm.hue = -6; mm.tint = [1.12, 1.18, 0.92]; }
    else if (/Bark/i.test(mm.name)) { mm.tint = [1.15, 1.05, 0.95]; }
    else { mm.tint = [1.1, 1.05, 0.9]; } // cocos
  }
  const ph = (frame / frames) * Math.PI * 2;
  m = bend(m, Math.sin(ph) * 0.22, [0.7, -0.7]);
  return R([], [inst(m)], { colors: 40 });
}

export async function bloomTree(kind: 'ipe-rosa' | 'jacaranda' | 'ipe-amarelo', seed: number, height: number): Promise<Sprite> {
  const src = kind === 'ipe-amarelo' ? 'tree_gold' : 'tree_blue';
  const m = transformMesh(await model(src), { fitHeight: height, rotY: seed * 83 });
  for (const mm of m.mats) {
    if (/leaves|flower/i.test(mm.name)) {
      if (kind === 'ipe-rosa') { mm.hue = 95; mm.sat = 1.15; mm.tint = [1.9, 1.35, 1.6]; }
      else if (kind === 'jacaranda') { mm.hue = 25; mm.sat = 0.95; mm.tint = [1.7, 1.45, 1.9]; }
      else { mm.hue = 8; mm.sat = 1.25; mm.tint = [1.75, 1.5, 0.75]; }
    } else mm.tint = [1.3, 1.15, 1.05];
  }
  return R([], [inst(m)], { colors: 44 });
}

export async function flowerClump(seed: number, kind: 'rosa' | 'lilas' | 'amarela'): Promise<Sprite> {
  const m = transformMesh(await model('flowers_pink'), { fitHeight: 0.85, rotY: seed * 90 });
  const col = kind === 'rosa' ? [236, 92, 150] : kind === 'lilas' ? [178, 118, 222] : [246, 204, 72];
  for (const mm of m.mats) {
    mm.fn = (p: V3, n: V3) => {
      const t = (p[1] - m.min[1]) / (m.max[1] - m.min[1]);
      const flower = t > 0.55 && n[1] > 0.2 && hash3(Math.floor(p[0] * 30), Math.floor(p[1] * 30), Math.floor(p[2] * 30), seed) > 0.25;
      if (flower) return [col[0], col[1], col[2]];
      const v = vnoise3(p[0] * 9, p[1] * 9, p[2] * 9, seed);
      return [70 + v * 30, 140 + v * 40, 60 + v * 20];
    };
  }
  return R([], [inst(m)], { colors: 24, ss: 3 });
}

export async function streetLamp(): Promise<Sprite> {
  const m = transformMesh(await model('lamp_single'), { fitHeight: 4.2 });
  for (const mm of m.mats) {
    if (/Glass/i.test(mm.name)) mm.glow = true;
    else mm.fn = () => [58, 62, 74];
  }
  return R([], [inst(m)], { colors: 16 });
}

export async function bench(rot: number): Promise<Sprite> {
  const m = transformMesh(await model('bench'), { fitWidth: 1.9, rotY: rot });
  for (const mm of m.mats) { mm.tint = [1.2, 1.05, 0.95]; mm.sat = 1.2; }
  return R([], [inst(m)], { colors: 24 });
}

export async function fountain(frame: number): Promise<Sprite> {
  const m = transformMesh(await model('fountain'), { fitWidth: 4.6 });
  for (const mm of m.mats) mm.tint = [1.15, 1.08, 1.0];
  // água animada (procedural) dentro das bacias
  const { Cylinder } = await import('./rt');
  const water = (k: number) => (c: { p: V3 }) => {
    const r = Math.hypot(c.p[0], c.p[2]);
    const w = Math.sin(r * 9 - frame * 2.1 + k);
    return { ramp: [[36, 120, 170], [50, 150, 196], [70, 184, 214], [140, 220, 236], [220, 246, 250]] as [number, number, number][], idx: w > 0.6 ? 4 : w > 0 ? 3 : 2, emissive: true };
  };
  const prims: Prim[] = [new Cylinder([0, 0, 0], 1.75, 0.42, water(0) as never)];
  const mi = inst(m);
  return R(prims, [mi], { colors: 40 });
}

export async function lighthouse(): Promise<Sprite> {
  const m = transformMesh(await model('lighthouse'), { fitHeight: 9.5 });
  const h = m.max[1] - m.min[1];
  for (const mm of m.mats) {
    if (/Lighthouse_Baked|Circle/i.test(mm.name)) {
      mm.fn = (p: V3) => {
        const t = (p[1] - m.min[1]) / h;
        if (t < 0.08) return [150, 140, 128];
        if (t > 0.72 && t < 0.86) return [255, 236, 170];
        return Math.floor(t * 9) % 2 ? [226, 64, 52] : [246, 242, 232];
      };
    }
    if (/Stone/i.test(mm.name)) mm.fn = () => [120, 112, 104];
  }
  return R([], [inst(m)], { colors: 32 });
}

export async function sailboat(rot: number): Promise<Sprite> {
  const m = transformMesh(await model('sailboat'), { fitHeight: 5.5, rotY: rot });
  const h = m.max[1] - m.min[1];
  for (const mm of m.mats) {
    mm.tint = [1.1, 1.05, 1.0];
    if (/Ship miniature/i.test(mm.name)) mm.hidden = true;                 // suporte de miniatura
    if (/boat_Baked/i.test(mm.name)) mm.fn = (p) => ((p[1] - m.min[1]) / h < 0.075 ? [36, 62, 118] : [240, 238, 232]); // casco branco/azul
    if (/ladder_Baked/i.test(mm.name)) mm.fn = () => [176, 128, 84];
  }
  return R([], [inst(m)], { colors: 32, shadow: false });
}

export async function busStop(rot: number): Promise<Sprite> {
  const m = transformMesh(await model('busstop'), { fitWidth: 3.6, rotY: rot });
  for (const mm of m.mats) {
    if (/Glass/i.test(mm.name)) mm.fn = () => [168, 214, 226];
    else if (/Frozen|white/i.test(mm.name)) mm.fn = () => [232, 230, 224];
  }
  return R([], [inst(m)], { colors: 32 });
}

export async function umbrella(rot: number, hue: number): Promise<Sprite> {
  const m = transformMesh(await model('umbrella'), { fitHeight: 2.7, rotY: rot });
  for (const mm of m.mats) { mm.hue = hue; mm.sat = 1.5; mm.tint = [1.12, 1.05, 1.0]; }
  return R([], [inst(m)], { colors: 28 });
}

export async function lounger(rot: number, cushion: [number, number, number]): Promise<Sprite> {
  const m = transformMesh(await model('lounger'), { fitWidth: 2.0, rotY: rot });
  for (const mm of m.mats) mm.fn = (p: V3, n: V3) => (n[1] > 0.5 && p[1] > 0.25 ? cushion : [178, 128, 84]);
  return R([], [inst(m)], { colors: 16 });
}
