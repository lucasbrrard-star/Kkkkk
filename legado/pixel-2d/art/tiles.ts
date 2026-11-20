// Tiles isométricos HD 64×32 gerados por pixel, com paleta de fim de tarde.
// Padrões usam coordenadas do reticulado (u, v) periódicas: tiles vizinhos
// encaixam sem costura.

import { RGB, hex, mix, ramp } from './color';
import { BAYER4, fbm, hash2, vnoise } from './noise';
import { Image, newImage, setPx } from './rt';

export const TILE_W = 64, TILE_H = 32;

// bits de borda: 1 = -y (cima-direita), 2 = +x (baixo-direita), 4 = +y (baixo-esquerda), 8 = -x (cima-esquerda)
export const E_NY = 1, E_PX = 2, E_PY = 4, E_NX = 8;

type PixFn = (u: number, v: number, X: number, Y: number) => RGB | [number, number, number, number] | null;

export function tile(fn: PixFn): Image {
  const img = newImage(TILE_W, TILE_H);
  const hw = TILE_W / 2;
  for (let Y = 0; Y < TILE_H; Y++) for (let X = 0; X < TILE_W; X++) {
    const cx = X + 0.5 - hw, cy = Y + 0.5;
    const u = cx / TILE_W + cy / TILE_H, v = cy / TILE_H - cx / TILE_W;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
    const c = fn(u, v, X, Y);
    if (!c) continue;
    if (c.length === 4) setPx(img, X, Y, [c[0], c[1], c[2]], c[3]);
    else setPx(img, X, Y, c as RGB);
  }
  return img;
}

function edgeDist(u: number, v: number, mask: number): number {
  let d = 9;
  if (mask & E_NY) d = Math.min(d, v);
  if (mask & E_PX) d = Math.min(d, 1 - u);
  if (mask & E_PY) d = Math.min(d, 1 - v);
  if (mask & E_NX) d = Math.min(d, u);
  return d;
}

// paleta (golden hour: verdes quentes, sombras arroxeadas)
const P = {
  grass: ramp('#5b9a38', { spread: 0.75 }),
  grassWarm: ramp('#86b043', { spread: 0.6 }),
  grassDry: ramp('#9aa651', { spread: 0.6 }),
  sand: ramp('#f0cf98', { spread: 0.5 }),
  wetSand: ramp('#c9a274', { spread: 0.5 }),
  deep: ramp('#1c5f92', { spread: 0.6 }),
  mid: ramp('#2384a8', { spread: 0.6 }),
  shallow: ramp('#38b2bd', { spread: 0.55 }),
  asphalt: ramp('#454a5e', { spread: 0.45, hueShift: 0.4 }),
  stone: ramp('#d7bfa2', { spread: 0.45 }),
  stoneRose: ramp('#c99a86', { spread: 0.45 }),
  terra: ramp('#c47a58', { spread: 0.55 }),
  dirt: ramp('#a77c52', { spread: 0.6 }),
};
const pick = (r: RGB[], i: number): RGB => r[Math.max(0, Math.min(r.length - 1, i))];
const GLINT: RGB = hex('#ffd9a8');

// ---------------- grama
export function grassTile(variant: number, sandMask = 0, flowers = false): Image {
  return tile((u, v, X, Y) => {
    const n = fbm(u * 3, v * 3, 11 + variant * 3, 3, 3);
    const n2 = vnoise(u * 9, v * 9, 40 + variant, 9);
    let i = 2;
    if (n > 0.6) i = 3; else if (n < 0.38) i = 1;
    // lâminas: traço vertical de 2px (claro em cima, escuro embaixo)
    const b = hash2(X >> 1 << 1 | 0, Y, 5 + variant);
    if (b > 0.9) i += 1;
    if (hash2(X, Y + 1, 5 + variant) > 0.9 && b <= 0.9) i -= 1;
    let c = n2 > 0.72 ? pick(P.grassWarm, i) : pick(P.grass, i);
    if (flowers) {
      const h = hash2(Math.floor(X / 2), Math.floor(Y / 2), 90 + variant);
      if (h > 0.955) {
        const fl = [hex('#fbf3f6'), hex('#f7d24c'), hex('#ec5f8f'), hex('#b893ee'), hex('#ff9a5a')][Math.floor(hash2(X >> 1, Y >> 1, 3) * 5)];
        return (X + Y) % 2 ? fl : mix(fl, [255, 255, 255], 0.3);
      }
    }
    if (sandMask) {
      const d = edgeDist(u, v, sandMask);
      const jag = 0.1 + 0.07 * vnoise(u * 12 + v * 12, (u - v) * 12, 3 + variant);
      if (d < jag) return pick(P.sand, hash2(X, Y, 8) > 0.8 ? 3 : 2);
      if (d < jag + 0.05) c = pick(P.grass, 1);
    }
    return c;
  });
}

