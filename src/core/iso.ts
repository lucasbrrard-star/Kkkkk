import { CONFIG } from '../config';

const HW = CONFIG.iso.tileW / 2, HH = CONFIG.iso.tileH / 2;

/** Mundo (tiles; x→baixo-direita, y→baixo-esquerda) para tela (px). */
export function toScreen(x: number, y: number, z = 0): { x: number; y: number } {
  return { x: (x - y) * HW, y: (x + y) * HH - z * CONFIG.iso.heightPx };
}

export function toWorld(sx: number, sy: number): { x: number; y: number } {
  const a = sx / HW, b = sy / HH;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Profundidade de ordenação a partir da posição no chão. */
export function depthOf(x: number, y: number): number {
  return (x + y) * HH;
}

export const DIRS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'] as const;

/** Converte vetor de tela (direita, baixo) em direção no mundo (tiles). */
export function screenVecToWorld(r: number, d: number): { x: number; y: number } {
  const k = Math.SQRT1_2;
  return { x: (r + d) * k, y: (d - r) * k };
}

/** Converte vetor do mundo em vetor de tela (direita, baixo) no plano do chão. */
export function worldVecToScreen(x: number, y: number): { r: number; d: number } {
  const k = Math.SQRT1_2;
  return { r: (x - y) * k, d: (x + y) * k };
}

/** Índice de direção (0..7, ordem DIRS) a partir de um vetor no mundo. */
export function dirIndexFromWorld(x: number, y: number): number {
  const { r, d } = worldVecToScreen(x, y);
  const ang = Math.atan2(d, r) * 180 / Math.PI;
  return (((Math.round((90 - ang) / 45)) % 8) + 8) % 8;
}
