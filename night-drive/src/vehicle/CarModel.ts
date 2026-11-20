import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface WheelRig {
  name: string;
  pivot: THREE.Object3D; // fixed to the car at the wheel centre (suspension travel moves it in Y)
  steer: THREE.Object3D; // yaw (front wheels)
  spin: THREE.Object3D; // roll around the axle
  radius: number;
  front: boolean;
  left: boolean;
  rest: THREE.Vector3;
}

export interface CarVisualState {
  speed: number; // signed longitudinal speed (m/s)
  steer: number; // front wheel angle (rad, + = right)
  brake: number; // 0..1
  reverse: boolean;
  lights: boolean;
  pitch: number;
  roll: number;
  wheelSpin: number; // rad/s of the driven wheels (can exceed ground speed when spinning)
  suspension: number[]; // per wheel vertical offset (m) FL, FR, RL, RR
}

export const PAINTS: { name: string; color: number; metal: number; rough: number }[] = [
  { name: 'Preto Meia-Noite', color: 0x050608, metal: 0.55, rough: 0.32 },
  { name: 'Vermelho Neon', color: 0x8a0410, metal: 0.6, rough: 0.28 },
  { name: 'Azul Elétrico', color: 0x0a2a8a, metal: 0.7, rough: 0.3 },
  { name: 'Branco Pérola', color: 0xd8dadf, metal: 0.35, rough: 0.25 },
  { name: 'Amarelo Racing', color: 0xd99a10, metal: 0.55, rough: 0.28 },
  { name: 'Grafite', color: 0x2a2d33, metal: 0.8, rough: 0.35 },
];

/** MeshStandardMaterial driven by per-vertex colour + per-vertex roughness/metalness (`aMat`). */
function vertexPbrMaterial(envIntensity = 1) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, envMapIntensity: envIntensity });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aMat;\nvarying vec2 vMat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMat;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * vMat.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * vMat.y;');
  };
  m.customProgramCacheKey = () => 'vertex-pbr';
  return m;
}

export class CarModel {
  readonly root = new THREE.Group(); // world transform from physics
  readonly body = new THREE.Group(); // pitch/roll
  readonly wheels: WheelRig[] = [];
  readonly paint: THREE.MeshPhysicalMaterial;
  readonly headlights: THREE.SpotLight[] = [];
  readonly tailLight: THREE.PointLight;
  readonly halfSize = new THREE.Vector2(1.0, 2.25);
  readonly isFallback: boolean;
  private readonly drl: THREE.MeshBasicMaterial;
  private readonly lens: THREE.MeshBasicMaterial;
  private readonly tail: THREE.MeshBasicMaterial;
  get tailMaterial() { return this.tail; }
  private readonly tailLens: THREE.MeshPhysicalMaterial;
  private readonly flares: THREE.Sprite[] = [];

