// Outros jogadores: avatares com interpolação (buffer de ~150 ms), animação pelo
// estado recebido, LOD de animação por distância e entrada/saída suaves.
import * as THREE from 'three';
import type { AnimState, Appearance, PlayerInfo } from '../../../shared/protocol';
import { Assets } from '../core/assets';
import { Avatar } from '../player/avatar';

const DELAY = 150; // ms

interface Sample { t: number; x: number; y: number; z: number; ry: number; anim: AnimState }

export class Remote {
  avatar: Avatar | null = null;
  samples: Sample[] = [];
  pos = new THREE.Vector3();
  ry = 0;
  speed = 0;
  emoteUntil = 0;
  emote: AnimState | null = null;
  private animAcc = 0;
  private frame = 0;
  fade = 0;
  constructor(public info: PlayerInfo) {
    this.pos.set(info.x, info.y, info.z);
    this.ry = info.ry;
    this.push(performance.now() - DELAY, info.x, info.y, info.z, info.ry, info.anim);
  }
  push(t: number, x: number, y: number, z: number, ry: number, anim: AnimState) {
    this.samples.push({ t, x, y, z, ry, anim });
    if (this.samples.length > 30) this.samples.shift();
  }

  update(dt: number, now: number, camPos: THREE.Vector3, animFar: number) {
    const rt = now - DELAY;
    const s = this.samples;
    let a = s[0], b = s[s.length - 1];
    for (let i = 0; i < s.length - 1; i++) if (s[i].t <= rt && s[i + 1].t >= rt) { a = s[i]; b = s[i + 1]; break; }
    const k = b.t > a.t ? THREE.MathUtils.clamp((rt - a.t) / (b.t - a.t), 0, 1) : 1;
    const nx = a.x + (b.x - a.x) * k, nz = a.z + (b.z - a.z) * k, ny = a.y + (b.y - a.y) * k;
    const moved = Math.hypot(nx - this.pos.x, nz - this.pos.z);
    this.speed += ((dt > 0 ? moved / dt : 0) - this.speed) * Math.min(1, dt * 6);
    this.pos.set(nx, ny, nz);
    let d = b.ry - a.ry; d = Math.atan2(Math.sin(d), Math.cos(d));
    const want = a.ry + d * k;
    let dr = want - this.ry; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    this.ry += dr * Math.min(1, dt * 12);
    if (!this.avatar) return;
    let anim = k > 0.5 ? b.anim : a.anim;
    if (this.emote && now < this.emoteUntil && (anim === 'idle' || anim === this.emote)) anim = this.emote;
    this.avatar.setState(anim);
    this.avatar.setSpeed(this.speed);
    this.avatar.airborne = anim === 'jump' ? 0.8 : 0;
    this.avatar.root.position.copy(this.pos);
    this.avatar.root.rotation.y = this.ry;
    const m = this.avatar.model;
    if (anim === 'sit') { m.position.y = -(this.avatar.hipsHeight - 0.5); m.position.z = -0.12; } else { m.position.y = 0; m.position.z = 0; }
    // aparecimento suave
    if (this.fade < 1) { this.fade = Math.min(1, this.fade + dt * 2.5); this.avatar.root.scale.setScalar(0.85 + 0.15 * this.fade); }
    // LOD: longe da câmera anima a 1/3 da taxa; muito longe, nem desenha
    const dist = camPos.distanceTo(this.pos);
    this.avatar.root.visible = dist < animFar * 2.2;
    if (!this.avatar.root.visible) return;
    this.animAcc += dt;
    this.frame++;
    if (dist < animFar || this.frame % 3 === 0) { this.avatar.update(this.animAcc); this.animAcc = 0; }
  }
}

export class Remotes {
  map = new Map<string, Remote>();
  group = new THREE.Group();
  constructor(private assets: Assets, scene: THREE.Scene) { scene.add(this.group); }

  async add(p: PlayerInfo) {
    if (this.map.has(p.id)) return;
    const r = new Remote(p);
    this.map.set(p.id, r);
    const av = await Avatar.create(this.assets, p.look);
    if (!this.map.has(p.id)) return; // saiu enquanto carregava
    r.avatar = av;
    av.root.scale.setScalar(0.85);
    this.group.add(av.root);
  }

  remove(id: string) {
    const r = this.map.get(id);
    if (!r) return;
    r.avatar?.dispose();
    this.map.delete(id);
  }

  async setLook(id: string, look: Appearance) {
    const r = this.map.get(id);
    if (!r) return;
    r.info.look = look;
    const old = r.avatar;
    const av = await Avatar.create(this.assets, look);
    if (this.map.get(id) !== r) return;
    old?.dispose();
    r.avatar = av;
    r.fade = 1;
    this.group.add(av.root);
  }

  snapshot(list: [string, number, number, number, number, AnimState][]) {
    const now = performance.now();
    for (const [id, x, y, z, ry, anim] of list) this.map.get(id)?.push(now, x, y, z, ry, anim);
  }

  emote(id: string, anim: AnimState) {
    const r = this.map.get(id);
    if (!r) return;
    r.emote = anim;
    r.emoteUntil = performance.now() + 450; // cobre a latência até o próximo snapshot (que já traz o emote)
  }

  update(dt: number, camPos: THREE.Vector3, animFar: number) {
    const now = performance.now();
    for (const r of this.map.values()) r.update(dt, now, camPos, animFar);
  }
}
