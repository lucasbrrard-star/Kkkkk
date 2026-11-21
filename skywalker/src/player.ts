// Investigador em primeira pessoa: movimento, lanterna (com sombras e bateria), revólver e
// modelo das mãos (renderizado numa cena separada, por cima do mundo).
import * as THREE from 'three';
import type { Assets } from './assets';
import type { Input } from './input';
import type { World } from './world';
import type { Sound } from './audio';
import { heightAt, PLAY_RADIUS } from './map';
import { clamp, damp, noise2 } from './noise';

export class Player {
  pos = new THREE.Vector3();
  yaw = 0; pitch = 0;
  cam: THREE.PerspectiveCamera;
  health = 100;
  stamina = 1;
  battery = 1;
  ammo = 6; reserve = 12;
  lightOn = true;
  reloading = 0;
  cooldown = 0;
  hurtT = 0;
  lastHurt = -99;
  shake = 0;
  dead = false;
  moving = 0;
  private bob = 0;
  private stepPhase = 0;
  private lagQ = new THREE.Quaternion();
  spot: THREE.SpotLight;
  muzzle: THREE.PointLight;
  // mãos
  vmScene = new THREE.Scene();
  vmCam: THREE.PerspectiveCamera;
  private gun = new THREE.Group();
  private torch = new THREE.Group();
  private lens: THREE.Mesh;
  private flashSprite: THREE.Sprite;
  private recoil = 0;
  private sway = new THREE.Vector2();
  forceLook: { yaw: number; pitch: number; t: number } | null = null;
  time = 0;

