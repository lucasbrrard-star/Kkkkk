import * as THREE from 'three';
import { rng } from '../core/math';
import type { CityLayout, Rect } from './CityLayout';
import { CURB_HEIGHT } from './CityLayout';

/**
 * All building volumes are ONE instanced unit box. A facade shader (injected into
 * MeshStandardMaterial so it keeps PBR lighting, fog and env reflections) generates floors,
 * window grids, lit/unlit offices, storefronts and roofs procedurally from per-instance data.
 */
const facadeVertexHead = /* glsl */ `
attribute vec3 aBox;
attribute vec4 aParams;
attribute vec3 aTint;
varying vec3 vLocal;
varying vec3 vObjN;
varying vec4 vParams;
varying vec3 vTint;
varying vec3 vBox;
`;

const facadeFragHead = /* glsl */ `
uniform float uTime;
varying vec3 vLocal;
varying vec3 vObjN;
varying vec4 vParams;
varying vec3 vTint;
varying vec3 vBox;
float bh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float bnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(bh(i), bh(i + vec2(1, 0)), u.x), mix(bh(i + vec2(0, 1)), bh(i + vec2(1, 1)), u.x), u.y); }
float aaBand(float x, float halfW) { float w = fwidth(x) * 0.75 + 1e-4; return smoothstep(halfW + w, halfW - w, abs(x)); }

struct Facade { vec3 albedo; float rough; float metal; vec3 emissive; };

Facade facade() {
  Facade F;
  vec3 n = vObjN;
  float seed = vParams.x;
  float style = vParams.y;
  float shop = vParams.z;
  float litRatio = vParams.w;
  float v = vLocal.y;
  if (n.y > 0.5) { // roof
    float g = bnoise(vLocal.xz * 0.7 + seed);
    F.albedo = vec3(0.05 + 0.04 * g);
    F.rough = 0.9; F.metal = 0.0; F.emissive = vec3(0.0);
    return F;
  }
  if (n.y < -0.5) { F.albedo = vec3(0.02); F.rough = 1.0; F.metal = 0.0; F.emissive = vec3(0.0); return F; }
  bool xFace = abs(n.x) > 0.5;
  float face = xFace ? (n.x > 0.0 ? 0.0 : 1.0) : (n.z > 0.0 ? 2.0 : 3.0);
  float u = xFace ? vLocal.z : vLocal.x;
  float halfW = (xFace ? vBox.z : vBox.x) * 0.5;
  float edge = halfW - abs(u);

  float floorH = style < 0.5 ? 3.6 : style < 1.5 ? 3.3 : style < 2.5 ? 4.0 : 3.0;
  float colW = style < 0.5 ? 2.6 : style < 1.5 ? 1.9 : style < 2.5 ? 1.6 : 2.3;
  float groundH = 4.4;

  // wall base material
  vec3 tint = vTint;
  float wallN = bnoise(vec2(u, v) * vec2(0.35, 0.12) + seed) * 0.5 + bnoise(vec2(u, v) * 2.3) * 0.5;
  F.albedo = tint * (0.55 + 0.35 * wallN);
  F.rough = 0.82; F.metal = 0.0; F.emissive = vec3(0.0);

  float cy = (v - groundH) / floorH;
  vec2 cell = vec2((u + halfW) / colW, cy);
  vec2 id = floor(cell);
  vec2 f = fract(cell) - 0.5;
  // floor slabs
  float slab = aaBand(f.y + 0.5, 0.06) + aaBand(f.y - 0.5, 0.06);
  F.albedo *= 1.0 - 0.35 * clamp(slab, 0.0, 1.0) * step(groundH, v);

  float win = 0.0;
  if (v > groundH && v < vBox.y - 1.6 && edge > 0.9) {
    if (style < 0.5) win = aaBand(f.x, 0.3) * aaBand(f.y - 0.04, 0.3);          // punched windows
    else if (style < 1.5) win = aaBand(f.y, 0.26);                             // ribbon windows
    else if (style < 2.5) win = aaBand(f.x, 0.45) * aaBand(f.y, 0.44);          // curtain wall
    else win = aaBand(f.x, 0.22) * aaBand(f.y + 0.05, 0.25);                    // small residential
  }
  // storefront / lobby band at street level
  float store = 0.0;
  if (v > 0.35 && v < 3.7 && edge > 0.7) {
    float mull = aaBand(fract((u + halfW) / 2.8) - 0.5, 0.46);
    store = mull;
  }

  // lit windows
  float roomId = id.x + face * 97.0;
  float rowLit = bh(vec2(id.y, seed + face));
  float rnd = bh(vec2(roomId, id.y) + seed * 1.37);
  float lit = step(rnd, litRatio * (0.35 + 1.1 * rowLit));
  float hue = bh(vec2(roomId * 1.7, id.y + seed));
  vec3 warm = vec3(1.0, 0.68, 0.38), cool = vec3(0.72, 0.86, 1.0), tv = vec3(0.45, 0.55, 1.0), pink = vec3(1.0, 0.55, 0.75);
  vec3 wc = hue < 0.55 ? warm : hue < 0.85 ? cool : hue < 0.95 ? tv : pink;
  float bright = 0.45 + 1.3 * bh(vec2(roomId, id.y * 3.1 + seed));
  // ceiling light gradient + half-drawn curtains on some rooms
  float inside = 0.75 + 0.5 * (f.y + 0.5);
  float blinds = mix(1.0, 0.35 + 0.65 * smoothstep(0.1, 0.25, f.y + 0.5 - bh(vec2(roomId, id.y + 5.0)) * 0.6), step(0.7, hue));
  // a few windows flicker (TV)
  float flick = hue > 0.85 && hue < 0.95 ? 0.75 + 0.25 * sin(uTime * 7.0 + roomId) : 1.0;
  vec3 winEmit = wc * bright * inside * blinds * flick * lit * 1.8;

  // distant facades: when windows get smaller than ~2 px, fade to their average so they do not sparkle
  float fw = max(fwidth(cell.x), fwidth(cell.y));
  float lodF = smoothstep(0.2, 0.55, fw);
  if (lodF > 0.0 && v > groundH && v < vBox.y - 1.6) {
    float cover = style < 0.5 ? 0.36 : style < 1.5 ? 0.52 : style < 2.5 ? 0.8 : 0.2;
    float rows = mix(0.6 + 0.8 * rowLit, 1.0, smoothstep(0.35, 0.8, fwidth(cell.y)));
    vec3 avgEmit = vec3(1.0, 0.78, 0.55) * litRatio * 0.62 * 1.25 * rows;
    win = mix(win, cover * step(0.9, edge), lodF);
    winEmit = mix(winEmit, avgEmit / max(cover, 0.01), lodF);
  }
  if (win > 0.0) {
    vec3 glassAlb = vec3(0.015, 0.018, 0.022);
    F.albedo = mix(F.albedo, glassAlb, win);
    F.rough = mix(F.rough, 0.06, win);
    F.metal = mix(F.metal, 0.3, win);
    F.emissive += winEmit * win;
  }
  if (store > 0.0) {
    // storefront: fascia band on top, lit interior with shelves / silhouettes, some shops closed
    float bay = floor((u + halfW) / 2.8);
    float shopRnd = bh(vec2(seed + face * 3.1, bay * 0.37));
    float open = shop > 0.5 ? step(0.18, bh(vec2(seed, face))) : 0.0;
    vec3 shopC = mix(vec3(1.0, 0.72, 0.42), vec3(0.78, 0.9, 1.0), step(0.55, bh(vec2(seed, face + 7.0))));
    if (bh(vec2(seed, face + 3.0)) > 0.8) shopC = vec3(1.0, 0.45, 0.75);
    float sv = (v - 0.35) / 3.35;
    float shelves = 0.65 + 0.35 * step(0.5, fract(sv * 5.0 + shopRnd));
    float aisle = 0.6 + 0.4 * smoothstep(0.1, 0.5, abs(fract((u + halfW) * 0.9 + shopRnd) - 0.5) * 2.0);
    float ceiling = 0.55 + 0.6 * smoothstep(0.55, 0.95, sv);
    float fascia = step(0.86, sv);
    vec3 emit = open * shopC * 0.95 * shelves * aisle * ceiling * (0.7 + 0.6 * shopRnd);
    emit *= 1.0 - fascia;
    vec3 lobby = vec3(0.32, 0.3, 0.27) * 0.25 * (1.0 - open);
    F.albedo = mix(F.albedo, mix(vec3(0.02), vec3(0.04, 0.04, 0.05), fascia), store);
    F.rough = mix(F.rough, mix(0.05, 0.5, fascia), store);
    F.emissive += (emit + lobby * (1.0 - fascia)) * store;
  }
  // grime near the ground
  F.albedo *= 0.55 + 0.45 * smoothstep(0.0, 1.5, v);
  return F;
}
`;

