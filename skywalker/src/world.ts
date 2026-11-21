// Mundo: terreno, floresta instanciada com LOD, objetos do chão, céu, névoa, cabana, covil,
// pistas e itens. Também guarda os colisores (círculos 2D numa grade espacial).
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Assets, ModelKey } from './assets';
import { rng, fbm, smooth, clamp } from './noise';
import { TERRAIN_SIZE, PLAY_RADIUS, CABIN, LAIR, SPAWN, CLUES, PICKUPS, CLEARINGS, heightAt, pathDist, pathMask } from './map';

// ------------------------------------------------------------------ colisores
export class Colliders {
  private cell = 4;
  private grid = new Map<number, { x: number; z: number; r: number; h: number }[]>();
  private key(ix: number, iz: number) { return (ix + 500) * 1000 + (iz + 500); }
  add(x: number, z: number, r: number, h = 10) {
    const c = { x, z, r, h };
    const i0 = Math.floor((x - r) / this.cell), i1 = Math.floor((x + r) / this.cell);
    const j0 = Math.floor((z - r) / this.cell), j1 = Math.floor((z + r) / this.cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this.key(i, j); let l = this.grid.get(k); if (!l) this.grid.set(k, (l = [])); l.push(c);
    }
  }
  near(x: number, z: number) { return this.grid.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))) ?? []; }
  /** empurra um círculo para fora dos obstáculos */
  resolve(p: { x: number; z: number }, r: number) {
    for (let it = 0; it < 2; it++) {
      const seen = new Set<object>();
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        for (const c of this.near(p.x + dx * this.cell, p.z + dz * this.cell)) {
          if (seen.has(c)) continue; seen.add(c);
          const ox = p.x - c.x, oz = p.z - c.z, d = Math.hypot(ox, oz), m = c.r + r;
          if (d < m && d > 1e-4) { p.x = c.x + (ox / d) * m; p.z = c.z + (oz / d) * m; }
        }
      }
    }
  }
  /** distância até o primeiro obstáculo no segmento (ou Infinity) */
  ray(x0: number, z0: number, x1: number, z1: number, minH = 0) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    if (len < 1e-4) return Infinity;
    const ux = dx / len, uz = dz / len;
    let best = Infinity;
    const seen = new Set<object>();
    for (let s = 0; s <= len + this.cell; s += this.cell * 0.5) {
      const px = x0 + ux * Math.min(s, len), pz = z0 + uz * Math.min(s, len);
      for (const c of this.near(px, pz)) {
        if (seen.has(c) || c.h < minH) continue; seen.add(c);
        const fx = x0 - c.x, fz = z0 - c.z;
        const b = fx * ux + fz * uz, cc = fx * fx + fz * fz - c.r * c.r;
        const disc = b * b - cc;
        if (disc < 0) continue;
        const t = -b - Math.sqrt(disc);
        if (t > 0 && t < len && t < best) best = t;
      }
      if (best < s) break;
    }
    return best;
  }
}

// ------------------------------------------------------------------ instâncias com LOD
interface Inst { m: THREE.Matrix4; p: THREE.Vector3; r: number }
interface Part { mesh: THREE.InstancedMesh; local: THREE.Matrix4 }

function partsOf(g: GLTF, cap: number, shadow: boolean): Part[] {
  const out: Part[] = [];
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const im = new THREE.InstancedMesh(m.geometry, m.material, cap);
    im.frustumCulled = false; im.count = 0;
    im.castShadow = shadow; im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    out.push({ mesh: im, local: m.matrixWorld.clone() });
  });
  return out;
}

export class LodGroup {
  near: Part[]; far: Part[];
  private tmp = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  constructor(scene: THREE.Scene, nearG: GLTF, farG: GLTF | null, public list: Inst[], public nearD: number, public farD: number, shadow: boolean) {
    this.near = partsOf(nearG, list.length, shadow);
    this.far = farG ? partsOf(farG, list.length, false) : [];
    for (const p of [...this.near, ...this.far]) scene.add(p.mesh);
  }
  update(cam: THREE.Vector3, fr: THREE.Frustum) {
    let n = 0, f = 0;
    const nd2 = this.nearD * this.nearD, fd2 = this.farD * this.farD;
    for (const it of this.list) {
      const dx = it.p.x - cam.x, dz = it.p.z - cam.z, d2 = dx * dx + dz * dz;
      if (d2 > fd2) continue;
      this.sphere.center.set(it.p.x, it.p.y + it.r * 0.5, it.p.z); this.sphere.radius = it.r;
      if (d2 > 16 && !fr.intersectsSphere(this.sphere)) continue;
      if (d2 < nd2 || !this.far.length) {
        for (const p of this.near) p.mesh.setMatrixAt(n, this.tmp.multiplyMatrices(it.m, p.local));
        n++;
      } else {
        for (const p of this.far) p.mesh.setMatrixAt(f, this.tmp.multiplyMatrices(it.m, p.local));
        f++;
      }
    }
    for (const p of this.near) { p.mesh.count = n; p.mesh.instanceMatrix.needsUpdate = true; }
    for (const p of this.far) { p.mesh.count = f; p.mesh.instanceMatrix.needsUpdate = true; }
  }
}

