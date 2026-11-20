import * as THREE from 'three';
import { CityLayout, CURB_HEIGHT, SIDEWALK, type Rect, type Road } from './CityLayout';
import { SURF } from './WetGroundMaterial';

/** Accumulates quads into one indexed geometry (positions, normals, surface ids). */
class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  surf: number[] = [];
  idx: number[] = [];

  quad(a: number[], b: number[], c: number[], d: number[], n: number[], s: number) {
    const i = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    for (let k = 0; k < 4; k++) { this.nrm.push(...n); this.surf.push(s); }
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** Horizontal rectangle at height y, normal up. */
  flat(r: Rect, y: number, s: number) {
    this.quad([r.minX, y, r.maxZ], [r.maxX, y, r.maxZ], [r.maxX, y, r.minZ], [r.minX, y, r.minZ], [0, 1, 0], s);
  }

  /** Oriented flat quad (for markings): center, half sizes along/perp to `ang` (rad around Y). */
  stripe(cx: number, cz: number, hl: number, hw: number, ang: number, y: number, s: number) {
    const fx = Math.sin(ang), fz = Math.cos(ang); // along
    const rx = fz, rz = -fx; // perpendicular
    const p = (a: number, b: number) => [cx + fx * a + rx * b, y, cz + fz * a + rz * b];
    // winding so the normal points up
    this.quad(p(hl, -hw), p(hl, hw), p(-hl, hw), p(-hl, -hw), [0, 1, 0], s);
  }

  /** Raised box top + 4 sides (curbs). */
  slab(r: Rect, h: number, topSurf: number) {
    this.flat(r, h, topSurf);
    const { minX: x0, maxX: x1, minZ: z0, maxZ: z1 } = r;
    this.quad([x0, h, z1], [x0, 0, z1], [x1, 0, z1], [x1, h, z1], [0, 0, 1], SURF.curb);
    this.quad([x1, h, z0], [x1, 0, z0], [x0, 0, z0], [x0, h, z0], [0, 0, -1], SURF.curb);
    this.quad([x1, h, z1], [x1, 0, z1], [x1, 0, z0], [x1, h, z0], [1, 0, 0], SURF.curb);
    this.quad([x0, h, z0], [x0, 0, z0], [x0, 0, z1], [x0, h, z1], [-1, 0, 0], SURF.curb);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aSurf', new THREE.Float32BufferAttribute(this.surf, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const MARK_Y = 0.02;

/** Builds the whole drivable ground (roads, curbs, sidewalks, lots, medians, markings) as ONE mesh. */
export function buildGroundGeometry(city: CityLayout): THREE.BufferGeometry {
  const b = new Builder();
  const W = city.world;
  // asphalt base covering the whole playable area
  b.flat({ minX: city.bounds.minX - 1, maxX: city.bounds.maxX + 1, minZ: city.bounds.minZ - 1, maxZ: city.bounds.maxZ + 1 }, 0, SURF.road);
  // outer sidewalk/plaza ring outside the ring roads (under the outer buildings)
  const B = city.bounds;
  const ring: Rect[] = [
    { minX: W.minX, maxX: W.maxX, minZ: W.minZ, maxZ: B.minZ },
    { minX: W.minX, maxX: W.maxX, minZ: B.maxZ, maxZ: W.maxZ },
    { minX: W.minX, maxX: B.minX, minZ: B.minZ, maxZ: B.maxZ },
    { minX: B.maxX, maxX: W.maxX, minZ: B.minZ, maxZ: B.maxZ },
  ];
  // ring sidewalks are the 4.5 m strip next to the ring roads, i.e. already part of `bounds`;
  // the blocks below are raised slabs.
  const outerRing: Rect[] = [
    { minX: B.minX, maxX: B.maxX, minZ: B.minZ, maxZ: B.minZ + SIDEWALK },
    { minX: B.minX, maxX: B.maxX, minZ: B.maxZ - SIDEWALK, maxZ: B.maxZ },
    { minX: B.minX, maxX: B.minX + SIDEWALK, minZ: B.minZ + SIDEWALK, maxZ: B.maxZ - SIDEWALK },
    { minX: B.maxX - SIDEWALK, maxX: B.maxX, minZ: B.minZ + SIDEWALK, maxZ: B.maxZ - SIDEWALK },
  ];
  for (const r of [...ring, ...outerRing]) b.slab(r, CURB_HEIGHT, SURF.sidewalk);
  for (const blk of city.blocks) b.slab(blk, CURB_HEIGHT, SURF.sidewalk);
  for (const m of city.medians) b.slab(m, CURB_HEIGHT + 0.05, SURF.grass);
  for (const g of city.grass) b.flat(g, CURB_HEIGHT + 0.012, SURF.grass);
  for (const l of city.lots) b.flat(l, CURB_HEIGHT + 0.01, SURF.lot);

  // ---- road markings
  const cross = (road: Road) => (road.dir === 'ns' ? city.ew : city.ns);
  for (const road of [...city.ns, ...city.ew]) {
    const ang = road.dir === 'ns' ? 0 : Math.PI / 2;
    const along = (t: number, off: number) => (road.dir === 'ns' ? [road.pos + off, t] : [t, road.pos + off]);
    const cuts = cross(road).map((c) => [c.pos - c.width / 2, c.pos + c.width / 2]).sort((a, c) => a[0] - c[0]);
    for (let k = 0; k < cuts.length - 1; k++) {
      const a = cuts[k][1], e = cuts[k + 1][0];
      const s0 = a + 4.2, s1 = e - 4.2; // leave room for crosswalks
      const len = s1 - s0;
      if (len <= 2) continue;
      const mid = (s0 + s1) / 2;
      const hw = road.width / 2;
      const line = (off: number, w: number, surf: number, dashed: boolean) => {
        if (!dashed) {
          const [x, z] = along(mid, off);
          b.stripe(x, z, len / 2, w / 2, ang, MARK_Y, surf);
        } else {
          for (let t = s0 + 1.5; t < s1 - 1.5; t += 9) {
            const [x, z] = along(t + 1.5, off);
            b.stripe(x, z, 1.5, w / 2, ang, MARK_Y, surf);
          }
        }
      };
      if (road.median) {
        const m = road.median / 2;
        for (const sgn of [-1, 1]) {
          line(sgn * (m + 0.35), 0.12, SURF.paintYellow, false);
          line(sgn * (m + 3.6), 0.13, SURF.paintWhite, true);
          line(sgn * (hw - 0.45), 0.13, SURF.paintWhite, false);
        }
      } else if (road.lanesPerDir === 2) {
        line(-0.13, 0.11, SURF.paintYellow, false);
        line(0.13, 0.11, SURF.paintYellow, false);
        for (const sgn of [-1, 1]) {
          line(sgn * 3.75, 0.13, SURF.paintWhite, true);
          line(sgn * (hw - 0.4), 0.13, SURF.paintWhite, false);
        }
      } else {
        line(-0.13, 0.11, SURF.paintYellow, false);
        line(0.13, 0.11, SURF.paintYellow, false);
        for (const sgn of [-1, 1]) line(sgn * (hw - 2.3), 0.13, SURF.paintWhite, false);
        // parking bays
        for (const sgn of [-1, 1]) for (let t = s0 + 3; t < s1 - 3; t += 5.5) {
          const [x, z] = along(t, sgn * (hw - 1.15));
          b.stripe(x, z, 0.07, 1.1, ang, MARK_Y, SURF.paintWhite);
        }
      }
      // crosswalks + stop lines at both ends
      for (const [edge, dirSign] of [[a, 1], [e, -1]] as const) {
        const cw = edge + dirSign * 2.1;
        for (let off = -hw + 0.9; off < hw - 0.5; off += 1.1) {
          if (road.median && Math.abs(off) < road.median / 2 + 0.2) continue;
          const [x, z] = along(cw, off + 0.27);
          b.stripe(x, z, 1.6, 0.27, ang, MARK_Y, SURF.paintWhite);
        }
        // stop line on the incoming side (right-hand traffic)
        const inner = road.median ? road.median / 2 : 0.25;
        const span = hw - inner - 0.4;
        const centerOff = dirSign > 0 ? -(inner + span / 2) * -1 : -(inner + span / 2);
        // traffic heading +axis uses the negative-x (NS) / positive-z (EW) half; see TrafficLights
        const side = road.dir === 'ns' ? (dirSign > 0 ? 1 : -1) : (dirSign > 0 ? -1 : 1);
        const [x, z] = along(edge + dirSign * 4.0, side * Math.abs(centerOff));
        b.stripe(x, z, 0.22, span / 2, ang, MARK_Y, SURF.paintWhite);
      }
    }
  }
  // parking lot stalls
  for (const p of city.parked) {
    void p;
  }
  for (const l of city.lots) {
    const w = l.maxX - l.minX;
    if (w < 20) continue;
    for (const z of [l.minZ + 6, l.minZ + 22, l.minZ + 30, l.minZ + 46, l.minZ + 54, l.minZ + 70]) {
      if (z > l.maxZ - 4) continue;
      for (let x = l.minX + 2.55; x < l.maxX - 1.5; x += 2.9) b.stripe(x, z, 2.5, 0.06, 0, CURB_HEIGHT + 0.025, SURF.paintWhite);
    }
  }
  return b.build();
}
