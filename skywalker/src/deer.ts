// Cervo: o modelo do BlenderKit não tem textura nem animação, então a pelagem é pintada
// num shader (pela posição de repouso de cada vértice) e o movimento é procedural.
// O mesmo cervo serve de disfarce para o Skywalker: imóvel, cabeça girando além do natural
// e olhos que refletem vermelho na lanterna (os de verdade refletem verde-claro).
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { Assets } from './assets';
import { heightAt } from './map';
import { angleDiff, damp, noise2 } from './noise';
import type { Colliders } from './world';

type Mode = 'graze' | 'alert' | 'flee' | 'still' | 'gone';

interface BoneRig { b: THREE.Bone; rest: THREE.Quaternion; lat: THREE.Vector3; up: THREE.Vector3; fwd: THREE.Vector3 }

let coatInfo: { min: THREE.Vector3; max: THREE.Vector3; len: THREE.Vector3; side: THREE.Vector3; tip: THREE.Vector3 } | null = null;

export class Deer {
  root = new THREE.Group();
  mode: Mode = 'graze';
  yaw = 0;
  speed = 0;
  t = Math.random() * 10;
  private bones: Record<string, BoneRig> = {};
  private eyes: THREE.Sprite[] = [];
  private headYaw = 0; private neckPitch = 0; private gait = 0;
  private eyeLocal: THREE.Vector3[] = [];
  lookAway = 0;
  seenLit = 0;
  fadeOut = 0;

