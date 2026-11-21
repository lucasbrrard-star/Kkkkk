// O SKYWALKER: criatura alta com crânio de cervo e galhadas enormes.
// Estados: escondido, observando na névoa, passando correndo, perseguindo, atacando,
// recuando, atordoado (tiro), chefe final e morto.
import * as THREE from 'three';
import type { Assets } from './assets';
import type { Colliders } from './world';
import { heightAt } from './map';
import { angleDiff, damp } from './noise';

export type SkyState = 'hidden' | 'watch' | 'runby' | 'chase' | 'attack' | 'retreat' | 'stagger' | 'rise' | 'dead';

export class Skywalker {
  root = new THREE.Group();
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction> = {};
  current: THREE.AnimationAction | null = null;
  state: SkyState = 'hidden';
  stateT = 0;
  yaw = 0;
  speed = 0;
  boss = false;
  health = 8;
  hitsThisRun = 0;
  attackDone = false;
  runTarget = new THREE.Vector3();
  litTime = 0;
  private eyes: THREE.Sprite[] = [];
  private bHead!: THREE.Bone;
  private bHips!: THREE.Bone;
  private bEyes!: THREE.Bone;
  onAttackHit: ((dmg: number) => void) | null = null;
  tmp = new THREE.Vector3();

  constructor(A: Assets) {
    const g = A.models.skywalker;
    this.model = g.scene;
    this.root.add(this.model);
    this.model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) {
        m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mt of mats as THREE.MeshStandardMaterial[]) {
          mt.envMapIntensity = 0;
          if (/skull/i.test(mt.name)) { mt.color.setRGB(0.6, 0.56, 0.48); mt.roughness = 0.72; }
          else if (/antler/i.test(mt.name)) { mt.color.setRGB(0.7, 0.66, 0.62); mt.roughness = 0.75; }
          else { mt.roughness = Math.max(0.6, mt.roughness); mt.color.setRGB(0.46, 0.42, 0.42); }
        }
      }
      const b = o as THREE.Bone;
      if (b.isBone) {
        if (b.name === 'head') this.bHead = b;
        if (b.name === 'hips') this.bHips = b;
        if (b.name === 'eyes') this.bEyes = b;
      }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of g.animations) {
      const a = this.mixer.clipAction(clip);
      if (/attack|hit|die/.test(clip.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[clip.name] = a;
    }
    // olhos: brasas vermelhas no fundo das órbitas
    const tex = eyeTex();
    for (const s of [-1, 1]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xff2a14, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.9 }));
      sp.scale.setScalar(0.07); sp.userData.side = s;
      this.root.add(sp); this.eyes.push(sp);
    }
    this.root.visible = false;
  }

  play(name: string, fade = 0.25, timeScale = 1) {
    const a = this.actions[name];
    if (!a || a === this.current) { if (a) a.timeScale = timeScale; return; }
    a.reset(); a.timeScale = timeScale; a.setEffectiveWeight(1); a.play();
    if (this.current) this.current.crossFadeTo(a, fade, false);
    this.current = a;
  }

  get pos() { return this.root.position; }

  set(state: SkyState) { this.state = state; this.stateT = 0; this.attackDone = false; }

  appear(x: number, z: number, yaw: number, state: SkyState) {
    this.root.visible = true;
    this.root.position.set(x, heightAt(x, z), z);
    this.yaw = yaw; this.root.rotation.y = yaw;
    this.hitsThisRun = 0; this.litTime = 0;
    this.set(state);
    this.current?.stop(); this.current = null;
    this.play(state === 'watch' ? 'idle' : state === 'rise' ? 'hit' : 'run', 0);
    this.mixer.update(0);
  }

  hide() { this.root.visible = false; this.set('hidden'); this.speed = 0; }

  /** centro do peito (para mira e luz) */
  chest(out = new THREE.Vector3()) {
    if (!this.bHips) return out.copy(this.pos).setY(this.pos.y + 1.5);
    this.bHips.getWorldPosition(out); out.y += 0.45; return out;
  }
  headPos(out = new THREE.Vector3()) { return this.bHead ? this.bHead.getWorldPosition(out) : out.copy(this.pos).setY(this.pos.y + 2.4); }

  /** teste de acerto: raio contra cápsula quadril→cabeça */
  rayHit(o: THREE.Vector3, d: THREE.Vector3, maxDist: number) {
    if (!this.root.visible || this.state === 'dead') return -1;
    const a = this.chest(new THREE.Vector3()).setY(this.pos.y + 0.6), b = this.headPos(new THREE.Vector3());
    // distância entre o raio e o segmento
    const u = d.clone().normalize(), v = b.clone().sub(a), w0 = o.clone().sub(a);
    const A = u.dot(u), B = u.dot(v), C = v.dot(v), D = u.dot(w0), E = v.dot(w0);
    const den = A * C - B * B;
    let sc = den > 1e-6 ? (B * E - C * D) / den : 0, tc = den > 1e-6 ? (A * E - B * D) / den : 0;
    tc = Math.max(0, Math.min(1, tc));
    sc = Math.max(0, (B * tc - D) / A);
    const p1 = o.clone().addScaledVector(u, sc), p2 = a.clone().addScaledVector(v, tc);
    const dist = p1.distanceTo(p2);
    // ajuda na mira pelo celular: tolerância cresce um pouco com a distância
    const tol = 0.5 + sc * 0.03;
    return dist < tol && sc < maxDist ? sc : -1;
  }

  update(dt: number, player: THREE.Vector3, cols: Colliders, lit: boolean) {
    if (!this.root.visible) return;
    this.stateT += dt;
    const to = new THREE.Vector3().subVectors(player, this.pos);
    const dist = Math.hypot(to.x, to.z);
    const face = Math.atan2(to.x, to.z);
    this.litTime = lit ? this.litTime + dt : Math.max(0, this.litTime - dt);
    let want = 0, turn = 6;
    switch (this.state) {
      case 'watch':
        this.play('idle', 0.4);
        this.yaw += angleDiff(this.yaw, face) * Math.min(1, dt * 1.5);
        break;
      case 'rise':
        this.play('hit', 0.1, 0.8);
        this.yaw += angleDiff(this.yaw, face) * Math.min(1, dt * 4);
        if (this.stateT > 0.9) this.set('chase');
        break;
      case 'runby': {
        this.play('run', 0.2, 1.25);
        const d = new THREE.Vector3().subVectors(this.runTarget, this.pos);
        this.yaw += angleDiff(this.yaw, Math.atan2(d.x, d.z)) * Math.min(1, dt * 5);
        want = 7.5;
        if (Math.hypot(d.x, d.z) < 2 || this.stateT > 8) this.hide();
        break;
      }
      case 'chase': {
        this.play('run', 0.2, 1.3);
        want = (this.boss ? 6.4 : 6.0) * (lit && dist < 16 ? 0.62 : 1);
        this.yaw = this.steer(face, cols, dt);
        turn = 0;
        if (dist < 2.15) { this.set('attack'); this.play(Math.random() < 0.5 ? 'attack_l' : 'attack_r', 0.12, 1.15); }
        if (!this.boss && this.stateT > 22) this.set('retreat');
        break;
      }
      case 'attack': {
        want = dist > 1.4 ? 1.5 : 0;
        this.yaw += angleDiff(this.yaw, face) * Math.min(1, dt * 8);
        const dur = (this.current?.getClip().duration ?? 0.8) / 1.15;
        if (!this.attackDone && this.stateT > dur * 0.45) {
          this.attackDone = true;
          const facing = Math.cos(angleDiff(this.yaw, face));
          if (dist < 3.0 && facing > 0.3) this.onAttackHit?.(this.boss ? 30 : 34);
        }
        if (this.stateT > dur) this.set(this.boss ? 'chase' : 'retreat');
        break;
      }
      case 'stagger':
        this.play('hit', 0.08, 1.2);
        want = -0.8;
        if (this.stateT > 0.6) this.set(this.boss || this.hitsThisRun < 2 ? 'chase' : 'retreat');
        break;
      case 'retreat': {
        this.play('run', 0.25, 1.35);
        want = 7.5;
        const away = face + Math.PI + Math.sin(this.stateT) * 0.4;
        this.yaw = this.steer(away, cols, dt);
        turn = 0;
        if (this.stateT > 3.2 && dist > 22) this.hide();
        if (this.stateT > 7) this.hide();
        break;
      }
      case 'dead':
        this.play('die', 0.15);
        want = 0;
        break;
    }
    this.speed = damp(this.speed, want, 5, dt);
    if (turn) this.root.rotation.y = this.yaw; else this.root.rotation.y = this.yaw;
    if (Math.abs(this.speed) > 0.01) {
      const p = { x: this.pos.x + Math.sin(this.yaw) * this.speed * dt, z: this.pos.z + Math.cos(this.yaw) * this.speed * dt };
      cols.resolve(p, 0.45);
      this.pos.set(p.x, heightAt(p.x, p.z), p.z);
    }
    this.mixer.update(dt);
    // olhos acompanham o osso dos olhos
    if (this.bEyes) {
      const e = this.bEyes.getWorldPosition(this.tmp);
      const q = this.root.quaternion.clone().invert();
      const lat = new THREE.Vector3(1, 0, 0).applyQuaternion(this.bHead.getWorldQuaternion(new THREE.Quaternion()));
      for (const s of this.eyes) {
        s.position.copy(e).addScaledVector(lat, s.userData.side * 0.045).sub(this.pos).applyQuaternion(q);
        (s.material as THREE.SpriteMaterial).opacity = this.state === 'dead' ? Math.max(0, 0.9 - this.stateT) : 0.85 + Math.random() * 0.15;
      }
    }
  }

  /** desvia das árvores olhando um pouco à frente */
  private steer(goal: number, cols: Colliders, dt: number) {
    let best = goal, bestScore = -1e9;
    for (const off of [0, -0.35, 0.35, -0.7, 0.7, -1.1, 1.1]) {
      const a = goal + off;
      const clear = cols.ray(this.pos.x, this.pos.z, this.pos.x + Math.sin(a) * 4, this.pos.z + Math.cos(a) * 4, 1);
      const score = Math.min(clear, 4) * 2 - Math.abs(off) * 1.2;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return this.yaw + angleDiff(this.yaw, best) * Math.min(1, dt * 7);
  }

  shot(): 'stagger' | 'retreat' | 'dead' {
    this.health -= this.boss ? 1 : 0;
    this.hitsThisRun++;
    if (this.boss && this.health <= 0) { this.set('dead'); this.play('die', 0.1); this.speed = 0; return 'dead'; }
    this.set('stagger');
    if (this.current === this.actions.hit) this.actions.hit.reset();
    else this.play('hit', 0.08, 1.2);
    return !this.boss && this.hitsThisRun >= 2 ? 'retreat' : 'stagger';
  }
}

function eyeTex() {
  const S = 32, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,200,180,0.7)'); r.addColorStop(1, 'rgba(255,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}