export function lotTile(variant: number): Image {
  return tile((u, v, X, Y) => {
    const n = fbm(u * 3, v * 3, 40 + variant, 3, 3);
    let i = n > 0.62 ? 3 : n < 0.38 ? 1 : 2;
    if (hash2(X, Y, 7 + variant) > 0.92) i++;
    if (n < 0.33 && hash2(X, Y, 9) > 0.4) return pick(P.dirt, 2);
    return pick(P.grassDry, i);
  });
}

// ---------------- areia
export function sandTile(variant: number, wetMask = 0, deco = 0): Image {
  return tile((u, v, X, Y) => {
    const n = fbm(u * 4, v * 4, 21 + variant, 2, 4);
    let c = pick(P.sand, n > 0.62 ? 3 : n < 0.36 ? 1 : 2);
    const rip = Math.sin((u * 3 + v) * Math.PI * 8 + vnoise(u * 4, v * 4, 9) * 3);
    if (rip > 0.94) c = pick(P.sand, 3);
    if (rip < -0.96) c = pick(P.sand, 1);
    if (hash2(X, Y, 31 + variant) > 0.985) c = pick(P.sand, 0);
    if (wetMask) {
      const d = edgeDist(u, v, wetMask);
      if (d < 0.18) c = pick(P.wetSand, d < 0.08 ? 1 : 2);
      else if (d < 0.26 && BAYER4[Y % 4][X % 4] > (d - 0.18) / 0.08) c = pick(P.wetSand, 2);
      if (d < 0.16 && hash2(X, Y, 12) > 0.9) c = GLINT; // reflexo do pôr do sol
    }
    if (deco === 1) {
      const dx = X - 30, dy = Y - 16;
      if (dx * dx + dy * dy * 2.5 < 10) return dy < 0 ? hex('#fbe8dd') : hex('#e9a898');
      if (Math.abs(dx) < 1 && dy === 3) return hex('#b98a7a');
    }
    if (deco === 2) {
      const dx = X - 24, dy = Y - 18;
      if (dx * dx + dy * dy < 6) return dx + dy < 0 ? hex('#ffffff') : hex('#d9cbbd');
      if (dx === 6 && dy === -3) return hex('#d97a6a');
      if (dx === 7 && dy === -3) return hex('#f3b0a0');
    }
    return c;
  });
}

// ---------------- água (animada) com reflexos dourados do sol poente
export function waterTile(depth: 0 | 1 | 2, frame: number, frames: number): Image {
  const r = depth === 0 ? P.deep : depth === 1 ? P.mid : P.shallow;
  const ph = (frame / frames) * Math.PI * 2;
  return tile((u, v, X, Y) => {
    const w1 = Math.sin(2 * Math.PI * (u * 1 + v * 2) + ph);
    const w2 = Math.sin(2 * Math.PI * (u * 2 - v * 1) - ph + 1.3);
    const w3 = Math.sin(2 * Math.PI * (u * 3 + v * 2) + ph * 2 + 0.7);
    const w4 = Math.sin(2 * Math.PI * (u * 4 - v * 3) - ph * 3 + 2.1);
    const s = w1 * 0.45 + w2 * 0.3 + w3 * 0.2 + w4 * 0.12;
    let i = 2;
    if (s > 0.62) i = 4;
    else if (s > 0.36) i = 3;
    else if (s < -0.62) i = 1;
    let c = pick(r, i);
    if (i === 4 && BAYER4[Y % 4][X % 4] > 0.55) c = pick(r, 3);
    // brilhos dourados nas cristas
    if (s > 0.78 && ((X + Y * 3) % 7 === 0)) c = mix(GLINT, c, depth === 2 ? 0.4 : 0.2);
    return c;
  });
}

export function foamTile(mask: number, frame: number, frames: number): Image {
  const ph = (frame / frames) * Math.PI * 2;
  const reach = 0.14 + 0.09 * Math.sin(ph);
  const white = hex('#f6fbfa'), light = hex('#bfe9ec');
  return tile((u, v, X, Y) => {
    const d = edgeDist(u, v, mask);
    if (d > 0.5) return null;
    const along = (mask & (E_NY | E_PY)) ? u : v;
    const wob = 0.035 * Math.sin(along * Math.PI * 4 + ph * 2) + 0.025 * Math.sin(along * Math.PI * 10 - ph);
    const edge = reach + wob;
    if (d < edge - 0.05) return [white[0], white[1], white[2], 230];
    if (d < edge) return light;
    if (d < edge + 0.07 && hash2(X, Y, frame) > 0.55) return [white[0], white[1], white[2], 150];
    if (d < 0.45 && Math.abs(d - (edge + 0.2 + 0.04 * Math.sin(along * 12 + ph))) < 0.018) return [light[0], light[1], light[2], 140];
    return null;
  });
}

