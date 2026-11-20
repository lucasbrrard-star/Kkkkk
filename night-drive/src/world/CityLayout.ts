import { rng, type Rng } from '../core/math';

/**
 * Pure data description of the city: road grid, blocks, lots, street furniture positions and
 * colliders. Rendering modules read from here; nothing in this file touches Three.js.
 *
 * Coordinate system: Y up, ground at y = 0. "NS" roads run along Z (fixed x), "EW" roads run
 * along X (fixed z). Traffic drives on the right.
 */
export interface Road {
  dir: 'ns' | 'ew';
  pos: number; // x for NS roads, z for EW roads
  width: number; // asphalt width, curb to curb
  median: number; // width of the raised central median (0 = none)
  lanesPerDir: number;
  name: string;
  from: number;
  to: number;
}

export type BlockKind = 'downtown' | 'shops' | 'parking' | 'park' | 'gas' | 'plaza' | 'outer';

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

export interface Block extends Rect { kind: BlockKind; id: number }

export interface Building extends Rect {
  height: number;
  style: number; // facade style index
  tint: [number, number, number];
  seed: number;
  shop: boolean; // lit storefront at street level
  neonEdge: number; // 0 none, else hue (0..1) of roof outline
  setback?: { rect: Rect; height: number }; // stepped upper volume
  face: 'n' | 's' | 'e' | 'w'; // main facade direction (towards the main street)
}

export interface Lamp { x: number; z: number; rot: number; height: number; warm: boolean }
export interface Palm { x: number; z: number; h: number; lean: number; rot: number }
export interface Tree { x: number; z: number; s: number }
export interface Prop { kind: 'bench' | 'bin' | 'hydrant' | 'bollard' | 'busstop' | 'cone' | 'barrier'; x: number; z: number; rot: number }
export interface Sign { text: string; x: number; y: number; z: number; rot: number; w: number; h: number; color: string; color2?: string; style: 'neon' | 'board' | 'vertical'; flicker: number }
export interface TrafficLight { x: number; z: number; rot: number; axis: 'ns' | 'ew'; ix: number; iz: number }
export interface ParkedCar { x: number; z: number; rot: number; color: number }

export interface Collider {
  kind: 'box' | 'circle';
  x: number; z: number; // center
  hx: number; hz: number; // half extents (box) / radius in hx (circle)
  rot: number; // box rotation around Y
  tag: 'building' | 'prop' | 'tree' | 'wall' | 'car';
}

export const CURB_HEIGHT = 0.15;
export const SIDEWALK = 4.5;

export class CityLayout {
  readonly ns: Road[] = [];
  readonly ew: Road[] = [];
  readonly blocks: Block[] = [];
  readonly buildings: Building[] = [];
  readonly lamps: Lamp[] = [];
  readonly palms: Palm[] = [];
  readonly trees: Tree[] = [];
  readonly props: Prop[] = [];
  readonly signs: Sign[] = [];
  readonly trafficLights: TrafficLight[] = [];
  readonly parked: ParkedCar[] = [];
  readonly colliders: Collider[] = [];
  readonly medians: Rect[] = [];
  readonly grass: Rect[] = [];
  readonly lots: Rect[] = []; // asphalt parking lots (inside blocks)
  readonly bounds: Rect; // drivable extents (inside the outer wall)
  readonly world: Rect; // everything that is rendered on the ground
  readonly spawn = { x: -5.0, z: -76, heading: 0 };

  private r: Rng = rng(1337);