  constructor(A: Assets, public disguised: boolean) {
    const model = SkeletonUtils.clone(A.models.deer.scene) as THREE.Group;
    this.root.add(model);
    model.updateMatrixWorld(true);
    let skinned: THREE.SkinnedMesh | null = null;
    model.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh) { skinned = m; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
    const sm = skinned as unknown as THREE.SkinnedMesh;
    if (!coatInfo) coatInfo = analyse(sm.geometry);
    sm.material = coatMaterial(coatInfo);
    // orientação: alinha o focinho do modelo com +Z do grupo
    const find = (n: string) => { let r: THREE.Bone | null = null; model.traverse((o) => { if ((o as THREE.Bone).isBone && o.name.replace(/[.]/g, '') === n.replace(/[.]/g, '')) r = o as THREE.Bone; }); return r as THREE.Bone | null; };
    const head = find('DEF-spine011') ?? find('DEF-spine010');
    const hips = find('DEF-spine004');
    if (head && hips) {
      const hp = head.getWorldPosition(new THREE.Vector3()), pp = hips.getWorldPosition(new THREE.Vector3());
      model.rotation.y = -Math.atan2(hp.x - pp.x, hp.z - pp.z);
      model.updateMatrixWorld(true);
    }
    const rootQinv = new THREE.Quaternion();
    const setup = (key: string, name: string) => {
      const b = find(name); if (!b) return;
      const wq = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(rootQinv).invert();
      this.bones[key] = { b, rest: b.quaternion.clone(), lat: new THREE.Vector3(1, 0, 0).applyQuaternion(wq), up: new THREE.Vector3(0, 1, 0).applyQuaternion(wq), fwd: new THREE.Vector3(0, 0, 1).applyQuaternion(wq) };
    };
    for (const [k, n] of [['neck1', 'DEF-spine009'], ['neck2', 'DEF-spine010'], ['head', 'DEF-spine011'], ['chest', 'DEF-spine007'], ['tail', 'DEF-spine'],
      ['thighL', 'DEF-thighL'], ['thighR', 'DEF-thighR'], ['shinL', 'DEF-shinL'], ['shinR', 'DEF-shinR'],
      ['fthighL', 'DEF-front_thighL'], ['fthighR', 'DEF-front_thighR'], ['fshinL', 'DEF-front_shinL'], ['fshinR', 'DEF-front_shinR']] as const) setup(k, n);
    // olhos: posição de repouso calculada pela malha (focinho → órbitas), presa ao osso da cabeça
    const hb = this.bones.head?.b;
    if (hb) {
      const ci = coatInfo;
      const k = 2.05 / (ci.max.y - ci.min.y);
      const up = new THREE.Vector3(0, 1, 0);
      for (const s of [-1, 1]) {
        const eb = ci.tip.clone().addScaledVector(ci.len, -0.2 / k).addScaledVector(up, 0.075 / k).addScaledVector(ci.side, (s * 0.062) / k);
        const w = eb.applyMatrix4(sm.matrixWorld);
        this.eyeLocal.push(hb.worldToLocal(w.clone()));
      }
    }
    // brilho dos olhos (tapetum lucidum)
    const tex = eyeTex();
    for (const s of [-1, 1]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: disguised ? 0xff1a10 : 0x9dffcf, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 }));
      sp.scale.setScalar(0.09);
      sp.userData.side = s;
      this.root.add(sp);
      this.eyes.push(sp);
    }
    void hb;
  }

  place(x: number, z: number, yaw: number) {
    this.root.position.set(x, heightAt(x, z), z); this.yaw = yaw; this.root.rotation.y = yaw;
  }

  /** posição dos olhos no mundo (side: -1 esquerdo, 1 direito, 0 meio) */
  eyePos(side: number, out: THREE.Vector3) {
    const h = this.bones.head?.b;
    if (h && this.eyeLocal.length === 2) {
      if (side === 0) return out.copy(this.eyeLocal[0]).add(this.eyeLocal[1]).multiplyScalar(0.5).applyMatrix4(h.matrixWorld);
      return out.copy(this.eyeLocal[side < 0 ? 0 : 1]).applyMatrix4(h.matrixWorld);
    }
    if (!h) return out.copy(this.root.position).setY(this.root.position.y + 1.5);
    h.getWorldPosition(out);
    const q = this.root.quaternion;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q), lat = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    // gira junto com a cabeça
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.headYaw);
    fwd.applyQuaternion(yaw); lat.applyQuaternion(yaw);
    return out.addScaledVector(fwd, 0.16).addScaledVector(lat, side * 0.075).add(new THREE.Vector3(0, 0.05 - this.neckPitch * 0.25, 0));
  }

  update(dt: number, player: THREE.Vector3, lightPos: THREE.Vector3, lightDir: THREE.Vector3, lightOn: number, cols: Colliders) {
    this.t += dt;
    const toP = new THREE.Vector3().subVectors(player, this.root.position);
    const dist = Math.hypot(toP.x, toP.z);
    const angToP = angleDiff(this.yaw, Math.atan2(toP.x, toP.z));
    let wantHeadYaw = 0, wantPitch = 0;
    if (this.mode === 'graze') {
      wantPitch = 0.95 + Math.sin(this.t * 0.7) * 0.05;
      if (Math.sin(this.t * 0.31) > 0.75) wantPitch = 0.1; // levanta a cabeça de vez em quando
      if (dist < 24) this.mode = 'alert';
    } else if (this.mode === 'alert') {
      wantPitch = -0.15; wantHeadYaw = Math.max(-1.1, Math.min(1.1, angToP));
      if (dist < 15 || this.seenLit > 2.5) this.flee(player);
    } else if (this.mode === 'still') {
      // disfarce: cabeça acompanha o jogador além do limite natural, com leve inclinação
      wantPitch = -0.1; wantHeadYaw = Math.max(-2.4, Math.min(2.4, angToP));
    } else if (this.mode === 'flee') {
      this.speed = damp(this.speed, 9.5, 2.5, dt);
      const away = Math.atan2(-toP.x, -toP.z) + Math.sin(this.t * 0.8) * 0.3;
      this.yaw += angleDiff(this.yaw, away) * Math.min(1, dt * 2.2);
      const nx = this.root.position.x + Math.sin(this.yaw) * this.speed * dt, nz = this.root.position.z + Math.cos(this.yaw) * this.speed * dt;
      const p = { x: nx, z: nz }; cols.resolve(p, 0.6);
      this.root.position.set(p.x, heightAt(p.x, p.z), p.z);
      wantPitch = -0.3;
      if (dist > 48) this.mode = 'gone';
    }
    // luz da lanterna nos olhos
    const e = new THREE.Vector3();
    let lit = 0;
    if (lightOn > 0.05) {
      this.eyePos(0, e);
      const v = e.clone().sub(lightPos); const d = v.length();
      const c = v.normalize().dot(lightDir);
      const facing = Math.cos(angleDiff(this.yaw + this.headYaw, Math.atan2(player.x - e.x, player.z - e.z)));
      lit = THREE.MathUtils.smoothstep(c, 0.9, 0.985) * Math.max(0, facing) * lightOn * (d < 45 ? 1 : 0);
    }
    this.seenLit = lit > 0.3 ? this.seenLit + dt : Math.max(0, this.seenLit - dt * 0.5);
    for (const s of this.eyes) {
      this.eyePos(s.userData.side, s.position).sub(this.root.position);
      s.position.applyQuaternion(this.root.quaternion.clone().invert());
      (s.material as THREE.SpriteMaterial).opacity = Math.min(1, lit * 1.4) * (1 - this.fadeOut);
      s.scale.setScalar(0.09 + lit * 0.09 + (this.disguised ? 0.03 : 0));
    }
    this.headYaw = damp(this.headYaw, wantHeadYaw, this.mode === 'still' ? 1.2 : 3, dt);
    this.neckPitch = damp(this.neckPitch, wantPitch, 2.5, dt);
    this.root.rotation.y = this.yaw;
    this.pose(dt);
  }

  flee(from: THREE.Vector3) {
    if (this.mode === 'flee' || this.disguised) return;
    this.mode = 'flee';
    this.yaw = Math.atan2(this.root.position.x - from.x, this.root.position.z - from.z);
  }

  private rot(k: string, axis: 'lat' | 'up' | 'fwd', a: number, extra?: THREE.Quaternion) {
    const r = this.bones[k]; if (!r) return;
    const q = new THREE.Quaternion().setFromAxisAngle(r[axis], a);
    r.b.quaternion.copy(r.rest).multiply(q);
    if (extra) r.b.quaternion.multiply(extra);
  }

  private pose(dt: number) {
    const running = this.mode === 'flee';
    this.gait += dt * (running ? 10.5 : 0);
    const g = this.gait;
    const amp = running ? 1 : 0;
    // pernas: galope (dianteiras e traseiras defasadas)
    this.rot('thighL', 'lat', amp * Math.sin(g) * 0.75);
    this.rot('thighR', 'lat', amp * Math.sin(g + 0.4) * 0.75);
    this.rot('shinL', 'lat', amp * (Math.sin(g - 1.2) * 0.6 - 0.25));
    this.rot('shinR', 'lat', amp * (Math.sin(g - 0.8) * 0.6 - 0.25));
    this.rot('fthighL', 'lat', amp * Math.sin(g + Math.PI) * 0.8);
    this.rot('fthighR', 'lat', amp * Math.sin(g + Math.PI + 0.4) * 0.8);
    this.rot('fshinL', 'lat', amp * (Math.sin(g + Math.PI + 1.3) * 0.7 + 0.35));
    this.rot('fshinR', 'lat', amp * (Math.sin(g + Math.PI + 1.7) * 0.7 + 0.35));
    if (running) this.root.position.y += Math.abs(Math.sin(g)) * 0.18;
    this.rot('chest', 'lat', running ? Math.sin(g) * 0.08 : 0);
    // pescoço e cabeça
    const chew = this.mode === 'graze' && this.neckPitch > 0.6 ? Math.sin(this.t * 6) * 0.04 : 0;
    const tilt = this.mode === 'still' ? Math.sin(this.t * 0.4) * 0.25 + 0.2 : 0;
    this.rot('neck1', 'lat', this.neckPitch * 0.55, new THREE.Quaternion().setFromAxisAngle(this.bones.neck1?.up ?? new THREE.Vector3(0, 1, 0), this.headYaw * 0.45));
    this.rot('neck2', 'lat', this.neckPitch * 0.35, new THREE.Quaternion().setFromAxisAngle(this.bones.neck2?.up ?? new THREE.Vector3(0, 1, 0), this.headYaw * 0.35));
    this.rot('head', 'lat', this.neckPitch * 0.2 + chew, new THREE.Quaternion().setFromAxisAngle(this.bones.head?.fwd ?? new THREE.Vector3(0, 0, 1), tilt));
    // cauda: abana de vez em quando (o disfarce não mexe nada)
    const flick = this.mode !== 'still' && noise2(this.t * 0.9, 5) > 0.45 ? Math.sin(this.t * 25) * 0.4 : 0;
    this.rot('tail', 'lat', running ? -0.8 : flick);
  }

  dispose() { this.root.removeFromParent(); }
}

