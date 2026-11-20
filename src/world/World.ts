// Renderização do mundo: tilemap isométrico em camadas + objetos posicionados
// com ordenação de profundidade. Não contém regras de jogo.
import Phaser from 'phaser';
import { depthOf, toScreen } from '../core/iso';
import { MapDef, N, T, WorldObject } from './MapData';

export const DEPTH = {
  ground: -100000, sand: -99000, water: -98000, foam: -97500, road: -97000, walk: -96500,
  shadows: -90000, actorsBase: 0, overlay: 80000, glow: 85000, birds: 70000, marker: 95000,
};

export interface Meta {
  tile: { w: number; h: number; cols: number; count: number; index: Record<string, number>; waterFrames: number };
  character: { frameW: number; frameH: number; anchorX: number; anchorY: number; dirs: string[]; player: { cols: number; layout: Record<string, { start: number; frames: number }> }; npc: { cols: number; layout: Record<string, { start: number; frames: number }> } };
}

interface AnimatedObj { sprite: Phaser.GameObjects.Image; shadow?: Phaser.GameObjects.Image; base: string; frames: number; fps: number; pingpong: boolean; phase: number; cur: number }

export interface BigObj { obj: WorldObject; sprite: Phaser.GameObjects.Image; depth: number; rect: { x0: number; y0: number; x1: number; y1: number } }

