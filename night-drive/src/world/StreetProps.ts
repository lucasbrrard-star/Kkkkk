import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../core/math';
import { CURB_HEIGHT, type CityLayout } from './CityLayout';
import { LAMP_ARM, LAMP_COOL, LAMP_WARM, lampLightPos } from './Lightmap';
import { LAYER_NO_REFLECT } from '../render/PlanarReflection';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function inst(geo: THREE.BufferGeometry, mat: THREE.Material, items: { x: number; y: number; z: number; rot?: number; s?: number | THREE.Vector3 }[]) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  items.forEach((it, i) => {
    tmpQ.setFromAxisAngle(UP, it.rot ?? 0);
    if (it.s instanceof THREE.Vector3) tmpS.copy(it.s); else tmpS.setScalar(it.s ?? 1);
    mesh.setMatrixAt(i, tmpM.compose(tmpP.set(it.x, it.y, it.z), tmpQ, tmpS));
  });
  mesh.count = items.length;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Camera-facing additive glow sprites (bulb halos scattered by rain). */
export function createGlowMaterial() {
  return new THREE.ShaderMaterial({
    name: 'Glow',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: false,
    uniforms: { uIntensity: { value: 1 } },
    vertexShader: /* glsl */ `
      // instanceMatrix / instanceColor are declared by three.js (USE_INSTANCING[_COLOR])
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        vUv = uv * 2.0 - 1.0;
        vColor = instanceColor;
        vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float scale = length(instanceMatrix[0].xyz);
        center.xy += position.xy * scale;
        gl_Position = projectionMatrix * center;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        float r = length(vUv);
        float a = exp(-r * r * 5.0) * 0.9 + exp(-r * 14.0) * 1.6;
        a *= smoothstep(1.0, 0.7, r);
        gl_FragColor = vec4(vColor * a * uIntensity, 1.0);
      }`,
  });
}

