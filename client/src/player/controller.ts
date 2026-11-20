// Controle do jogador: movimento relativo à câmera com aceleração, rotação suave,
// colisão (círculos e caixas rotacionadas), degrau de calçada, pulo com gravidade,
// sentar em bancos e emotes. Gera o estado enviado à rede.
import * as THREE from 'three';
import type { AnimState } from '../../../shared/protocol';
import type { City, Seat } from '../world/city';
import { Avatar } from './avatar';
import { Input } from './input';

const WALK = 1.75, RUN = 4.6, RADIUS = 0.32, GRAVITY = 14, JUMP_V = 4.6;
const EMOTES = new Set<AnimState>(['dance', 'wave', 'agree', 'headShake']);

export class PlayerController {
  pos = new THREE.Vector3();
  vel = new THREE.Vector2();
  vy = 0;
  ry = 0;
  speed = 0;
  grounded = true;
  anim: AnimState = 'idle';
  seat: Seat | null = null;
  private emoteUntil = 0;
  private t = 0;
  onLand?: () => void;
  onStep?: (run: boolean) => void;
  private stepPhase = 0;

  constructor(public avatar: Avatar, private city: City, private input: Input) {
    avatar.root.position.copy(this.pos);
  }

  teleport(x: number, z: number, ry: number) {
    this.pos.set(x, this.city.heightAt(x, z), z);
    this.ry = ry; this.vel.set(0, 0); this.vy = 0; this.seat = null;
    this.sync();
  }

  emote(a: AnimState) {
    if (!EMOTES.has(a) || this.seat) return;
    this.anim = a;
    this.emoteUntil = a === 'dance' ? Infinity : this.t + (a === 'wave' ? 2.6 : 2.2);
    this.avatar.setState(a);
  }

  sit(seat: Seat) {
    this.seat = seat;
    this.pos.set(seat.x, this.city.heightAt(seat.x, seat.z), seat.z);
    this.ry = seat.rot;
    this.vel.set(0, 0);
    this.anim = 'sit';
    this.avatar.setState('sit');
  }

  standUp() {
    if (!this.seat) return;
    const s = this.seat;
    this.seat = null;
    this.pos.x += Math.sin(s.rot) * 0.6; this.pos.z += Math.cos(s.rot) * 0.6;
    this.anim = 'idle';
    this.avatar.setState('idle');
  }

  update(dt: number, camYaw: number) {
    this.t += dt;
    const inp = this.input;
    const wantsMove = Math.hypot(inp.move.x, inp.move.y) > 0.05;
    if (this.seat) {
      if (wantsMove || inp.hit('Space')) this.standUp();
      else { this.sync(); return; }
    }
    // direção desejada relativa à câmera
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let dx = fx * inp.move.y + rx * inp.move.x, dz = fz * inp.move.y + rz * inp.move.x;
    const mag = Math.min(1, Math.hypot(dx, dz));
    const dl = Math.hypot(dx, dz);
    if (dl > 0.001) { dx /= dl; dz /= dl; }
    const target = mag < 0.05 ? 0 : (inp.run ? RUN : WALK * Math.max(0.55, mag));
    // aceleração (no ar o controle é menor)
    const acc = this.grounded ? 12 : 3;
    const tvx = dx * target, tvz = dz * target;
    this.vel.x += (tvx - this.vel.x) * (1 - Math.exp(-acc * dt));
    this.vel.y += (tvz - this.vel.y) * (1 - Math.exp(-acc * dt));
    this.speed = this.vel.length();
    if (this.speed > 0.15 && mag > 0.05) {
      const want = Math.atan2(dx, dz);
      let d = want - this.ry; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.ry += d * (1 - Math.exp(-dt * 11));
    }
    // emotes terminam ao andar ou pelo tempo
    if (EMOTES.has(this.anim) && (wantsMove || this.t > this.emoteUntil)) this.anim = 'idle';
    // pulo
    if (inp.hit('Space') && this.grounded) { this.vy = JUMP_V; this.grounded = false; }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    this.collide();
    const ground = this.city.heightAt(this.pos.x, this.pos.z);
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) { this.pos.y = ground; this.vy = 0; this.grounded = true; this.onLand?.(); }
    } else {
      // degraus (meio-fio) sobem/descem suavemente
      this.pos.y += (ground - this.pos.y) * (1 - Math.exp(-dt * 20));
    }
    // estado de animação
    if (!EMOTES.has(this.anim) || wantsMove) {
      if (!this.grounded) this.anim = 'jump';
      else if (this.speed > 3.0) this.anim = 'run';
      else if (this.speed > 0.25) this.anim = 'walk';
      else this.anim = 'idle';
    }
    this.avatar.setState(this.anim);
    this.avatar.setSpeed(this.speed);
    const air = this.grounded ? 0 : THREE.MathUtils.clamp(1 - Math.abs(this.vy) / JUMP_V * 0.6, 0.3, 1);
    this.avatar.airborne += (air - this.avatar.airborne) * (1 - Math.exp(-dt * 14));
    // passos (som)
    if (this.grounded && this.speed > 0.3) {
      this.stepPhase += dt * (this.speed > 3 ? 2.9 : 1.9) * (this.speed > 3 ? 1 : this.speed / WALK);
      if (this.stepPhase >= 1) { this.stepPhase -= 1; this.onStep?.(this.speed > 3); }
    }
    this.sync();
  }

  private sync() {
    this.avatar.root.position.copy(this.pos);
    this.avatar.root.rotation.y = this.ry;
    // sentado: abaixa o quadril até a altura do assento
    const m = this.avatar.model;
    if (this.seat) { m.position.y = -(this.avatar.hipsHeight - 0.5); m.position.z = -0.12; }
    else { m.position.y = 0; m.position.z = 0; }
  }

  /** Empurra o jogador para fora de colisores próximos (2 iterações). */
  private collide() {
    for (let it = 0; it < 2; it++) {
      for (const c of this.city.colliders) {
        if (c.kind === 'circle') {
          const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
          if (this.pos.y > c.h) continue;
          const min = c.r + RADIUS, d2 = dx * dx + dz * dz;
          if (d2 >= min * min || d2 < 1e-8) continue;
          const d = Math.sqrt(d2), k = (min - d) / d;
          this.pos.x += dx * k; this.pos.z += dz * k;
        } else {
          if (Math.abs(this.pos.x - c.x) > c.hx + c.hz + 1 || Math.abs(this.pos.z - c.z) > c.hx + c.hz + 1) continue;
          if (this.pos.y > c.h + 0.05) continue;
          const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
          const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
          const lx = cs * dx - sn * dz, lz = sn * dx + cs * dz;
          const qx = THREE.MathUtils.clamp(lx, -c.hx, c.hx), qz = THREE.MathUtils.clamp(lz, -c.hz, c.hz);
          const ox = lx - qx, oz = lz - qz;
          const d2 = ox * ox + oz * oz;
          let px = 0, pz = 0;
          if (d2 > 1e-8) {
            if (d2 >= RADIUS * RADIUS) continue;
            const d = Math.sqrt(d2), k = (RADIUS - d) / d;
            px = ox * k; pz = oz * k;
          } else {
            // centro dentro da caixa: sai pelo lado mais próximo
            const ex = c.hx - Math.abs(lx), ez = c.hz - Math.abs(lz);
            if (ex < ez) px = Math.sign(lx || 1) * (ex + RADIUS); else pz = Math.sign(lz || 1) * (ez + RADIUS);
          }
          // de volta ao mundo (rotação inversa)
          this.pos.x += cs * px + sn * pz;
          this.pos.z += -sn * px + cs * pz;
        }
      }
    }
  }
}
