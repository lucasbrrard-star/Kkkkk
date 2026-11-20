// Colisões no plano do chão (coordenadas de tile): círculo do ator contra
// retângulos/círculos estáticos (com altura, permitindo pular obstáculos baixos),
// água/limites do mapa e colisores dinâmicos (ônibus). Resolve por deslizamento.
import { Collider, N, T } from '../world/MapData';

export interface DynCollider { x: number; y: number; r: number; h: number; id: string }

export class CollisionSystem {
  private grid = new Map<number, Collider[]>();
  private cell = 4;
  dynamic: DynCollider[] = [];

  constructor(private colliders: Collider[], private terrain: Uint8Array) {
    for (const c of colliders) {
      const [x0, y0, x1, y1] = c.kind === 'rect' ? [c.x0, c.y0, c.x1, c.y1] : [c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r];
      for (let gy = Math.floor(y0 / this.cell); gy <= Math.floor(y1 / this.cell); gy++)
        for (let gx = Math.floor(x0 / this.cell); gx <= Math.floor(x1 / this.cell); gx++) {
          const k = gy * 1000 + gx;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k)!.push(c);
        }
    }
  }

  blockedTile(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) return true;
    return this.terrain[ty * N + tx] === T.Water;
  }

  private near(x: number, y: number): Collider[] {
    const out: Collider[] = [];
    const gx = Math.floor(x / this.cell), gy = Math.floor(y / this.cell);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const l = this.grid.get((gy + dy) * 1000 + gx + dx);
      if (l) for (const c of l) if (!out.includes(c)) out.push(c);
    }
    return out;
  }

  /** Move um círculo de (x,y) por (dx,dy) e retorna a posição resolvida. z = altura atual (pulo). */
  move(x: number, y: number, dx: number, dy: number, r: number, z: number, ignore?: string): { x: number; y: number; hit: boolean } {
    // sub-passos para evitar atravessar objetos finos
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / (r * 0.5)));
    let hit = false;
    for (let s = 0; s < steps; s++) {
      x += dx / steps; y += dy / steps;
      for (let it = 0; it < 3; it++) {
        const res = this.resolve(x, y, r, z, ignore);
        x = res.x; y = res.y; hit = hit || res.hit;
        if (!res.hit) break;
      }
    }
    return { x, y, hit };
  }

  overlaps(x: number, y: number, r: number, z: number, ignore?: string): boolean {
    const res = this.resolve(x, y, r, z, ignore);
    return res.hit;
  }

  private resolve(x: number, y: number, r: number, z: number, ignore?: string) {
    let hit = false;
    // tiles bloqueados (água, fora do mapa): tratados como caixas
    const tx0 = Math.floor(x - r), tx1 = Math.floor(x + r), ty0 = Math.floor(y - r), ty1 = Math.floor(y + r);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (!this.blockedTile(tx, ty)) continue;
      const p = pushOutRect(x, y, r, tx, ty, tx + 1, ty + 1);
      if (p) { x = p.x; y = p.y; hit = true; }
    }
    for (const c of this.near(x, y)) {
      if (z >= c.h) continue; // acima do obstáculo (pulo)
      if (c.kind === 'rect') {
        const p = pushOutRect(x, y, r, c.x0, c.y0, c.x1, c.y1);
        if (p) { x = p.x; y = p.y; hit = true; }
      } else {
        const ddx = x - c.x, ddy = y - c.y;
        const d = Math.hypot(ddx, ddy);
        const m = r + c.r;
        if (d < m) {
          const nx = d > 1e-6 ? ddx / d : 1, ny = d > 1e-6 ? ddy / d : 0;
          x = c.x + nx * m; y = c.y + ny * m; hit = true;
        }
      }
    }
    for (const c of this.dynamic) {
      if (c.id === ignore || z >= c.h) continue;
      const ddx = x - c.x, ddy = y - c.y;
      const d = Math.hypot(ddx, ddy);
      const m = r + c.r;
      if (d < m) {
        const nx = d > 1e-6 ? ddx / d : 1, ny = d > 1e-6 ? ddy / d : 0;
        x = c.x + nx * m; y = c.y + ny * m; hit = true;
      }
    }
    return { x, y, hit };
  }
}

function pushOutRect(x: number, y: number, r: number, x0: number, y0: number, x1: number, y1: number) {
  const cx = Math.max(x0, Math.min(x, x1));
  const cy = Math.max(y0, Math.min(y, y1));
  const dx = x - cx, dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    return { x: cx + (dx / d) * r, y: cy + (dy / d) * r };
  }
  // centro dentro do retângulo: empurra pelo menor eixo
  const l = x - x0 + r, rr = x1 - x + r, t = y - y0 + r, b = y1 - y + r;
  const m = Math.min(l, rr, t, b);
  if (m === l) return { x: x0 - r, y };
  if (m === rr) return { x: x1 + r, y };
  if (m === t) return { x, y: y0 - r };
  return { x, y: y1 + r };
}
