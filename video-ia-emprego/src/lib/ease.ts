export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const smooth = (u: number) => {
  const c = clamp(u);
  return c * c * (3 - 2 * c);
};
export const smoother = (u: number) => {
  const c = clamp(u);
  return c * c * c * (c * (c * 6 - 15) + 10);
};
export const outCubic = (u: number) => 1 - Math.pow(1 - clamp(u), 3);
export const outQuint = (u: number) => 1 - Math.pow(1 - clamp(u), 5);
export const outExpo = (u: number) => (clamp(u) >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(u)));
export const inCubic = (u: number) => Math.pow(clamp(u), 3);
export const inOutCubic = (u: number) => {
  const c = clamp(u);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};
export const inOutSine = (u: number) => -(Math.cos(Math.PI * clamp(u)) - 1) / 2;
// mola amortecida (0 -> 1 com leve overshoot)
export const spring = (u: number, k = 7, w = 11) => {
  if (u <= 0) return 0;
  return 1 - Math.exp(-k * u) * Math.cos(w * u);
};
// pseudo-aleatório determinístico
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
};
export const seeded = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};
