import * as THREE from 'three';
import type { CityLayout, Lamp } from './CityLayout';

export const LAMP_ARM = 2.4;

/** World position of the light emitted by a street lamp (end of its arm). */
export function lampLightPos(l: Lamp, out = new THREE.Vector3()) {
  const k = l.height / 8; // lamp models are uniformly scaled by height / 8
  return out.set(l.x + Math.sin(l.rot) * LAMP_ARM * k, l.height - 0.4 * k, l.z + Math.cos(l.rot) * LAMP_ARM * k);
}

export const LAMP_WARM = new THREE.Color(1.0, 0.62, 0.32);
export const LAMP_COOL = new THREE.Color(0.75, 0.85, 1.0);

/**
 * Bakes the diffuse light that falls on the ground (street lamp pools, shop window spill, neon
 * sign glow, gas station canopy) into a canvas texture addressed by world XZ. The wet ground
 * shader adds it to the dynamic lights; rain streaks use it to light up under lamps.
 */
export function bakeGroundLightmap(city: CityLayout, size = 1024) {
  const W = city.world;
  const sx = size / (W.maxX - W.minX), sz = size / (W.maxZ - W.minZ);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  const px = (x: number) => (x - W.minX) * sx;
  const pz = (z: number) => (z - W.minZ) * sz;
  const rgb = (c: THREE.Color, a: number) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;

  const blob = (x: number, z: number, radius: number, color: THREE.Color, strength: number) => {
    const g = ctx.createRadialGradient(px(x), pz(z), 0, px(x), pz(z), radius * sx);
    g.addColorStop(0, rgb(color, strength));
    g.addColorStop(0.25, rgb(color, strength * 0.55));
    g.addColorStop(0.6, rgb(color, strength * 0.15));
    g.addColorStop(1, rgb(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(px(x - radius), pz(z - radius), radius * 2 * sx, radius * 2 * sz);
  };

  const v = new THREE.Vector3();
  for (const l of city.lamps) {
    lampLightPos(l, v);
    blob(v.x, v.z, l.height * 1.9, l.warm ? LAMP_WARM : LAMP_COOL, 0.42);
  }
  // storefront spill on the sidewalk in front of shops
  const shopCols = [new THREE.Color(1, 0.75, 0.45), new THREE.Color(0.85, 0.9, 1), new THREE.Color(1, 0.6, 0.8), new THREE.Color(0.6, 0.95, 1)];
  city.buildings.forEach((b, i) => {
    if (!b.shop) return;
    const c = shopCols[i % shopCols.length];
    const g = (x0: number, z0: number, x1: number, z1: number) => {
      const grad = ctx.createLinearGradient(px(x0), pz(z0), px(x1), pz(z1));
      grad.addColorStop(0, rgb(c, 0.16));
      grad.addColorStop(1, rgb(c, 0));
      ctx.fillStyle = grad;
    };
    const d = 6;
    if (b.face === 's') { g(0, b.minZ, 0, b.minZ - d); ctx.fillRect(px(b.minX), pz(b.minZ - d), (b.maxX - b.minX) * sx, d * sz); }
    if (b.face === 'n') { g(0, b.maxZ, 0, b.maxZ + d); ctx.fillRect(px(b.minX), pz(b.maxZ), (b.maxX - b.minX) * sx, d * sz); }
    if (b.face === 'w') { g(b.minX, 0, b.minX - d, 0); ctx.fillRect(px(b.minX - d), pz(b.minZ), d * sx, (b.maxZ - b.minZ) * sz); }
    if (b.face === 'e') { g(b.maxX, 0, b.maxX + d, 0); ctx.fillRect(px(b.maxX), pz(b.minZ), d * sx, (b.maxZ - b.minZ) * sz); }
  });
  for (const s of city.signs) {
    const c = new THREE.Color(s.color);
    const ox = Math.sin(s.rot) * 3, oz = Math.cos(s.rot) * 3;
    blob(s.x + ox, s.z + oz, s.style === 'neon' && s.w > 8 ? 16 : 8, c, s.w > 8 ? 0.5 : 0.3);
  }
  // gas station canopy (bright white)
  const gas = city.blocks.find((b) => b.kind === 'gas');
  if (gas) {
    const cx = gas.minX + 4.5 + 24, cz = gas.minZ + 4.5 + 30;
    ctx.fillStyle = 'rgba(235,245,255,0.75)';
    ctx.fillRect(px(cx - 10), pz(cz - 8), 20 * sx, 16 * sz);
    blob(cx, cz, 22, new THREE.Color(0.9, 0.95, 1), 0.5);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // canvas row 0 = world minZ, matching the shader's uv
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  const rect = new THREE.Vector4(W.minX, W.minZ, 1 / (W.maxX - W.minX), 1 / (W.maxZ - W.minZ));
  return { texture: tex, rect, canvas };
}