  private constructor(scene: THREE.Group | null, info: { wheels: Record<string, { center: number[]; radius: number }> } | null) {
    this.isFallback = !scene;
    this.root.name = 'player-car';
    this.root.add(this.body);
    this.paint = new THREE.MeshPhysicalMaterial({
      color: PAINTS[0].color, metalness: PAINTS[0].metal, roughness: PAINTS[0].rough,
      clearcoat: 1, clearcoatRoughness: 0.035, envMapIntensity: 1.25,
    });
    this.drl = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6.5, 7.5) });
    this.lens = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5.4, 6) });
    this.tail = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.15, 0.08) });
    this.tailLens = new THREE.MeshPhysicalMaterial({ color: 0x3a0306, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85, emissive: new THREE.Color(0.25, 0, 0), clearcoat: 1 });
    const trim = vertexPbrMaterial(1.0);
    const wheelMat = vertexPbrMaterial(0.9);
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x0b0e12, roughness: 0.03, metalness: 0.0, transparent: true, opacity: 0.58, envMapIntensity: 2.0, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1 });
    const clear = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.12, envMapIntensity: 1.5, depthWrite: false });

    if (scene && info) {
      const byName: Record<string, THREE.Material> = {
        paint: this.paint, trim, glass, clear, light_drl: this.drl, light_head: this.lens, light_tail: this.tail, tail_lens: this.tailLens,
      };
      const meshes: THREE.Mesh[] = [];
      scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
      for (const mesh of meshes) {
        const g = mesh.geometry as THREE.BufferGeometry;
        const mat = g.getAttribute('_mat');
        if (mat) { g.setAttribute('aMat', mat); g.deleteAttribute('_mat'); }
        const name = mesh.name.startsWith('wheel_') ? mesh.name : (mesh.parent?.name.startsWith('wheel_') ? mesh.parent.name : mesh.name);
        if (name.startsWith('wheel_')) {
          const w = info.wheels[name];
          const front = name[6] === 'F', left = name[7] === 'L';
          const rig = this.makeWheelRig(name, new THREE.Vector3(...(w.center as [number, number, number])), w.radius, front, left);
          mesh.removeFromParent();
          // keep the dequantization scale/offset; only the wheel centre moves to the pivot
          mesh.position.sub(rig.rest);
          mesh.material = wheelMat;
          mesh.castShadow = false;
          rig.spin.add(mesh);
          continue;
        }
        const key = Object.keys(byName).find((k) => name === k || name.startsWith(k + '_') || mesh.name === k);
        mesh.material = byName[key ?? 'trim'] ?? trim;
        if (key === 'glass' || key === 'clear') mesh.renderOrder = 2;
        mesh.removeFromParent();
        this.body.add(mesh);
      }
    } else {
      this.buildFallback(trim, glass, wheelMat);
    }

    // headlights (two spots) + tail glow
    for (const x of [-0.62, 0.62]) {
      const s = new THREE.SpotLight(0xdde8ff, 0, 90, 0.44, 0.55, 1.25);
      s.position.set(x, 0.66, 2.05);
      s.target.position.set(x * 0.4, 0, 24);
      this.body.add(s, s.target);
      this.headlights.push(s);
    }
    this.tailLight = new THREE.PointLight(0xff1010, 0, 9, 1.6);
    this.tailLight.position.set(0, 0.75, -2.5);
    this.body.add(this.tailLight);

    // lens flares on the headlights (visible from the front / in reflections)
    const flareTex = CarModel.flareTexture();
    for (const x of [-0.7, 0.7]) {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex, color: new THREE.Color(1.6, 1.75, 2.1), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      f.position.set(x, 0.63, 1.82);
      f.scale.setScalar(0.55);
      this.body.add(f);
      this.flares.push(f);
    }
  }

  private makeWheelRig(name: string, center: THREE.Vector3, radius: number, front: boolean, left: boolean): WheelRig {
    const pivot = new THREE.Object3D();
    pivot.position.copy(center);
    const steer = new THREE.Object3D();
    const spin = new THREE.Object3D();
    pivot.add(steer);
    steer.add(spin);
    this.root.add(pivot);
    const rig = { name, pivot, steer, spin, radius, front, left, rest: center.clone() };
    this.wheels.push(rig);
    return rig;
  }

  /** Procedural fallback used only if the GLB cannot be loaded (keeps the game playable). */
  private buildFallback(trim: THREE.Material, glass: THREE.Material, wheelMat: THREE.Material) {
    const shape = new THREE.Shape();
    const p: [number, number][] = [[-2.25, 0.25], [-2.3, 0.75], [-1.9, 0.95], [-0.9, 1.05], [-0.3, 1.2], [0.6, 1.18], [1.3, 0.9], [2.2, 0.72], [2.3, 0.35], [2.1, 0.22]];
    shape.moveTo(p[0][1] * 0, 0);
    shape.moveTo(p[0][0], p[0][1]);
    for (const [x, y] of p.slice(1)) shape.lineTo(x, y);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1.8, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 4, steps: 1 });
    g.translate(0, 0, -0.9);
    g.rotateY(-Math.PI / 2);
    const body = new THREE.Mesh(g, this.paint);
    this.body.add(body);
    const cab = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    cab.scale.set(0.78, 0.38, 1.25);
    cab.position.set(0, 0.95, -0.1);
    this.body.add(cab);
    void trim;
    for (const [n, x, z] of [['wheel_FL', 0.82, 1.3], ['wheel_FR', -0.82, 1.3], ['wheel_RL', 0.84, -1.42], ['wheel_RR', -0.84, -1.42]] as const) {
      const rig = this.makeWheelRig(n, new THREE.Vector3(x, 0.34, z), 0.34, n[6] === 'F', n[7] === 'L');
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.09, 12, 28), wheelMat);
      tyre.rotation.y = Math.PI / 2;
      rig.spin.add(tyre);
    }
  }

  static flareTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.12, 'rgba(220,235,255,0.7)');
    grad.addColorStop(0.4, 'rgba(120,160,255,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  static async load(url: string, infoUrl: string, onProgress?: (p: number) => void): Promise<CarModel> {
    try {
      const loader = new GLTFLoader();
      const fileLoader = new THREE.FileLoader();
      fileLoader.setResponseType('arraybuffer');
      // Hosts that refuse .glb get the same bytes as base64 inside a JSON file ({ "glb": "..." }).
      const loadBytes = url.endsWith('.json')
        ? fetch(url).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then((j: { glb: string }) => {
          const bin = atob(j.glb);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return bytes.buffer;
        })
        : (fileLoader.loadAsync(url, (e) => { if (e.total) onProgress?.(e.loaded / e.total); }) as Promise<ArrayBuffer>);
      const [buffer, info] = await Promise.all([
        loadBytes,
        fetch(infoUrl).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      ]);
      // The meshopt decoder (WebAssembly) is only loaded when the file is actually compressed with it.
      const head = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 65536)));
      if (head.includes('EXT_meshopt_compression')) {
        const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
        loader.setMeshoptDecoder(MeshoptDecoder);
      }
      const gltf = await loader.parseAsync(buffer, url.substring(0, url.lastIndexOf('/') + 1));
      return new CarModel(gltf.scene, info);
    } catch (err) {
      console.warn('[car] GLB failed to load, using procedural fallback', err);
      return new CarModel(null, null);
    }
  }

  setPaint(index: number) {
    const p = PAINTS[(index + PAINTS.length) % PAINTS.length];
    this.paint.color.setHex(p.color);
    this.paint.metalness = p.metal;
    this.paint.roughness = p.rough;
  }

  update(dt: number, s: CarVisualState) {
    this.body.rotation.set(s.pitch, 0, s.roll);
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      if (w.front) {
        // Ackermann: inner wheel turns a bit more
        const inner = (s.steer > 0) !== w.left;
        w.steer.rotation.y = -s.steer * (inner ? 1.08 : 0.92);
      }
      const omega = w.front ? s.speed / w.radius : s.wheelSpin;
      w.spin.rotation.x += omega * dt;
      const idx = (w.front ? 0 : 2) + (w.left ? 0 : 1);
      w.pivot.position.y = w.rest.y + (s.suspension[idx] ?? 0);
    }
    const lights = s.lights ? 1 : 0;
    for (const h of this.headlights) h.intensity = lights * 160;
    this.lens.color.setRGB(1, 1.08, 1.2).multiplyScalar(0.4 + lights * 6);
    for (const f of this.flares) f.visible = s.lights;
    const brake = Math.max(s.brake, 0);
    const tailI = lights * 4 + brake * 11;
    this.tail.color.setRGB(tailI + 0.15, (tailI + 0.15) * 0.035, (tailI + 0.15) * 0.02);
    this.tailLens.emissive.setRGB(0.15 * lights + brake * 0.8, 0, 0);
    this.tailLight.intensity = lights * 0.8 + brake * 4.5 + (s.reverse ? 2 : 0);
    this.tailLight.color.setRGB(1, s.reverse ? 0.9 : 0.06, s.reverse ? 0.85 : 0.04);
  }
}
