// Caminho de câmera 2.5D compartilhado entre o Remotion (vídeo) e o script de áudio.
// A velocidade da câmera é uma soma de "sinos" assimétricos; a posição é a integral.
// Isso garante velocidade contínua (sem trancos) em todos os cortes de câmera.

export const FPS = 30;
export const FOCAL = 10;
export const Z_GLASS = 10; // plano da tela do monitor
export const T_GLASS = 4.25; // instante em que a câmera atravessa o vidro
export const T_PORTAL = 6.37; // instante em que entra no mundo 3D

const bell = (t, c, wl, wr) => {
  const w = t < c ? wl : wr;
  const u = (t - c) / w;
  return Math.exp(-u * u);
};

const SQRT_PI_2 = Math.sqrt(Math.PI) / 2;

// cada bump: {c, wl, wr, area} -> pico = area / ((wl+wr)*sqrt(pi)/2)
const BUMPS = [
  {c: 2.0, wl: 1.7, wr: 1.4, area: 2.4}, // push-in lento no quarto
  {c: T_GLASS, wl: 0.3, wr: 0.26, area: 0}, // mergulho no monitor (área resolvida abaixo)
  {c: 5.55, wl: 0.55, wr: 0.55, area: 0.9}, // deriva de leitura no espaço da interface
  {c: T_PORTAL, wl: 0.2, wr: 0.28, area: 0}, // mergulho no portal (área resolvida abaixo)
];

const DT = 1 / 600;
const T_END = 9;

const velocityWith = (bumps, t) => {
  let v = 0;
  for (const b of bumps) {
    const peak = b.area / ((b.wl + b.wr) * SQRT_PI_2);
    v += peak * bell(t, b.c, b.wl, b.wr);
  }
  return v;
};

const integrate = (bumps) => {
  const n = Math.ceil(T_END / DT) + 1;
  const z = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const t0 = (i - 1) * DT;
    z[i] = z[i - 1] + 0.5 * (velocityWith(bumps, t0) + velocityWith(bumps, t0 + DT)) * DT;
  }
  return z;
};

const sampleArr = (arr, t) => {
  const x = Math.max(0, Math.min(T_END, t)) / DT;
  const i = Math.floor(x);
  const f = x - i;
  return arr[i] * (1 - f) + arr[Math.min(arr.length - 1, i + 1)] * f;
};

// resolve área do mergulho para cruzar o vidro exatamente em T_GLASS
const solve = (bumps, idx, tTarget, zTarget) => {
  let lo = 0, hi = 80;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    bumps[idx].area = mid;
    const z = integrate(bumps);
    if (sampleArr(z, tTarget) < zTarget) lo = mid; else hi = mid;
  }
  bumps[idx].area = (lo + hi) / 2;
};

export const Z_PORTAL = 30;
const B = BUMPS.map((b) => ({...b}));
solve(B, 1, T_GLASS, Z_GLASS);
solve(B, 3, T_PORTAL, Z_PORTAL);
const Z_TABLE = integrate(B);

export const camZ = (t) => sampleArr(Z_TABLE, t);
export const camV = (t) => velocityWith(B, t);
export const bumps = B;

const smooth = (x) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};

// deslocamento lateral/vertical da câmera (unidades de mundo)
// No quarto, centraliza no monitor (y=-200) até o vidro; no espaço da interface, faz um S suave.
export const MONITOR_Y = -200;
export const camXY = (t) => {
  const z = camZ(t);
  const toMonitor = smooth(z / Z_GLASS) ** 1.6;
  let x = 0 * toMonitor;
  let y = MONITOR_Y * toMonitor;
  // leve deriva "câmera na mão" no quarto
  const hand = 1 - smooth((t - 3.6) / 0.5);
  x += hand * (6 * Math.sin(t * 1.3) + 3 * Math.sin(t * 2.9 + 1.0));
  y += hand * (4 * Math.sin(t * 1.1 + 0.4) + 2 * Math.cos(t * 2.3));
  // espaço da interface: curva em S
  if (t > T_GLASS) {
    const u = t - T_GLASS;
    x += 60 * Math.sin(u * 1.6) * smooth(u / 0.6);
    y += -30 * Math.sin(u * 1.2) * smooth(u / 0.6);
  }
  return {x, y};
};

export const camRoll = (t) => {
  // rolagem sutil, mais forte nos mergulhos
  const dive = camV(t);
  return 0.35 * Math.sin(t * 0.9) + 0.06 * dive * Math.sin(t * 3.0);
};

// projeta um ponto do mundo para a tela (pixels relativos ao centro) e retorna a escala
export const project = (X, Y, Z, t) => {
  const z = camZ(t);
  const {x, y} = camXY(t);
  const d = Z - z;
  const k = FOCAL / d;
  return {sx: (X - x) * k, sy: (Y - y) * k, k, d};
};
