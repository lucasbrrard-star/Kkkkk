// Rótulos e placas com texto nítido (canvas → textura).
import * as THREE from 'three';

const FONT = '"Baloo 2", "Segoe UI", system-ui, sans-serif';

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Rótulo flutuante (sprite) com título e subtítulo opcional. size = altura em metros. */
export function makeLabel(text: string, o: { size?: number; sub?: string; bg?: string; accent?: string } = {}): THREE.Sprite {
  const scale = 2;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const f1 = 34 * scale, f2 = 24 * scale;
  ctx.font = `800 ${f1}px ${FONT}`;
  const w1 = ctx.measureText(text).width;
  ctx.font = `600 ${f2}px ${FONT}`;
  const w2 = o.sub ? ctx.measureText(o.sub).width : 0;
  const W = Math.ceil(Math.max(w1, w2) + 48 * scale), H = Math.ceil((o.sub ? 92 : 62) * scale);
  c.width = W; c.height = H + 14 * scale;
  ctx.fillStyle = o.bg ?? 'rgba(18,24,40,0.85)';
  rounded(ctx, 2, 2, W - 4, H - 4, 18 * scale); ctx.fill();
  ctx.lineWidth = 3 * scale; ctx.strokeStyle = o.accent ?? '#ffffff'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W / 2 - 12 * scale, H - 3); ctx.lineTo(W / 2, H + 12 * scale); ctx.lineTo(W / 2 + 12 * scale, H - 3); ctx.closePath(); ctx.fillStyle = o.accent ?? '#fff'; ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 ${f1}px ${FONT}`;
  ctx.fillText(text, W / 2, (o.sub ? 34 : 31) * scale);
  if (o.sub) { ctx.font = `600 ${f2}px ${FONT}`; ctx.fillStyle = o.accent ?? '#ddd'; ctx.fillText(o.sub, W / 2, 68 * scale); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, fog: false, toneMapped: false });
  const sp = new THREE.Sprite(mat);
  const h = o.size ?? 1;
  sp.scale.set((h * c.width) / c.height, h, 1);
  sp.center.set(0.5, 0);
  sp.renderOrder = 10;
  return sp;
}

/** Textura de placa retangular (letreiros, "À venda"). */
export function makeSignTexture(title: string, sub: string, color = '#c2452e'): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, color); g.addColorStop(1, '#00000033');
  ctx.fillStyle = '#f6f1e6'; ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = g; ctx.fillRect(12, 12, 1000, 232);
  ctx.strokeStyle = '#fff6dc'; ctx.lineWidth = 6; ctx.strokeRect(24, 24, 976, 208);
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 96px ${FONT}`;
  ctx.fillText(title, 512, 110, 940);
  ctx.font = `600 40px ${FONT}`;
  ctx.fillStyle = '#fff3cf';
  ctx.fillText(sub, 512, 192, 900);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
