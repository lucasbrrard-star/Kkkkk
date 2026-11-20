// Câmera em terceira pessoa: órbita (arrastar / pinça / roda do mouse), segue o
// jogador por trás quando ele anda, encurta ao encostar em prédios e nunca entra no chão.
import * as THREE from 'three';
import type { Collider } from '../world/city';

export class ThirdPersonCamera {
  yaw = Math.PI;            // ângulo horizontal (0 → câmera ao sul do alvo, olhando para o norte)
  pitch = 0.32;             // inclinação (rad)
  dist = 5.2;
  minDist = 2.2; maxDist = 11;
  sensitivity = 1;
  target = new THREE.Vector3();
  private smoothTarget = new THREE.Vector3();
  private curDist = 5.2;
  private lastManual = -10;
  private t = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch0 = 0;
  enabled = true;

  constructor(private cam: THREE.PerspectiveCamera, private dom: HTMLElement, private colliders: () => Collider[]) {
    dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) this.pinch0 = this.pinchDist();
      dom.setPointerCapture?.(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p || !this.enabled) return;
      if (this.pointers.size === 1) {
        const k = 0.0055 * this.sensitivity * (e.pointerType === 'touch' ? 1.25 : 1);
        this.yaw -= (e.clientX - p.x) * k;
        this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - p.y) * k, -0.25, 1.15);
        this.lastManual = this.t;
      }
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 2) {
        const d = this.pinchDist();
        if (this.pinch0 > 0) this.dist = THREE.MathUtils.clamp(this.dist * (this.pinch0 / d), this.minDist, this.maxDist);
        this.pinch0 = d;
      }
    });
    const up = (e: PointerEvent) => { this.pointers.delete(e.pointerId); this.pinch0 = 0; };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.dist = THREE.MathUtils.clamp(this.dist * (1 + Math.sign(e.deltaY) * 0.1), this.minDist, this.maxDist);
      e.preventDefault();
    }, { passive: false });
  }

  private pinchDist() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  snap(pos: THREE.Vector3, facing: number) {
    this.target.copy(pos);
    this.smoothTarget.copy(pos);
    this.yaw = facing + Math.PI;
  }

  /** facing = rotação do jogador; moving = se está andando (para seguir por trás). */
  update(dt: number, player: THREE.Vector3, facing: number, moving: boolean, headHeight = 1.55) {
    this.t += dt;
    this.target.set(player.x, player.y + headHeight, player.z);
    this.smoothTarget.lerp(this.target, 1 - Math.exp(-dt * 12));
    // segue por trás suavemente quando anda e o jogador não mexeu na câmera há pouco
    if (moving && this.t - this.lastManual > 1.2) {
      const want = facing + Math.PI;
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-dt * 1.6));
    }
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    // colisão: encurta a distância se um prédio estiver entre o alvo e a câmera
    const allowed = Math.min(this.dist, this.castBoxes(this.smoothTarget, dir, this.dist));
    const k = allowed < this.curDist ? 1 - Math.exp(-dt * 25) : 1 - Math.exp(-dt * 4);
    this.curDist += (allowed - this.curDist) * k;
    const pos = this.smoothTarget.clone().addScaledVector(dir, this.curDist);
    pos.y = Math.max(pos.y, 0.6);
    this.cam.position.copy(pos);
    this.cam.lookAt(this.smoothTarget.x, this.smoothTarget.y - 0.15, this.smoothTarget.z);
  }

  /** Distância até o primeiro colisor alto (caixa) ao longo do raio (2D + altura). */
  private castBoxes(o: THREE.Vector3, dir: THREE.Vector3, max: number): number {
    let best = max;
    const pad = 0.35;
    for (const c of this.colliders()) {
      if (c.kind !== 'box' || c.h < 2.5) continue;
      if (Math.abs(c.x - o.x) > c.hx + c.hz + max + 2 || Math.abs(c.z - o.z) > c.hx + c.hz + max + 2) continue;
      const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
      const dx = o.x - c.x, dz = o.z - c.z;
      const ox = cs * dx - sn * dz, oz = sn * dx + cs * dz;
      const vx = cs * dir.x - sn * dir.z, vz = sn * dir.x + cs * dir.z;
      let t0 = 0, t1 = max;
      const slab = (p: number, v: number, h: number) => {
        if (Math.abs(v) < 1e-6) return p >= -h && p <= h;
        let a = (-h - p) / v, b = (h - p) / v;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        return t0 <= t1;
      };
      if (!slab(ox, vx, c.hx + pad) || !slab(oz, vz, c.hz + pad)) continue;
      const yAt = o.y + dir.y * t0;
      if (yAt > c.h + 0.2) continue;
      best = Math.min(best, Math.max(this.minDist * 0.5, t0 - 0.2));
    }
    return best;
  }
}