// ------------------------------------------------------------------ objetos interativos
export interface Interactive {
  kind: 'clue' | 'ammo' | 'battery';
  index: number;
  obj: THREE.Object3D;
  glint: THREE.Sprite;
  pos: THREE.Vector3;
  taken: boolean;
  active: boolean;
}

export interface BeamUniforms { lightPos: { value: THREE.Vector3 }; lightDir: { value: THREE.Vector3 }; lightOn: { value: number }; time: { value: number } }

export class World {
  scene: THREE.Scene;
  colliders = new Colliders();
  groups: LodGroup[] = [];
  items: Interactive[] = [];
  beam: BeamUniforms = { lightPos: { value: new THREE.Vector3() }, lightDir: { value: new THREE.Vector3(0, 0, -1) }, lightOn: { value: 1 }, time: { value: 0 } };
  campLight!: THREE.PointLight;
  cabinLight!: THREE.PointLight;
  mist: THREE.Mesh[] = [];
  dust: THREE.Points;
  private frustum = new THREE.Frustum();
  private pm = new THREE.Matrix4();
  private mistTex: THREE.Texture;
  private glintTex: THREE.Texture;
  lairCenter = new THREE.Vector3();

  constructor(public A: Assets, quality: 'high' | 'low') {
    const s = (this.scene = new THREE.Scene());
    s.fog = new THREE.FogExp2(0x06080c, 0.043);
    s.background = new THREE.Color(0x06080c);
    this.mistTex = makeMistTexture();
    this.glintTex = makeGlintTexture();
    this.buildLights();
    this.buildSky();
    this.buildTerrain(quality);
    this.scatter(quality);
    this.buildCabin();
    this.buildLair();
    this.buildItems();
    this.buildMist(quality === 'high' ? 34 : 16);
    this.dust = this.buildDust(quality === 'high' ? 420 : 220);
    this.lairCenter.set(LAIR.x, heightAt(LAIR.x, LAIR.z), LAIR.z);
  }

  // ---------------------------------------------------------------- luzes
  private buildLights() {
    const hemi = new THREE.HemisphereLight(0x22324a, 0x0b0907, 0.3);
    this.scene.add(hemi);
    const moon = new THREE.DirectionalLight(0x8ea4c8, 0.12);
    moon.position.set(40, 80, -60);
    this.scene.add(moon);
    this.campLight = new THREE.PointLight(0xff8a3a, 18, 16, 1.6);
    this.campLight.position.set(CABIN.x + 6.5, heightAt(CABIN.x + 6.5, CABIN.z - 9) + 0.6, CABIN.z - 9);
    this.scene.add(this.campLight);
    this.cabinLight = new THREE.PointLight(0xffb36b, 6, 9, 1.8);
    this.scene.add(this.cabinLight);
  }

