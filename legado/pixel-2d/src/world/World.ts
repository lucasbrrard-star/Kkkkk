// Renderização do mundo: tilemap isométrico em camadas + objetos posicionados
// com ordenação de profundidade. Não contém regras de jogo.
import Phaser from 'phaser';
import { CONFIG } from '../config';
import { depthOf, toScreen } from '../core/iso';
import { MapDef, N, T, WorldObject } from './MapData';

export const DEPTH = {
  ground: -100000, sand: -99000, water: -98000, foam: -97500, road: -97000, walk: -96500,
  lots: -95000, flat: -92000, shadows: -90000, actorsBase: 0, overlay: 80000, glow: 85000, birds: 70000, marker: 95000,
};

export interface Meta {
  tile: { w: number; h: number; cols: number; count: number; index: Record<string, number>; waterFrames: number };
  character: {
    frameW: number; frameH: number; anchorX: number; anchorY: number; dirs: string[];
    player: { cols: number; layout: Record<string, { start: number; frames: number }> };
    npc: { cols: number; layout: Record<string, { start: number; frames: number }> };
    npcCount: number; npcNames: string[];
  };
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
  private bobbing: { img: Phaser.GameObjects.Image; y: number; phase: number }[] = [];
  bigs: BigObj[] = [];
  sprites: { img: Phaser.GameObjects.Image; x: number; y: number; alpha: number }[] = [];
  glows: { img: Phaser.GameObjects.Image; phase: number; base: number }[] = [];
  private lotGfx!: Phaser.GameObjects.Graphics;
  private waterFrame = 0;
  private waterTimer = 0;
  private t = 0;
  waterDist: Uint8Array;

