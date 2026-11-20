// Tiles isométricos 32×16 gerados por pixel. Os padrões usam coordenadas do
// reticulado (u, v) periódicas, então tiles vizinhos se encaixam sem costura.

import { RGB, hex, mix, ramp } from './color';
import { BAYER4, fbm, hash2, vnoise } from './noise';
import { Image, newImage, setPx } from './rt';

export const TILE_W = 32, TILE_H = 16;

// bits de borda: 1 = -y (cima-direita), 2 = +x (baixo-direita), 4 = +y (baixo-esquerda), 8 = -x (cima-esquerda)
export const E_NY = 1, E_PX = 2, E_PY = 4, E_NX = 8;

type PixFn = (u: number, v: number, X: number, Y: number) => RGB | [number, number, number, number] | null;

export function tile(fn: PixFn): Image {
  const img = newImage(TILE_W, TILE_H);
  for (let Y = 0; Y < TILE_H; Y++) for (let X = 0; X < TILE_W; X++) {
    const cx = X + 0.5 - 16, cy = Y + 0.5;
    const u = cx / 32 + cy / 16, v = cy / 16 - cx / 32;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
    const c = fn(u, v, X, Y);
    if (!c) continue;
    if (c.length === 4) setPx(img, X, Y, [c[0], c[1], c[2]], c[3]);
    else setPx(img, X, Y, c as RGB);
  }
  return img;
}

/** distância (em u/v) até as bordas marcadas na máscara */
function edgeDist(u: number, v: number, mask: number): number {
  let d = 9;
  if (mask & E_NY) d = Math.min(d, v);
  if (mask & E_PX) d = Math.min(d, 1 - u);
  if (mask & E_PY) d = Math.min(d, 1 - v);
  if (mask & E_NX) d = Math.min(d, u);
  return d;
}

const P = {
  grass: ramp('#5f9e45', { spread: 0.8 }),
  grassDry: ramp('#93a052', { spread: 0.7 }),
  sand: ramp('#e8cf98', { spread: 0.55 }),
  wetSand: ramp('#c9ad78', { spread: 0.55 }),
  deep: ramp('#1f6f9e', { spread: 0.7 }),
  mid: ramp('#2c93b5', { spread: 0.7 }),
  shallow: ramp('#46bcc4', { spread: 0.6 }),
  asphalt: ramp('#4d4f5c', { spread: 0.45, hueShift: 0.4 }),
  concrete: ramp('#c9c2b4', { spread: 0.45 }),
  pave: ramp('#c47a58', { spread: 0.55 }),
  dirt: ramp('#a77c52', { spread: 0.6 }),
};

function pick(r: RGB[], i: number): RGB { return r[Math.max(0, Math.min(r.length - 1, i))]; }

// ---------------- grama
export function grassTile(variant: number, sandMask = 0, flowers = false): Image {
  return tile((u, v, X, Y) => {
    const n = fbm(u * 4, v * 4, 11 + variant * 3, 3, 4);
    const blade = hash2(X + variant * 57, Y * 3 + variant, 5);
    let i = 2;
    if (n > 0.6) i = 3; else if (n < 0.4) i = 1;
    if (blade > 0.93) i += 1;
    if (blade < 0.06) i -= 1;
    // tufos: pixel claro com sombra embaixo
    let c = pick(P.grass, i);
    if (flowers && hash2(X, Y, 90 + variant) > 0.965) {
      const fl = [hex('#f4e9f0'), hex('#f2c94c'), hex('#e46b8a'), hex('#b9a0e8')][Math.floor(hash2(X, Y, 3) * 4)];
      c = fl;
    }
    if (sandMask) {
      const d = edgeDist(u, v, sandMask);
      const jag = 0.12 + 0.08 * vnoise(u * 9 + v * 9, (u - v) * 9, 3 + variant);
      if (d < jag) return pick(P.sand, hash2(X, Y, 8) > 0.8 ? 3 : 2);
      if (d < jag + 0.06) c = pick(P.grass, 1);
    }
    return c;
  });
}

