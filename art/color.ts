// Utilitários de cor para a pipeline de pixel art.
// Rampas com "hue shifting": sombras puxam para azul/violeta, luzes para amarelo —
// técnica clássica de pixel art que evita sombras "sujas" (apenas escurecidas).

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

export function hex(h: string): RGB {
  const v = parseInt(h.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgb2hsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hsl2rgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function shiftHueTowards(h: number, target: number, amt: number): number {
  let d = target - h;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return h + d * amt;
}

/**
 * Gera uma rampa de 5 tons [mais escuro … destaque] a partir de uma cor base (índice 2).
 */
export function ramp(base: string | RGB, opts: { spread?: number; hueShift?: number; satBoost?: number } = {}): RGB[] {
  const spread = opts.spread ?? 1;
  const hs = opts.hueShift ?? 1;
  const [h, s, l] = rgb2hsl(typeof base === 'string' ? hex(base) : base);
  const out: RGB[] = [];
  const steps = [-2, -1, 0, 1, 2];
  for (const k of steps) {
    const dl = k * 0.11 * spread * (k < 0 ? 1 : 0.85);
    let nh = h;
    if (k < 0) nh = shiftHueTowards(h, h < 70 || h > 300 ? 12 : 235, (h < 70 || h > 300 ? 0.05 : 0.08) * -k * hs);
    if (k > 0) nh = shiftHueTowards(h, 55, 0.10 * k * hs);
    const ns = Math.min(1, Math.max(0, s * (k < 0 ? 1 + 0.03 * -k * (opts.satBoost ?? 1) : 1 - 0.06 * k)));
    const nl = Math.min(0.97, Math.max(0.03, l + dl));
    out.push(hsl2rgb(nh, ns, nl));
  }
  return out;
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export function darken(c: RGB, amt: number): RGB {
  const [h, s, l] = rgb2hsl(c);
  return hsl2rgb(shiftHueTowards(h, 240, amt * 0.5), Math.min(1, s * 1.05), Math.max(0, l - amt * 0.5));
}

export function lighten(c: RGB, amt: number): RGB {
  const [h, s, l] = rgb2hsl(c);
  return hsl2rgb(shiftHueTowards(h, 55, amt * 0.4), s, Math.min(1, l + amt * 0.5));
}