function analyse(g: THREE.BufferGeometry) {
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const size = bb.getSize(new THREE.Vector3());
  const pos = g.attributes.position;
  const lenAxis = size.x > size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  // o lado da cabeça é onde estão os vértices mais altos (galhada)
  const c = bb.getCenter(new THREE.Vector3());
  let sum = 0, n = 0;
  const top = bb.max.y - size.y * 0.08;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > top) { sum += (lenAxis.x ? pos.getX(i) - c.x : pos.getZ(i) - c.z); n++; }
  if (n && sum < 0) lenAxis.negate();
  const side = lenAxis.x ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  // ponta do focinho: vértice mais à frente na faixa de altura da cabeça
  const tip = new THREE.Vector3(); let best = -Infinity;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const h = (v.y - bb.min.y) / size.y;
    if (h < 0.5 || h > 0.8) continue;
    const l = v.clone().sub(c).dot(lenAxis);
    if (l > best) { best = l; tip.copy(v); }
  }
  tip.addScaledVector(side, -tip.clone().sub(c).dot(side));
  return { min: bb.min.clone(), max: bb.max.clone(), len: lenAxis, side, tip };
}

function coatMaterial(ci: NonNullable<typeof coatInfo>) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.bbMin = { value: ci.min }; sh.uniforms.bbMax = { value: ci.max };
    sh.uniforms.lenAxis = { value: ci.len }; sh.uniforms.sideAxis = { value: ci.side };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vRest; uniform vec3 bbMin; uniform vec3 bbMax; uniform vec3 lenAxis; uniform vec3 sideAxis;
      float hsh(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
      float vn(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hsh(i),hsh(i+vec3(1,0,0)),f.x),mix(hsh(i+vec3(0,1,0)),hsh(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hsh(i+vec3(0,0,1)),hsh(i+vec3(1,0,1)),f.x),mix(hsh(i+vec3(0,1,1)),hsh(i+vec3(1,1,1)),f.x),f.y),f.z); }`)
      .replace('#include <map_fragment>', `
        vec3 c = (bbMin + bbMax) * 0.5; vec3 sz = bbMax - bbMin;
        float h = (vRest.y - bbMin.y) / sz.y;
        float halfLen = 0.5 * dot(sz, abs(lenAxis));
        float l = dot(vRest - c, lenAxis) / halfLen;
        float sd = abs(dot(vRest - c, sideAxis)) / (0.5 * dot(sz, abs(sideAxis)));
        float fur = vn(vRest * 38.0) * 0.5 + vn(vRest * 9.0) * 0.5;
        vec3 coat = vec3(0.19, 0.105, 0.05) * (0.8 + fur * 0.4);
        coat *= mix(1.0, 0.7, smoothstep(0.56, 0.66, h) * (1.0 - smoothstep(0.55, 0.8, l)));       // dorso escuro
        float belly = smoothstep(0.52, 0.44, h) * smoothstep(0.30, 0.40, h) * (1.0 - smoothstep(0.55, 0.9, sd));
        coat = mix(coat, vec3(0.36, 0.3, 0.23) * (0.85 + fur * 0.3), belly * 0.8);              // barriga clara
        coat = mix(coat, vec3(0.12, 0.08, 0.05), smoothstep(0.6, 0.78, l) * smoothstep(0.48, 0.58, h) * 0.7); // crina do pescoço
        float rump = smoothstep(-0.78, -0.92, l) * smoothstep(0.46, 0.52, h) * smoothstep(0.68, 0.6, h);
        coat = mix(coat, vec3(0.55, 0.5, 0.42), rump);                                             // espelho claro na anca
        coat = mix(coat, vec3(0.1, 0.075, 0.055) * (0.8 + fur * 0.3), smoothstep(0.36, 0.22, h));   // pernas
        coat = mix(coat, vec3(0.04, 0.035, 0.03), smoothstep(0.045, 0.02, h));                     // cascos
        coat = mix(coat, vec3(0.05, 0.045, 0.04), smoothstep(0.93, 0.985, l) * smoothstep(0.62, 0.7, h)); // focinho
        float antler = smoothstep(0.80, 0.83, h);
        coat = mix(coat, mix(vec3(0.2, 0.16, 0.11), vec3(0.6, 0.55, 0.46), smoothstep(0.85, 1.0, h)) * (0.85 + fur * 0.25), antler);
        diffuseColor.rgb *= coat;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.9, 0.55, antler);');
  };
  return m;
}

function eyeTex() {
  const S = 32, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.8)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}
