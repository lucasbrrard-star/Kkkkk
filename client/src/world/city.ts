// Monta a cidade inicial a partir do layout compartilhado (shared/city.ts):
// chão em camadas, sinalização, prédios, props instanciados, terrenos, orla e mar.
// Também gera os colisores e pontos de interação usados pelo controlador.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BEACH, BOARDWALK, BUILDINGS, CELLS_X, CELLS_Z, CITY, CURB, LOTS, Lot, PLAZA, ROADS, groundHeight } from '../../../shared/city';
import type { LotState } from '../../../shared/protocol';
import { Assets } from '../core/assets';
import { Engine } from '../core/engine';
import { groundMaterial, impostorMaterial, lotBorderMaterial, waterMaterial, wavePavementTexture } from '../gfx/materials';
import { makeLabel, makeSignTexture } from './labels';

export type Collider = { kind: 'box'; x: number; z: number; hx: number; hz: number; rot: number; h: number } | { kind: 'circle'; x: number; z: number; r: number; h: number };
export interface Seat { x: number; z: number; rot: number }
export interface Interactable { id: string; kind: 'lot' | 'service' | 'npc' | 'bench'; x: number; z: number; r: number; title: string; data?: unknown }


export class City {
  group = new THREE.Group();
  colliders: Collider[] = [];
  seats: Seat[] = [];
  interactables: Interactable[] = [];
  private animated: { update(t: number): void }[] = [];
  private lotVisuals = new Map<string, { border: THREE.Mesh; mat: THREE.ShaderMaterial; label: THREE.Sprite; lot: Lot }>();

  constructor(private engine: Engine, private assets: Assets) {
    engine.scene.add(this.group);
  }

  async build(onStep?: (s: string) => void) {
    onStep?.('Pavimentando ruas…');
    this.buildGround();
    this.buildMarkings();
    onStep?.('Plantando a orla…');
    this.buildShore();
    onStep?.('Erguendo prédios…');
    await this.buildBuildings();
    onStep?.('Mobiliando a praça…');
    await this.buildProps();
    this.buildLots();
    this.buildBounds();
  }

  update(t: number) { for (const a of this.animated) a.update(t); }

  /** Altura do chão (calçadas elevadas pelo meio-fio, ruas no nível 0, areia em declive). */
  heightAt(x: number, z: number): number { return groundHeight(x, z); }