const hash = (x: number, y: number, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

export class World {
  map!: Phaser.Tilemaps.Tilemap;
  layers: Record<string, Phaser.Tilemaps.TilemapLayer> = {};
  private waterTiles: { tile: Phaser.Tilemaps.Tile; base: number }[] = [];
  private foamTiles: { tile: Phaser.Tilemaps.Tile; base: number }[] = [];
  private animated: AnimatedObj[] = [];
  bigs: BigObj[] = [];
  sprites: { img: Phaser.GameObjects.Image; x: number; y: number; alpha: number }[] = [];
  glows: { img: Phaser.GameObjects.Image; phase: number }[] = [];
  private waterFrame = 0;
  private waterTimer = 0;
  waterDist: Uint8Array;

  constructor(private scene: Phaser.Scene, public def: MapDef, private meta: Meta) {
    this.waterDist = new Uint8Array(N * N);
    this.computeWaterDistance();
    this.buildTilemap();
    this.buildObjects();
  }

  terrainAt(x: number, y: number): T {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) return T.Water;
    return this.def.terrain[ty * N + tx];
  }

  private computeWaterDistance() {
    const t = this.def.terrain;
    const q: number[] = [];
    this.waterDist.fill(255);
    for (let i = 0; i < N * N; i++) if (t[i] !== T.Water) { this.waterDist[i] = 0; q.push(i); }
    while (q.length) {
      const i = q.shift()!;
      const x = i % N, y = (i / N) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const j = ny * N + nx;
        if (this.waterDist[j] > this.waterDist[i] + 1) { this.waterDist[j] = this.waterDist[i] + 1; q.push(j); }
      }
    }
  }

  private buildTilemap() {
    const { w, h } = this.meta.tile;
    const md = new Phaser.Tilemaps.MapData({
      width: N, height: N, tileWidth: w, tileHeight: h,
      orientation: Phaser.Tilemaps.Orientation.ISOMETRIC as unknown as number,
      format: Phaser.Tilemaps.Formats.ARRAY_2D,
    } as Phaser.Types.Tilemaps.MapDataConfig);
    this.map = new Phaser.Tilemaps.Tilemap(this.scene, md);
    const ts = this.map.addTilesetImage('tiles', 'tiles', w, h, 0, 0)!;
    const mk = (name: string, depth: number) => {
      const l = this.map.createBlankLayer(name, ts, -w / 2, 0)!;
      l.setDepth(depth);
      l.setCullPadding(4, 4);
      this.layers[name] = l;
      return l;
    };
    const L = {
      solo: mk('solo', DEPTH.ground),
      areia: mk('areia', DEPTH.sand),
      agua: mk('agua', DEPTH.water),
      espuma: mk('espuma', DEPTH.foam),
      ruas: mk('ruas', DEPTH.road),
      calcadas: mk('calcadas', DEPTH.walk),
    };
    const I = this.meta.tile.index;
    const d = this.def;
    const tAt = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? T.Water : d.terrain[y * N + x]);
    const mask = (x: number, y: number, pred: (t: T) => boolean) =>
      (pred(tAt(x, y - 1)) ? 1 : 0) | (pred(tAt(x + 1, y)) ? 2 : 0) | (pred(tAt(x, y + 1)) ? 4 : 0) | (pred(tAt(x - 1, y)) ? 8 : 0);

    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = d.terrain[y * N + x];
      const r = hash(x, y, 1);
      switch (t) {
        case T.Water: {
          const dist = this.waterDist[y * N + x];
          const depth = dist <= 1 ? 2 : dist <= 3 ? 1 : 0;
          const base = I[`water_${depth}_0`];
          this.waterTiles.push({ tile: L.agua.putTileAt(base, x, y), base });
          const m = mask(x, y, (n) => n !== T.Water);
          if (m) {
            const fb = I[`foam_${m}_0`];
            this.foamTiles.push({ tile: L.espuma.putTileAt(fb, x, y), base: fb });
          }
          break;
        }
        case T.Sand: {
          const m = mask(x, y, (n) => n === T.Water);
          const v = Math.floor(r * 3);
          let name = `sand_${v}_${m}`;
          if (!m && r > 0.965) name = 'sanddeco_1';
          else if (!m && r < 0.02) name = 'sanddeco_2';
          L.areia.putTileAt(I[name], x, y);
          break;
        }
        case T.Grass: {
          const m = mask(x, y, (n) => n === T.Sand || n === T.Water);
          let name = `grass_${Math.floor(r * 4)}_${m}`;
          if (!m && hash(x, y, 9) > 0.86) name = `grassf_${hash(x, y, 4) > 0.5 ? 1 : 0}`;
          L.solo.putTileAt(I[name], x, y);
          break;
        }
        case T.Lot: L.solo.putTileAt(I[`lot_${r > 0.5 ? 1 : 0}`], x, y); break;
        case T.Road: {
          let name = `asphalt_${r > 0.92 ? 3 : r > 0.5 ? 1 : 0}`;
          const cr = d.crossing[y * N + x];
          if (cr === 1) name = 'cross_x';
          else if (cr === 2) name = 'cross_y';
          else if (d.centerLine[y * N + x]) name = d.roadDir[y * N + x] === 1 ? 'center_x' : 'center_y';
          L.ruas.putTileAt(I[name], x, y);
          break;
        }
        case T.Side: {
          const m = mask(x, y, (n) => n === T.Road);
          L.calcadas.putTileAt(I[`side_${r > 0.6 ? 1 : 0}_${m}`], x, y);
          break;
        }
        case T.Board: {
          const m = mask(x, y, (n) => n === T.Road);
          L.calcadas.putTileAt(I[`board_${m}`], x, y);
          break;
        }
        case T.Pave: L.calcadas.putTileAt(I[`pave_${r > 0.5 ? 1 : 0}`], x, y); break;
      }
    }
  }

  private buildObjects() {
    for (const o of this.def.objects) {
      const p = toScreen(o.x, o.y);
      const img = this.scene.add.image(p.x, p.y, 'objects', o.frame);
      img.setOrigin(this.anchorX(o.frame), this.anchorY(o.frame));
      const d = o.sortRect ? depthOf((o.sortRect.x0 + o.sortRect.x1) / 2, (o.sortRect.y0 + o.sortRect.y1) / 2) : depthOf(o.x, o.y);
      img.setDepth(o.flat ? DEPTH.shadows + 2 : d);
      if (!o.flat) this.sprites.push({ img, x: o.x, y: o.y, alpha: 1 });
      let shadow: Phaser.GameObjects.Image | undefined;
      const shName = o.anim ? o.frame.replace(/_0$/, '__sh_0') : o.frame + '__sh';
      if (o.shadow && this.scene.textures.get('objects').has(shName)) {
        shadow = this.scene.add.image(p.x, p.y, 'objects', shName);
        shadow.setOrigin(this.anchorX(shName), this.anchorY(shName));
        shadow.setDepth(DEPTH.shadows);
      }
      if (o.anim) {
        const base = o.frame.replace(/_0$/, '');
        this.animated.push({ sprite: img, shadow, base, frames: o.anim.frames, fps: o.anim.fps, pingpong: !!o.anim.pingpong, phase: hash(o.x * 10 | 0, o.y * 10 | 0, 3) * 10, cur: 0 });
      }
      if (o.big && o.sortRect) this.bigs.push({ obj: o, sprite: img, depth: d, rect: o.sortRect });
      if (o.glow) {
        const gp = toScreen(o.x + o.glow.dx, o.y + o.glow.dy, o.glow.z);
        const g = this.scene.add.image(gp.x, gp.y, 'objects', 'glow').setDepth(DEPTH.glow).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35);
        this.glows.push({ img: g, phase: Math.random() * 6 });
      }
    }
  }

  private frameAnchor(name: string) {
    const f = this.scene.textures.getFrame('objects', name) as Phaser.Textures.Frame & { customPivot?: boolean; pivotX?: number; pivotY?: number };
    return f;
  }
  anchorX(name: string) { const f = this.frameAnchor(name); return f.customPivot ? f.pivotX! : 0.5; }
  anchorY(name: string) { const f = this.frameAnchor(name); return f.customPivot ? f.pivotY! : 1; }

  /** Deixa translúcidos os objetos que cobrem o personagem (evita perdê-lo de vista). */
  fadeOccluders(bounds: Phaser.Geom.Rectangle, depth: number, px: number, py: number, dt: number) {
    const k = 1 - Math.exp(-12 * dt);
    for (const s of this.sprites) {
      if (Math.abs(s.x - px) > 9 || Math.abs(s.y - py) > 9) { if (s.alpha !== 1) { s.alpha = 1; s.img.setAlpha(1); } continue; }
      let target = 1;
      if (s.img.depth > depth) {
        const b = s.img.getBounds();
        if (Phaser.Geom.Rectangle.Overlaps(b, bounds) && b.bottom > bounds.centerY) {
          // só se o pixel do objeto realmente cobre a área central do personagem
          target = 0.42;
        }
      }
      s.alpha += (target - s.alpha) * k;
      s.img.setAlpha(s.alpha);
    }
  }

  update(dt: number, time: number) {
    // água e espuma
    this.waterTimer += dt;
    if (this.waterTimer > 0.22) {
      this.waterTimer = 0;
      this.waterFrame = (this.waterFrame + 1) % this.meta.tile.waterFrames;
      for (const w of this.waterTiles) w.tile.index = w.base + this.waterFrame;
      for (const f of this.foamTiles) f.tile.index = f.base + this.waterFrame;
    }
    // objetos animados (palmeiras, árvores, guarda-sóis, fonte)
    for (const a of this.animated) {
      const t = time / 1000 * a.fps + a.phase;
      let f: number;
      if (a.pingpong && a.frames > 2) {
        const cyc = (a.frames - 1) * 2;
        const k = Math.floor(t) % cyc;
        f = k < a.frames ? k : cyc - k;
      } else f = Math.floor(t) % a.frames;
      if (f !== a.cur) {
        a.cur = f;
        const name = `${a.base}_${f}`;
        a.sprite.setFrame(name);
        a.sprite.setOrigin(this.anchorX(name), this.anchorY(name));
        if (a.shadow) {
          const sn = `${a.base}__sh_${f}`;
          a.shadow.setFrame(sn);
          a.shadow.setOrigin(this.anchorX(sn), this.anchorY(sn));
        }
      }
    }
  }
}