  constructor(private A: Assets, private world: World, private snd: Sound, private input: Input, quality: 'high' | 'low') {
    this.cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.06, 420);
    // lanterna
    const spot = (this.spot = new THREE.SpotLight(0xfff0d8, 38, 46, 0.5, 0.6, 1.3));
    spot.castShadow = true;
    spot.shadow.mapSize.set(quality === 'high' ? 1024 : 512, quality === 'high' ? 1024 : 512);
    spot.shadow.camera.near = 0.3; spot.shadow.camera.far = 30;
    spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.03;
    spot.map = makeCookie();
    world.scene.add(spot, spot.target);
    this.muzzle = new THREE.PointLight(0xffb060, 0, 14, 1.8);
    world.scene.add(this.muzzle);
    // mãos: revólver à direita, lanterna à esquerda
    this.vmCam = new THREE.PerspectiveCamera(55, 16 / 9, 0.01, 5);
    this.vmScene.add(new THREE.HemisphereLight(0x3a4a66, 0x0a0806, 0.9));
    const key = new THREE.PointLight(0xffe2b8, 0.9, 2, 1.5); key.position.set(-0.25, 0.05, -0.3); this.vmScene.add(key);
    const rim = new THREE.DirectionalLight(0x8fa6d0, 0.6); rim.position.set(1, 1, 0.5); this.vmScene.add(rim);
    this.vmScene.userData.key = key;
    const rev = A.models.revolver.scene.clone(true);
    rev.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { (m.material as THREE.MeshStandardMaterial).envMapIntensity = 0; m.renderOrder = 10; } });
    rev.rotation.set(0, Math.PI, 0);
    rev.scale.setScalar(0.82);
    this.gun.add(rev);
    this.gun.position.set(0.23, -0.21, -0.45);
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeFlashTex(), color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    this.flashSprite.position.set(0.215, -0.17, -0.8); this.flashSprite.scale.setScalar(0.22);
    this.vmScene.add(this.gun, this.flashSprite);
    const fl = A.models.flashlight_hand.scene.clone(true);
    alignLongAxis(fl);
    fl.scale.multiplyScalar(0.9);
    this.torch.add(fl);
    this.lens = new THREE.Mesh(new THREE.CircleGeometry(0.02, 20), new THREE.MeshBasicMaterial({ color: 0xfff4dc }));
    this.lens.visible = false;
    this.torch.add(this.lens);
    this.torch.position.set(-0.21, -0.2, -0.4);
    this.vmScene.add(this.torch);
  }

  spawn(x: number, z: number, yaw: number) {
    this.pos.set(x, heightAt(x, z), z); this.yaw = yaw; this.pitch = 0;
    this.health = 100; this.dead = false; this.hurtT = 0; this.stamina = 1;
    this.forceLook = null;
    this.updateCamera(0);
    this.lagQ.copy(this.cam.quaternion);
  }

  get eye() { return this.cam.position; }
  forward(out = new THREE.Vector3()) { return this.cam.getWorldDirection(out); }

  update(dt: number, canAct: boolean) {
    const inp = this.input;
    this.time += dt;
    // olhar
    const l = inp.consumeLook();
    if (canAct) { this.yaw -= l.x; this.pitch = clamp(this.pitch - l.y, -1.3, 1.25); }
    if (this.forceLook) {
      const f = this.forceLook; f.t -= dt;
      let dy = f.yaw - this.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt * 9); this.pitch += (f.pitch - this.pitch) * Math.min(1, dt * 9);
      if (f.t <= 0) this.forceLook = null;
    }
    // andar
    inp.poll();
    let mx = inp.move.x, my = inp.move.y;
    const mag = Math.min(1, Math.hypot(mx, my));
    if (!canAct) { mx = my = 0; }
    const wantRun = inp.sprint && my > 0.3 && this.stamina > 0.05;
    const speed = (wantRun ? 4.6 : 2.35) * (this.health < 35 ? 0.85 : 1);
    this.stamina = clamp(this.stamina + (wantRun && mag > 0.1 ? -dt / 7 : dt / 9), 0, 1);
    if (this.stamina <= 0.02 && inp.touch) { inp.sprint = false; document.getElementById('btn-run')?.classList.remove('on'); }
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const vx = (mx * c - my * s) * speed, vz = (-mx * s - my * c) * speed;
    const p = { x: this.pos.x + vx * dt, z: this.pos.z + vz * dt };
    this.world.colliders.resolve(p, 0.35);
    const r = Math.hypot(p.x, p.z);
    if (r > PLAY_RADIUS) { p.x *= PLAY_RADIUS / r; p.z *= PLAY_RADIUS / r; }
    const moved = Math.hypot(p.x - this.pos.x, p.z - this.pos.z) / Math.max(dt, 1e-4);
    this.pos.set(p.x, heightAt(p.x, p.z), p.z);
    this.moving = damp(this.moving, clamp(moved / 4.6, 0, 1), 10, dt);
    // passos e balanço da cabeça
    if (moved > 0.3) {
      this.stepPhase += dt * (wantRun ? 2.35 : 1.75);
      if (this.stepPhase >= 1) { this.stepPhase -= 1; this.snd.step(wantRun ? 0.75 : 0.45, wantRun ? 1.08 : 1); }
      this.bob += dt * (wantRun ? 13 : 9);
    }
    this.updateCamera(dt);
    // timers
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    if (this.time - this.lastHurt > 7 && this.health < 100 && !this.dead) this.health = Math.min(100, this.health + dt * 5);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) { const n = Math.min(6 - this.ammo, this.reserve); this.ammo += n; this.reserve -= n; }
    }
    if (this.lightOn) this.battery = Math.max(0, this.battery - dt / 260);
    this.updateFlashlight(dt);
    this.updateViewmodel(dt);
  }

  private updateCamera(dt: number) {
    const bobY = Math.sin(this.bob) * 0.035 * this.moving;
    const bobX = Math.cos(this.bob * 0.5) * 0.03 * this.moving;
    const breath = Math.sin(this.time * 1.6) * 0.006;
    this.cam.position.set(this.pos.x, this.pos.y + 1.64 + bobY + breath, this.pos.z);
    const sh = this.shake * this.shake;
    const e = new THREE.Euler(this.pitch + noise2(this.time * 18, 1) * 0.05 * sh, this.yaw + noise2(this.time * 18, 7) * 0.05 * sh, bobX * 0.4 + noise2(this.time * 15, 3) * 0.06 * sh, 'YXZ');
    this.cam.quaternion.setFromEuler(e);
    this.cam.updateMatrixWorld();
    void dt;
  }

  private updateFlashlight(dt: number) {
    // a lanterna segue a câmera com um pequeno atraso (mão)
    this.lagQ.slerp(this.cam.quaternion, 1 - Math.exp(-dt * 11));
    const off = new THREE.Vector3(-0.2, -0.22, -0.2).applyQuaternion(this.cam.quaternion);
    this.spot.position.copy(this.cam.position).add(off);
    const dir = new THREE.Vector3(0.03, -0.03, -1).applyQuaternion(this.lagQ);
    dir.x += noise2(this.time * 0.7, 2) * 0.012; dir.y += noise2(this.time * 0.6, 9) * 0.01;
    this.spot.target.position.copy(this.spot.position).addScaledVector(dir.normalize(), 10);
    this.spot.target.updateMatrixWorld();
    let k = this.lightOn ? 1 : 0;
    if (this.lightOn) {
      if (this.battery < 0.2) k *= 0.55 + this.battery * 2.2;
      if (this.battery < 0.2 && Math.random() < (0.2 - this.battery) * 0.6) k *= Math.random() * 0.4;
      if (this.battery <= 0) k = 0.05 + Math.random() * 0.04;
    }
    this.spot.intensity = 38 * k;
    this.spot.visible = k > 0.001;
    this.world.beam.lightPos.value.copy(this.spot.position);
    this.world.beam.lightDir.value.copy(dir);
    this.world.beam.lightOn.value = k;
    (this.lens.material as THREE.MeshBasicMaterial).color.setScalar(0.15 + k * 0.85);
    (this.vmScene.userData.key as THREE.PointLight).intensity = 0.25 + k * 0.7;
  }

  private updateViewmodel(dt: number) {
    const l = { x: this.sway.x, y: this.sway.y };
    this.sway.x = damp(this.sway.x, 0, 6, dt); this.sway.y = damp(this.sway.y, 0, 6, dt);
    this.recoil = damp(this.recoil, 0, 9, dt);
    const bx = Math.cos(this.bob * 0.5) * 0.012 * this.moving, by = Math.abs(Math.sin(this.bob * 0.5)) * 0.012 * this.moving;
    const rl = this.reloading > 0 ? Math.sin(Math.min(1, (2.2 - this.reloading) / 2.2) * Math.PI) : 0;
    this.gun.position.set(0.23 + bx + l.x * 0.02, -0.21 - by - rl * 0.16 + l.y * 0.02, -0.45 + this.recoil * 0.07);
    this.gun.rotation.set(-0.06 + this.recoil * 0.35 + rl * 0.9, 0.04 + rl * 0.5, rl * 0.4);
    this.torch.position.set(-0.21 + bx * 0.7, -0.2 - by * 0.8 + Math.sin(this.time * 1.6) * 0.003, -0.4);
    this.torch.rotation.set(0.04 + Math.sin(this.time * 0.9) * 0.01, 0.06, 0);
    const fm = this.flashSprite.material as THREE.SpriteMaterial;
    fm.opacity = Math.max(0, fm.opacity - dt * 14);
    this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 900);
  }

  toggleLight() {
    this.lightOn = !this.lightOn;
    this.snd.click(0.45, 3000);
  }

  /** dispara; devolve o raio do tiro (ou null se não atirou) */
  fire(): { o: THREE.Vector3; d: THREE.Vector3 } | null {
    if (this.cooldown > 0 || this.reloading > 0 || this.dead) return null;
    if (this.ammo <= 0) { this.snd.click(0.6, 1800); this.cooldown = 0.35; if (this.reserve > 0) this.reload(); return null; }
    this.ammo--; this.cooldown = 0.48; this.recoil = 1; this.shake = Math.max(this.shake, 0.35);
    this.pitch += 0.035;
    this.snd.play('gunshot', { vol: 1, rate: 0.96 + Math.random() * 0.08 });
    (this.flashSprite.material as THREE.SpriteMaterial).opacity = 1;
    this.flashSprite.material.rotation = Math.random() * 6;
    const f = this.forward();
    this.muzzle.position.copy(this.cam.position).addScaledVector(f, 0.8);
    this.muzzle.intensity = 40;
    navigator.vibrate?.(30);
    return { o: this.cam.position.clone(), d: f };
  }

  reload() {
    if (this.reloading > 0 || this.ammo >= 6 || this.reserve <= 0) return;
    this.reloading = 2.2;
    this.snd.play('reload', { vol: 0.8 });
  }

  hurt(amount: number, from: THREE.Vector3) {
    if (this.dead) return;
    this.health -= amount; this.lastHurt = this.time; this.hurtT = 1; this.shake = 1;
    this.snd.play('hurt', { vol: 1 });
    navigator.vibrate?.([80, 40, 120]);
    // a câmera vira para quem atacou
    const d = from.clone().sub(this.cam.position);
    this.forceLook = { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) * 0.7, t: 0.45 };
    if (this.health <= 0) { this.health = 0; this.dead = true; }
  }

  onLookDelta(dx: number, dy: number) { this.sway.x -= dx * 3; this.sway.y += dy * 3; }

  resize(w: number, h: number) {
    this.cam.aspect = this.vmCam.aspect = w / h;
    this.cam.fov = w / h < 1.2 ? 80 : 70;
    this.cam.updateProjectionMatrix(); this.vmCam.updateProjectionMatrix();
  }
}