function createFacadeMaterial(timeUniform: { value: number }) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: 0.9 });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = timeUniform;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n' + facadeVertexHead)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position * aBox; vObjN = normal; vParams = aParams; vTint = aTint; vBox = aBox;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + facadeFragHead)
      .replace('#include <color_fragment>', '#include <color_fragment>\nFacade FC = facade();\ndiffuseColor.rgb = FC.albedo;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = FC.rough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = FC.metal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += FC.emissive;');
  };
  mat.customProgramCacheKey = () => 'facade-v1';
  return mat;
}

interface Volume { rect: Rect; base: number; height: number; seed: number; style: number; shop: number; lit: number; tint: [number, number, number] }

export class Buildings {
  readonly group = new THREE.Group();
  readonly time = { value: 0 };
  private readonly beacons: THREE.InstancedMesh;
  private readonly beaconMat: THREE.MeshBasicMaterial;

  constructor(city: CityLayout) {
    const vols: Volume[] = [];
    for (const b of city.buildings) {
      vols.push({ rect: b, base: CURB_HEIGHT, height: b.height, seed: b.seed, style: b.style, shop: b.shop ? 1 : 0, lit: 0.22 + (b.seed % 1) * 0.3, tint: b.tint });
      if (b.setback) vols.push({ rect: b.setback.rect, base: CURB_HEIGHT + b.height, height: b.setback.height - b.height, seed: b.seed + 11, style: (b.style + 2) % 4, shop: 0, lit: 0.3, tint: b.tint });
    }
    // distant skyline (beyond the playable area, seen through the fog)
    const r = rng(99);
    for (let k = 0; k < 220; k++) {
      const ang = r.range(0, Math.PI * 2);
      const rad = r.range(330, 900);
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad * 1.1;
      const w = r.range(18, 45), d = r.range(18, 45);
      const h = r.range(40, 120) + (rad < 500 ? 0 : r.range(0, 160)) + (Math.abs(ang - 1.57) < 0.5 ? r.range(30, 120) : 0);
      vols.push({ rect: { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }, base: 0, height: h, seed: r.range(0, 1000), style: r.int(0, 3), shop: 0, lit: r.range(0.2, 0.45), tint: [0.2, 0.21, 0.24] });
    }

    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const n = vols.length;
    const aBox = new Float32Array(n * 3), aParams = new Float32Array(n * 4), aTint = new Float32Array(n * 3);
    const mesh = new THREE.InstancedMesh(geo, createFacadeMaterial(this.time), n);
    const m = new THREE.Matrix4();
    vols.forEach((v, i) => {
      const w = v.rect.maxX - v.rect.minX, d = v.rect.maxZ - v.rect.minZ;
      m.makeScale(w, v.height, d).setPosition((v.rect.minX + v.rect.maxX) / 2, v.base, (v.rect.minZ + v.rect.maxZ) / 2);
      mesh.setMatrixAt(i, m);
      aBox.set([w, v.height, d], i * 3);
      aParams.set([v.seed, v.style, v.shop, v.lit], i * 4);
      aTint.set(v.tint, i * 3);
    });
    geo.setAttribute('aBox', new THREE.InstancedBufferAttribute(aBox, 3));
    geo.setAttribute('aParams', new THREE.InstancedBufferAttribute(aParams, 4));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(aTint, 3));
    mesh.computeBoundingSphere();
    mesh.frustumCulled = false;
    mesh.name = 'buildings';
    this.group.add(mesh);

