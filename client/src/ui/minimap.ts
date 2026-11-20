// Minimapa: camada estática (ruas, quadras, terrenos, prédios, praia) desenhada uma vez
// em canvas; a cada ~150 ms recorta a região ao redor do jogador e desenha os marcadores.
import { BEACH, BOARDWALK, BUILDINGS, CELLS_X, CELLS_Z, CITY, LOTS, PLAZA, ROADS } from '../../../shared/city';
import type { LotState } from '../../../shared/protocol';
import type { ModelInfo } from '../core/assets';

const PPM = 3;                 // pixels por metro na camada estática
const X0 = -130, X1 = 140, Z0 = -130, Z1 = 130;

export class Minimap {
  base = document.createElement('canvas');
  private lots = new Map<string, LotState>();
  waypoint: { x: number; z: number; label: string } | null = null;
  private acc = 0;
  constructor(private canvas: HTMLCanvasElement, private models: Record<string, ModelInfo>, private viewRadius = 55) {
    this.base.width = (X1 - X0) * PPM; this.base.height = (Z1 - Z0) * PPM;
    this.drawBase();
  }

  setLots(list: LotState[]) { for (const l of list) this.lots.set(l.id, l); this.drawBase(); }
  setLot(l: LotState) { this.lots.set(l.id, l); this.drawBase(); }

  private P = (x: number) => (x - X0) * PPM;
  private Q = (z: number) => (z - Z0) * PPM;

  drawBase() {
    const c = this.base.getContext('2d')!, P = this.P, Q = this.Q;
    c.fillStyle = '#7fa86a'; c.fillRect(0, 0, this.base.width, this.base.height);
    // praia e mar
    c.fillStyle = '#efd9a8'; c.fillRect(P(BEACH.x0), 0, P(X1) - P(BEACH.x0), this.base.height);
    c.fillStyle = '#3d9cc0'; c.fillRect(P(CITY.shoreX), 0, P(X1) - P(CITY.shoreX), this.base.height);
    c.fillStyle = '#e8e2d2'; c.fillRect(P(BOARDWALK.x0), 0, (BOARDWALK.x1 - BOARDWALK.x0) * PPM, this.base.height);
    // ruas
    c.fillStyle = '#4a4d57';
    for (const r of ROADS) {
      if (r.x0 === r.x1) c.fillRect(P(r.x0 - r.w / 2), Q(-CITY.half), r.w * PPM, CITY.half * 2 * PPM);
      else c.fillRect(P(-CITY.half), Q(r.z0 - r.w / 2), CITY.half * 2 * PPM, r.w * PPM);
    }
    // quadras
    for (const [x0, x1] of CELLS_X) for (const [z0, z1] of CELLS_Z) {
      c.fillStyle = '#d9d2c3'; c.fillRect(P(x0), Q(z0), (x1 - x0) * PPM, (z1 - z0) * PPM);
      c.fillStyle = '#8fbf6f'; c.fillRect(P(x0 + 3.5), Q(z0 + 3.5), (x1 - x0 - 7) * PPM, (z1 - z0 - 7) * PPM);
    }
    c.fillStyle = '#efe4cf'; c.fillRect(P(-PLAZA.half), Q(-PLAZA.half), PLAZA.half * 2 * PPM, PLAZA.half * 2 * PPM);
    c.fillStyle = '#7ec8e3'; c.beginPath(); c.arc(P(0), Q(0), 3.5 * PPM, 0, Math.PI * 2); c.fill();
    // terrenos
    for (const l of LOTS) {
      const s = this.lots.get(l.id);
      const owned = !!s?.owner;
      c.fillStyle = owned ? 'rgba(255,179,71,.55)' : 'rgba(70,255,154,.45)';
      c.strokeStyle = owned ? '#ff9d1f' : '#1fd273';
      c.lineWidth = 2;
      c.fillRect(P(l.x - l.w / 2), Q(l.z - l.d / 2), l.w * PPM, l.d * PPM);
      c.strokeRect(P(l.x - l.w / 2), Q(l.z - l.d / 2), l.w * PPM, l.d * PPM);
      c.fillStyle = '#0b3b22'; c.font = `900 ${5 * PPM}px Nunito, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(l.id, P(l.x), Q(l.z));
    }
    // prédios
    for (const b of BUILDINGS) {
      const m = this.models[b.model];
      if (!m) continue;
      const hx = (m.bounds.max[0] - m.bounds.min[0]) / 2, hz = (m.bounds.max[2] - m.bounds.min[2]) / 2;
      c.save(); c.translate(P(b.x), Q(b.z)); c.rotate(-b.rot * Math.PI / 180);
      c.fillStyle = b.kind === 'service' ? '#b77ce8' : '#9c96a8';
      c.fillRect(-hx * PPM, -hz * PPM, hx * 2 * PPM, hz * 2 * PPM);
      c.restore();
    }
  }

  /** Desenha o recorte ao redor do jogador (norte para cima). */
  update(dt: number, me: { x: number; z: number; ry: number }, others: { x: number; z: number }[], npcs: { x: number; z: number }[]) {
    this.acc += dt;
    if (this.acc < 0.15) return;
    this.acc = 0;
    const cv = this.canvas, W = cv.clientWidth * Math.min(2, devicePixelRatio || 1) | 0, H = W;
    if (cv.width !== W) { cv.width = W; cv.height = H; }
    const c = cv.getContext('2d')!;
    const r = this.viewRadius, sx = this.P(me.x - r), sz = this.Q(me.z - r), sw = r * 2 * PPM;
    c.fillStyle = '#3d9cc0'; c.fillRect(0, 0, W, H);
    c.drawImage(this.base, sx, sz, sw, sw, 0, 0, W, H);
    const k = W / (r * 2);
    const at = (x: number, z: number) => [(x - me.x + r) * k, (z - me.z + r) * k] as const;
    for (const o of others) { const [x, y] = at(o.x, o.z); c.fillStyle = '#5fc8ff'; c.beginPath(); c.arc(x, y, W * 0.025, 0, Math.PI * 2); c.fill(); }
    for (const o of npcs) { const [x, y] = at(o.x, o.z); c.fillStyle = '#ffc83d'; c.strokeStyle = '#7a4b00'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, W * 0.035, 0, Math.PI * 2); c.fill(); c.stroke(); }
    if (this.waypoint) {
      let [x, y] = at(this.waypoint.x, this.waypoint.z);
      const cx = W / 2, cy = H / 2, dx = x - cx, dy = y - cy, m = Math.max(Math.abs(dx), Math.abs(dy)) / (W / 2 - W * 0.07);
      if (m > 1) { x = cx + dx / m; y = cy + dy / m; }
      c.fillStyle = '#ff4f9a'; c.strokeStyle = '#fff'; c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, W * 0.05, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    // jogador: seta na direção em que olha
    c.save(); c.translate(W / 2, H / 2); c.rotate(-me.ry + Math.PI);
    const s = W * 0.065;
    c.fillStyle = '#fff'; c.strokeStyle = '#ff4f9a'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -s * 1.2); c.lineTo(s * 0.85, s * 0.9); c.lineTo(0, s * 0.45); c.lineTo(-s * 0.85, s * 0.9); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
}
