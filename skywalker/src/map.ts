// Geografia da floresta: relevo, trilha, lugares da história e pontos de coleta.
import { fbm, smooth, lerp } from './noise';

export const TERRAIN_SIZE = 280;
export const PLAY_RADIUS = 112;

export type V2 = { x: number; z: number };
const v = (x: number, z: number): V2 => ({ x, z });

export const CABIN = v(0, 78);
export const SPAWN = v(1.5, 66);
export const LAIR = v(2, -96);

/** trilha antiga: da cabana até o covil */
export const PATH: V2[] = [v(0, 70), v(3, 52), v(-4, 34), v(-7, 16), v(4, -2), v(7, -22), v(-3, -42), v(-8, -58), v(5, -76), v(2, -88)];

export interface ClueDef { key: string; model: string; pos: V2; title: string; text: string; voice: string; rotY: number }
export const CLUES: ClueDef[] = [
  { key: 'shoe', model: 'kids_shoe', pos: v(-10, 44), rotY: 0.6, title: 'Tênis do Theo', voice: 'v_clue1',
    text: 'O tênis do Theo… ainda está molhado. Ele passou por aqui.' },
  { key: 'teddy', model: 'teddy', pos: v(19, 14), rotY: -0.9, title: 'O ursinho', voice: 'v_clue2',
    text: 'O ursinho dele. Ele nunca dormia sem ele… Aguenta firme, filho.' },
  { key: 'car', model: 'toy_car', pos: v(-24, -16), rotY: 2.1, title: 'Carrinho de madeira', voice: 'v_clue3',
    text: 'O carrinho que eu fiz pra ele. Tem marcas de garras na madeira.' },
  { key: 'walkie', model: 'walkie', pos: v(23, -47), rotY: 0.3, title: 'O rádio do Theo', voice: 'v_clue4',
    text: 'O rádio dele… Theo? Theo, é o papai! Responde!' },
  { key: 'drawing', model: 'drawing', pos: v(-21, -70), rotY: -0.4, title: 'Um desenho', voice: 'v_clue5',
    text: 'Um desenho… um homem com chifres. Ele sabia. Ele já tinha visto essa coisa.' },
];

export interface PickupDef { kind: 'ammo' | 'battery'; pos: V2 }
export const PICKUPS: PickupDef[] = [
  { kind: 'ammo', pos: v(4.2, 71.5) },
  { kind: 'battery', pos: v(-3.5, 72) },
  { kind: 'battery', pos: v(-14, 26) },
  { kind: 'ammo', pos: v(12, 30) },
  { kind: 'ammo', pos: v(26, -4) },
  { kind: 'battery', pos: v(-17, -34) },
  { kind: 'ammo', pos: v(9, -36) },
  { kind: 'battery', pos: v(30, -62) },
  { kind: 'ammo', pos: v(-12, -82) },
  { kind: 'ammo', pos: v(14, -86) },
  { kind: 'battery', pos: v(-30, 4) },
];

/** clareiras onde não nascem árvores (x, z, raio) */
export const CLEARINGS: [number, number, number][] = [
  [CABIN.x, CABIN.z, 13], [SPAWN.x, SPAWN.z, 5], [LAIR.x, LAIR.z, 15],
  ...CLUES.map((c) => [c.pos.x, c.pos.z, 3.2] as [number, number, number]),
  ...PICKUPS.map((p) => [p.pos.x, p.pos.z, 1.6] as [number, number, number]),
];

function segDist(px: number, pz: number, a: V2, b: V2) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz)));
  const x = a.x + dx * t - px, z = a.z + dz * t - pz;
  return Math.sqrt(x * x + z * z);
}

export function pathDist(x: number, z: number) {
  let d = 1e9;
  for (let i = 0; i < PATH.length - 1; i++) d = Math.min(d, segDist(x, z, PATH[i], PATH[i + 1]));
  return d;
}

function rawHeight(x: number, z: number) {
  return fbm(x * 0.011 + 3.1, z * 0.011 - 1.7, 4) * 5.0 + fbm(x * 0.05 + 7, z * 0.05, 3) * 0.7;
}

const FLAT: [number, number, number, number, number][] = [
  [CABIN.x, CABIN.z, 9, 18, rawHeight(CABIN.x, CABIN.z)],
  [LAIR.x, LAIR.z, 11, 22, rawHeight(LAIR.x, LAIR.z) - 0.6],
];

export function heightAt(x: number, z: number) {
  let h = rawHeight(x, z);
  for (const [cx, cz, r0, r1, hc] of FLAT) {
    const d = Math.hypot(x - cx, z - cz);
    h = lerp(hc, h, smooth(r0, r1, d));
  }
  const p = 1 - smooth(0.8, 2.8, pathDist(x, z));
  h -= p * 0.12;
  // borda do mapa sobe um pouco (barranco) — reforça o limite jogável
  const r = Math.hypot(x, z);
  h += smooth(PLAY_RADIUS - 4, PLAY_RADIUS + 25, r) * 6;
  return h;
}

export function pathMask(x: number, z: number) { return 1 - smooth(0.9, 2.6, pathDist(x, z) + fbm(x * 0.3, z * 0.3, 2) * 0.6); }