    // ---- neon roof outlines + vertical edge strips
    const neon: { pos: THREE.Vector3; scale: THREE.Vector3; color: THREE.Color }[] = [];
    for (const b of city.buildings) {
      if (!b.neonEdge) continue;
      const top = CURB_HEIGHT + (b.setback ? b.setback.height : b.height);
      const rr = b.setback ? b.setback.rect : b;
      const c = new THREE.Color().setHSL(b.neonEdge, 1, 0.55).multiplyScalar(5);
      const w = rr.maxX - rr.minX, d = rr.maxZ - rr.minZ, cx = (rr.minX + rr.maxX) / 2, cz = (rr.minZ + rr.maxZ) / 2;
      const t = 0.22;
      neon.push({ pos: new THREE.Vector3(cx, top, rr.minZ), scale: new THREE.Vector3(w + t, t, t), color: c });
      neon.push({ pos: new THREE.Vector3(cx, top, rr.maxZ), scale: new THREE.Vector3(w + t, t, t), color: c });
      neon.push({ pos: new THREE.Vector3(rr.minX, top, cz), scale: new THREE.Vector3(t, t, d + t), color: c });
      neon.push({ pos: new THREE.Vector3(rr.maxX, top, cz), scale: new THREE.Vector3(t, t, d + t), color: c });
      if (b.seed % 3 < 1.4) {
        const base = b.setback ? CURB_HEIGHT + b.height : CURB_HEIGHT + 6;
        for (const [x, z] of [[rr.minX, rr.minZ], [rr.maxX, rr.minZ], [rr.minX, rr.maxZ], [rr.maxX, rr.maxZ]]) {
          neon.push({ pos: new THREE.Vector3(x, (base + top) / 2, z), scale: new THREE.Vector3(t, top - base, t), color: c.clone().multiplyScalar(0.8) });
        }
      }
    }
    if (neon.length) {
      const ng = new THREE.BoxGeometry(1, 1, 1);
      const nm = new THREE.InstancedMesh(ng, new THREE.MeshBasicMaterial({ color: 0xffffff }), neon.length);
      neon.forEach((e, i) => {
        m.compose(e.pos, new THREE.Quaternion(), e.scale);
        nm.setMatrixAt(i, m);
        nm.setColorAt(i, e.color);
      });
      nm.name = 'neon-edges';
      nm.computeBoundingSphere();
      this.group.add(nm);
    }

