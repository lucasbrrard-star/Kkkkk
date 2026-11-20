// Cena principal: orquestra mundo, jogador, NPCs, ônibus, câmera, interações e UI.
import Phaser from 'phaser';
import { CONFIG } from '../config';
import { depthOf, toScreen } from '../core/iso';
import { Actor } from '../entities/Actor';
import { Bus } from '../entities/Bus';
import { CharacterView } from '../entities/CharacterView';
import { Npc } from '../entities/Npc';
import { PlayerController } from '../entities/PlayerController';
import { CameraController } from '../systems/CameraController';
import { CollisionSystem, DynCollider } from '../systems/CollisionSystem';
import { InputController } from '../systems/InputController';
import { InteractionSystem } from '../systems/InteractionSystem';
import { Ambient } from '../world/Ambient';
import { buildMap, Interactable, MapDef, N } from '../world/MapData';
import { BigObj, Meta, World } from '../world/World';
import { Ui } from '../ui/Ui';
import { sfx } from '../audio/Sfx';

export class GameScene extends Phaser.Scene {
  meta!: Meta;
  def!: MapDef;
  world!: World;
  col!: CollisionSystem;
  input2!: InputController;
  player!: Actor;
  pc!: PlayerController;
  pview!: CharacterView;
  npcs: Npc[] = [];
  nviews: CharacterView[] = [];
  private npcCols: DynCollider[] = [];
  private playerCol!: DynCollider;
  bus!: Bus;
  camCtl!: CameraController;
  inter!: InteractionSystem;
  ambient!: Ambient;
  ui!: Ui;
  private fpsAcc = 0; private fpsFrames = 0;
  private lastNow = 0;

  constructor() { super('game'); }

