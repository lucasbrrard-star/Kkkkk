// Ônibus circular decorativo: percorre a faixa externa do anel de ruas,
// contorna esquinas em arco, para no ponto da orla e aguarda pedestres à frente.
import Phaser from 'phaser';
import { CONFIG } from '../config';
import { depthOf, dirIndexFromWorld, toScreen } from '../core/iso';
import { DynCollider } from '../systems/CollisionSystem';
import { DEPTH, World } from '../world/World';

interface P { x: number; y: number }

export class Bus {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  private path: P[] = [];
  private cum: number[] = [];
  private total = 0;
  s = 0;
  x = 0; y = 0; hx = 1; hy = 0;
  private dwell = 0;
  private stopS = 0;
  private servedStop = false;
  speed = 0;
  colliders: DynCollider[] = [];
  sortRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  depth = 0;

  constructor(private scene: Phaser.Scene, route: P[], stop: P, private world: World) {
    this.buildPath(route, 2.2);
    // posição do ponto ao longo do caminho
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.path.length; i++) {
      const d = Math.hypot(this.path[i].x - stop.x, this.path[i].y - stop.y);
      if (d < bd) { bd = d; best = i; }
    }
    this.stopS = this.cum[best];
    this.s = (this.stopS - 22 + this.total) % this.total;
    this.sprite = scene.add.image(0, 0, 'objects', 'bus_1');
    this.shadow = scene.add.image(0, 0, 'objects', 'bus_1__sh').setDepth(DEPTH.shadows + 5);
    for (let i = 0; i < 3; i++) this.colliders.push({ x: 0, y: 0, r: 0.72, h: 3, id: 'bus' + i });
    this.place();
  }

  private buildPath(route: P[], r: number) {
    const n = route.length;
    const pts: P[] = [];
    for (let i = 0; i < n; i++) {
      const prev = route[(i - 1 + n) % n], cur = route[i], next = route[(i + 1) % n];
      const d1 = norm(cur.x - prev.x, cur.y - prev.y), d2 = norm(next.x - cur.x, next.y - cur.y);
      const a = { x: cur.x - d1.x * r, y: cur.y - d1.y * r };
      const b = { x: cur.x + d2.x * r, y: cur.y + d2.y * r };
      // curva de Bézier quadrática na esquina
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        pts.push({
          x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cur.x + t * t * b.x,
          y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cur.y + t * t * b.y,
        });
      }
    }
    this.path = pts;
    this.cum = [0];
    for (let i = 1; i <= pts.length; i++) {
      const p = pts[i - 1], q = pts[i % pts.length];
      this.cum.push(this.cum[i - 1] + Math.hypot(q.x - p.x, q.y - p.y));
    }
    this.total = this.cum[pts.length];
  }

  private at(s: number) {
    s = ((s % this.total) + this.total) % this.total;
    let lo = 0, hi = this.cum.length - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    const p = this.path[lo], q = this.path[(lo + 1) % this.path.length];
    const seg = this.cum[lo + 1] - this.cum[lo] || 1;
    const t = (s - this.cum[lo]) / seg;
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
  }

  /** Distância ao ponto (ETA) em segundos aproximados. */
  etaToStop(): number {
    if (this.dwell > 0) return 0;
    const d = ((this.stopS - this.s) % this.total + this.total) % this.total;
    return d / CONFIG.bus.speed;
  }

  update(dt: number, player: { x: number; y: number }) {
    // pedestre à frente → espera
    const ahead = { x: this.x + this.hx * 3.2, y: this.y + this.hy * 3.2 };
    const dx = player.x - ahead.x, dy = player.y - ahead.y;
    const along = dx * this.hx + dy * this.hy, lat = Math.abs(-dx * this.hy + dy * this.hx);
    const blocked = Math.abs(along) < 1.8 && lat < 1.2;

    let target = CONFIG.bus.speed;
    const toStop = ((this.stopS - this.s) % this.total + this.total) % this.total;
    if (!this.servedStop && toStop < 6) target = Math.max(0.6, CONFIG.bus.speed * (toStop / 6));
    if (this.dwell > 0) { this.dwell -= dt; target = 0; if (this.dwell <= 0) this.servedStop = true; }
    if (blocked) target = 0;
    this.speed += (target - this.speed) * (1 - Math.exp(-4 * dt));
    if (this.speed < 0.02 && target === 0) this.speed = 0;
    this.s = (this.s + this.speed * dt) % this.total;
    if (!this.servedStop && this.dwell <= 0 && toStop < 0.15) { this.dwell = CONFIG.bus.dwell; this.speed = 0; }
    // libera nova parada somente depois de se afastar bastante do ponto
    if (this.servedStop && this.dwell <= 0 && toStop > 8 && toStop < this.total - 8) this.servedStop = false;
    this.place();
  }

  private place() {
    const p = this.at(this.s);
    const q = this.at(this.s + 0.6);
    const hx = q.x - p.x, hy = q.y - p.y;
    const hl = Math.hypot(hx, hy) || 1;
    this.hx = hx / hl; this.hy = hy / hl;
    this.x = p.x; this.y = p.y;
    const dir = dirIndexFromWorld(this.hx, this.hy);
    const name = `bus_${dir}`;
    if (this.sprite.frame.name !== name) {
      this.sprite.setFrame(name).setOrigin(this.world.anchorX(name), this.world.anchorY(name));
      this.shadow.setFrame(name + '__sh').setOrigin(this.world.anchorX(name + '__sh'), this.world.anchorY(name + '__sh'));
    }
    const sp = toScreen(p.x, p.y);
    this.sprite.setPosition(Math.round(sp.x), Math.round(sp.y));
    this.shadow.setPosition(Math.round(sp.x), Math.round(sp.y));
    for (let i = 0; i < 3; i++) {
      const o = (i - 1) * 1.6;
      this.colliders[i].x = p.x + this.hx * o; this.colliders[i].y = p.y + this.hy * o;
    }
    const L = 2.4, W = 0.7;
    const xs = [p.x + this.hx * L + this.hy * W, p.x + this.hx * L - this.hy * W, p.x - this.hx * L + this.hy * W, p.x - this.hx * L - this.hy * W];
    const ys = [p.y + this.hy * L - this.hx * W, p.y + this.hy * L + this.hx * W, p.y - this.hy * L - this.hx * W, p.y - this.hy * L + this.hx * W];
    this.sortRect = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    this.depth = depthOf(p.x, p.y);
    this.sprite.setDepth(this.depth);
  }
}

function norm(x: number, y: number) { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }
