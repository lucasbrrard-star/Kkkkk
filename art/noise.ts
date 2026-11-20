// Ruído determinístico (hash + value noise) para texturas procedurais.

export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

export function hash3(x: number, y: number, z: number, seed = 0): number {
  return hash2(x * 31 + z * 7919, y * 17 - z * 104729, seed);
}

function smooth(t: number) { return t * t * (3 - 2 * t); }

/** Value noise 2D; se `period` for dado, é periódico (tileável). */
export function vnoise(x: number, y: number, seed = 0, period = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const w = (a: number) => (period ? ((a % period) + period) % period : a);
  const a = hash2(w(xi), w(yi), seed);
  const b = hash2(w(xi + 1), w(yi), seed);
  const c = hash2(w(xi), w(yi + 1), seed);
  const d = hash2(w(xi + 1), w(yi + 1), seed);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, seed = 0, oct = 3, period = 0): number {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x * f, y * f, seed + i * 17, period ? period * f : 0) * amp;
    n += amp; amp *= 0.5; f *= 2;
  }
  return s / n;
}

export function vnoise3(x: number, y: number, z: number, seed = 0): number {
  const zi = Math.floor(z), zf = smooth(z - zi);
  const a = vnoise(x + zi * 13.1, y - zi * 7.7, seed);
  const b = vnoise(x + (zi + 1) * 13.1, y - (zi + 1) * 7.7, seed);
  return a + (b - a) * zf;
}

/** PRNG simples (mulberry32). */
export function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => (v + 0.5) / 16));