  create() {
    this.meta = this.cache.json.get('meta');
    this.def = buildMap();
    this.cameras.main.setBackgroundColor('#1c5f92');
    this.world = new World(this, this.def, this.meta);
    this.col = new CollisionSystem(this.def.colliders, this.def.terrain, this.def.walkable);

    const ch = this.meta.character;
    this.player = new Actor(this.def.spawn.x, this.def.spawn.y, CONFIG.player.radius, 'player');
    this.player.facing = this.player.shownFacing = 0;
    this.pc = new PlayerController(this.player, this.col);
    this.pview = new CharacterView(this, 'player', ch.player, ch.frameW, ch.frameH, ch.anchorX, ch.anchorY);

    this.def.npcs.forEach((nd, i) => {
      if (nd.sheet >= ch.npcCount) return;
      const npc = new Npc(nd, this.col, i);
      this.npcs.push(npc);
      this.nviews.push(new CharacterView(this, `npc${nd.sheet}`, ch.npc, ch.frameW, ch.frameH, ch.anchorX, ch.anchorY));
      const c = { x: npc.actor.x, y: npc.actor.y, r: 0.3, h: 1.7, id: npc.actor.id };
      this.npcCols.push(c); this.col.dynamic.push(c);
    });
    this.playerCol = { x: 0, y: 0, r: 0.3, h: 1.7, id: 'player' };
    this.col.dynamic.push(this.playerCol);

    this.bus = new Bus(this, this.def.busRoute, this.def.busStop, this.world);
    this.col.dynamic.push(...this.bus.colliders);

    this.ambient = new Ambient(this, this.world);
    this.inter = new InteractionSystem(this, this.def.interactables);

    this.input2 = new InputController();
    this.ui = new Ui(this.input2);
    this.ui.onRestart = () => this.restart();
    this.ui.onSettings = (s) => this.applySettings(s);
    this.ui.onMap = () => this.ui.showMinimap(this.renderMinimap());
    this.ui.thumb = (frame) => this.frameCanvas(frame);
    this.applySettings(this.ui.settings);
    for (const l of this.def.lots) this.ui.addWorldLabel(l.id, `<b>Terreno Livre</b><span>${l.size}</span>`, 'lot');

    // retrato do jogador (cabeça do quadro "idle S")
    const src = this.textures.get('player-img').getSourceImage() as HTMLImageElement;
    this.ui.setAvatar(src, ch.anchorX - 15, 26, 30, 30);

    this.pc.onJump = () => sfx.jump();
    this.pc.onLand = () => sfx.land();
    this.pc.onStep = () => sfx.step();
    const unlock = () => { sfx.start(); sfx.setEnabled(this.ui.settings.sound); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    this.camCtl = new CameraController(this.cameras.main, N);
    this.camCtl.zoomOffset = this.ui.settings.zoom;
    this.camCtl.applyZoom();
    this.camCtl.snapTo(this.player);
    this.scale.on('resize', () => { this.camCtl.applyZoom(); this.camCtl.snapTo(this.player); });

    const ld = document.getElementById('loading');
    if (ld) { ld.style.opacity = '0'; setTimeout(() => ld.remove(), 450); }
    (window as unknown as { __game: unknown }).__game = this;
  }

  /** Recorta um quadro do atlas para uso na UI (miniaturas do catálogo). */
  private frameCanvas(frame: string): HTMLCanvasElement | null {
    const tex = this.textures.get('objects');
    if (!tex.has(frame)) return null;
    const f = tex.get(frame);
    const c = document.createElement('canvas');
    c.width = f.cutWidth; c.height = f.cutHeight;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(f.source.image as HTMLImageElement, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
    return c;
  }

  /** Minimapa simples da ilha a partir do terreno. */
  private renderMinimap(): HTMLCanvasElement {
    const S = 4, c = document.createElement('canvas');
    c.width = N * S; c.height = N * S;
    const ctx = c.getContext('2d')!;
    const cols = ['#2384a8', '#f0cf98', '#5b9a38', '#9aa651', '#454a5e', '#d7bfa2', '#e9e1d2', '#c47a58'];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { ctx.fillStyle = cols[this.def.terrain[y * N + x]]; ctx.fillRect(x * S, y * S, S, S); }
    for (const l of this.def.lots) { ctx.strokeStyle = '#3dff8a'; ctx.lineWidth = 2; ctx.strokeRect(l.x0 * S, l.y0 * S, (l.x1 - l.x0 + 1) * S, (l.y1 - l.y0 + 1) * S); }
    for (const o of this.def.objects) if (/^casa|^cafe/.test(o.frame)) { ctx.fillStyle = '#e2453c'; ctx.fillRect(o.x * S, o.y * S, 5 * S, 4 * S); }
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(this.player.x * S, this.player.y * S, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff5a3c'; ctx.beginPath(); ctx.arc(this.player.x * S, this.player.y * S, 4, 0, Math.PI * 2); ctx.fill();
    return c;
  }

  private applySettings(s: Ui['settings']) {
    sfx.setEnabled(s.sound);
    this.ambient?.setTime(s.time);
    if (this.camCtl) { this.camCtl.zoomOffset = s.zoom; this.camCtl.applyZoom(); }
  }

  restart() {
    const p = this.player;
    p.x = this.def.spawn.x; p.y = this.def.spawn.y; p.z = 0; p.vx = p.vy = p.vz = 0;
    p.facing = p.shownFacing = 0; p.setState('idle');
    this.ui.setCoins(CONFIG.economy.startCoins);
    this.ui.closePanel(); this.ui.closeDialog();
    this.camCtl.snapTo(p);
  }

  private interact(it: Interactable) {
    if (it.kind === 'npc' && it.npc !== undefined) {
      const npc = this.npcs[it.npc];
      this.ui.showDialog(it.title, npc.talkTo(this.player.x, this.player.y));
    } else if (it.kind === 'busstop') {
      const eta = this.bus.etaToStop();
      const txt = eta < 1 ? 'Ônibus no ponto agora' : eta < 60 ? `~${Math.ceil(eta)} s` : `~${Math.ceil(eta / 60)} min`;
      this.ui.showInfo(it, { 'Próximo ônibus': txt });
    } else this.ui.showInfo(it);
  }

  update(time: number, _phaserDelta: number) {
    // tempo real medido (independe de suavização/limites do laço do navegador)
    const now = performance.now();
    const deltaMs = this.lastNow ? now - this.lastNow : 16.7;
    this.lastNow = now;
    const dt = Math.min(deltaMs / 1000, 1 / 10); // colisões usam subpassos: seguro em FPS baixo
    const inp = this.input2.read();
    if (inp.menu) {
      if (this.ui.anyOverlay) this.ui.closeOverlays(); else this.ui.toggleMenu();
    }
    const paused = this.ui.paused;
    if (paused) { inp.mx = inp.my = 0; inp.jump = false; inp.run = false; inp.interact = false; }
    if (inp.interact && this.ui.panelOpen) { this.ui.closePanel(); this.ui.closeDialog(); inp.interact = false; }

    if (!paused) {
      this.npcs.forEach((n, i) => { this.npcCols[i].x = n.actor.x; this.npcCols[i].y = n.actor.y; });
      this.playerCol.x = this.player.x; this.playerCol.y = this.player.y;
      this.pc.update(inp, dt);
      for (const n of this.npcs) n.update(dt, this.player.x, this.player.y);
      this.bus.update(dt, this.player);
      this.world.update(dt, time);
    }
    this.ambient.update(paused ? 0 : dt, time, this.cameras.main);

    this.inter.update(this.player.x, this.player.y, dt, (it) => {
      if (it.kind === 'npc' && it.npc !== undefined && this.npcs[it.npc]) { it.x = this.npcs[it.npc].actor.x; it.y = this.npcs[it.npc].actor.y; }
    });
    if (inp.interact && this.inter.current && !paused) this.interact(this.inter.current);

    const snap = this.camCtl.zoom;
    this.pview.sync(this.player, paused ? 0 : dt, snap);
    this.sortActor(this.pview, this.player);
    this.npcs.forEach((n, i) => { this.nviews[i].sync(n.actor, paused ? 0 : dt, snap); this.sortActor(this.nviews[i], n.actor); });
    this.camCtl.update(this.player, dt);
    const pb = this.pview.sprite.getBounds();
    const core = new Phaser.Geom.Rectangle(pb.x + pb.width * 0.3, pb.y + pb.height * 0.2, pb.width * 0.4, pb.height * 0.65);
    this.world.fadeOccluders(core, this.pview.sprite.depth, this.player.x, this.player.y, dt);

    // rótulos flutuantes dos terrenos (DOM, nítidos)
    const cam = this.cameras.main;
    const dpr = this.game.scale.zoom; // 1/dpr
    for (const l of this.def.lots) {
      const w = toScreen((l.x0 + l.x1 + 1) / 2, (l.y0 + l.y1 + 1) / 2, 2.2);
      const sx = (w.x - cam.worldView.x) * cam.zoom * dpr, sy = (w.y - cam.worldView.y) * cam.zoom * dpr;
      this.ui.placeWorldLabel(l.id, sx, sy, Math.hypot(this.player.x - (l.x0 + l.x1) / 2, this.player.y - (l.y0 + l.y1) / 2) < 16);
    }

    const reg = this.def.regions.find((r) => this.player.x >= r.x0 && this.player.x < r.x1 && this.player.y >= r.y0 && this.player.y < r.y1);
    if (reg) this.ui.setRegion(reg.name);
    this.fpsAcc += deltaMs; this.fpsFrames++;
    if (this.fpsAcc > 500) { this.ui.setFps(Math.round(this.fpsFrames * 1000 / this.fpsAcc)); this.fpsAcc = 0; this.fpsFrames = 0; }
  }

  /** Ordenação contra objetos grandes: decide frente/trás pelo retângulo do chão. */
  private sortActor(v: CharacterView, a: Actor) {
    let d = depthOf(a.x, a.y);
    const bigs: Pick<BigObj, 'rect' | 'depth'>[] = [...this.world.bigs, { rect: this.bus.sortRect, depth: this.bus.depth }];
    for (const b of bigs) {
      const r = b.rect;
      if (a.x < r.x0 - 4 || a.x > r.x1 + 4 || a.y < r.y0 - 4 || a.y > r.y1 + 4) continue;
      const front = a.x >= r.x1 || a.y >= r.y1;
      const behind = a.x <= r.x0 || a.y <= r.y0;
      let isFront: boolean;
      if (front && !behind) isFront = true;
      else if (behind && !front) isFront = false;
      else isFront = a.x + a.y > (a.x >= r.x1 ? r.x1 + r.y0 : r.x0 + r.y1);
      if (isFront) d = Math.max(d, b.depth + 0.5); else d = Math.min(d, b.depth - 0.5);
    }
    v.setDepth(d);
  }
}