  constructor() {
    const X = [-150, -75, 0, 75, 150];
    const Z = [-180, -90, 0, 90, 180];
    for (const x of X) {
      const boulevard = x === 0;
      this.ns.push({ dir: 'ns', pos: x, width: boulevard ? 21 : 13, median: boulevard ? 3 : 0, lanesPerDir: boulevard ? 2 : 1, name: boulevard ? 'Neon Boulevard' : `Rua ${X.indexOf(x) + 1}`, from: Z[0], to: Z[Z.length - 1] });
    }
    for (const z of Z) {
      const avenue = z === 0;
      this.ew.push({ dir: 'ew', pos: z, width: avenue ? 16 : 13, median: 0, lanesPerDir: avenue ? 2 : 1, name: avenue ? 'Avenida Central' : `Travessa ${Z.indexOf(z) + 1}`, from: X[0], to: X[X.length - 1] });
    }
    const outerNS = this.ns[0], outerNS2 = this.ns[this.ns.length - 1];
    const outerEW = this.ew[0], outerEW2 = this.ew[this.ew.length - 1];
    this.bounds = {
      minX: outerNS.pos - outerNS.width / 2 - SIDEWALK, maxX: outerNS2.pos + outerNS2.width / 2 + SIDEWALK,
      minZ: outerEW.pos - outerEW.width / 2 - SIDEWALK, maxZ: outerEW2.pos + outerEW2.width / 2 + SIDEWALK,
    };
    const ring = 46;
    this.world = { minX: this.bounds.minX - ring, maxX: this.bounds.maxX + ring, minZ: this.bounds.minZ - ring, maxZ: this.bounds.maxZ + ring };
    // Roads stop at the outer ring roads
    for (const r of this.ns) { r.from = outerEW.pos - outerEW.width / 2; r.to = outerEW2.pos + outerEW2.width / 2; }
    for (const r of this.ew) { r.from = outerNS.pos - outerNS.width / 2; r.to = outerNS2.pos + outerNS2.width / 2; }

    this.buildBlocks(X, Z);
    this.buildMedians();
    for (const b of this.blocks) this.populateBlock(b);
    this.buildStreetFurniture();
    this.buildOuterRing();
    this.buildSigns();
  }

  // ---------------------------------------------------------------- queries
  roadAt(x: number, z: number): Road | null {
    for (const r of this.ns) if (Math.abs(x - r.pos) <= r.width / 2 && z >= r.from && z <= r.to) return r;
    for (const r of this.ew) if (Math.abs(z - r.pos) <= r.width / 2 && x >= r.from && x <= r.to) return r;
    return null;
  }

  /** Height of the drivable surface (roads 0, blocks/sidewalks/medians raised by the curb). */
  groundHeight(x: number, z: number): number {
    for (const m of this.medians) if (x > m.minX && x < m.maxX && z > m.minZ && z < m.maxZ) return CURB_HEIGHT;
    if (this.roadAt(x, z)) return 0;
    return CURB_HEIGHT;
  }

  // ---------------------------------------------------------------- generation
  private buildBlocks(X: number[], Z: number[]) {
    // kinds for the 4x4 inner blocks, indexed [ix][iz]
    const plan: BlockKind[][] = [
      ['shops', 'parking', 'downtown', 'park'],
      ['downtown', 'shops', 'downtown', 'shops'],
      ['shops', 'downtown', 'shops', 'downtown'],
      ['plaza', 'gas', 'downtown', 'shops'],
    ];
    let id = 0;
    for (let i = 0; i < X.length - 1; i++) {
      for (let j = 0; j < Z.length - 1; j++) {
        const a = this.ns[i], b = this.ns[i + 1], c = this.ew[j], d = this.ew[j + 1];
        this.blocks.push({ id: id++, kind: plan[i][j], minX: a.pos + a.width / 2, maxX: b.pos - b.width / 2, minZ: c.pos + c.width / 2, maxZ: d.pos - d.width / 2 });
      }
    }
  }

  private buildMedians() {
    for (const r of this.ns) {
      if (!r.median) continue;
      // median broken at every intersection
      const cuts = this.ew.map((e) => [e.pos - e.width / 2 - 1.5, e.pos + e.width / 2 + 1.5]);
      for (let k = 0; k < cuts.length - 1; k++) {
        const m: Rect = { minX: r.pos - r.median / 2, maxX: r.pos + r.median / 2, minZ: cuts[k][1] + 6, maxZ: cuts[k + 1][0] - 6 };
        this.medians.push(m);
        for (let z = m.minZ + 4; z < m.maxZ - 2; z += 11) {
          this.palms.push({ x: r.pos, z, h: this.r.range(9, 13), lean: this.r.range(0, 0.12), rot: this.r.range(0, Math.PI * 2) });
          this.colliders.push({ kind: 'circle', x: r.pos, z, hx: 0.45, hz: 0.45, rot: 0, tag: 'tree' });
        }
      }
    }
  }