export function lotTile(variant: number): Image {
  return tile((u, v, X, Y) => {
    const n = fbm(u * 3, v * 3, 40 + variant, 3, 3);
    if (n < 0.42) return pick(P.dirt, hash2(X, Y, 2) > 0.7 ? 3 : 2);
    let i = n > 0.62 ? 3 : 2;
    if (hash2(X, Y, 7 + variant) > 0.92) i++;
    return pick(P.grassDry, i);
  });
}

// ---------------- areia
export function sandTile(variant: number, wetMask = 0, deco = 0): Image {
  return tile((u, v, X, Y) => {
    const n = fbm(u * 5, v * 5, 21 + variant, 2, 5);
    let c = pick(P.sand, n > 0.62 ? 3 : n < 0.36 ? 1 : 2);
    // ondulações de vento
    const rip = Math.sin((u * 3 + v) * Math.PI * 6 + vnoise(u * 4, v * 4, 9) * 3);
    if (rip > 0.92) c = pick(P.sand, 3);
    if (hash2(X, Y, 31 + variant) > 0.975) c = pick(P.sand, 1);
    if (wetMask) {
      const d = edgeDist(u, v, wetMask);
      if (d < 0.22) c = pick(P.wetSand, d < 0.1 ? 1 : 2);
      else if (d < 0.3 && BAYER4[Y % 4][X % 4] > (d - 0.22) / 0.08) c = pick(P.wetSand, 2);
    }
    if (deco === 1) {
      // concha
      const sx = 15, sy = 8;
      const dx = X - sx, dy = Y - sy;
      if (dx * dx + dy * dy * 2 < 5) return dy < 0 ? hex('#fbe8dd') : hex('#e9b8a8');
      if (dx === 0 && dy === 2) return hex('#b98a7a');
    }
    if (deco === 2) {
      const dx = X - 12, dy = Y - 9;
      if (dx * dx + dy * dy < 3) return hex('#f6f2ee');
      if (dx === 3 && dy === -1) return hex('#d97a6a');
    }
    return c;
  });
}

// ---------------- água (animada, padrão periódico no reticulado)
export function waterTile(depth: 0 | 1 | 2, frame: number, frames: number): Image {
  const r = depth === 0 ? P.deep : depth === 1 ? P.mid : P.shallow;
  const ph = (frame / frames) * Math.PI * 2;
  return tile((u, v, X, Y) => {
    const w1 = Math.sin(2 * Math.PI * (u * 1 + v * 2) + ph);
    const w2 = Math.sin(2 * Math.PI * (u * 2 - v * 1) - ph + 1.3);
    const w3 = Math.sin(2 * Math.PI * (u * 3 + v * 1) + ph * 2 + 0.7);
    const s = w1 * 0.5 + w2 * 0.35 + w3 * 0.25;
    let i = 2;
    if (s > 0.62) i = 4;
    else if (s > 0.38) i = 3;
    else if (s < -0.7) i = 1;
    if (i === 4 && BAYER4[Y % 4][X % 4] > 0.5) i = 3;
    return pick(r, i);
  });
}

/** espuma na borda que encosta na areia (overlay com alfa) */
export function foamTile(mask: number, frame: number, frames: number): Image {
  const ph = (frame / frames) * Math.PI * 2;
  const reach = 0.16 + 0.1 * Math.sin(ph);
  const white = hex('#f4fbfb'), light = hex('#bfe9ec');
  return tile((u, v, X, Y) => {
    const d = edgeDist(u, v, mask);
    if (d > 0.5) return null;
    const along = (mask & (E_NY | E_PY)) ? u : v;
    const wob = 0.04 * Math.sin(along * Math.PI * 4 + ph * 2) + 0.03 * Math.sin(along * Math.PI * 10 - ph);
    const edge = reach + wob;
    if (d < edge - 0.05) return [white[0], white[1], white[2], 235];
    if (d < edge) return light;
    if (d < edge + 0.08 && hash2(X, Y, frame) > 0.6) return [white[0], white[1], white[2], 150];
    if (d < 0.42 && Math.abs(d - (edge + 0.2 + 0.05 * Math.sin(along * 12 + ph))) < 0.025) return [light[0], light[1], light[2], 140];
    return null;
  });
}