  constructor(private scene: Phaser.Scene, public def: MapDef, private meta: Meta) {
    this.waterDist = new Uint8Array(N * N);
    this.computeWaterDistance();
    this.buildTilemap();
    this.buildObjects();
    this.lotGfx = scene.add.graphics().setDepth(DEPTH.lots);
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
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
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
      solo: mk('solo', DEPTH.ground), areia: mk('areia', DEPTH.sand), agua: mk('agua', DEPTH.water),
      espuma: mk('espuma', DEPTH.foam), ruas: mk('ruas', DEPTH.road), calcadas: mk('calcadas', DEPTH.walk),
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
          if (m) { const fb = I[`foam_${m}_0`]; this.foamTiles.push({ tile: L.espuma.putTileAt(fb, x, y), base: fb }); }
          break;
        }
        case T.Sand: {
          const m = mask(x, y, (n) => n === T.Water);
          let name = `sand_${Math.floor(r * 3)}_${m}`;
          if (!m && r > 0.965) name = 'sanddeco_1'; else if (!m && r < 0.02) name = 'sanddeco_2';
          L.areia.putTileAt(I[name], x, y);
          break;
        }
        case T.Grass: {
          const m = mask(x, y, (n) => n === T.Sand || n === T.Water);
          let name = `grass_${Math.floor(r * 4)}_${m}`;
          if (!m && hash(x, y, 9) > 0.84) name = `grassf_${Math.floor(hash(x, y, 4) * 3)}`;
          L.solo.putTileAt(I[name], x, y);
          break;
        }
        case T.Lot: L.solo.putTileAt(I[`lot_${r > 0.5 ? 1 : 0}`], x, y); break;
        case T.Road: {
          let name = `asphalt_${r > 0.93 ? 3 : r > 0.5 ? 1 : 0}`;
          const cr = d.crossing[y * N + x];
          if (cr === 1) name = 'cross_x'; else if (cr === 2) name = 'cross_y';
          else if (d.centerLine[y * N + x]) name = d.roadDir[y * N + x] === 1 ? 'center_x' : 'center_y';
          L.ruas.putTileAt(I[name], x, y);
          break;
        }
        case T.Side: L.calcadas.putTileAt(I[`side_${r > 0.6 ? 1 : 0}_${mask(x, y, (n) => n === T.Road)}`], x, y); break;
        case T.Board: L.calcadas.putTileAt(I[`board_${mask(x, y, (n) => n === T.Road)}`], x, y); break;
        case T.Pave: L.calcadas.putTileAt(I[`pave_${r > 0.5 ? 1 : 0}`], x, y); break;
      }
    }
  }

  private buildObjects() {
    const tex = this.scene.textures.get('objects');
    for (const o of this.def.objects) {
      if (!tex.has(o.frame)) { console.warn('frame ausente', o.frame); continue; }
      const p = toScreen(o.x, o.y);
      const img = this.scene.add.image(p.x, p.y, 'objects', o.frame);
      img.setOrigin(this.anchorX(o.frame), this.anchorY(o.frame));
      const d = o.sortRect ? depthOf((o.sortRect.x0 + o.sortRect.x1) / 2, (o.sortRect.y0 + o.sortRect.y1) / 2) : depthOf(o.x, o.y);
      img.setDepth(o.flat ? DEPTH.flat + depthOf(o.x, o.y) * 0.01 : d);
      if (!o.flat && !o.noFade) this.sprites.push({ img, x: o.x, y: o.y, alpha: 1 });
      if (o.bob) this.bobbing.push({ img, y: p.y, phase: o.bob });
      let shadow: Phaser.GameObjects.Image | undefined;
      const shName = o.anim ? o.frame.replace(/_0$/, '__sh_0') : o.frame + '__sh';
      if (o.shadow && tex.has(shName)) {
        shadow = this.scene.add.image(p.x, p.y, 'objects', shName).setOrigin(this.anchorX(shName), this.anchorY(shName)).setDepth(DEPTH.shadows);
      }
      if (o.anim) {
        const base = o.frame.replace(/_0$/, '');
        this.animated.push({ sprite: img, shadow, base, frames: o.anim.frames, fps: o.anim.fps, pingpong: !!o.anim.pingpong, phase: hash(o.x * 10 | 0, o.y * 10 | 0, 3) * 10, cur: 0 });
      }
      if (o.big && o.sortRect) this.bigs.push({ obj: o, sprite: img, depth: d, rect: o.sortRect });
      for (const g of o.glow ?? []) {
        const gp = toScreen(o.x + g.dx, o.y + g.dy, g.z);
        const base = 0.42 * (g.scale ?? 1);
        const gi = this.scene.add.image(Math.round(gp.x), Math.round(gp.y), 'objects', 'glow').setDepth(DEPTH.glow).setBlendMode(Phaser.BlendModes.ADD).setScale(g.scale ?? 1).setAlpha(base);
        this.glows.push({ img: gi, phase: Math.random() * 6, base });
      }
    }
  }

  anchorX(name: string) { const f = this.scene.textures.getFrame('objects', name) as Phaser.Textures.Frame & { customPivot?: boolean; pivotX?: number }; return f?.customPivot ? f.pivotX! : 0.5; }
  anchorY(name: string) { const f = this.scene.textures.getFrame('objects', name) as Phaser.Textures.Frame & { customPivot?: boolean; pivotY?: number }; return f?.customPivot ? f.pivotY! : 1; }

  /** Deixa translúcidos os objetos que cobrem o personagem (evita perdê-lo de vista). */
  fadeOccluders(bounds: Phaser.Geom.Rectangle, depth: number, px: number, py: number, dt: number) {
    const k = 1 - Math.exp(-12 * dt);
    for (const s of this.sprites) {
      if (Math.abs(s.x - px) > 12 || Math.abs(s.y - py) > 12) { if (s.alpha !== 1) { s.alpha = 1; s.img.setAlpha(1); } continue; }
      let target = 1;
      if (s.img.depth > depth) {
        const b = s.img.getBounds();
        if (Phaser.Geom.Rectangle.Overlaps(b, bounds) && b.bottom > bounds.centerY) target = 0.45;
      }
      s.alpha += (target - s.alpha) * k;
      s.img.setAlpha(s.alpha);
    }
  }

  update(dt: number, time: number) {
    this.t += dt;
    this.waterTimer += dt;
    if (this.waterTimer > 0.22) {
      this.waterTimer = 0;
      this.waterFrame = (this.waterFrame + 1) % this.meta.tile.waterFrames;
      for (const w of this.waterTiles) w.tile.index = w.base + this.waterFrame;
      for (const f of this.foamTiles) f.tile.index = f.base + this.waterFrame;
    }
    for (const a of this.animated) {
      const t = time / 1000 * a.fps + a.phase;
      let f: number;
      if (a.pingpong && a.frames > 2) { const cyc = (a.frames - 1) * 2; const k = Math.floor(t) % cyc; f = k < a.frames ? k : cyc - k; }
      else f = Math.floor(t) % a.frames;
      if (f !== a.cur) {
        a.cur = f;
        const name = `${a.base}_${f}`;
        a.sprite.setFrame(name).setOrigin(this.anchorX(name), this.anchorY(name));
        if (a.shadow) { const sn = `${a.base}__sh_${f}`; a.shadow.setFrame(sn).setOrigin(this.anchorX(sn), this.anchorY(sn)); }
      }
    }
    for (const b of this.bobbing) b.img.y = Math.round(b.y + Math.sin(this.t * 1.3 + b.phase) * 2.5);
    this.drawLots();
  }

  /** Contorno tracejado brilhante dos terrenos livres (como na referência). */
  private drawLots() {
    const g = this.lotGfx;
    g.clear();
    const off = (this.t * 1.2) % 1;
    for (const l of this.def.lots) {
      const x0 = l.x0 + 0.15, y0 = l.y0 + 0.15, x1 = l.x1 + 0.85, y1 = l.y1 + 0.85;
      const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const pulse = 0.65 + Math.sin(this.t * 3) * 0.2;
      for (let e = 0; e < 4; e++) {
        const [ax, ay] = corners[e], [bx, by] = corners[(e + 1) % 4];
        const len = Math.hypot(bx - ax, by - ay);
        for (let s = off * 0.8 - 0.8; s < len; s += 0.8) {
          const s0 = Math.max(0, s), s1 = Math.min(len, s + 0.45);
          if (s1 <= s0) continue;
          const p0 = toScreen(ax + (bx - ax) * s0 / len, ay + (by - ay) * s0 / len), p1 = toScreen(ax + (bx - ax) * s1 / len, ay + (by - ay) * s1 / len);
          g.lineStyle(7, 0x3dff8a, 0.18 * pulse).lineBetween(p0.x, p0.y, p1.x, p1.y);
          g.lineStyle(3, 0x7dffb0, 0.95 * pulse).lineBetween(p0.x, p0.y, p1.x, p1.y);
        }
      }
    }
    void CONFIG;
  }
}
