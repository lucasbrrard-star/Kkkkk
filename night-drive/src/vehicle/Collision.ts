import type { Collider } from '../world/CityLayout';
import type { VehiclePhysics } from './VehiclePhysics';

export interface Impact { speed: number; x: number; z: number; tag: Collider['tag'] }

/**
 * Static collision world for the car: oriented car box vs axis-aligned/rotated boxes and circles,
 * with a uniform grid broad phase. Resolution pushes the car out along the minimum translation
 * vector, removes the normal velocity (with a little bounce), applies friction and a yaw impulse
 * from the contact point so corner hits spin the car.
 */
export class CollisionWorld {
  private readonly cell = 16;
  private readonly grid = new Map<string, Collider[]>();
  readonly dynamic: Collider[] = []; // traffic cars (refreshed every frame)

  constructor(colliders: Collider[]) {
    for (const c of colliders) {
      const r = c.kind === 'circle' ? c.hx : Math.hypot(c.hx, c.hz);
      const x0 = Math.floor((c.x - r) / this.cell), x1 = Math.floor((c.x + r) / this.cell);
      const z0 = Math.floor((c.z - r) / this.cell), z1 = Math.floor((c.z + r) / this.cell);
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
        const k = `${i},${j}`;
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(c);
      }
    }
  }

  query(x: number, z: number, r: number, out: Collider[] = []) {
    out.length = 0;
    const seen = new Set<Collider>();
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell);
    const z0 = Math.floor((z - r) / this.cell), z1 = Math.floor((z + r) / this.cell);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const arr = this.grid.get(`${i},${j}`);
      if (arr) for (const c of arr) if (!seen.has(c)) { seen.add(c); out.push(c); }
    }
    for (const c of this.dynamic) if (Math.abs(c.x - x) < r + 4 && Math.abs(c.z - z) < r + 4) out.push(c);
    return out;
  }

  /** Segment (camera ray) vs building boxes in XZ, returns the hit fraction (1 = clear). */
  raycastBuildings(ax: number, az: number, bx: number, bz: number, y: number, heights: (c: Collider) => number): number {
    let tMin = 1;
    const cand = this.query((ax + bx) / 2, (az + bz) / 2, Math.hypot(bx - ax, bz - az) / 2 + 2);
    for (const c of cand) {
      if (c.kind !== 'box' || (c.tag !== 'building' && c.tag !== 'wall')) continue;
      if (y > heights(c)) continue;
      const pad = 0.4;
      const minX = c.x - c.hx - pad, maxX = c.x + c.hx + pad, minZ = c.z - c.hz - pad, maxZ = c.z + c.hz + pad;
      const dx = bx - ax, dz = bz - az;
      let t0 = 0, t1 = 1;
      for (const [p, d, lo, hi] of [[ax, dx, minX, maxX], [az, dz, minZ, maxZ]]) {
        if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = 2; break; } continue; }
        let ta = (lo - p) / d, tb = (hi - p) / d;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) break;
      }
      if (t0 <= t1 && t0 < tMin && t0 >= 0) tMin = t0;
    }
    return tMin;
  }

  private tmp: Collider[] = [];

  resolveCar(car: VehiclePhysics, halfW: number, halfL: number): Impact | null {
    let worst: Impact | null = null;
    for (let iter = 0; iter < 3; iter++) {
      const cand = this.query(car.x, car.z, halfL + 1, this.tmp);
      let any = false;
      for (const c of cand) {
        const hit = c.kind === 'circle' ? this.carVsCircle(car, halfW, halfL, c) : this.carVsBox(car, halfW, halfL, c);
        if (!hit) continue;
        any = true;
        const sp = this.respond(car, hit.nx, hit.nz, hit.depth, hit.px, hit.pz);
        if (!worst || sp > worst.speed) worst = { speed: sp, x: hit.px, z: hit.pz, tag: c.tag };
      }
      if (!any) break;
    }
    return worst;
  }

  private carVsCircle(car: VehiclePhysics, hw: number, hl: number, c: Collider) {
    const s = Math.sin(car.heading), co = Math.cos(car.heading);
    const dx = c.x - car.x, dz = c.z - car.z;
    // local: lx along left (+X at heading 0), lz along forward
    const lx = dx * co - dz * s, lz = dx * s + dz * co;
    const cx = Math.max(-hw, Math.min(hw, lx)), cz = Math.max(-hl, Math.min(hl, lz));
    const ex = lx - cx, ez = lz - cz;
    const d2 = ex * ex + ez * ez;
    const r = c.hx;
    if (d2 > r * r) return null;
    let nlx: number, nlz: number, depth: number;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      nlx = -ex / d; nlz = -ez / d; depth = r - d;
    } else {
      // centre inside the box: push along the smallest axis
      const px = hw - Math.abs(lx), pz = hl - Math.abs(lz);
      if (px < pz) { nlx = -Math.sign(lx); nlz = 0; depth = px + r; } else { nlx = 0; nlz = -Math.sign(lz); depth = pz + r; }
    }
    // back to world (inverse rotation)
    const nx = nlx * co + nlz * s, nz = -nlx * s + nlz * co;
    const px = car.x + cx * co + cz * s, pz = car.z - cx * s + cz * co;
    return { nx, nz, depth, px, pz };
  }

  private carVsBox(car: VehiclePhysics, hw: number, hl: number, c: Collider) {
    // SAT on the 4 axes (car left/forward, box local x/z)
    const s = Math.sin(car.heading), co = Math.cos(car.heading);
    const cAxes: [number, number][] = [[co, -s], [s, co]]; // car left, car forward (world)
    const bs = Math.sin(c.rot), bc = Math.cos(c.rot);
    const bAxes: [number, number][] = [[bc, -bs], [bs, bc]];
    const dx = c.x - car.x, dz = c.z - car.z;
    let best = Infinity, bnx = 0, bnz = 0;
    const axes = [...cAxes, ...bAxes];
    for (const [ax, az] of axes) {
      const rCar = hw * Math.abs(cAxes[0][0] * ax + cAxes[0][1] * az) + hl * Math.abs(cAxes[1][0] * ax + cAxes[1][1] * az);
      const rBox = c.hx * Math.abs(bAxes[0][0] * ax + bAxes[0][1] * az) + c.hz * Math.abs(bAxes[1][0] * ax + bAxes[1][1] * az);
      const dist = dx * ax + dz * az;
      const overlap = rCar + rBox - Math.abs(dist);
      if (overlap <= 0) return null;
      if (overlap < best) { best = overlap; const sg = dist > 0 ? -1 : 1; bnx = ax * sg; bnz = az * sg; }
    }
    // contact point: the car corner deepest along -n
    let px = car.x, pz = car.z, deepest = Infinity;
    for (const [a, b] of [[hw, hl], [-hw, hl], [hw, -hl], [-hw, -hl]]) {
      const wx = car.x + cAxes[0][0] * a + cAxes[1][0] * b, wz = car.z + cAxes[0][1] * a + cAxes[1][1] * b;
      const d = wx * bnx + wz * bnz;
      if (d < deepest) { deepest = d; px = wx; pz = wz; }
    }
    return { nx: bnx, nz: bnz, depth: best, px, pz };
  }

  /** Returns the impact speed along the normal (m/s). */
  private respond(car: VehiclePhysics, nx: number, nz: number, depth: number, px: number, pz: number) {
    car.x += nx * (depth + 0.002);
    car.z += nz * (depth + 0.002);
    const vn = car.vx * nx + car.vz * nz;
    if (vn >= 0) return 0;
    const e = 0.22;
    const dvx = -(1 + e) * vn * nx, dvz = -(1 + e) * vn * nz;
    car.vx += dvx; car.vz += dvz;
    // tangential scrub
    const tx = -nz, tz = nx;
    const vt = car.vx * tx + car.vz * tz;
    const scrub = Math.min(Math.abs(vt), Math.abs(vn) * 0.6) * Math.sign(vt);
    car.vx -= tx * scrub; car.vz -= tz * scrub;
    // yaw impulse from the contact offset
    const rx = px - car.x, rz = pz - car.z;
    car.yawRate += ((rz * dvx - rx * dvz) / 2.1) * 0.55;
    return -vn;
  }
}
