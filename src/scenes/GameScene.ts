// Cena principal: orquestra mundo, jogador, NPC, ônibus, câmera, interações e UI.
import Phaser from 'phaser';
import { CONFIG } from '../config';
import { depthOf } from '../core/iso';
import { Actor } from '../entities/Actor';
import { Bus } from '../entities/Bus';
import { CharacterView } from '../entities/CharacterView';
import { Npc } from '../entities/Npc';
import { PlayerController } from '../entities/PlayerController';
import { CameraController } from '../systems/CameraController';
import { CollisionSystem } from '../systems/CollisionSystem';
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
  npc!: Npc;
  nview!: CharacterView;
  bus!: Bus;
  camCtl!: CameraController;
  inter!: InteractionSystem;
  ambient!: Ambient;
  ui!: Ui;
  private fpsAcc = 0; private fpsFrames = 0;

  constructor() { super('game'); }

  create() {
    this.meta = this.cache.json.get('meta');
    this.def = buildMap();
    this.cameras.main.setBackgroundColor('#1d6e9e');
    this.world = new World(this, this.def, this.meta);
    this.col = new CollisionSystem(this.def.colliders, this.def.terrain);

    const ch = this.meta.character;
    this.player = new Actor(this.def.spawn.x, this.def.spawn.y, CONFIG.player.radius, 'player');
    this.player.facing = this.player.shownFacing = 0;
    this.pc = new PlayerController(this.player, this.col);
    this.pview = new CharacterView(this, 'player', ch.player, ch.frameW, ch.frameH, ch.anchorX, ch.anchorY);

    this.npc = new Npc(this.def.npcPath, this.col);
    this.nview = new CharacterView(this, 'npc', ch.npc, ch.frameW, ch.frameH, ch.anchorX, ch.anchorY);

    this.bus = new Bus(this, this.def.busRoute, this.def.busStop, this.world);
    this.col.dynamic.push(...this.bus.colliders);
    // NPC também é um obstáculo para o jogador (e vice-versa)
    this.col.dynamic.push({ x: 0, y: 0, r: 0.25, h: 1.6, id: 'npc' });
    this.col.dynamic.push({ x: 0, y: 0, r: 0.25, h: 1.6, id: 'player' });

    this.ambient = new Ambient(this, this.world);
    this.inter = new InteractionSystem(this, this.def.interactables);

    this.input2 = new InputController();
    this.ui = new Ui(this.input2);
    this.ui.onRestart = () => this.restart();
    this.ui.onSettings = (s) => this.applySettings(s);
    this.applySettings(this.ui.settings);

    // retrato do jogador (cabeça do quadro "idle S")
    const src = this.textures.get('player-img').getSourceImage() as HTMLImageElement;
    this.ui.setAvatar(src, ch.anchorX - 12, 12, 24, 24);

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
    // ganchos para testes automatizados
    (window as unknown as { __game: unknown }).__game = this;
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
    if (it.kind === 'npc') {
      this.ui.showDialog(it.title, this.npc.talkTo(this.player.x, this.player.y));
    } else if (it.kind === 'busstop') {
      const eta = this.bus.etaToStop();
      const txt = eta < 1 ? 'Ônibus no ponto agora' : eta < 60 ? `~${Math.ceil(eta)} s` : `~${Math.ceil(eta / 60)} min`;
      this.ui.showInfo(it, { 'Próximo ônibus': txt });
    } else this.ui.showInfo(it);
  }

  update(time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    const inp = this.input2.read();
    if (inp.menu) {
      if (this.ui.panelOpen) { this.ui.closePanel(); this.ui.closeDialog(); } else this.ui.toggleMenu();
    }
    const paused = this.ui.paused;
    if (paused) { inp.mx = inp.my = 0; inp.jump = false; inp.run = false; inp.interact = false; }

    // diálogos/painéis: E fecha; movimento continua permitido
    if (inp.interact && this.ui.panelOpen) { this.ui.closePanel(); this.ui.closeDialog(); inp.interact = false; }

    if (!paused) {
      // atualiza colisores dinâmicos dos personagens
      const dynN = this.col.dynamic.find((d) => d.id === 'npc')!; dynN.x = this.npc.actor.x; dynN.y = this.npc.actor.y;
      const dynP = this.col.dynamic.find((d) => d.id === 'player')!; dynP.x = this.player.x; dynP.y = this.player.y;
      this.pc.update(inp, dt);
      this.npc.update(dt, this.player.x, this.player.y);
      this.bus.update(dt, this.player);
      this.world.update(dt, time);
    }
    this.ambient.update(paused ? 0 : dt, time, this.cameras.main);

    this.inter.update(this.player.x, this.player.y, dt, (it) => {
      if (it.kind === 'npc') { it.x = this.npc.actor.x; it.y = this.npc.actor.y; }
    });
    if (inp.interact && this.inter.current && !paused) this.interact(this.inter.current);

    // renderização
    const snap = this.camCtl.zoom;
    this.pview.sync(this.player, paused ? 0 : dt, snap);
    this.nview.sync(this.npc.actor, paused ? 0 : dt, snap);
    this.sortActor(this.pview, this.player);
    this.sortActor(this.nview, this.npc.actor);
    this.camCtl.update(this.player, dt);
    const pb = this.pview.sprite.getBounds();
    const core = new Phaser.Geom.Rectangle(pb.x + pb.width * 0.3, pb.y + pb.height * 0.25, pb.width * 0.4, pb.height * 0.6);
    this.world.fadeOccluders(core, this.pview.sprite.depth, this.player.x, this.player.y, dt);

    // região atual no HUD
    const reg = this.def.regions.find((r) => this.player.x >= r.x0 && this.player.x < r.x1 && this.player.y >= r.y0 && this.player.y < r.y1);
    if (reg) this.ui.setRegion(reg.name);

    // FPS medido
    this.fpsAcc += deltaMs; this.fpsFrames++;
    if (this.fpsAcc > 500) { this.ui.setFps(Math.round(this.fpsFrames * 1000 / this.fpsAcc)); this.fpsAcc = 0; this.fpsFrames = 0; }
  }

  /** Ordenação contra objetos grandes: decide frente/trás pelo retângulo do chão. */
  private sortActor(v: CharacterView, a: Actor) {
    let d = depthOf(a.x, a.y);
    const bigs: Pick<BigObj, 'rect' | 'depth'>[] = [...this.world.bigs, { rect: this.bus.sortRect, depth: this.bus.depth }];
    for (const b of bigs) {
      const r = b.rect;
      // só importa quando está perto do objeto
      if (a.x < r.x0 - 3 || a.x > r.x1 + 3 || a.y < r.y0 - 3 || a.y > r.y1 + 3) continue;
      const front = a.x >= r.x1 || a.y >= r.y1;
      const behind = a.x <= r.x0 || a.y <= r.y0;
      let isFront: boolean;
      if (front && !behind) isFront = true;
      else if (behind && !front) isFront = false;
      else isFront = a.x + a.y > (a.x >= r.x1 ? r.x1 + r.y0 : r.x0 + r.y1);
      if (isFront) d = Math.max(d, b.depth + 0.5);
      else d = Math.min(d, b.depth - 0.5);
    }
    v.setDepth(d);
  }
}