  private inner(b: Rect, inset: number): Rect {
    return { minX: b.minX + inset, maxX: b.maxX - inset, minZ: b.minZ + inset, maxZ: b.maxZ - inset };
  }

  private addBuilding(rect: Rect, height: number, face: Building['face'], opts: Partial<Building> = {}) {
    const r = this.r;
    const palette: [number, number, number][] = [
      [0.32, 0.33, 0.36], [0.24, 0.25, 0.29], [0.42, 0.38, 0.34], [0.18, 0.2, 0.24], [0.36, 0.3, 0.3], [0.5, 0.48, 0.45], [0.22, 0.24, 0.22],
    ];
    const bld: Building = {
      ...rect, height, face, style: r.int(0, 3), tint: r.pick(palette), seed: r.next() * 1000,
      shop: false, neonEdge: 0, ...opts,
    };
    if (height > 45 && r.chance(0.55)) {
      const w = rect.maxX - rect.minX, d = rect.maxZ - rect.minZ;
      const ix = w * r.range(0.12, 0.22), iz = d * r.range(0.12, 0.22);
      bld.setback = { rect: { minX: rect.minX + ix, maxX: rect.maxX - ix, minZ: rect.minZ + iz, maxZ: rect.maxZ - iz }, height: height + r.range(12, 40) };
    }
    if (height > 35 && r.chance(0.45)) bld.neonEdge = r.pick([0.83, 0.52, 0.92, 0.6, 0.75]);
    this.buildings.push(bld);
    this.colliders.push({ kind: 'box', x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2, hx: (rect.maxX - rect.minX) / 2, hz: (rect.maxZ - rect.minZ) / 2, rot: 0, tag: 'building' });
    return bld;
  }

  /** Splits the edge of a block into building lots facing the street. */
  private perimeterLots(b: Rect, depth: number, minW: number, maxW: number, fill: (rect: Rect, face: Building['face'], corner: boolean) => void) {
    const r = this.r;
    const inn = this.inner(b, SIDEWALK);
    // south and north rows span the full width (they take the corners)
    const rows: [Building['face'], number, number, number, number][] = [
      ['s', inn.minX, inn.maxX, inn.minZ, inn.minZ + depth],
      ['n', inn.minX, inn.maxX, inn.maxZ - depth, inn.maxZ],
    ];
    for (const [face, x0, x1, z0, z1] of rows) {
      let x = x0;
      while (x < x1 - 4) {
        let w = Math.min(r.range(minW, maxW), x1 - x);
        if (x1 - (x + w) < minW * 0.7) w = x1 - x;
        fill({ minX: x + 0.3, maxX: x + w - 0.3, minZ: z0, maxZ: z1 }, face, x === x0 || x + w >= x1);
        x += w;
      }
    }
    // west and east columns between the rows
    const cols: [Building['face'], number, number, number, number][] = [
      ['w', inn.minX, inn.minX + depth, inn.minZ + depth, inn.maxZ - depth],
      ['e', inn.maxX - depth, inn.maxX, inn.minZ + depth, inn.maxZ - depth],
    ];
    for (const [face, x0, x1, z0, z1] of cols) {
      let z = z0;
      while (z < z1 - 4) {
        let w = Math.min(r.range(minW, maxW), z1 - z);
        if (z1 - (z + w) < minW * 0.7) w = z1 - z;
        fill({ minX: x0, maxX: x1, minZ: z + 0.3, maxZ: z + w - 0.3 }, face, false);
        z += w;
      }
    }
  }