// ---------------- asfalto e sinalização
export function asphaltTile(variant: number, line = 0, cross: 'x' | 'y' | null = null, curbMask = 0, center: 'x' | 'y' | null = null): Image {
  return tile((u, v, X, Y) => {
    const n = fbm(u * 5, v * 5, 61 + variant, 2, 5);
    let c = pick(P.asphalt, n > 0.64 ? 3 : n < 0.36 ? 1 : 2);
    const h = hash2(X, Y, 9 + variant);
    if (h > 0.94) c = pick(P.asphalt, 3);
    else if (h < 0.04) c = pick(P.asphalt, 0);
    if (hash2(X, Y, 3) > 0.993) c = mix(c, GLINT, 0.35); // reflexo quente
    if (variant === 3) {
      const du = u - 0.5, dv = v - 0.5;
      if (Math.abs(du) < 0.14 && Math.abs(dv) < 0.14) return Math.floor((du + 0.14) * 40) % 2 ? pick(P.asphalt, 0) : hex('#6c6c78');
    }
    if (line) {
      const d = edgeDist(u, v, line);
      const along = (line & (E_NY | E_PY)) ? u : v;
      if (d < 0.05 && (along * 2) % 1 < 0.6) return hex('#f0c84e');
    }
    if (center) {
      const across = center === 'x' ? v : u, along = center === 'x' ? u : v;
      if (Math.abs(across - 0.5) < 0.035 && (along * 2) % 1 < 0.55) return hex('#f0c84e');
    }
    if (cross) {
      const along = cross === 'x' ? v : u, across = cross === 'x' ? u : v;
      if (across > 0.1 && across < 0.9 && (along * 4) % 1 < 0.5) return hash2(X, Y, 4) > 0.9 ? hex('#d6d2c8') : hex('#f1eee6');
    }
    if (curbMask) {
      const d = edgeDist(u, v, curbMask);
      if (d < 0.06) c = mix(c, hex('#232430'), 0.45);
    }
    return c;
  });
}

// ---------------- calçada de pedra (paralelepípedos rosados/bege) com meio-fio
export function sidewalkTile(variant: number, curbMask: number): Image {
  return tile((u, v, X, Y) => {
    const ru = u * 4, rv = v * 6;
    const row = Math.floor(rv), off = row % 2 ? 0.5 : 0;
    const col = Math.floor(ru + off);
    const fu = (ru + off) % 1, fv = rv % 1;
    let c: RGB;
    if (fu < 0.07 || fv < 0.1) c = mix(pick(P.stone, 0), hex('#5a4a52'), 0.3);
    else {
      const h = hash2(col + variant * 31, row, 44);
      const base = h > 0.62 ? P.stoneRose : P.stone;
      let i = h > 0.85 ? 3 : h < 0.2 ? 1 : 2;
      if (fv > 0.82) i -= 1;               // sombra na base de cada pedra
      if (fv < 0.22 && fu > 0.15) i += 1;  // luz no topo
      c = pick(base, i);
    }
    if (curbMask) {
      const d = edgeDist(u, v, curbMask);
      if (d < 0.05) c = hex('#8e8a86');
      else if (d < 0.11) c = hex('#e9e4da');
      else if (d < 0.13) c = hex('#b9b2a8');
    }
    return c;
  });
}

export function boardwalkTile(curbMask: number): Image {
  const blk = hex('#2b2a33'), wht = hex('#f3ead8'), wht2 = hex('#e4d7bf');
  return tile((u, v, X, Y) => {
    const w = (v + 0.22 * Math.sin(2 * Math.PI * u * 2)) * 2;
    const f = ((w % 1) + 1) % 1;
    let c = f < 0.42 ? blk : (hash2(X, Y, 3) > 0.85 ? wht2 : wht);
    // textura de pedrinhas
    if (((X >> 1) + (Y >> 1)) % 3 === 0 && hash2(X, Y, 8) > 0.6) c = mix(c, f < 0.42 ? [70, 66, 80] : [214, 200, 178], 0.6);
    if (curbMask) {
      const d = edgeDist(u, v, curbMask);
      if (d < 0.05) c = hex('#8e8a86');
      else if (d < 0.11) c = hex('#e9e4da');
    }
    return c;
  });
}

// ---------------- piso da praça (mosaico em leque, terracota e creme)
export function paverTile(variant: number): Image {
  return tile((u, v, X, Y) => {
    const a = (u + variant * 0.5) * 2, b = v * 2;
    const cu = Math.floor(a), cv = Math.floor(b);
    const fu = a - cu, fv = b - cv;
    // leque: arcos concêntricos dentro de cada célula
    const r = Math.hypot(fu - 0.5, fv);
    const ring = Math.floor(r * 6);
    const edge = (r * 6) % 1 < 0.14;
    const seg = Math.floor(Math.atan2(fv, fu - 0.5) * 4);
    if (edge) return mix(pick(P.terra, 0), [80, 60, 70], 0.3);
    const base = (ring + cu + cv) % 2 ? P.terra : P.stone;
    const h = hash2(seg + ring * 7 + cu * 13, cv, 4);
    return pick(base, h > 0.7 ? 3 : h < 0.25 ? 1 : 2);
  });
}

export const PAL = P;
