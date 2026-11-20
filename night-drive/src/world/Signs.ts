import * as THREE from 'three';
import type { CityLayout, Sign } from './CityLayout';
import { CURB_HEIGHT } from './CityLayout';

/**
 * Every neon sign is drawn once into a shared canvas atlas; all signs are a single merged mesh
 * (one draw call) with HDR additive glow. A per-vertex flicker seed makes some tubes stutter.
 */
const ATLAS = 2048;

interface Cell { x: number; y: number; w: number; h: number }

function packAtlas(signs: Sign[]) {
  const cells: Cell[] = [];
  let x = 0, y = 0, rowH = 0;
  const pxPerM = 64;
  for (const s of signs) {
    const w = Math.min(ATLAS, Math.ceil(s.w * pxPerM) + 32), h = Math.ceil(s.h * pxPerM) + 32;
    if (x + w > ATLAS) { x = 0; y += rowH; rowH = 0; }
    cells.push({ x, y, w, h });
    x += w; rowH = Math.max(rowH, h);
  }
  return { cells, used: y + rowH };
}

function drawNeonText(g: CanvasRenderingContext2D, s: Sign, c: Cell) {
  const lines = s.text.split('|');
  const vertical = s.style === 'vertical';
  g.save();
  g.translate(c.x + c.w / 2, c.y + c.h / 2);
  const pad = 22;
  const boxW = c.w - pad * 2, boxH = c.h - pad * 2;
  if (vertical) {
    const chars = lines[0].replace(/\s/g, '').split('');
    const step = boxH / chars.length;
    const font = Math.min(step * 0.86, boxW * 0.9);
    g.font = `700 ${font}px "Arial Black", "Segoe UI", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    chars.forEach((ch, i) => glowText(g, ch, 0, -boxH / 2 + step * (i + 0.5), s.color, font));
  } else {
    const n = lines.length;
    const lh = boxH / n;
    const hero = lines.length > 1;
    let font = lh * (hero ? 0.88 : 0.78);
    g.font = `${hero ? 'italic 900' : '700'} ${font}px ${hero ? '"Brush Script MT", "Segoe Script", cursive' : '"Arial Black", "Segoe UI", sans-serif'}`;
    const widest = Math.max(...lines.map((l) => g.measureText(l).width));
    if (widest > boxW) { font *= boxW / widest; g.font = g.font.replace(/\d+(\.\d+)?px/, `${font}px`); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, i) => glowText(g, l, hero ? (i === 0 ? -boxW * 0.08 : boxW * 0.08) : 0, -boxH / 2 + lh * (i + 0.5), s.color, font));
    if (!hero) {
      // neon frame tube
      g.strokeStyle = s.color; g.lineWidth = 3; g.shadowColor = s.color; g.shadowBlur = 12;
      g.strokeRect(-boxW / 2 - 6, -boxH / 2 - 4, boxW + 12, boxH + 8);
    }
  }
  g.restore();
}

function glowText(g: CanvasRenderingContext2D, t: string, x: number, y: number, color: string, size: number) {
  g.shadowColor = color;
  g.fillStyle = color;
  for (const blur of [size * 0.5, size * 0.25, size * 0.1]) { g.shadowBlur = blur; g.fillText(t, x, y); }
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = Math.max(1.5, size * 0.035);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.font = g.font;
  g.strokeText(t, x, y);
}

export class Signs {
  readonly mesh: THREE.Mesh;
  readonly boards: THREE.Mesh;
  private readonly time = { value: 0 };

  constructor(city: CityLayout) {
    const signs = city.signs;
    const { cells } = packAtlas(signs);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ATLAS;
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, ATLAS, ATLAS);
    signs.forEach((s, i) => drawNeonText(g, s, cells[i]));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.generateMipmaps = true;

    const pos: number[] = [], uv: number[] = [], flick: number[] = [], idx: number[] = [];
    const bpos: number[] = [], bidx: number[] = [];
    signs.forEach((s, i) => {
      const c = cells[i];
      const fx = Math.cos(s.rot), fz = -Math.sin(s.rot); // sign's local +X in world
      const nx = Math.sin(s.rot), nz = Math.cos(s.rot); // facing direction
      const hw = (s.w + 32 / 64) / 2, hh = (s.h + 32 / 64) / 2;
      const cx = s.x + nx * 0.06, cz = s.z + nz * 0.06, cy = CURB_HEIGHT + s.y;
      const base = pos.length / 3;
      const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
      for (const [a, b] of corners) pos.push(cx + fx * a, cy + b, cz + fz * a);
      const u0 = c.x / ATLAS, u1 = (c.x + c.w) / ATLAS, v0 = 1 - (c.y + c.h) / ATLAS, v1 = 1 - c.y / ATLAS;
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      for (let k = 0; k < 4; k++) flick.push(s.flicker > 0 ? 1 + i * 0.37 : 0);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      // dark backing board for framed / vertical signs
      if (s.style !== 'neon' || !s.text.includes('|')) {
        const bb = bpos.length / 3;
        const bx = s.x - nx * 0.02, bz = s.z - nz * 0.02;
        const bw = s.w / 2 + 0.15, bh = s.h / 2 + 0.15;
        for (const [a, b] of [[-bw, -bh], [bw, -bh], [bw, bh], [-bw, bh]]) bpos.push(bx + fx * a, cy + b, bz + fz * a);
        bidx.push(bb, bb + 1, bb + 2, bb, bb + 2, bb + 3);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aFlicker', new THREE.Float32BufferAttribute(flick, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(4.2, 4.2, 4.2), side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFlicker;\nuniform float uTime;\nvarying float vFlick;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vFlick = 1.0;
          if (aFlicker > 0.0) {
            float t = uTime * 1.7 + aFlicker * 13.0;
            float k = fract(sin(floor(t * 6.0) * 91.7 + aFlicker) * 4375.85);
            vFlick = (fract(t * 0.21) < 0.12 && k > 0.45) ? 0.08 : 1.0;
          }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFlick;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= diffuseColor.a * vFlick;');
    };
    mat.customProgramCacheKey = () => 'neon-signs';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'signs';
    this.mesh.renderOrder = 8;

    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3));
    bgeo.setIndex(bidx);
    bgeo.computeVertexNormals();
    this.boards = new THREE.Mesh(bgeo, new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }));
    this.boards.name = 'sign-boards';
  }

  update(t: number) { this.time.value = t; }
}