/** "cookie" da lanterna: ponto quente, anéis do refletor e sujeira na lente */
function makeCookie() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.12, '#fff6ea'); gr.addColorStop(0.22, '#c9c2b6');
  gr.addColorStop(0.3, '#9c958a'); gr.addColorStop(0.36, '#b4ada0'); gr.addColorStop(0.55, '#5d5850'); gr.addColorStop(0.8, '#2a2724'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 40; i++) {
    const x = S / 2 + (Math.random() - 0.5) * S * 0.7, y = S / 2 + (Math.random() - 0.5) * S * 0.7, r = 4 + Math.random() * 16;
    const s = g.createRadialGradient(x, y, 0, x, y, r);
    s.addColorStop(0, 'rgba(150,150,150,1)'); s.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = s; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** gira o modelo para que o eixo mais comprido aponte para -Z, com a ponta mais larga (cabeça) na frente */
function alignLongAxis(o: THREE.Object3D) {
  o.updateMatrixWorld(true);
  const pts: THREE.Vector3[] = [];
  o.traverse((c) => {
    const m = c as THREE.Mesh; if (!m.isMesh) return;
    const pa = m.geometry.attributes.position;
    for (let i = 0; i < pa.count; i += 3) pts.push(new THREE.Vector3().fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld));
  });
  const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of pts) { const d = p.clone().sub(c); const a = [d.x, d.y, d.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i * 3 + j] += a[i] * a[j]; }
  let ax = new THREE.Vector3(1, 1, 1).normalize();
  for (let k = 0; k < 40; k++) ax = new THREE.Vector3(cov[0] * ax.x + cov[1] * ax.y + cov[2] * ax.z, cov[3] * ax.x + cov[4] * ax.y + cov[5] * ax.z, cov[6] * ax.x + cov[7] * ax.y + cov[8] * ax.z).normalize();
  // ponta mais larga = cabeça da lanterna
  let r0 = 0, r1 = 0, mn = Infinity, mx = -Infinity;
  for (const p of pts) { const t = p.clone().sub(c).dot(ax); mn = Math.min(mn, t); mx = Math.max(mx, t); }
  for (const p of pts) {
    const d = p.clone().sub(c); const t = d.dot(ax); const r = d.addScaledVector(ax, -t).length();
    if (t < mn + (mx - mn) * 0.15) r0 = Math.max(r0, r); if (t > mx - (mx - mn) * 0.15) r1 = Math.max(r1, r);
  }
  if (r0 > r1) ax.negate();
  const q = new THREE.Quaternion().setFromUnitVectors(ax, new THREE.Vector3(0, 0, -1));
  o.quaternion.premultiply(q);
  o.position.sub(c.clone().applyQuaternion(q));
}

function makeFlashTex() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.translate(S / 2, S / 2);
  for (let i = 0; i < 7; i++) {
    g.rotate((Math.PI * 2) / 7 + Math.random() * 0.3);
    const gr = g.createLinearGradient(0, 0, S / 2, 0);
    gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, -5); g.lineTo(S / 2 * (0.6 + Math.random() * 0.4), 0); g.lineTo(0, 5); g.fill();
  }
  const r = g.createRadialGradient(0, 0, 0, 0, 0, S / 4);
  r.addColorStop(0, 'rgba(255,255,230,1)'); r.addColorStop(1, 'rgba(255,160,60,0)');
  g.fillStyle = r; g.beginPath(); g.arc(0, 0, S / 4, 0, 7); g.fill();
  return new THREE.CanvasTexture(c);
}