  // ------------------------------------------------------------------ chão
  private buildGround() {
    const A = this.assets;
    const mats = {
      asphalt: groundMaterial(A, 'asphalt', 7, { variation: 0.22, roughness: 0.95 }),
      pavers: groundMaterial(A, 'pavers', 2.2, { variation: 0.12, tint: 0xfff6ee }),
      plaza: groundMaterial(A, 'plaza', 3.4, { variation: 0.1, tint: 0xfff0e2, normalScale: 0.6 }),
      grass: groundMaterial(A, 'grass', 3.5, { variation: 0.22, tint: 0xe8f5d8, normalScale: 0.7 }),
      lot: groundMaterial(A, 'grass', 3.5, { variation: 0.3, tint: 0xf2e8b0, normalScale: 0.7 }),
      sand: groundMaterial(A, 'sand', 12, { variation: 0.12, tint: 0xffe8c8 }),
      curb: new THREE.MeshStandardMaterial({ color: 0xbdb6aa, roughness: 0.9 }),
    };
    // camadas coplanares: polygonOffset evita z-fighting em qualquer distância
    const layer = (m: THREE.Material, f: number) => { m.polygonOffset = true; m.polygonOffsetFactor = f; m.polygonOffsetUnits = f; };
    layer(mats.pavers, -1); layer(mats.plaza, -2); layer(mats.grass, -2); layer(mats.lot, -3);
    const quad = (x0: number, z0: number, x1: number, z1: number, y: number) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
      return g;
    };
    const parts: Record<string, THREE.BufferGeometry[]> = { asphalt: [], pavers: [], plaza: [], grass: [], lot: [], sand: [], curb: [] };
    // base de grama/terra sob tudo
    parts.grass.push(quad(-140, -140, BOARDWALK.x0, 140, -0.02));
    // ruas: norte-sul inteiras, leste-oeste cortadas nos cruzamentos (evita z-fighting)
    const ns = ROADS.filter((r) => r.x0 === r.x1), ew = ROADS.filter((r) => r.z0 === r.z1);
    for (const r of ns) parts.asphalt.push(quad(r.x0 - r.w / 2, -CITY.half, r.x0 + r.w / 2, CITY.half, 0));
    for (const r of ew) {
      const cuts = ns.map((n) => [n.x0 - n.w / 2, n.x0 + n.w / 2]).sort((a, b) => a[0] - b[0]);
      let x = -CITY.half;
      for (const [a, b] of cuts) { if (a > x) parts.asphalt.push(quad(x, r.z0 - r.w / 2, a, r.z0 + r.w / 2, 0)); x = b; }
    }
    // quadras: laje de calçada (com meio-fio) + miolo
    for (const [x0, x1] of CELLS_X) for (const [z0, z1] of CELLS_Z) {
      const box = new THREE.BoxGeometry(x1 - x0, CURB, z1 - z0);
      box.translate((x0 + x1) / 2, CURB / 2, (z0 + z1) / 2);
      // topo → pavers; laterais → meio-fio
      const top = quad(x0, z0, x1, z1, CURB + 0.001);
      parts.pavers.push(top);
      parts.curb.push(box);
      const inset = CITY.sidewalk;
      const ix0 = x0 + inset, ix1 = x1 - inset, iz0 = z0 + inset, iz1 = z1 - inset;
      const central = x0 < 0 && x1 > 0 && z0 < 0 && z1 > 0;
      if (central) parts.plaza.push(quad(-PLAZA.half + 0.5, -PLAZA.half + 0.5, PLAZA.half - 0.5, PLAZA.half - 0.5, CURB + 0.004));
      else parts.grass.push(quad(ix0, iz0, ix1, iz1, CURB + 0.004));
    }
    for (const l of LOTS) parts.lot.push(quad(l.x - l.w / 2, l.z - l.d / 2, l.x + l.w / 2, l.z + l.d / 2, CURB + 0.008));
    // mosaico de pedra portuguesa em ondas ao redor do chafariz
    const ringTex = wavePavementTexture('#f3eadb', '#b8643f');
    const ring = new THREE.RingGeometry(4.2, 11.8, 72, 1);
    ring.rotateX(-Math.PI / 2);
    const rp = ring.attributes.position as THREE.BufferAttribute, ruv = ring.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < rp.count; i++) ruv.setXY(i, rp.getX(i) / 3.2, rp.getZ(i) / 3.2);
    const ringMat = new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const ringMesh = new THREE.Mesh(ring, ringMat);
    ringMesh.position.y = CURB + 0.006;
    ringMesh.receiveShadow = true;
    this.group.add(ringMesh);
    // calçadão (pedra portuguesa em ondas)
    const wave = new THREE.MeshStandardMaterial({ map: wavePavementTexture(), roughness: 0.85 });
    wave.map!.repeat.set(1, 1);
    const bw = new THREE.BoxGeometry(BOARDWALK.x1 - BOARDWALK.x0, CURB, CITY.half * 2);
    bw.translate((BOARDWALK.x0 + BOARDWALK.x1) / 2, CURB / 2, 0);
    // UV do topo do calçadão em metros (onda a cada 6 m)
    const uv = bw.attributes.uv as THREE.BufferAttribute, pos = bw.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 6, pos.getZ(i) / 6);
    const bwMesh = new THREE.Mesh(bw, wave);
    bwMesh.receiveShadow = true;
    this.group.add(bwMesh);
    // areia com caimento até o mar
    const sandG = new THREE.PlaneGeometry(BEACH.x1 - BEACH.x0 + 8, CITY.half * 2 + 60, 24, 4);
    sandG.rotateX(-Math.PI / 2);
    sandG.translate((BEACH.x0 + BEACH.x1 + 8) / 2, 0, 0);
    const sp = sandG.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i); sp.setY(i, 0.12 - Math.max(0, x - CITY.shoreX + 6) * 0.07); }
    sandG.computeVertexNormals();
    parts.sand.push(sandG);
    for (const [k, list] of Object.entries(parts)) {
      if (!list.length) continue;
      const geo = mergeGeometries(list.map((g) => g.index ? g.toNonIndexed() : g));
      const mesh = new THREE.Mesh(geo, (mats as Record<string, THREE.Material>)[k]);
      mesh.receiveShadow = true;
      if (k === 'curb') mesh.castShadow = false;
      this.group.add(mesh);
    }
  }

  // ------------------------------------------------------------------ faixas e sinalização
  private buildMarkings() {
    const dash = new THREE.PlaneGeometry(0.16, 2.2); dash.rotateX(-Math.PI / 2);
    const zebra = new THREE.PlaneGeometry(0.55, 4.2); zebra.rotateX(-Math.PI / 2);
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c24a, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2 });
    const dashes: THREE.Matrix4[] = [], zebras: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const near = (v: number) => [-80, -30, 30, 80].some((c) => Math.abs(v - c) < 7.5);
    for (const r of ROADS) {
      const vertical = r.x0 === r.x1;
      for (let s = -CITY.half + 2; s < CITY.half - 2; s += 4.5) {
        if (near(s)) continue;
        if (!vertical && s > 74) continue;
        q.setFromAxisAngle(up, vertical ? 0 : Math.PI / 2);
        m.compose(new THREE.Vector3(vertical ? r.x0 : s, 0.012, vertical ? s : r.z0), q, new THREE.Vector3(1, 1, 1));
        dashes.push(m.clone());
      }
    }
    // faixas de pedestres nas 4 saídas da praça
    for (const [x, z, vertical] of [[-30, 0, true], [30, 0, true], [0, -30, false], [0, 30, false]] as const) {
      for (let i = -4; i <= 4; i++) {
        q.setFromAxisAngle(up, vertical ? Math.PI / 2 : 0);
        m.compose(new THREE.Vector3(vertical ? x + i * 1.1 : x, 0.012, vertical ? z : z + i * 1.1), q, new THREE.Vector3(1, 1, 1));
        zebras.push(m.clone());
      }
    }
    for (const [geo, mat, list] of [[dash, yellow, dashes], [zebra, white, zebras]] as const) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.computeBoundingSphere();
      im.receiveShadow = true;
      this.group.add(im);
    }
  }

  // ------------------------------------------------------------------ mar
  private buildShore() {
    const water = waterMaterial(CITY.shoreX);
    const g = new THREE.PlaneGeometry(700, 700, 1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(CITY.shoreX - 4 + 350, -0.12, 0);
    const mesh = new THREE.Mesh(g, water);
    mesh.receiveShadow = false;
    this.group.add(mesh);
    this.animated.push({ update: (t) => { (water.userData.uTime as { value: number }).value = t; } });
  }

  // ------------------------------------------------------------------ prédios
  private async buildBuildings() {
    const jobs = BUILDINGS.map(async (b) => {
      const gltf = await this.assets.model(b.model);
      const obj = gltf.scene.clone(true);
      obj.position.set(b.x, CURB, b.z);
      obj.rotation.y = THREE.MathUtils.degToRad(b.rot);
      obj.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) { me.castShadow = true; me.receiveShadow = true; } });
      this.group.add(obj);
      const bd = this.assets.bounds(b.model);
      if (bd) {
        const hx = (bd.max[0] - bd.min[0]) / 2, hz = (bd.max[2] - bd.min[2]) / 2, h = bd.max[1] - bd.min[1];
        this.colliders.push({ kind: 'box', x: b.x, z: b.z, hx: hx * 0.96, hz: hz * 0.96, rot: THREE.MathUtils.degToRad(b.rot), h });
        if (b.label) {
          const lab = makeLabel(b.label, { size: 0.9, bg: 'rgba(20,28,48,0.82)', accent: '#ffc65a' });
          lab.position.set(b.x, h + CURB + 1.2, b.z);
          this.group.add(lab);
          this.interactables.push({ id: b.interact ?? b.model, kind: 'service', x: b.x, z: b.z, r: Math.max(hx, hz) + 3, title: b.label });
        }
      }
    });
    await Promise.all(jobs);
  }

  // ------------------------------------------------------------------ props instanciados
  // Instâncias agrupadas em blocos de 40 m (o frustum culling funciona por bloco) e com
  // LOD: perto usa <key>.glb, longe usa <key>_far.glb (quando existe).
  private lodChunks: { x: number; z: number; r: number; d: number; near: THREE.Object3D[]; far: THREE.Object3D[] }[] = [];
  lodNear = 55;

  private async meshesOf(key: string): Promise<THREE.Mesh[]> {
    const gltf = await this.assets.model(key);
    gltf.scene.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    return meshes;
  }

  /** Renderiza o modelo de lado (ortográfico, fundo transparente) para uma textura — impostor. */
  private impostors = new Map<string, Promise<THREE.ShaderMaterial>>();
  private impostor(key: string): Promise<THREE.ShaderMaterial> {
    if (!this.impostors.has(key)) this.impostors.set(key, (async () => {
      const gltf = await this.assets.model(key);
      const b = this.assets.bounds(key)!;
      const w = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]) * 1.02, h = (b.max[1] - b.min[1]) * 1.02;
      const scene = new THREE.Scene();
      scene.add(gltf.scene.clone(true));
      scene.environment = this.engine.scene.environment;
      const sun = new THREE.DirectionalLight(0xffe2c0, 2.6); sun.position.set(-0.4, 1, 1);
      scene.add(sun, new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, 0.6));
      const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h, 0, 0.1, 200);
      cam.position.set(0, 0, 60);
      const W = 256, H = Math.min(512, Math.round((256 * h) / w / 64) * 64 || 256);
      const rt = new THREE.WebGLRenderTarget(W, H, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, samples: 0 });
      const r = this.engine.renderer;
      const prevTarget = r.getRenderTarget(), prevColor = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
      r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(scene, cam);
      r.setRenderTarget(prevTarget); r.setClearColor(prevColor, prevAlpha);
      return impostorMaterial(rt.texture, w, h);
    })());
    return this.impostors.get(key)!;
  }

  private async instanced(key: string, list: { x: number; z: number; rot: number; s?: number; y?: number }[], shadow = true) {
    if (!list.length) return;
    const near = await this.meshesOf(key);
    const isTree = this.assets.manifest.models[key]?.category === 'tree';
    const far = !isTree && this.assets.manifest.models[`${key}_far`] ? await this.meshesOf(`${key}_far`) : null;
    const imp = isTree ? await this.impostor(key) : null;
    const quad = imp ? new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0) : null;
    const CH = 40;
    const chunks = new Map<string, typeof list>();
    for (const p of list) {
      const k = `${Math.floor(p.x / CH)},${Math.floor(p.z / CH)}`;
      if (!chunks.has(k)) chunks.set(k, []);
      chunks.get(k)!.push(p);
    }
    const place = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const build = (meshes: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; matrixWorld: THREE.Matrix4 }[], items: typeof list, castShadow: boolean) => meshes.map((me) => {
      const im = new THREE.InstancedMesh(me.geometry, me.material, items.length);
      items.forEach((p, i) => {
        q.setFromAxisAngle(up, p.rot);
        place.compose(new THREE.Vector3(p.x, p.y ?? CURB, p.z), q, new THREE.Vector3(p.s ?? 1, p.s ?? 1, p.s ?? 1));
        im.setMatrixAt(i, place.clone().multiply(me.matrixWorld));
      });
      im.computeBoundingSphere();
      if (im.boundingSphere && imp) im.boundingSphere.radius += 8;
      im.castShadow = castShadow; im.receiveShadow = true;
      this.group.add(im);
      return im;
    });
    for (const items of chunks.values()) {
      let cx = 0, cz = 0;
      for (const p of items) { cx += p.x; cz += p.z; }
      cx /= items.length; cz /= items.length;
      const r = Math.max(...items.map((p) => Math.hypot(p.x - cx, p.z - cz))) + 4;
      const n = build(near, items, shadow);
      const f = imp ? build([{ geometry: quad!, material: imp, matrixWorld: new THREE.Matrix4() }], items, false) : far ? build(far, items, false) : [];
      f.forEach((o) => (o.visible = false));
      // árvores detalhadas só de perto (impostor além disso); demais props com LOD mais longe
      this.lodChunks.push({ x: cx, z: cz, r, d: imp ? 14 + 22 * this.engine.preset.treeDensity : this.lodNear, near: n, far: f });
    }
  }

  /** Troca perto/longe por bloco conforme a distância da câmera. */
  updateLod(cam: THREE.Vector3) {
    for (const c of this.lodChunks) {
      if (!c.far.length) continue;
      const d = Math.hypot(cam.x - c.x, cam.z - c.z) - c.r;
      const useNear = d < c.d;
      if (c.near[0].visible !== useNear) { for (const o of c.near) o.visible = useNear; for (const o of c.far) o.visible = !useNear; }
    }
  }

  private async buildProps() {
    const density = this.engine.preset.treeDensity;
    this.lodNear = 25 + 35 * density;
    const rnd = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const lamps: { x: number; z: number; rot: number }[] = [];
    const trees: Record<string, { x: number; z: number; rot: number; s?: number }[]> = { tree_ipe: [], tree_gold: [], tree_leafy: [], palm: [] };
    const benches: { x: number; z: number; rot: number }[] = [];
    const nearRoad = (v: number) => [-80, -30, 30, 80].some((c) => Math.abs(v - c) < 8);
    // postes e árvores nas calçadas (lado de dentro das quadras)
    for (const [x0, x1] of CELLS_X) for (const [z0, z1] of CELLS_Z) {
      const off = 1.1;
      const edges: [number, number, number, number, number][] = [
        [x0 + off, z0, x0 + off, z1, Math.PI / 2], [x1 - off, z0, x1 - off, z1, -Math.PI / 2],
        [x0, z0 + off, x1, z0 + off, 0], [x0, z1 - off, x1, z1 - off, Math.PI],
      ];
      for (const [ax, az, bx, bz, rot] of edges) {
        const len = Math.hypot(bx - ax, bz - az);
        for (let s = 6; s < len - 4; s += 16) {
          const x = ax + ((bx - ax) * s) / len, z = az + ((bz - az) * s) / len;
          if (Math.abs(x) > CITY.half - 2 || Math.abs(z) > CITY.half - 2) continue;
          lamps.push({ x, z, rot });
          const tx = ax + ((bx - ax) * (s + 8)) / len, tz = az + ((bz - az) * (s + 8)) / len;
          if (s + 8 < len - 4 && rnd() < density && !LOTS.some((l) => Math.abs(tx - l.x) < l.w / 2 + 1 && Math.abs(tz - l.z) < l.d / 2 + 1)) {
            const k = ['tree_ipe', 'tree_leafy', 'tree_gold', 'tree_leafy'][Math.floor(rnd() * 4)];
            trees[k].push({ x: tx, z: tz, rot: rnd() * 6.28, s: 0.85 + rnd() * 0.3 });
          }
        }
      }
    }
    void nearRoad;
    // praça: bancos em anel, ipês nos cantos, canteiros
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8, r = 8.6;
      benches.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, rot: -a - Math.PI / 2 });
    }
    for (const [x, z] of [[-18, -18], [18, -18], [-18, 18], [18, 18]]) trees.tree_ipe.push({ x, z, rot: rnd() * 6.28, s: 1.05 });
    for (const [x, z] of [[-21, -6], [-21, 6], [21, -6], [21, 6], [-6, -21], [6, -21], [-6, 21], [6, 21]]) trees.palm.push({ x, z, rot: rnd() * 6.28, s: 0.8 });
    // orla: coqueiros no calçadão e na areia
    for (let z = -100; z <= 100; z += 13) {
      trees.palm.push({ x: BOARDWALK.x1 + 1.5, z: z + rnd() * 4, rot: rnd() * 6.28, s: 0.9 + rnd() * 0.25 });
      if (rnd() < 0.5 * density) trees.palm.push({ x: 100 + rnd() * 6, z: z + 6, rot: rnd() * 6.28, s: 0.8 + rnd() * 0.3 });
    }
    for (const [k, list] of Object.entries(trees)) await this.instanced(k, list);
    await this.instanced('lamp', lamps);
    await this.instanced('bench', benches);
    // colisores e assentos
    for (const l of lamps) this.colliders.push({ kind: 'circle', x: l.x, z: l.z, r: 0.25, h: 4 });
    for (const list of Object.values(trees)) for (const t of list) this.colliders.push({ kind: 'circle', x: t.x, z: t.z, r: 0.45, h: 6 });
    for (const b of benches) {
      this.colliders.push({ kind: 'box', x: b.x, z: b.z, hx: 0.95, hz: 0.38, rot: b.rot, h: 0.5 });
      // assento: frente do banco
      const fx = Math.sin(b.rot) * 0.35, fz = Math.cos(b.rot) * 0.35;
      this.seats.push({ x: b.x + fx, z: b.z + fz, rot: b.rot });
      this.interactables.push({ id: `banco-${this.seats.length - 1}`, kind: 'bench', x: b.x + fx * 2, z: b.z + fz * 2, r: 1.4, title: 'Banco da praça', data: this.seats.length - 1 });
    }
    // chafariz e estátua
    const f = await this.assets.model('fountain');
    const fountain = f.scene.clone(true);
    fountain.position.set(0, CURB, 0);
    fountain.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) { me.castShadow = true; me.receiveShadow = true; } });
    this.group.add(fountain);
    this.colliders.push({ kind: 'circle', x: 0, z: 0, r: 3.6, h: 1 });
    const st = await this.assets.model('statue');
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), new THREE.MeshStandardMaterial({ color: 0xd9d2c4, roughness: 0.7 }));
    pedestal.position.set(0, CURB + 0.6, -20); pedestal.castShadow = pedestal.receiveShadow = true;
    const statue = st.scene.clone(true); statue.position.set(0, CURB + 1.2, -20);
    statue.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) me.castShadow = true; });
    this.group.add(pedestal, statue);
    this.colliders.push({ kind: 'box', x: 0, z: -20, hx: 0.9, hz: 0.9, rot: 0, h: 3 });
    // pórtico de boas-vindas (sul da praça), voltado para o chafariz
    this.buildWelcomeArch(0, 21);
    // orla: guarda-sóis e espreguiçadeiras
    const umb: { x: number; z: number; rot: number }[] = [], lou: { x: number; z: number; rot: number }[] = [];
    for (let z = -90; z <= 90; z += 15) { const x = 98 + rnd() * 5; umb.push({ x, z, rot: rnd() * 6.28 }); lou.push({ x: x + 1.2, z: z + 1.6, rot: -Math.PI / 2 }); lou.push({ x: x - 1.2, z: z + 1.6, rot: -Math.PI / 2 }); }
    this.buildUmbrellas(umb);
    await this.instanced('lounger', lou.map((u) => ({ ...u, y: 0.1 })));
    for (const u of umb) this.colliders.push({ kind: 'circle', x: u.x, z: u.z, r: 0.15, h: 2.5 });
    // ponto de ônibus na Av. Beira-Mar e canteiros na praça
    await this.instanced('busstop', [{ x: 72, z: -6, rot: Math.PI }]);
    this.colliders.push({ kind: 'box', x: 72.6, z: -6, hx: 0.4, hz: 2.1, rot: 0, h: 3 });
    await this.instanced('planter', [[-12, -23], [12, -23], [-12, 23], [12, 23]].map(([x, z]) => ({ x, z, rot: 0 })));
    for (const [x, z] of [[-12, -23], [12, -23], [-12, 23], [12, 23]]) this.colliders.push({ kind: 'box', x, z, hx: 1.1, hz: 0.4, rot: 0, h: 0.8 });
  }

  /** Guarda-sóis listrados (procedurais: 1 draw call para o tecido, 1 para os mastros). */
  private buildUmbrellas(list: { x: number; z: number; rot: number }[]) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 8;
    const ctx = c.getContext('2d')!;
    const cols = ['#ff5d73', '#fff4e0', '#2fb7c9', '#fff4e0', '#ffc145', '#fff4e0'];
    for (let i = 0; i < 12; i++) { ctx.fillStyle = cols[i % cols.length]; ctx.fillRect((i * 256) / 12, 0, 256 / 12 + 1, 8); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const canopy = new THREE.ConeGeometry(1.45, 0.55, 24, 1, true).translate(0, 2.45, 0);
    const pole = new THREE.CylinderGeometry(0.035, 0.035, 2.5, 6).translate(0, 1.25, 0);
    const canMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.4, metalness: 0.3 });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const [geo, mat] of [[canopy, canMat], [pole, poleMat]] as const) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((u, i) => { q.setFromAxisAngle(up, u.rot); m.compose(new THREE.Vector3(u.x, 0.02, u.z), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m); });
      im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true;
      this.group.add(im);
    }
  }

  private buildWelcomeArch(x: number, z: number) {
    const stone = new THREE.MeshStandardMaterial({ color: 0xf0e6d6, roughness: 0.6 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8a948, roughness: 0.35, metalness: 0.7 });
    const g = new THREE.Group();
    for (const sx of [-5.2, 5.2]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5.2, 0.8), stone); p.position.set(sx, 2.6, 0); g.add(p);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.25, 1.05), gold); cap.position.set(sx, 5.3, 0); g.add(cap);
      this.colliders.push({ kind: 'box', x: x + sx, z, hx: 0.45, hz: 0.45, rot: 0, h: 5 });
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(11.4, 1.4, 0.5), stone); beam.position.set(0, 5.9, 0); g.add(beam);
    const signTex = makeSignTexture('BEM-VINDO À CIDADE VIVA', 'Centro de Boas-Vindas · Servidor Brasil');
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.35, roughness: 0.5 });
    for (const side of [-1, 1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(10.8, 1.25), signMat);
      sign.position.set(0, 5.9, side * 0.26);
      sign.rotation.y = side < 0 ? Math.PI : 0;
      g.add(sign);
    }
    g.position.set(x, CURB, z);
    g.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) { me.castShadow = true; me.receiveShadow = true; } });
    this.group.add(g);
  }

  // ------------------------------------------------------------------ terrenos
  private buildLots() {
    const signTex = makeSignTexture('À VENDA', 'Terreno livre · fale com a Corretora', '#2bb673');
    const boardMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x7a5434, roughness: 0.8 });
    for (const lot of LOTS) {
      // faixa ao longo do perímetro com distância acumulada (para o tracejado)
      const w = lot.w / 2 - 0.3, d = lot.d / 2 - 0.3, y = CURB + 0.05;
      const pts = [[-w, -d], [w, -d], [w, d], [-w, d], [-w, -d]];
      const pos: number[] = [], uv: number[] = [], dist: number[] = [], idx: number[] = [];
      let acc = 0;
      for (let i = 0; i < pts.length; i++) {
        const [px, pz] = pts[i];
        const [nx, nz] = pts[Math.min(i + 1, pts.length - 1)];
        if (i > 0) acc += Math.hypot(px - pts[i - 1][0], pz - pts[i - 1][1]);
        const cx = Math.sign(px) * 0.25, cz = Math.sign(pz) * 0.25;
        pos.push(lot.x + px - cx, y, lot.z + pz - cz, lot.x + px + cx, y, lot.z + pz + cz);
        uv.push(0, 0, 0, 1); dist.push(acc, acc);
        if (i < pts.length - 1) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
        void nx; void nz;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
      g.setIndex(idx);
      const mat = lotBorderMaterial(new THREE.Color(0x45ff95));
      const border = new THREE.Mesh(g, mat);
      border.renderOrder = 2;
      this.group.add(border);
      this.animated.push({ update: (t) => { mat.uniforms.uTime.value = t; } });
      // placa "À venda"
      const sign = new THREE.Group();
      const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.08), [postMat, postMat, postMat, postMat, boardMat, boardMat]);
      board.position.y = 1.7;
      for (const sx of [-0.9, 0.9]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), postMat); p.position.set(sx, 0.7, 0); sign.add(p); }
      sign.add(board);
      const facing = lot.z < -80 ? 0 : Math.abs(lot.x) > Math.abs(lot.z) ? (lot.x > 0 ? -Math.PI / 2 : Math.PI / 2) : (lot.z > 0 ? Math.PI : 0);
      sign.rotation.y = facing;
      const edgeOff = 1.5;
      sign.position.set(lot.x + Math.sin(facing) * (lot.d / 2 - edgeOff) * 0, CURB, lot.z + (lot.z < 0 ? lot.d / 2 - edgeOff : -(lot.d / 2 - edgeOff)));
      sign.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) me.castShadow = true; });
      this.group.add(sign);
      this.colliders.push({ kind: 'box', x: sign.position.x, z: sign.position.z, hx: 1.1, hz: 0.2, rot: facing, h: 2.3 });
      const label = makeLabel(`${lot.id} · Terreno livre`, { size: 0.75, sub: `${lot.w} × ${lot.d} m · ₵ ${lot.price.toLocaleString('pt-BR')}`, bg: 'rgba(14,50,34,0.85)', accent: '#46ff9a' });
      label.position.set(lot.x, CURB + 3.4, lot.z);
      this.group.add(label);
      this.lotVisuals.set(lot.id, { border, mat, label, lot });
      this.interactables.push({ id: lot.id, kind: 'lot', x: lot.x, z: lot.z, r: Math.max(lot.w, lot.d) / 2, title: `Terreno ${lot.id}`, data: lot });
    }
  }

  /** Atualiza a aparência de um terreno quando muda de dono. */
  setLotState(s: LotState) {
    const v = this.lotVisuals.get(s.id);
    if (!v) return;
    const owned = !!s.owner;
    v.mat.uniforms.uColor.value = new THREE.Color(owned ? 0xffb347 : 0x45ff95);
    const old = v.label;
    const nl = makeLabel(owned ? `${s.id} · de ${s.ownerName}` : `${s.id} · Terreno livre`, {
      size: 0.75, sub: owned ? 'Construção em breve' : `${v.lot.w} × ${v.lot.d} m · ₵ ${v.lot.price.toLocaleString('pt-BR')}`,
      bg: owned ? 'rgba(60,36,10,0.85)' : 'rgba(14,50,34,0.85)', accent: owned ? '#ffb347' : '#46ff9a',
    });
    nl.position.copy(old.position);
    this.group.remove(old);
    (old.material as THREE.SpriteMaterial).map?.dispose();
    this.group.add(nl);
    v.label = nl;
  }

  private buildBounds() {
    const H = CITY.half;
    this.colliders.push({ kind: 'box', x: 0, z: -H - 2, hx: H + 30, hz: 2, rot: 0, h: 99 });
    this.colliders.push({ kind: 'box', x: 0, z: H + 2, hx: H + 30, hz: 2, rot: 0, h: 99 });
    this.colliders.push({ kind: 'box', x: -H - 2, z: 0, hx: 2, hz: H + 30, rot: 0, h: 99 });
    this.colliders.push({ kind: 'box', x: CITY.shoreX + 1, z: 0, hx: 2, hz: H + 30, rot: 0, h: 99 });
  }
}