  private populateBlock(b: Block) {
    const r = this.r;
    const nearBoulevard = Math.min(Math.abs(b.minX), Math.abs(b.maxX)) < 15;
    switch (b.kind) {
      case 'downtown': {
        const depth = Math.min(26, (b.maxX - b.minX - 2 * SIDEWALK) / 2 - 1, (b.maxZ - b.minZ - 2 * SIDEWALK) / 2 - 1);
        this.perimeterLots(b, depth, 16, 28, (rect, face, corner) => {
          const h = corner ? r.range(70, 150) : r.range(28, 95);
          this.addBuilding(rect, h, face, { shop: r.chance(0.6), style: r.int(0, 3) });
        });
        // courtyard: a small plaza with trees
        const c = this.inner(b, SIDEWALK + depth + 2);
        if (c.maxX - c.minX > 6 && c.maxZ - c.minZ > 6) this.grass.push(c);
        break;
      }
      case 'shops': {
        const depth = 18;
        this.perimeterLots(b, depth, 10, 18, (rect, face) => {
          const tall = r.chance(0.25);
          this.addBuilding(rect, tall ? r.range(30, 60) : r.range(8, 22), face, { shop: true, style: r.int(0, 3) });
        });
        const c = this.inner(b, SIDEWALK + depth);
        this.lots.push(c);
        for (let k = 0; k < 6; k++) this.parked.push({ x: r.range(c.minX + 3, c.maxX - 3), z: r.range(c.minZ + 3, c.maxZ - 3), rot: r.chance(0.5) ? 0 : Math.PI / 2, color: r.int(0, 7) });
        break;
      }
      case 'parking': {
        const inn = this.inner(b, SIDEWALK);
        this.lots.push(inn);
        // parking rows: stalls along X, aisles between
        const rowsZ = [inn.minZ + 6, inn.minZ + 22, inn.minZ + 30, inn.minZ + 46, inn.minZ + 54, inn.minZ + 70];
        for (const z of rowsZ) {
          if (z > inn.maxZ - 4) continue;
          for (let x = inn.minX + 4; x < inn.maxX - 3; x += 2.9) if (r.chance(0.55)) this.parked.push({ x, z, rot: Math.PI / 2 * (r.chance(0.5) ? 1 : -1) + Math.PI / 2, color: r.int(0, 7) });
        }
        for (let x = inn.minX + 8; x < inn.maxX - 4; x += 22) for (const z of [inn.minZ + 14, inn.minZ + 38, inn.minZ + 62]) if (z < inn.maxZ - 4) this.lamps.push({ x, z, rot: 0, height: 8, warm: false });
        // kiosk
        this.addBuilding({ minX: inn.maxX - 9, maxX: inn.maxX - 1, minZ: inn.maxZ - 7, maxZ: inn.maxZ - 1 }, 3.6, 'w', { shop: true, style: 1 });
        break;
      }
      case 'park': {
        const inn = this.inner(b, SIDEWALK);
        this.grass.push(inn);
        for (let k = 0; k < 28; k++) {
          const x = r.range(inn.minX + 3, inn.maxX - 3), z = r.range(inn.minZ + 3, inn.maxZ - 3);
          if (Math.abs(x - (inn.minX + inn.maxX) / 2) < 3.5 || Math.abs(z - (inn.minZ + inn.maxZ) / 2) < 3.5) continue; // paths
          const s = r.range(0.8, 1.3);
          this.trees.push({ x, z, s });
          this.colliders.push({ kind: 'circle', x, z, hx: 0.35 * s, hz: 0, rot: 0, tag: 'tree' });
        }
        const cx = (inn.minX + inn.maxX) / 2, cz = (inn.minZ + inn.maxZ) / 2;
        for (const [dx, dz] of [[-6, 0], [6, 0], [0, -6], [0, 6]]) this.props.push({ kind: 'bench', x: cx + dx, z: cz + dz, rot: Math.atan2(dx, dz) });
        this.lamps.push({ x: cx - 10, z: cz - 10, rot: 0, height: 5, warm: true }, { x: cx + 10, z: cz + 10, rot: 0, height: 5, warm: true });
        break;
      }
      case 'gas': {
        const inn = this.inner(b, SIDEWALK);
        this.lots.push(inn);
        this.addBuilding({ minX: inn.maxX - 18, maxX: inn.maxX - 2, minZ: inn.minZ + 30, maxZ: inn.minZ + 44 }, 5, 'w', { shop: true, style: 1, tint: [0.7, 0.7, 0.72] });
        // canopy pillars are colliders, the roof is decoration (Props/Decor)
        const cx = inn.minX + 24, cz = inn.minZ + 30;
        for (const [dx, dz] of [[-8, -6], [8, -6], [-8, 6], [8, 6]]) this.colliders.push({ kind: 'circle', x: cx + dx, z: cz + dz, hx: 0.4, hz: 0, rot: 0, tag: 'prop' });
        for (const dz of [-6, 6]) for (const dx of [-3, 3]) this.colliders.push({ kind: 'box', x: cx + dx, z: cz + dz * 0.4, hx: 0.5, hz: 0.9, rot: 0, tag: 'prop' });
        break;
      }
      case 'plaza': {
        const inn = this.inner(b, SIDEWALK);
        const depth = 16;
        this.perimeterLots({ ...b, minZ: b.maxZ - 40 }, depth, 12, 20, (rect, face) => this.addBuilding(rect, r.range(14, 40), face, { shop: true }));
        const p: Rect = { minX: inn.minX + 4, maxX: inn.maxX - 4, minZ: inn.minZ + 4, maxZ: b.maxZ - 40 - 2 };
        for (let k = 0; k < 10; k++) {
          const x = r.range(p.minX + 2, p.maxX - 2), z = r.range(p.minZ + 2, p.maxZ - 2);
          this.palms.push({ x, z, h: r.range(7, 11), lean: r.range(0, 0.2), rot: r.range(0, 6.28) });
          this.colliders.push({ kind: 'circle', x, z, hx: 0.45, hz: 0, rot: 0, tag: 'tree' });
        }
        break;
      }
      default:
        break;
    }
    void nearBoulevard;
  }