/** Additive cone of light below street lamps (fake volumetrics, stronger with rain). */
function createConeMaterial() {
  return new THREE.ShaderMaterial({
    name: 'LightCone',
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uIntensity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying float vH;
      varying vec3 vColor;
      varying float vFacing;
      varying vec3 vWorld;
      void main() {
        vH = uv.y;
        vColor = instanceColor;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vec3 v = normalize(cameraPosition - wp.xyz);
        vFacing = abs(dot(n, v));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      varying float vH;
      varying vec3 vColor;
      varying float vFacing;
      varying vec3 vWorld;
      void main() {
        float fall = pow(vH, 1.6);
        float soft = pow(vFacing, 1.8);
        float n = 0.85 + 0.15 * sin(vWorld.y * 3.0 + uTime * 6.0 + vWorld.x);
        float dist = length(cameraPosition - vWorld);
        float near = smoothstep(1.0, 6.0, dist);
        gl_FragColor = vec4(vColor * fall * soft * n * near * 0.05 * uIntensity, 1.0);
      }`,
  });
}

export type SignalColor = 'green' | 'yellow' | 'red';

/** Fixed-time signal plan per intersection, phase-shifted so the city does not blink in sync. */
export class TrafficSignals {
  static readonly G = 11;
  static readonly Y = 3;
  static readonly R = 1.5;
  static readonly CYCLE = 2 * (TrafficSignals.G + TrafficSignals.Y + TrafficSignals.R);
  time = 0;
  state(ix: number, iz: number, axis: 'ns' | 'ew'): SignalColor {
    const { G, Y, R, CYCLE } = TrafficSignals;
    let t = (this.time + ix * 6.3 + iz * 9.1) % CYCLE;
    if (axis === 'ew') t = (t + G + Y + R) % CYCLE;
    if (t < G) return 'green';
    if (t < G + Y) return 'yellow';
    return 'red';
  }
}

export class StreetProps {
  readonly group = new THREE.Group();
  readonly signals = new TrafficSignals();
  readonly lampLights: { pos: THREE.Vector3; color: THREE.Color }[] = [];
  private readonly signalLamps: THREE.InstancedMesh;
  private readonly signalGlows: THREE.InstancedMesh;
  private readonly glowMat: THREE.ShaderMaterial;
  private readonly coneMat: THREE.ShaderMaterial;
  private readonly city: CityLayout;
  private lastSignalKey = '';

  constructor(city: CityLayout) {
    this.city = city;
    const metal = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.45, metalness: 0.8 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.6 });

    // ---------------- street lamps (H = 8 m reference, arm along +Z)
    const H = 8;
    const pole = new THREE.CylinderGeometry(0.075, 0.13, H, 10);
    pole.translate(0, H / 2, 0);
    const base = new THREE.CylinderGeometry(0.2, 0.24, 0.6, 10);
    base.translate(0, 0.3, 0);
    const arm = new THREE.BoxGeometry(0.07, 0.07, LAMP_ARM);
    arm.rotateX(-0.06);
    arm.translate(0, H - 0.18, LAMP_ARM / 2);
    const head = new THREE.BoxGeometry(0.42, 0.14, 0.95);
    head.translate(0, H - 0.3, LAMP_ARM - 0.05);
    const lampGeo = mergeGeometries([pole, base, arm, head])!;
    const lampItems = city.lamps.map((l) => ({ x: l.x, y: CURB_HEIGHT, z: l.z, rot: l.rot, s: l.height / H }));
    this.group.add(inst(lampGeo, metal, lampItems));
    const bulbGeo = new THREE.PlaneGeometry(0.34, 0.8);
    bulbGeo.rotateX(Math.PI / 2);
    bulbGeo.translate(0, H - 0.38, LAMP_ARM - 0.05);
    const bulbs = inst(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), lampItems);
    const glows: { x: number; y: number; z: number; s: number }[] = [];
    const cones: { x: number; y: number; z: number; s: THREE.Vector3 }[] = [];
    const v = new THREE.Vector3();
    city.lamps.forEach((l, i) => {
      const c = (l.warm ? LAMP_WARM : LAMP_COOL).clone();
      bulbs.setColorAt(i, c.clone().multiplyScalar(14));
      lampLightPos(l, v);
      this.lampLights.push({ pos: v.clone(), color: c });
      glows.push({ x: v.x, y: v.y - 0.1, z: v.z, s: 1.35 * (l.height / H) });
      cones.push({ x: v.x, y: v.y - 0.1, z: v.z, s: new THREE.Vector3(1, (l.height - 0.5) / 7.5, 1) });
    });
    this.group.add(bulbs);

    this.glowMat = createGlowMaterial();
    const glowGeo = new THREE.PlaneGeometry(2, 2);
    const glowMesh = inst(glowGeo, this.glowMat, glows);
    city.lamps.forEach((l, i) => glowMesh.setColorAt(i, (l.warm ? LAMP_WARM : LAMP_COOL).clone().multiplyScalar(0.9)));
    glowMesh.frustumCulled = false;
    glowMesh.renderOrder = 10;
    this.group.add(glowMesh);

    this.coneMat = createConeMaterial();
    const coneGeo = new THREE.CylinderGeometry(0.22, 3.3, 7.5, 20, 1, true);
    coneGeo.translate(0, -3.75, 0);
    const coneMesh = inst(coneGeo, this.coneMat, cones);
    city.lamps.forEach((l, i) => coneMesh.setColorAt(i, l.warm ? LAMP_WARM : LAMP_COOL));
    coneMesh.layers.set(LAYER_NO_REFLECT);
    coneMesh.renderOrder = 9;
    this.group.add(coneMesh);

    // ---------------- traffic lights: pole + housing facing local -Z; 3 lamps per signal
    const tlPole = new THREE.CylinderGeometry(0.09, 0.11, 4.6, 8);
    tlPole.translate(0, 2.3, 0);
    const tlBox = new THREE.BoxGeometry(0.38, 1.12, 0.32);
    tlBox.translate(0, 4.35, -0.12);
    const visors: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 3; k++) {
      const vz = new THREE.BoxGeometry(0.3, 0.03, 0.22);
      vz.translate(0, 4.72 - k * 0.34, -0.36);
      visors.push(vz);
    }
    const tlGeo = mergeGeometries([tlPole, tlBox, ...visors])!;
    this.group.add(inst(tlGeo, darkMetal, city.trafficLights.map((t) => ({ x: t.x, y: CURB_HEIGHT, z: t.z, rot: t.rot }))));
    const lampDisc = new THREE.CircleGeometry(0.115, 16);
    lampDisc.rotateY(Math.PI); // face -Z
    const sl: { x: number; y: number; z: number; rot: number }[] = [];
    const glowItems: { x: number; y: number; z: number; s: number }[] = [];
    for (const t of city.trafficLights) {
      for (let k = 0; k < 3; k++) {
        const fx = -Math.sin(t.rot) * 0.29, fz = -Math.cos(t.rot) * 0.29;
        sl.push({ x: t.x + fx, y: CURB_HEIGHT + 4.69 - k * 0.34, z: t.z + fz, rot: t.rot });
      }
      glowItems.push({ x: t.x, y: CURB_HEIGHT + 4.4, z: t.z, s: 0.9 });
    }
    this.signalLamps = inst(lampDisc, new THREE.MeshBasicMaterial({ color: 0xffffff }), sl);
    this.signalLamps.setColorAt(0, new THREE.Color());
    this.group.add(this.signalLamps);
    this.signalGlows = inst(glowGeo, createGlowMaterial(), glowItems);
    this.signalGlows.setColorAt(0, new THREE.Color());
    this.signalGlows.frustumCulled = false;
    this.signalGlows.renderOrder = 10;
    this.group.add(this.signalGlows);

    // ---------------- benches, bins, hydrants
    const seat = new THREE.BoxGeometry(1.8, 0.06, 0.45); seat.translate(0, 0.46, 0);
    const back = new THREE.BoxGeometry(1.8, 0.4, 0.05); back.translate(0, 0.75, 0.2);
    const legs: THREE.BufferGeometry[] = [];
    for (const x of [-0.8, 0.8]) { const l = new THREE.BoxGeometry(0.06, 0.46, 0.42); l.translate(x, 0.23, 0); legs.push(l); }
    const benchGeo = mergeGeometries([seat, back, ...legs])!;
    const binGeo = new THREE.CylinderGeometry(0.3, 0.27, 0.95, 12); binGeo.translate(0, 0.475, 0);
    const hyd = new THREE.CylinderGeometry(0.13, 0.15, 0.6, 10); hyd.translate(0, 0.3, 0);
    const hydCap = new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); hydCap.translate(0, 0.6, 0);
    const hydSide = new THREE.CylinderGeometry(0.05, 0.05, 0.42, 8); hydSide.rotateZ(Math.PI / 2); hydSide.translate(0, 0.42, 0);
    const hydGeo = mergeGeometries([hyd, hydCap, hydSide])!;
    const byKind = (k: string) => city.props.filter((p) => p.kind === k).map((p) => ({ x: p.x, y: CURB_HEIGHT, z: p.z, rot: p.rot }));
    this.group.add(inst(benchGeo, new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.6 }), byKind('bench')));
    this.group.add(inst(binGeo, new THREE.MeshStandardMaterial({ color: 0x1d2a22, roughness: 0.5, metalness: 0.4 }), byKind('bin')));
    this.group.add(inst(hydGeo, new THREE.MeshStandardMaterial({ color: 0x8a1410, roughness: 0.45, metalness: 0.2 }), byKind('hydrant')));

    // ---------------- shop awnings
    const r = rng(77);
    const awnings: { x: number; y: number; z: number; rot: number; s: THREE.Vector3 }[] = [];
    const awnColors: THREE.Color[] = [];
    const palette = [0x7a1022, 0x0f3d5c, 0x1d4d2a, 0x5a1a5e, 0x6b4a10, 0x202020];
    for (const b of city.buildings) {
      if (!b.shop || b.height > 40 || !r.chance(0.6)) continue;
      const w = (b.face === 'n' || b.face === 's' ? b.maxX - b.minX : b.maxZ - b.minZ) - 1.2;
      if (w < 3) continue;
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      const rot = b.face === 'n' ? 0 : b.face === 's' ? Math.PI : b.face === 'e' ? Math.PI / 2 : -Math.PI / 2;
      const off = 0.9;
      const x = b.face === 'e' ? b.maxX + off : b.face === 'w' ? b.minX - off : cx;
      const z = b.face === 'n' ? b.maxZ + off : b.face === 's' ? b.minZ - off : cz;
      awnings.push({ x, y: CURB_HEIGHT + 3.95, z, rot, s: new THREE.Vector3(w, 1, 1) });
      awnColors.push(new THREE.Color(r.pick(palette)));
    }
    const awnGeo = new THREE.BoxGeometry(1, 0.06, 1.8);
    awnGeo.rotateX(0.32);
    const awnMesh = inst(awnGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), awnings);
    awnColors.forEach((c, i) => awnMesh.setColorAt(i, c));
    this.group.add(awnMesh);

    // ---------------- gas station canopy
    const gas = city.blocks.find((b) => b.kind === 'gas');
    if (gas) {
      const cx = gas.minX + 4.5 + 24, cz = gas.minZ + 4.5 + 30;
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(21, 0.9, 17), new THREE.MeshStandardMaterial({ color: 0xe8e8ec, roughness: 0.4 }));
      canopy.position.set(cx, CURB_HEIGHT + 5.6, cz);
      this.group.add(canopy);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(21.1, 0.3, 17.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.5, 3.2) }));
      stripe.position.set(cx, CURB_HEIGHT + 5.75, cz);
      this.group.add(stripe);
      const panels = new THREE.Mesh(new THREE.PlaneGeometry(18, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 9.5, 10) }));
      panels.rotation.x = Math.PI / 2;
      panels.position.set(cx, CURB_HEIGHT + 5.14, cz);
      this.group.add(panels);
      const pillars = inst(new THREE.CylinderGeometry(0.3, 0.3, 5.2, 12).translate(0, 2.6, 0), metal,
        [[-8, -6], [8, -6], [-8, 6], [8, 6]].map(([dx, dz]) => ({ x: cx + dx, y: CURB_HEIGHT, z: cz + dz })));
      this.group.add(pillars);
      const pumpGeo = new THREE.BoxGeometry(1.0, 1.8, 0.6).translate(0, 0.9, 0);
      const pumps = inst(pumpGeo, new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.35, metalness: 0.3, emissive: new THREE.Color(0.05, 0.25, 0.3) }),
        [[-3, -2.4], [3, -2.4], [-3, 2.4], [3, 2.4]].map(([dx, dz]) => ({ x: cx + dx, y: CURB_HEIGHT, z: cz + dz, rot: Math.PI / 2 })));
      this.group.add(pumps);
      for (const [dx, dz] of [[0, -8], [0, 8]]) this.lampLights.push({ pos: new THREE.Vector3(cx + dx, 5, cz + dz), color: new THREE.Color(0.9, 0.95, 1).multiplyScalar(1.6) });
    }
  }

  update(t: number, dt: number) {
    this.coneMat.uniforms.uTime.value = t;
    this.signals.time += dt;
    // recolor signal lamps when any state changes
    let key = '';
    const states = this.city.trafficLights.map((s) => this.signals.state(s.ix, s.iz, s.axis));
    for (const s of states) key += s[0];
    if (key === this.lastSignalKey) return;
    this.lastSignalKey = key;
    const on = { red: new THREE.Color(9, 0.25, 0.12), yellow: new THREE.Color(9, 4.5, 0.2), green: new THREE.Color(0.3, 8, 3.2) };
    const off = [new THREE.Color(0.08, 0.005, 0.005), new THREE.Color(0.08, 0.05, 0.005), new THREE.Color(0.005, 0.06, 0.03)];
    states.forEach((s, i) => {
      const idx = s === 'red' ? 0 : s === 'yellow' ? 1 : 2;
      for (let k = 0; k < 3; k++) this.signalLamps.setColorAt(i * 3 + k, k === idx ? on[s] : off[k]);
      const tl = this.city.trafficLights[i];
      const fx = -Math.sin(tl.rot) * 0.45, fz = -Math.cos(tl.rot) * 0.45;
      this.signalGlows.setMatrixAt(i, tmpM.compose(tmpP.set(tl.x + fx, CURB_HEIGHT + 4.69 - idx * 0.34, tl.z + fz), tmpQ.identity(), tmpS.setScalar(0.85)));
      this.signalGlows.setColorAt(i, on[s].clone().multiplyScalar(0.12));
    });
    this.signalLamps.instanceColor!.needsUpdate = true;
    this.signalGlows.instanceColor!.needsUpdate = true;
    this.signalGlows.instanceMatrix.needsUpdate = true;
  }

  setVolumetrics(intensity: number) {
    this.coneMat.uniforms.uIntensity.value = intensity;
    this.glowMat.uniforms.uIntensity.value = 0.6 + intensity * 0.4;
  }
}