    // ---- rooftop clutter (AC units, water tanks) + antennas with blinking beacons
    const boxes: THREE.Matrix4[] = [];
    const beaconPos: THREE.Vector3[] = [];
    const rr = rng(4242);
    for (const b of city.buildings) {
      const top = CURB_HEIGHT + (b.setback ? b.setback.height : b.height);
      const rect = b.setback ? b.setback.rect : b;
      const w = rect.maxX - rect.minX, d = rect.maxZ - rect.minZ;
      const k = b.height > 14 ? rr.int(1, 3) : 0;
      for (let i = 0; i < k; i++) {
        const sx = rr.range(1.5, Math.min(5, w * 0.4)), sz = rr.range(1.5, Math.min(5, d * 0.4)), sy = rr.range(1, 2.6);
        const x = rr.range(rect.minX + sx, rect.maxX - sx), z = rr.range(rect.minZ + sz, rect.maxZ - sz);
        boxes.push(new THREE.Matrix4().makeScale(sx, sy, sz).setPosition(x, top + sy / 2, z));
      }
      if (b.height > 70) {
        const x = (rect.minX + rect.maxX) / 2 + rr.range(-w / 4, w / 4), z = (rect.minZ + rect.maxZ) / 2 + rr.range(-d / 4, d / 4);
        const ah = rr.range(6, 16);
        boxes.push(new THREE.Matrix4().makeScale(0.25, ah, 0.25).setPosition(x, top + ah / 2, z));
        beaconPos.push(new THREE.Vector3(x, top + ah + 0.2, z));
      }
    }
    const roofGeo = new THREE.BoxGeometry(1, 1, 1);
    const roof = new THREE.InstancedMesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.8, metalness: 0.3 }), boxes.length);
    boxes.forEach((mm, i) => roof.setMatrixAt(i, mm));
    roof.name = 'roof-clutter';
    roof.computeBoundingSphere();
    this.group.add(roof);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.2, 0.1) });
    this.beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 8, 6), this.beaconMat, Math.max(1, beaconPos.length));
    beaconPos.forEach((p, i) => this.beacons.setMatrixAt(i, new THREE.Matrix4().setPosition(p)));
    this.beacons.count = beaconPos.length;
    this.beacons.computeBoundingSphere();
    this.group.add(this.beacons);
  }

  update(t: number) {
    this.time.value = t;
    const on = (t * 0.8) % 1 < 0.18;
    this.beaconMat.color.setRGB(on ? 8 : 0.25, on ? 0.3 : 0.01, on ? 0.15 : 0.01);
  }
}