  // ---------------------------------------------------------------- céu
  private buildSky() {
    const moonDir = new THREE.Vector3(0.35, 0.42, -0.84).normalize();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { moonDir: { value: moonDir } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `varying vec3 vDir; uniform vec3 moonDir;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
        void main(){
          float y = clamp(vDir.y, -0.2, 1.0);
          vec3 col = mix(vec3(0.02,0.026,0.04), vec3(0.004,0.006,0.011), smoothstep(0.0,0.7,y));
          float md = dot(normalize(vDir), moonDir);
          col += vec3(0.20,0.24,0.32) * pow(max(md,0.0), 300.0) * 0.5 + vec3(0.05,0.065,0.09)*pow(max(md,0.0),10.0);
          col += vec3(0.85,0.88,0.95) * smoothstep(0.99990, 0.99994, md);
          vec3 q = floor(vDir*420.0); float s = h(q); col += vec3(0.5) * step(0.9975, s) * smoothstep(0.05,0.4,y);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
    sky.renderOrder = -10; sky.frustumCulled = false;
    this.scene.add(sky);
  }

  // ---------------------------------------------------------------- terreno
  private buildTerrain(quality: 'high' | 'low') {
    const A = this.A;
    const N = 256;
    const data = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) / N - 0.5) * TERRAIN_SIZE, z = ((j + 0.5) / N - 0.5) * TERRAIN_SIZE;
      const k = (j * N + i) * 4;
      const near = (cx: number, cz: number, r: number) => 1 - smooth(r * 0.6, r, Math.hypot(x - cx, z - cz));
      data[k] = clamp(pathMask(x, z) + near(CABIN.x, CABIN.z, 10) * 0.6 + near(LAIR.x, LAIR.z, 12) * 0.8, 0, 1) * 255;
      data[k + 1] = clamp(fbm(x * 0.06, z * 0.06, 3) * 1.4 + 0.45, 0, 1) * 255;
      data[k + 2] = clamp(smooth(0.25, 0.6, fbm(x * 0.03 + 9, z * 0.03 - 4, 3)) * 0.9, 0, 1) * 255;
      data[k + 3] = 255;
    }
    const mask = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    mask.magFilter = THREE.LinearFilter; mask.minFilter = THREE.LinearFilter; mask.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({
      map: A.tex.ground_diff, normalMap: A.tex.ground_nor, roughnessMap: A.tex.ground_rough,
      roughness: 1, metalness: 0, color: 0xbdb5a8, normalScale: new THREE.Vector2(1.3, 1.3),
    });
    const TILE = 40;
    for (const t of [A.tex.ground_diff, A.tex.ground_nor, A.tex.ground_rough]) t.repeat.set(10, 10);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.map2 = { value: A.tex.ground2_diff };
      sh.uniforms.maskTex = { value: mask };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; uniform sampler2D map2; uniform sampler2D maskTex;`)
        .replace('#include <map_fragment>', `
          vec4 gMask = texture2D(maskTex, vWPos.xz / ${TERRAIN_SIZE.toFixed(1)} + 0.5);
          vec3 c1 = texture2D(map, vMapUv).rgb;
          vec3 c2 = texture2D(map2, vMapUv * 0.71 + vec2(0.37, 0.11)).rgb;
          vec3 gcol = mix(c1, c2, gMask.g * 0.85);
          gcol = mix(gcol, c2 * vec3(0.92, 0.82, 0.72), gMask.r);
          gcol *= mix(1.0, 0.62, gMask.b);
          diffuseColor.rgb *= gcol;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.42, gMask.b * 0.75);`);
    };
    const segs = quality === 'high' ? 30 : 20;
    const n = Math.ceil(TERRAIN_SIZE / TILE);
    for (let ti = 0; ti < n; ti++) for (let tj = 0; tj < n; tj++) {
      const cx = -TERRAIN_SIZE / 2 + (ti + 0.5) * TILE, cz = -TERRAIN_SIZE / 2 + (tj + 0.5) * TILE;
      const g = new THREE.PlaneGeometry(TILE, TILE, segs, segs);
      g.rotateX(-Math.PI / 2);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i) + cx, pos.getZ(i) + cz));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.position.set(cx, 0, cz);
      m.receiveShadow = true;
      this.scene.add(m);
    }
  }

  // ---------------------------------------------------------------- floresta e chão
  private model(k: ModelKey) { return this.A.models[k]; }

  private scatter(quality: 'high' | 'low') {
    const R = rng(1147);
    const lists: Record<string, Inst[]> = {};
    const push = (k: string, x: number, z: number, scale: number, rotY: number, r: number, tilt = 0) => {
      const y = heightAt(x, z);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt * (R() - 0.5), rotY, tilt * (R() - 0.5)));
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.05, z), q, new THREE.Vector3(scale, scale, scale));
      (lists[k] ??= []).push({ m, p: new THREE.Vector3(x, y, z), r });
    };
    const blocked = (x: number, z: number, pad: number) => CLEARINGS.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + pad);
    // árvores numa grade com jitter; densidade varia com ruído
    const cell = 4.6;
    const half = PLAY_RADIUS + 26;
    const trees: [string, number, number][] = [
      ['tree_evergreen', 0.36, 0.34], ['tree_pine', 0.26, 0.3], ['tree_dead_bare', 0.13, 0.22],
      ['tree_dead_twisted', 0.13, 0.3], ['tree_half_dead', 0.12, 0.16],
    ];
    for (let gx = -half; gx < half; gx += cell) for (let gz = -half; gz < half; gz += cell) {
      const x = gx + R() * cell, z = gz + R() * cell;
      const rr = Math.hypot(x, z);
      if (rr > half) continue;
      const dens = 0.55 + fbm(x * 0.02, z * 0.02, 2) * 0.7 + smooth(PLAY_RADIUS - 6, PLAY_RADIUS + 4, rr) * 0.6;
      if (R() > dens) continue;
      if (pathDist(x, z) < 2.4 || blocked(x, z, 1.2)) continue;
      // perto do covil: só árvores mortas
      const nearLair = Math.hypot(x - LAIR.x, z - LAIR.z) < 34;
      let pick = R(), acc = 0, type = trees[0];
      for (const t of trees) { acc += t[1]; if (pick <= acc) { type = t; break; } }
      if (nearLair && R() < 0.75) type = R() < 0.5 ? trees[2] : trees[3];
      const sc = 0.78 + R() * 0.5;
      const dead = type[0].includes('dead');
      push(type[0], x, z, sc, R() * Math.PI * 2, 9 * sc, dead ? 0.12 : 0.04);
      this.colliders.add(x, z, type[2] * sc + 0.08);
    }
    // limite invisível do mapa
    for (let a = 0; a < Math.PI * 2; a += 0.035) this.colliders.add(Math.cos(a) * (PLAY_RADIUS + 3), Math.sin(a) * (PLAY_RADIUS + 3), 3.2);

    // vegetação rasteira e detritos
    const props: [string, number, number, number, number][] = [
      // chave, quantidade, escala mín, escala máx, raio de colisão
      ['fern', quality === 'high' ? 620 : 380, 0.7, 1.4, 0],
      ['branches', 260, 0.8, 1.3, 0],
      ['roots', 120, 0.8, 1.3, 0],
      ['stump', 70, 0.7, 1.2, 0.5],
      ['stump_scan', 45, 0.8, 1.2, 0.45],
      ['dead_trunk', 55, 0.8, 1.2, 0],
      ['rock_moss_1', 26, 0.5, 0.9, 0],
      ['rock_moss_2', 26, 0.5, 0.9, 0],
      ['boulder', 40, 0.6, 1.5, 0.9],
    ];
    for (const [k, count, s0, s1, cr] of props) {
      let placed = 0, tries = 0;
      while (placed < count && tries++ < count * 6) {
        const a = R() * Math.PI * 2, d = Math.sqrt(R()) * (PLAY_RADIUS - 2);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (blocked(x, z, k === 'fern' || k === 'branches' ? 0 : 1) || pathDist(x, z) < (k === 'fern' ? 1.6 : 2.2)) continue;
        const sc = s0 + R() * (s1 - s0);
        const rot = R() * Math.PI * 2;
        push(k, x, z, sc, rot, k === 'dead_trunk' ? 4 : k.startsWith('rock') ? 5 : 1.6, 0.08);
        if (cr) this.colliders.add(x, z, cr * sc);
        if (k === 'dead_trunk') { // tronco caído: colisores ao longo do comprimento
          for (let t = -2.4; t <= 2.4; t += 0.8) this.colliders.add(x + Math.cos(rot) * t * sc, z - Math.sin(rot) * t * sc, 0.32 * sc, 0.5);
        }
        if (k.startsWith('rock')) this.colliders.add(x, z, 1.2 * sc, 1);
        placed++;
      }
    }
    // [perto, longe, sombra]; no modo leve tudo encolhe (a neblina esconde o resto)
    const lod: Record<string, [number, number, boolean]> = {
      tree_evergreen: [24, 90, true], tree_pine: [24, 90, true], tree_dead_bare: [22, 90, true],
      tree_dead_twisted: [20, 75, true], tree_half_dead: [20, 75, true],
      fern: [30, 30, false], branches: [26, 26, false], roots: [28, 28, false], stump: [40, 40, true],
      stump_scan: [40, 40, true], dead_trunk: [45, 45, true], rock_moss_1: [55, 55, true], rock_moss_2: [55, 55, true], boulder: [60, 60, true],
    };
    const k2 = quality === 'high' ? 1 : 0.75;
    for (const [k, list] of Object.entries(lists)) {
      const [nd0, fd0, sh] = lod[k];
      const nd = nd0 * k2, fd = fd0 * (quality === 'high' ? 1 : 0.8);
      const far = (this.A.models as Record<string, GLTF>)[k + '_far'] ?? null;
      this.groups.push(new LodGroup(this.scene, this.model(k as ModelKey), far, list, nd, fd, sh));
    }
    // folhagem mais escura e fosca à noite
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!m || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
      m.envMapIntensity = 0;
      if (m.alphaTest > 0 || m.transparent) { m.alphaTest = Math.max(m.alphaTest, 0.42); m.transparent = false; m.side = THREE.DoubleSide; }
    });
  }

  private place(k: ModelKey, x: number, z: number, rotY = 0, scale = 1, shadow = true, yOff = 0) {
    const o = this.model(k).scene.clone(true);
    o.position.set(x, heightAt(x, z) + yOff, z); o.rotation.y = rotY; o.scale.setScalar(scale);
    o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = shadow; m.receiveShadow = true; } });
    this.scene.add(o);
    return o;
  }

  // ---------------------------------------------------------------- cabana e fogueira
  private buildCabin() {
    const cab = this.place('cabin', CABIN.x, CABIN.z, Math.PI, 1);
    const b = this.A.manifest.models.cabin.bounds;
    const w = (b.max[0] - b.min[0]) / 2 + 0.2, d = (b.max[2] - b.min[2]) / 2 + 0.2;
    for (let x = -w; x <= w; x += 0.9) { this.colliders.add(CABIN.x + x, CABIN.z - d, 0.5); this.colliders.add(CABIN.x + x, CABIN.z + d, 0.5); }
    for (let z = -d; z <= d; z += 0.9) { this.colliders.add(CABIN.x - w, CABIN.z + z, 0.5); this.colliders.add(CABIN.x + w, CABIN.z + z, 0.5); }
    this.cabinLight.position.set(CABIN.x + 1.2, heightAt(CABIN.x, CABIN.z) + 2.2, CABIN.z - d - 0.6);
    // janela acesa (brilho quente)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glintTex, color: 0xffa45c, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
    glow.position.copy(this.cabinLight.position); glow.scale.setScalar(1.6);
    this.scene.add(glow);
    void cab;
    // fogueira apagando
    const fx = CABIN.x + 6.5, fz = CABIN.z - 9;
    this.place('campfire', fx, fz, 0.4, 1, false);
    this.colliders.add(fx, fz, 0.7, 0.4);
    const ember = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glintTex, color: 0xff5a1a, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
    ember.position.set(fx, heightAt(fx, fz) + 0.25, fz); ember.scale.setScalar(1.3);
    ember.name = 'ember';
    this.scene.add(ember);
  }

  // ---------------------------------------------------------------- covil do Skywalker
  private buildLair() {
    const R = rng(66);
    const L = LAIR;
    const stakeMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.95 });
    const stakeGeo = new THREE.CylinderGeometry(0.035, 0.06, 2.4, 6);
    stakeGeo.translate(0, 1.2, 0);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + R() * 0.3, d = 9 + R() * 2.5;
      const x = L.x + Math.cos(a) * d, z = L.z + Math.sin(a) * d;
      const y = heightAt(x, z);
      const st = new THREE.Mesh(stakeGeo, stakeMat);
      st.position.set(x, y - 0.1, z); st.rotation.set((R() - 0.5) * 0.25, R() * 6, (R() - 0.5) * 0.25);
      st.castShadow = true;
      this.scene.add(st);
      const sk = this.model(i % 3 === 0 ? 'human_skull' : 'deer_skull').scene.clone(true);
      sk.position.set(x, y + 2.25, z); sk.rotation.set(-0.3, Math.atan2(L.x - x, L.z - z), 0);
      sk.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
      this.scene.add(sk);
      this.colliders.add(x, z, 0.15);
    }
    for (let i = 0; i < 7; i++) {
      const a = R() * Math.PI * 2, d = 2 + R() * 6;
      this.place('bone_pile', L.x + Math.cos(a) * d, L.z + Math.sin(a) * d, R() * 6, 0.9 + R() * 0.6, true, -0.02);
    }
    for (let i = 0; i < 6; i++) {
      const a = R() * Math.PI * 2, d = 1 + R() * 7;
      this.place('human_skull', L.x + Math.cos(a) * d, L.z + Math.sin(a) * d, R() * 6, 1, true, 0.02).rotation.x = (R() - 0.5) * 1.2;
    }
    // ninho de galhos no centro
    for (let i = 0; i < 10; i++) this.place('branches', L.x + (R() - 0.5) * 3, L.z + (R() - 0.5) * 3, R() * 6, 1 + R() * 0.6, true, 0.05);
    this.place('deer_skull', L.x, L.z, 0, 1.4, true, 0.1);
  }

  // ---------------------------------------------------------------- pistas e itens
  private buildItems() {
    const add = (kind: Interactive['kind'], index: number, obj: THREE.Object3D, x: number, z: number) => {
      const y = heightAt(x, z);
      obj.position.set(x, y + 0.01, z);
      obj.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      this.scene.add(obj);
      const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glintTex, color: kind === 'clue' ? 0xfff2d8 : 0xd8e8ff, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, fog: true }));
      glint.position.set(x, y + 0.14, z); glint.scale.setScalar(0.3);
      this.scene.add(glint);
      this.items.push({ kind, index, obj, glint, pos: new THREE.Vector3(x, y + 0.1, z), taken: false, active: kind !== 'clue' });
    };
    CLUES.forEach((c, i) => {
      const obj = c.model === 'drawing' ? makeDrawing() : this.model(c.model as ModelKey).scene.clone(true);
      obj.rotation.y = c.rotY;
      if (c.model === 'kids_shoe') obj.rotation.z = 1.25; // tombado de lado
      add('clue', i, obj, c.pos.x, c.pos.z);
      obj.visible = false;
    });
    PICKUPS.forEach((p, i) => add(p.kind, i, p.kind === 'ammo' ? makeAmmoBox() : makeBatteries(), p.pos.x, p.pos.z));
  }

  // ---------------------------------------------------------------- névoa rasteira e poeira no feixe
  private beamGLSL = `
    uniform vec3 lightPos; uniform vec3 lightDir; uniform float lightOn;
    float beamAt(vec3 wp){
      vec3 v = wp - lightPos; float d = length(v);
      float c = dot(v / max(d, 1e-3), lightDir);
      return smoothstep(0.84, 0.985, c) * lightOn / (1.0 + 0.035 * d * d);
    }`;

  private buildMist(n: number) {
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, fog: false,
        uniforms: { map: { value: this.mistTex }, ...this.beam, alpha: { value: 0.1 + Math.random() * 0.08 }, seed: { value: Math.random() * 10 } },
        vertexShader: `varying vec2 vUv; varying vec3 vW; varying float vDist;
          void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec2 vUv; varying vec3 vW; varying float vDist; uniform sampler2D map; uniform float alpha; uniform float time; uniform float seed;
          ${this.beamGLSL}
          void main(){
            vec2 uv = vUv + vec2(time*0.006 + seed, seed*0.37);
            float n = texture2D(map, uv).r * texture2D(map, vUv*0.6 - vec2(time*0.004, 0.0) + seed).r;
            float edge = smoothstep(0.0,0.35,vUv.x)*smoothstep(1.0,0.65,vUv.x)*smoothstep(0.0,0.35,vUv.y)*smoothstep(1.0,0.65,vUv.y);
            float a = n * edge * alpha * smoothstep(1.5, 6.0, vDist) * (1.0 - smoothstep(26.0, 44.0, vDist));
            float b = beamAt(vW);
            vec3 col = vec3(0.07,0.085,0.11) + vec3(1.0,0.92,0.78) * b * 1.3;
            gl_FragColor = vec4(col, a * (1.0 + b * 1.6));
          }`,
      });
      const m = new THREE.Mesh(geo, mat);
      m.userData.size = 7 + Math.random() * 7;
      m.scale.set(m.userData.size, m.userData.size * 0.45, 1);
      m.frustumCulled = false; m.renderOrder = 5;
      this.mist.push(m);
      this.scene.add(m);
      this.respawnMist(m, new THREE.Vector3(SPAWN.x, 0, SPAWN.z), true);
    }
  }

  private respawnMist(m: THREE.Mesh, around: THREE.Vector3, any: boolean) {
    const a = Math.random() * Math.PI * 2, d = any ? 4 + Math.random() * 34 : 30 + Math.random() * 10;
    const x = around.x + Math.cos(a) * d, z = around.z + Math.sin(a) * d;
    m.position.set(x, heightAt(x, z) + 0.4 + Math.random() * 1.6, z);
  }

  private buildDust(n: number) {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) p[i] = (Math.random() - 0.5) * 16;
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { ...this.beam, origin: { value: new THREE.Vector3() }, px: { value: 1 } },
      vertexShader: `uniform vec3 origin; uniform float time; uniform float px; varying float vB; ${this.beamGLSL}
        void main(){
          vec3 p = position + vec3(sin(time*0.13 + position.y)*0.6, sin(time*0.07 + position.x)*0.4 - time*0.05, cos(time*0.11 + position.z)*0.6);
          p = mod(p - origin + 8.0, 16.0) - 8.0 + origin;
          vB = beamAt(p);
          vec4 mv = viewMatrix * vec4(p,1.0);
          gl_PointSize = px * 2.2 * (6.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vB; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); gl_FragColor = vec4(vec3(1.0,0.93,0.8), a * vB * 1.4); }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    return pts;
  }

  // ---------------------------------------------------------------- atualização por quadro
  update(cam: THREE.PerspectiveCamera, t: number, playerPos: THREE.Vector3) {
    this.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm);
    const cp = cam.position;
    for (const g of this.groups) g.update(cp, this.frustum);
    this.beam.time.value = t;
    for (const m of this.mist) {
      m.quaternion.copy(cam.quaternion);
      if (m.position.distanceTo(playerPos) > 44) this.respawnMist(m, playerPos, false);
    }
    (this.dust.material as THREE.ShaderMaterial).uniforms.origin.value.copy(cp);
    // fogueira e janela tremulando
    const fl = 0.75 + Math.sin(t * 9.1) * 0.1 + Math.sin(t * 23.7) * 0.08 + Math.random() * 0.07;
    this.campLight.intensity = 16 * fl;
    this.cabinLight.intensity = 5 + Math.sin(t * 3.3) * 0.4;
  }
}

// ------------------------------------------------------------------ texturas e objetos procedurais
function makeMistTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0, a = 0.5, f = 1 / 32;
    for (let o = 0; o < 4; o++) {
      // ruído periódico (repete sem emenda)
      const px = (x * f), py = (y * f), P = S * f;
      const n = (Math.sin((px / P) * Math.PI * 2 * (o + 1) + o * 1.7) + Math.cos((py / P) * Math.PI * 2 * (o + 2) + o) + Math.sin(((px + py) / P) * Math.PI * 2 * (o + 1)) * 0.6) / 2.6;
      v += n * a; a *= 0.5; f *= 2;
    }
    const k = (y * S + x) * 4, val = Math.max(0, Math.min(255, (v * 0.5 + 0.5) * 255));
    img.data[k] = img.data[k + 1] = img.data[k + 2] = val; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeGlintTexture() {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.15, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(S / 2, 4); g.lineTo(S / 2, S - 4); g.moveTo(4, S / 2); g.lineTo(S - 4, S / 2); g.stroke();
  return new THREE.CanvasTexture(c);
}

/** desenho de giz de cera do Theo: pai, filho e a figura alta com chifres entre as árvores */
export function drawingCanvas() {
  const W = 512, H = 360, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e9e2cf'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(120,100,70,${Math.random() * 0.06})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  g.strokeStyle = 'rgba(150,170,200,0.35)'; g.lineWidth = 1;
  for (let y = 40; y < H; y += 28) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  const crayon = (col: string, w: number, pts: number[][]) => {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      g.beginPath();
      pts.forEach(([x, y], i) => { const jx = x + (Math.random() - 0.5) * 2.5, jy = y + (Math.random() - 0.5) * 2.5; if (i) g.lineTo(jx, jy); else g.moveTo(jx, jy); });
      g.stroke();
    }
  };
  // árvores
  for (const x of [40, 110, 400, 470]) { crayon('#3d5a2a', 7, [[x, 330], [x, 120]]); crayon('#2f4a22', 5, [[x - 30, 170], [x, 100], [x + 30, 170], [x - 30, 170]]); }
  // chão
  crayon('#5b4630', 5, [[10, 332], [500, 328]]);
  // pai e filho
  const person = (x: number, s: number, col: string) => {
    g.strokeStyle = col; g.lineWidth = 4; g.beginPath(); g.arc(x, 330 - 92 * s, 13 * s, 0, Math.PI * 2); g.stroke();
    crayon(col, 4, [[x, 330 - 79 * s], [x, 330 - 35 * s]]);
    crayon(col, 4, [[x - 18 * s, 330], [x, 330 - 35 * s], [x + 18 * s, 330]]);
    crayon(col, 4, [[x - 22 * s, 330 - 70 * s], [x, 330 - 60 * s], [x + 22 * s, 330 - 70 * s]]);
  };
  person(170, 1.25, '#24407a'); person(215, 0.8, '#b8352a');
  g.fillStyle = '#24407a'; g.font = 'bold 20px "Comic Sans MS", cursive'; g.fillText('PAPAI', 140, 195); g.fillStyle = '#b8352a'; g.fillText('EU', 205, 240);
  // a criatura: alta, preta, chifres, olhos vermelhos
  const X = 330;
  crayon('#111', 9, [[X, 330], [X - 6, 250], [X, 160], [X + 4, 250], [X + 10, 330]]);
  crayon('#111', 6, [[X - 40, 300], [X - 20, 200], [X, 175], [X + 20, 200], [X + 44, 305]]);
  crayon('#111', 7, [[X, 160], [X, 128]]);
  g.fillStyle = '#ddd'; g.beginPath(); g.ellipse(X, 118, 15, 22, 0, 0, Math.PI * 2); g.fill();
  crayon('#4a3a28', 4, [[X - 8, 100], [X - 30, 60], [X - 55, 40]]); crayon('#4a3a28', 3, [[X - 30, 60], [X - 22, 30]]); crayon('#4a3a28', 3, [[X - 42, 50], [X - 60, 62]]);
  crayon('#4a3a28', 4, [[X + 8, 100], [X + 30, 60], [X + 55, 40]]); crayon('#4a3a28', 3, [[X + 30, 60], [X + 22, 30]]); crayon('#4a3a28', 3, [[X + 42, 50], [X + 60, 62]]);
  g.fillStyle = '#d0141a'; g.beginPath(); g.arc(X - 6, 114, 3.5, 0, 7); g.arc(X + 6, 114, 3.5, 0, 7); g.fill();
  g.fillStyle = '#111'; g.font = 'bold 22px "Comic Sans MS", cursive'; g.fillText('O HOMEM CERVO', 250, 30);
  g.fillStyle = '#b8352a'; g.font = '16px "Comic Sans MS", cursive'; g.fillText('ele imita os bichos', 290, 52);
  return c;
}

function makeDrawing() {
  const tex = new THREE.CanvasTexture(drawingCanvas()); tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.PlaneGeometry(0.297, 0.21, 8, 4);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 18) * 0.008 + pos.getY(i) * pos.getY(i) * 0.3);
  g.computeVertexNormals(); g.rotateX(-Math.PI / 2); g.translate(0, 0.012, 0);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }));
  const o = new THREE.Group(); o.add(m); return o;
}

function labelTex(text: string, bg: string, fg: string) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d')!; g.fillStyle = bg; g.fillRect(0, 0, 128, 64);
  g.fillStyle = fg; g.font = 'bold 26px Georgia, serif'; g.textAlign = 'center'; g.fillText(text, 64, 42);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function makeAmmoBox() {
  const o = new THREE.Group();
  const side = new THREE.MeshStandardMaterial({ map: labelTex('.38 SPL', '#6e1f17', '#e8d9b0'), roughness: 0.7 });
  const plain = new THREE.MeshStandardMaterial({ color: 0x5a1912, roughness: 0.75 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.045, 0.075), [plain, plain, side, plain, side, side]);
  box.position.y = 0.0225; box.rotation.y = 0.4; o.add(box);
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3c, metalness: 0.9, roughness: 0.3 });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0048, 0.0048, 0.03, 8), brass);
    b.rotation.z = Math.PI / 2; b.position.set(0.09 + i * 0.012, 0.005, 0.03 - i * 0.02); o.add(b);
  }
  return o;
}

function makeBatteries() {
  const o = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.45, metalness: 0.2 });
  const cap = new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.3, metalness: 0.9 });
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.06, 14), body); g.add(b);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.0172, 0.0172, 0.018, 14), cap); c.position.y = 0.024; g.add(c);
    g.rotation.z = Math.PI / 2; g.rotation.y = i * 0.5; g.position.set(0, 0.017, i * 0.04); o.add(g);
  }
  return o;
}