  private buildStreetFurniture() {
    const r = this.r;
    const lampStep = 26;
    // lamps along both sidewalks of each road segment (between intersections)
    const segs = (road: Road, cross: Road[]) => {
      const out: [number, number][] = [];
      const cuts = cross.map((c) => [c.pos - c.width / 2 - SIDEWALK, c.pos + c.width / 2 + SIDEWALK]).sort((a, b) => a[0] - b[0]);
      for (let k = 0; k < cuts.length - 1; k++) out.push([cuts[k][1], cuts[k + 1][0]]);
      return out;
    };
    for (const road of this.ns) {
      for (const [a, b] of segs(road, this.ew)) {
        for (const side of [-1, 1]) {
          const x = road.pos + side * (road.width / 2 + 0.7);
          const n = Math.max(1, Math.round((b - a) / lampStep));
          for (let k = 0; k < n; k++) {
            const z = a + ((k + 0.5) * (b - a)) / n + (side > 0 ? lampStep / 2 / n : 0) * 0;
            this.lamps.push({ x, z, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2, height: road.median ? 9.5 : 8, warm: !road.median });
            this.colliders.push({ kind: 'circle', x, z, hx: 0.22, hz: 0, rot: 0, tag: 'prop' });
            // a few props between lamps
            const pz = z + lampStep / 2 / n;
            if (pz < b - 2 && r.chance(0.5)) {
              const kind = r.pick(['bench', 'bin', 'hydrant', 'bin'] as const);
              const px = road.pos + side * (road.width / 2 + (kind === 'bench' ? 2.6 : 0.8));
              this.props.push({ kind, x: px, z: pz, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
              this.colliders.push({ kind: 'circle', x: px, z: pz, hx: kind === 'bench' ? 0.9 : 0.35, hz: 0, rot: 0, tag: 'prop' });
            }
          }
          // street-side trees on the non-boulevard roads
          if (!road.median) {
            for (let z = a + 9; z < b - 6; z += 26) {
              const x2 = road.pos + side * (road.width / 2 + 2.6);
              if (r.chance(0.6)) { this.trees.push({ x: x2, z, s: r.range(0.75, 1.0) }); this.colliders.push({ kind: 'circle', x: x2, z, hx: 0.3, hz: 0, rot: 0, tag: 'tree' }); }
            }
          } else {
            for (let z = a + 6; z < b - 4; z += 13) {
              const x2 = road.pos + side * (road.width / 2 + 2.8);
              this.palms.push({ x: x2, z, h: r.range(10, 14), lean: r.range(0.02, 0.14), rot: r.range(0, 6.28) });
              this.colliders.push({ kind: 'circle', x: x2, z, hx: 0.42, hz: 0, rot: 0, tag: 'tree' });
            }
          }
        }
      }
    }
    for (const road of this.ew) {
      for (const [a, b] of segs(road, this.ns)) {
        for (const side of [-1, 1]) {
          const z = road.pos + side * (road.width / 2 + 0.7);
          const n = Math.max(1, Math.round((b - a) / lampStep));
          for (let k = 0; k < n; k++) {
            const x = a + ((k + 0.5) * (b - a)) / n;
            this.lamps.push({ x, z, rot: side > 0 ? Math.PI : 0, height: 8, warm: road.width < 15 });
            this.colliders.push({ kind: 'circle', x, z, hx: 0.22, hz: 0, rot: 0, tag: 'prop' });
          }
          for (let x = a + 9; x < b - 6; x += 24) {
            const z2 = road.pos + side * (road.width / 2 + 2.6);
            if (r.chance(0.55)) { this.trees.push({ x, z: z2, s: r.range(0.75, 1.0) }); this.colliders.push({ kind: 'circle', x, z: z2, hx: 0.3, hz: 0, rot: 0, tag: 'tree' }); }
          }
        }
      }
    }
    // traffic lights: one signal per approach corner at every intersection
    this.ns.forEach((a, ix) => this.ew.forEach((b, iz) => {
      const hx = a.width / 2 + 0.6, hz = b.width / 2 + 0.6;
      // NS traffic heading +Z stops before z = b.pos - hz; its signal stands on the far right corner
      this.trafficLights.push({ x: a.pos - hx, z: b.pos + hz, rot: 0, axis: 'ns', ix, iz });
      this.trafficLights.push({ x: a.pos + hx, z: b.pos - hz, rot: Math.PI, axis: 'ns', ix, iz });
      this.trafficLights.push({ x: a.pos + hx, z: b.pos + hz, rot: Math.PI / 2, axis: 'ew', ix, iz });
      this.trafficLights.push({ x: a.pos - hx, z: b.pos - hz, rot: -Math.PI / 2, axis: 'ew', ix, iz });
      for (const [x, z] of [[a.pos - hx, b.pos + hz], [a.pos + hx, b.pos - hz], [a.pos + hx, b.pos + hz], [a.pos - hx, b.pos - hz]]) {
        this.colliders.push({ kind: 'circle', x, z, hx: 0.25, hz: 0, rot: 0, tag: 'prop' });
      }
    }));
    // remove lamps/props that collide with intersections' corners or with trees
  }

  /** Buildings outside the ring roads close the playable area (with a solid wall collider). */
  private buildOuterRing() {
    const r = this.r;
    const B = this.bounds, W = this.world;
    const strips: [Rect, Building['face']][] = [
      [{ minX: W.minX, maxX: W.maxX, minZ: W.minZ, maxZ: B.minZ }, 'n'],
      [{ minX: W.minX, maxX: W.maxX, minZ: B.maxZ, maxZ: W.maxZ }, 's'],
      [{ minX: W.minX, maxX: B.minX, minZ: B.minZ, maxZ: B.maxZ }, 'e'],
      [{ minX: B.maxX, maxX: W.maxX, minZ: B.minZ, maxZ: B.maxZ }, 'w'],
    ];
    for (const [s, face] of strips) {
      const alongX = face === 'n' || face === 's';
      const len = alongX ? s.maxX - s.minX : s.maxZ - s.minZ;
      let t = 0;
      while (t < len - 2) {
        const w = Math.min(r.range(14, 30), len - t);
        const depth = r.range(14, 26);
        let rect: Rect;
        if (alongX) {
          const x0 = s.minX + t;
          rect = face === 'n' ? { minX: x0, maxX: x0 + w - 0.5, minZ: s.maxZ - depth, maxZ: s.maxZ } : { minX: x0, maxX: x0 + w - 0.5, minZ: s.minZ, maxZ: s.minZ + depth };
        } else {
          const z0 = s.minZ + t;
          rect = face === 'e' ? { minX: s.maxX - depth, maxX: s.maxX, minZ: z0, maxZ: z0 + w - 0.5 } : { minX: s.minX, maxX: s.minX + depth, minZ: z0, maxZ: z0 + w - 0.5 };
        }
        this.addBuilding(rect, r.range(18, 110), face, { shop: r.chance(0.5) });
        this.colliders.pop(); // the wall below handles collision for the ring
        t += w;
      }
    }
    const thick = 2;
    this.colliders.push(
      { kind: 'box', x: (B.minX + B.maxX) / 2, z: B.minZ - thick, hx: (B.maxX - B.minX) / 2 + 10, hz: thick, rot: 0, tag: 'wall' },
      { kind: 'box', x: (B.minX + B.maxX) / 2, z: B.maxZ + thick, hx: (B.maxX - B.minX) / 2 + 10, hz: thick, rot: 0, tag: 'wall' },
      { kind: 'box', x: B.minX - thick, z: (B.minZ + B.maxZ) / 2, hx: thick, hz: (B.maxZ - B.minZ) / 2 + 10, rot: 0, tag: 'wall' },
      { kind: 'box', x: B.maxX + thick, z: (B.minZ + B.maxZ) / 2, hx: thick, hz: (B.maxZ - B.minZ) / 2 + 10, rot: 0, tag: 'wall' },
    );
  }

  private buildSigns() {
    const r = this.r;
    const names = ['HOTEL ZENITH', 'NEON NOODLES', 'PULSE', 'KAIRO', 'ARCADE 88', 'SUSHI BAR', 'CINEMA', 'OPEN 24H', 'MOTEL', 'JAZZ CLUB', 'TACOS', 'VINYL', 'RAMEN', 'BAR', 'CAFÉ LUNA', 'PHARMA', 'DINER', 'KARAOKE', 'GYM 24', 'PIZZA'];
    const colors = ['#ff2bd6', '#28e8ff', '#ff4d6d', '#ffb02e', '#7cff6b', '#b46bff', '#ff7a1a', '#3d7bff'];
    // The hero sign from the art direction, on the first block west of the boulevard.
    // (visible on the driver's left right after spawning, like in the reference image)
    const hero = this.buildings
      .filter((b) => b.minX > 0 && b.minX < 25 && b.face === 'w' && b.minZ > -80 && b.maxZ < -5)
      .sort((a, b) => a.minZ - b.minZ)[0];
    if (hero) {
      hero.height = Math.max(hero.height, 16);
      this.signs.push({ text: 'NIGHT|DRIVE', x: hero.minX - 0.35, y: 10.5, z: (hero.minZ + hero.maxZ) / 2, rot: -Math.PI / 2, w: 9, h: 6, color: '#ff3fd0', style: 'neon', flicker: 0 });
      hero.shop = true;
    }
    for (const b of this.buildings) {
      if (b === hero || !b.shop) continue;
      if (Math.abs(b.minX) > 200 || Math.abs(b.minZ) > 230) continue;
      if (!r.chance(0.55)) continue;
      const text = r.pick(names), color = r.pick(colors);
      const vertical = b.height > 18 && r.chance(0.35);
      const w = vertical ? 1.6 : Math.min(r.range(4, 8), (b.face === 'n' || b.face === 's' ? b.maxX - b.minX : b.maxZ - b.minZ) - 1);
      const h = vertical ? Math.min(9, text.length * 1.1) : 1.4;
      const y = vertical ? r.range(6, 9) : 4.6;
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      const off = 0.32;
      let x = cx, z = cz, rot = 0;
      if (b.face === 's') { z = b.minZ - off; rot = Math.PI; }
      else if (b.face === 'n') { z = b.maxZ + off; rot = 0; }
      else if (b.face === 'e') { x = b.maxX + off; rot = Math.PI / 2; }
      else { x = b.minX - off; rot = -Math.PI / 2; }
      this.signs.push({ text, x, y: y + h / 2, z, rot, w, h, color, style: vertical ? 'vertical' : 'neon', flicker: r.chance(0.15) ? r.range(0.5, 1) : 0 });
    }
  }
}