// ---------------- asfalto e marcações
export function asphaltTile(variant: number, line = 0, cross: 'x' | 'y' | null = null, curbMask = 0, center: 'x' | 'y' | null = null): Image {
  return tile((u, v, X, Y) => {
    const n = fbm(u * 6, v * 6, 61 + variant, 2, 6);
    let c = pick(P.asphalt, n > 0.62 ? 3 : n < 0.38 ? 1 : 2);
    if (hash2(X, Y, 9 + variant) > 0.95) c = pick(P.asphalt, 3);
    if (hash2(X, Y, 19 + variant) > 0.97) c = pick(P.asphalt, 0);
    if (variant === 3) {
      // bueiro
      const du = u - 0.5, dv = v - 0.5;
      if (Math.abs(du) < 0.16 && Math.abs(dv) < 0.16) return Math.floor((du + 0.16) * 30) % 2 ? pick(P.asphalt, 0) : hex('#6c6c74');
    }
    // linha amarela tracejada na borda
    if (line) {
      const d = edgeDist(u, v, line);
      const along = (line & (E_NY | E_PY)) ? u : v;
      if (d < 0.07 && (along * 2) % 1 < 0.6) return hex('#e8c14a');
    }
    if (center) {
      // linha central tracejada no meio do tile (rua ao longo de x → linha em v = 0.5)
      const across = center === 'x' ? v : u;
      const along = center === 'x' ? u : v;
      if (Math.abs(across - 0.5) < 0.05 && (along * 2) % 1 < 0.55) return hex('#e8c14a');
    }
    if (cross) {
      const along = cross === 'x' ? v : u;
      const across = cross === 'x' ? u : v;
      if (across > 0.12 && across < 0.88 && (along * 4) % 1 < 0.5) return hex('#ece8df');
    }
    if (curbMask) {
      const d = edgeDist(u, v, curbMask);
      if (d < 0.05) c = mix(c, hex('#2a2b33'), 0.5);
    }
    return c;
  });
}

// ---------------- calçada de concreto com meio-fio
export function sidewalkTile(variant: number, curbMask: number): Image {
  return tile((u, v, X, Y) => {
    const n = vnoise(u * 7, v * 7, 70 + variant, 7);
    let c = pick(P.concrete, n > 0.65 ? 3 : 2);
    // juntas das placas (2×2 por tile)
    const gu = (u * 2) % 1, gv = (v * 2) % 1;
    if (gu < 0.045 || gv < 0.045) c = pick(P.concrete, 1);
    if (hash2(X, Y, 71 + variant) > 0.96) c = pick(P.concrete, 1);
    if (curbMask) {
      const d = edgeDist(u, v, curbMask);
      if (d < 0.06) c = pick(P.concrete, 0);
      else if (d < 0.13) c = pick(P.concrete, 4);
    }
    return c;
  });
}

// ---------------- calçadão em ondas (pedra portuguesa) — padrão contínuo
export function boardwalkTile(curbMask: number): Image {
  const blk = hex('#2b2a31'), wht = hex('#efe9dc'), wht2 = hex('#ddd5c4');
  return tile((u, v, X, Y) => {
    const w = (v + 0.22 * Math.sin(2 * Math.PI * u * 2)) * 2;
    const f = ((w % 1) + 1) % 1;
    let c = f < 0.42 ? blk : (hash2(X, Y, 3) > 0.85 ? wht2 : wht);
    if (curbMask) {
      const d = edgeDist(u, v, curbMask);
      if (d < 0.06) c = pick(P.concrete, 0);
      else if (d < 0.13) c = pick(P.concrete, 4);
    }
    return c;
  });
}

// ---------------- piso de praça (tijolinho)
export function paverTile(variant: number): Image {
  return tile((u, v, X, Y) => {
    const row = Math.floor(v * 4);
    const off = row % 2 ? 0.5 : 0;
    const col = Math.floor(u * 3 + off);
    const fu = (u * 3 + off) % 1, fv = (v * 4) % 1;
    if (fu < 0.07 || fv < 0.1) return pick(P.pave, 0);
    const h = hash2(col + variant * 13, row, 44);
    return pick(P.pave, h > 0.7 ? 3 : h < 0.2 ? 1 : 2);
  });
}

export const PAL = P;
