// SKYWALKER — jogo de terror em primeira pessoa (celular na horizontal).
// Este arquivo liga tudo: telas, HUD, diretor da história (pistas, sustos, cervos,
// perseguições, chefe final) e o laço principal.
import * as THREE from 'three';
import { loadAll, type Assets, type SoundKey } from './assets';
import { Sound } from './audio';
import { Input } from './input';
import { Pipeline, type Fx } from './post';
import { World, drawingCanvas, type Interactive } from './world';
import { Player } from './player';
import { Skywalker } from './skywalker';
import { Deer } from './deer';
import { CLUES, SPAWN, LAIR, PLAY_RADIUS, heightAt } from './map';
import { angleDiff, clamp, damp } from './noise';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const store = {
  get(k: string, d: string) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
};

const MOBILE = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
const QUALITY = store.get('sw-quality', MOBILE ? 'low' : 'high') as 'high' | 'low';

type GameState = 'menu' | 'play' | 'pause' | 'dead' | 'ending';

const OBJ = [
  'Siga o choro. Procure qualquer coisa do Theo.',
  'Siga o choro mais para dentro da mata.',
  'Siga o choro. Não confie nos bichos.',
  'Siga o choro. Ele está perto.',
  'Siga o choro. Falta pouco.',
  'Siga o choro até o covil.',
];

class Game {
  canvas = $<HTMLCanvasElement>('view');
  pipe = new Pipeline(this.canvas, MOBILE, QUALITY);
  input = new Input(this.canvas);
  snd = new Sound(MOBILE);
  A!: Assets;
  world!: World;
  player!: Player;
  sky!: Skywalker;
  realDeer!: Deer;
  fakeDeer!: Deer;
  state: GameState = 'menu';
  clock = new THREE.Clock();
  t = 0;
  fx: Fx = { time: 0, damage: 0, fade: 1, flash: 0, ca: 0, tension: 0, low: 0 };
  // história
  clues = 0;
  checkpoint = { x: SPAWN.x, z: SPAWN.z, yaw: 0 };
  timers = { cry: 9, scare: 30, skyCool: 25, deer: 0, mimic: -1, forced: -1, bossIn: -1, endT: -1, deathT: -1 };
  forcedEvent: string | null = null;
  flags = { deerLine: false, followed: false, battery: false, boss: false, won: false, firstReveal: false };
  tension = 0;
  private loops: { amb?: ReturnType<Sound['play']>; drone?: ReturnType<Sound['play']>; music?: ReturnType<Sound['play']>; run?: ReturnType<Sound['play']> } = {};
  private beat = 0;
  private hudCache: Record<string, string> = {};
  private subsT = 0;
  private cardT = 0;
  private compassT = 0;
  private compassTarget = new THREE.Vector3();
  private blood: THREE.Sprite[] = [];
  private lookAwayT = 0;
  private standoffT = 0;

  async boot() {
    this.onResize();
    addEventListener('resize', () => this.onResize());
    addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 250));
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.pause(); });
    this.A = await loadAll(this.snd.ctx, (f, label) => {
      $('load-fill').style.width = `${Math.round(f * 100)}%`;
      $('load-label').textContent = `carregando ${label}… ${Math.round(f * 100)}%`;
    });
    this.snd.setBuffers(this.A.sounds);
    $('load-label').textContent = 'montando a floresta…';
    await new Promise((r) => setTimeout(r, 30));
    this.world = new World(this.A, QUALITY);
    this.player = new Player(this.A, this.world, this.snd, this.input, QUALITY);
    this.sky = new Skywalker(this.A);
    this.world.scene.add(this.sky.root);
    this.sky.onAttackHit = (d) => this.onPlayerHit(d);
    this.realDeer = new Deer(this.A, false);
    this.fakeDeer = new Deer(this.A, true);
    this.player.spawn(SPAWN.x, SPAWN.z, 0);
    this.onResize();
    // pré-compila os shaders para não travar no primeiro susto
    this.sky.appear(SPAWN.x, SPAWN.z - 30, 0, 'watch');
    this.world.scene.add(this.realDeer.root, this.fakeDeer.root);
    this.realDeer.place(SPAWN.x + 3, SPAWN.z - 25, 0); this.fakeDeer.place(SPAWN.x - 3, SPAWN.z - 25, 0);
    this.world.update(this.player.cam, 0, this.player.pos);
    this.pipe.renderer.compile(this.world.scene, this.player.cam);
    this.pipe.render(this.world.scene, this.player.cam, this.player.vmScene, this.player.vmCam, this.fx, 0.016);
    this.sky.hide(); this.realDeer.root.removeFromParent(); this.fakeDeer.root.removeFromParent();
    this.setupUI();
    this.show('screen-title');
    this.renderLoop();
  }

  // ---------------------------------------------------------------- telas
  show(id: string | null) {
    for (const s of document.querySelectorAll<HTMLElement>('.screen')) s.hidden = s.id !== id;
  }

  setupUI() {
    const menuMusic = () => {
      this.snd.unlock();
      if (!this.loops.music && this.state === 'menu') this.loops.music = this.snd.play('music_box', { loop: true, vol: 0.5, bus: 'music' }) ?? undefined;
    };
    $('screen-title').addEventListener('pointerdown', menuMusic);
    $('btn-start').addEventListener('click', () => this.start());
    $('btn-howto').addEventListener('click', () => this.show('screen-howto'));
    $('btn-credits').addEventListener('click', () => this.showCredits());
    $('btn-credits2').addEventListener('click', () => this.showCredits());
    for (const b of document.querySelectorAll('.back')) b.addEventListener('click', () => this.show(this.state === 'ending' ? 'screen-ending' : 'screen-title'));
    $('btn-resume').addEventListener('click', () => this.resume());
    $('btn-restart').addEventListener('click', () => this.retry());
    $('btn-quit').addEventListener('click', () => location.reload());
    $('btn-retry').addEventListener('click', () => this.retry());
    $('btn-again').addEventListener('click', () => location.reload());
    const sens = $<HTMLInputElement>('sens');
    sens.value = store.get('sw-sens', '1');
    this.input.sens = +sens.value;
    sens.addEventListener('input', () => { this.input.sens = +sens.value; store.set('sw-sens', sens.value); });
    const q = $<HTMLSelectElement>('quality');
    q.value = QUALITY;
    q.addEventListener('change', () => { store.set('sw-quality', q.value); location.reload(); });
  }

  async showCredits() {
    this.show('screen-credits');
    const list = $('credit-list');
    if (list.childElementCount) return;
    try {
      const c: { name: string; author: string; license: string; source: string; url: string }[] = await (await fetch('assets/credits.json')).json();
      for (const it of c) {
        const d = document.createElement('div');
        const a = document.createElement('a'); a.href = it.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = it.name;
        d.append(a, document.createTextNode(` · ${it.author} · ${it.source} · ${it.license}`));
        list.append(d);
      }
    } catch { list.textContent = 'Lista de créditos indisponível.'; }
  }

  async start() {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else el.webkitRequestFullscreen?.();
    } catch { /* tela cheia indisponível neste navegador */ }
    try { await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'); } catch { /* sem trava de orientação */ }
    try { await (navigator as Navigator & { wakeLock?: { request(t: string): Promise<unknown> } }).wakeLock?.request('screen'); } catch { /* sem wake lock */ }
    // iPhone: toca mesmo com a chave de silêncio ligada
    try { const as = (navigator as Navigator & { audioSession?: { type: string } }).audioSession; if (as) as.type = 'playback'; } catch { /* sem audioSession */ }
    await this.snd.unlock();
    this.loops.music?.stop(1.5); this.loops.music = undefined;
    this.loops.amb = this.snd.play('ambience', { loop: true, vol: 0.85, bus: 'amb' }) ?? undefined;
    this.loops.drone = this.snd.play('drone', { loop: true, vol: 0.15, bus: 'amb' }) ?? undefined;
    this.show(null);
    $('hud').hidden = false;
    this.state = 'play';
    this.input.enabled = true;
    this.input.clearEdges();
    if (!this.input.touch) this.canvas.requestPointerLock?.();
    this.player.spawn(SPAWN.x, SPAWN.z, 0);
    this.fx.fade = 1;
    this.activateClue(0);
    this.voice('v_intro', 'Três noites. Três noites desde que aquela coisa levou o Theo. A polícia diz que foi um animal. Mas eu vi os chifres. Eu vi aquilo andar sobre duas pernas. Os velhos daqui chamam de Skywalker. Hoje eu vou encontrá-lo… e vou matá-lo.', 'Você');
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.show('screen-pause');
    if (document.pointerLockElement) document.exitPointerLock();
    this.snd.ctx.suspend().catch(() => {});
  }

  resume() {
    this.state = 'play';
    this.show(null);
    this.input.clearEdges();
    this.snd.ctx.resume().catch(() => {});
    if (!this.input.touch) this.canvas.requestPointerLock?.();
  }

  // ---------------------------------------------------------------- legendas e vozes
  voice(key: SoundKey, text: string, who = '', kid = false, opts: { distort?: boolean; rate?: number } = {}) {
    const h = this.snd.play(key, { bus: 'voice', vol: 1, distort: opts.distort, lowpass: opts.distort ? 2600 : undefined, rate: opts.rate });
    const dur = (this.A.sounds[key]?.duration ?? 4) / (opts.rate ?? 1);
    this.subtitle(text, who, kid, dur + 0.8);
    return h;
  }

  subtitle(text: string, who = '', kid = false, dur = 4) {
    const s = $('subs');
    s.innerHTML = '';
    if (who) { const w = document.createElement('span'); w.className = 'who'; w.textContent = who + ': '; s.append(w); }
    const tt = document.createElement('span'); if (kid) tt.className = 'kid'; tt.textContent = text; s.append(tt);
    s.classList.add('on');
    this.subsT = dur;
  }

  // ---------------------------------------------------------------- pistas
  activateClue(i: number) {
    for (const it of this.world.items) if (it.kind === 'clue') { it.active = it.index === i && !it.taken; it.obj.visible = it.active; }
    this.setObjective(OBJ[Math.min(this.clues, 5)]);
  }

  setObjective(t: string) { this.hud('objective', t); }

  takeItem(it: Interactive) {
    it.taken = true; it.active = false; it.obj.visible = false; it.glint.visible = false;
    if (it.kind === 'ammo') { this.player.reserve += 12; this.snd.play('reload', { vol: 0.5, rate: 1.3, duration: 0.6 }); this.subtitle('Munição .38 — mais 12 balas.', '', false, 2.5); return; }
    if (it.kind === 'battery') { this.player.battery = Math.min(1, this.player.battery + 0.65); this.snd.click(0.5, 2600); this.subtitle('Pilhas novas para a lanterna.', '', false, 2.5); return; }
    const c = CLUES[it.index];
    this.clues++;
    this.checkpoint = { x: it.pos.x, z: it.pos.z, yaw: this.player.yaw };
    this.snd.play('clue', { vol: 0.9 });
    $('clue-title').textContent = c.title;
    $('clue-text').textContent = c.text;
    const img = $<HTMLCanvasElement>('clue-img');
    img.hidden = c.model !== 'drawing';
    if (c.model === 'drawing') img.getContext('2d')!.drawImage(drawingCanvas(), 0, 0);
    $('clue-card').hidden = false;
    this.cardT = 7;
    setTimeout(() => this.voice(c.voice as SoundKey, c.text, 'Você'), 700);
    this.hud('clue-count', `PISTAS ${this.clues}/5`);
    if (this.clues < 5) this.activateClue(this.clues);
    else this.setObjective(OBJ[5]);
    this.timers.cry = 14;
    // eventos amarrados à história
    if (this.clues === 1) this.force('realDeer', 12);
    if (this.clues === 2) this.force('fakeDeer', 14);
    if (this.clues === 3) this.force('stalk', 30);
    if (this.clues === 4) { this.timers.mimic = 9; this.force('runby', 26); }
  }

  force(ev: string, inT: number) { this.forcedEvent = ev; this.timers.forced = inT; }

  // ---------------------------------------------------------------- utilidades de cena
  private camYawTo(p: THREE.Vector3) { return Math.atan2(-(p.x - this.player.pos.x), -(p.z - this.player.pos.z)); }
  private inView(p: THREE.Vector3, deg = 36) { return Math.abs(angleDiff(this.player.yaw, this.camYawTo(p))) < (deg * Math.PI) / 180; }
  private clearLine(a: THREE.Vector3, b: THREE.Vector3) { const d = Math.hypot(b.x - a.x, b.z - a.z); return this.world.colliders.ray(a.x, a.z, b.x, b.z, 3) > d - 0.9; }

  /** acha um ponto livre a certa distância, dentro de um ângulo relativo ao olhar */
  spot(minD: number, maxD: number, angC: number, angW: number) {
    for (let i = 0; i < 20; i++) {
      const a = this.player.yaw + angC + (Math.random() - 0.5) * angW;
      const d = minD + Math.random() * (maxD - minD);
      const x = this.player.pos.x - Math.sin(a) * d, z = this.player.pos.z - Math.cos(a) * d;
      if (Math.hypot(x, z) > PLAY_RADIUS - 4) continue;
      const p = { x, z }; this.world.colliders.resolve(p, 0.9);
      if (Math.hypot(p.x - x, p.z - z) > 0.6) continue;
      return new THREE.Vector3(x, heightAt(x, z), z);
    }
    return null;
  }

  private isLit(p: THREE.Vector3, maxD = 24) {
    const b = this.world.beam;
    if (b.lightOn.value < 0.2) return false;
    const v = p.clone().sub(b.lightPos.value); const d = v.length();
    if (d > maxD) return false;
    return v.normalize().dot(b.lightDir.value) > Math.cos(0.42) && this.clearLine(b.lightPos.value, p);
  }

  // ---------------------------------------------------------------- eventos de susto
  runEvent(ev: string) {
    const P = this.player, sky = this.sky;
    const skyFree = sky.state === 'hidden' && this.timers.skyCool <= 0 && !this.flags.boss;
    switch (ev) {
      case 'twig': {
        const p = this.spot(6, 10, Math.PI, 1.6); if (p) this.snd.play('twig', { pos: p, vol: 1 });
        return true;
      }
      case 'whispers': {
        const p = this.spot(1.5, 2.5, Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1), 0.6);
        if (p) this.snd.play('whispers', { pos: p.setY(p.y + 1.6), vol: 0.5, ref: 1.5 });
        return true;
      }
      case 'deerCall': {
        const p = this.spot(30, 45, Math.random() * Math.PI * 2, 0.5); if (p) this.snd.play('deer_call', { pos: p, vol: 1, ref: 10, rate: 0.85 });
        return true;
      }
      case 'watch': {
        if (!skyFree) return false;
        const p = this.spot(24, 32, 0, 1.4); if (!p) return false;
        sky.appear(p.x, p.z, Math.atan2(P.pos.x - p.x, P.pos.z - p.z), 'watch');
        this.timers.skyCool = 30;
        return true;
      }
      case 'runby': {
        if (!skyFree) return false;
        const side = Math.random() < 0.5 ? 1 : -1;
        const a = this.spot(20, 26, side * 0.75, 0.2), b = this.spot(20, 26, -side * 0.75, 0.2);
        if (!a || !b) return false;
        sky.appear(a.x, a.z, 0, 'runby'); sky.runTarget.copy(b);
        sky.set('runby');
        this.snd.play('creature_run', { pos: a, vol: 1, ref: 8 });
        this.timers.skyCool = 25;
        return true;
      }
      case 'stalk': {
        if (!skyFree) return false;
        const g = this.spot(5, 7, Math.PI, 0.8);
        if (g) this.snd.play('growl', { pos: g.setY(g.y + 2), vol: 1, ref: 3 });
        if (!this.flags.followed) { this.flags.followed = true; setTimeout(() => this.voice('v_followed', 'Tem alguma coisa me seguindo.', 'Você'), 1600); }
        setTimeout(() => {
          if (this.state !== 'play' || this.sky.state !== 'hidden') return;
          const p = this.spot(18, 24, Math.PI, 0.9); if (!p) return;
          this.sky.appear(p.x, p.z, Math.atan2(this.player.pos.x - p.x, this.player.pos.z - p.z), 'chase');
          this.snd.play('scream', { pos: p.clone().setY(p.y + 2.4), vol: 1, ref: 8 });
          this.tension = 1;
        }, 3800);
        this.timers.skyCool = 40;
        return true;
      }
      case 'realDeer': case 'fakeDeer': {
        const fake = ev === 'fakeDeer';
        const deer = fake ? this.fakeDeer : this.realDeer;
        if (deer.root.parent) return false;
        if (fake && !skyFree) return false;
        const p = this.spot(26, 33, 0, 0.9); if (!p) return false;
        deer.place(p.x, p.z, Math.atan2(P.pos.x - p.x, P.pos.z - p.z) + (fake ? 0.6 : 1.6 * (Math.random() - 0.5)));
        deer.mode = fake ? 'still' : 'graze'; deer.fadeOut = 0; deer.seenLit = 0;
        this.world.scene.add(deer.root);
        if (fake) { this.standoffT = 0; this.lookAwayT = 0; this.timers.skyCool = 999; }
        else this.snd.play('deer_call', { pos: p, vol: 0.6, ref: 8 });
        return true;
      }
    }
    return false;
  }

  scheduleScare() {
    const c = this.clues;
    const opts: [string, number][] = [
      ['twig', 2], ['deerCall', 1], ['whispers', c >= 1 ? 1 : 0.3],
      ['watch', c >= 1 ? 1.6 : this.t > 40 ? 0.8 : 0],
      ['runby', c >= 2 ? 1.1 : 0], ['realDeer', c >= 1 ? 0.9 : 0], ['fakeDeer', c >= 2 ? 1.5 : 0], ['stalk', c >= 3 ? 1.1 : 0],
    ];
    const tot = opts.reduce((a, o) => a + o[1], 0);
    let r = Math.random() * tot;
    for (const [k, w] of opts) { r -= w; if (r <= 0) { if (!this.runEvent(k)) this.runEvent('twig'); break; } }
    this.timers.scare = (c >= 3 ? 14 : 20) + Math.random() * 16;
  }

  // ---------------------------------------------------------------- disfarce revelado
  reveal(deer: Deer) {
    const p = deer.root.position.clone();
    deer.root.removeFromParent();
    this.sky.appear(p.x, p.z, Math.atan2(this.player.pos.x - p.x, this.player.pos.z - p.z), 'rise');
    this.snd.play('transform', { pos: p.clone().setY(p.y + 1.5), vol: 1, ref: 6 });
    setTimeout(() => this.snd.play('scream', { pos: p.clone().setY(p.y + 2.5), vol: 1, ref: 8 }), 350);
    this.snd.play('stinger', { vol: 0.9 });
    this.fx.flash = 0.35; this.player.shake = 0.8; this.tension = 1;
    navigator.vibrate?.([60, 30, 60]);
    if (this.player.pos.distanceTo(p) < 14) {
      const d = p.clone().sub(this.player.cam.position);
      this.player.forceLook = { yaw: Math.atan2(-d.x, -d.z), pitch: 0.12, t: 0.5 };
    }
    this.flags.firstReveal = true;
    this.timers.skyCool = 20;
  }

  onPlayerHit(dmg: number) {
    if (this.state !== 'play') return;
    this.player.hurt(dmg, this.sky.headPos());
    this.snd.play('stinger', { vol: 0.7, rate: 1.1 });
    this.fx.flash = 0.15; this.fx.ca = 1;
    if (this.player.dead) this.die();
  }

  die() {
    this.state = 'dead';
    this.timers.deathT = 2.2;
    this.snd.play('scream', { vol: 1, rate: 0.9 });
    this.input.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  retry() {
    this.show(null);
    $('hud').hidden = false;
    this.sky.hide(); this.sky.boss = false;
    this.realDeer.root.removeFromParent(); this.fakeDeer.root.removeFromParent();
    this.loops.run?.stop(); this.loops.run = undefined;
    let cp = this.checkpoint;
    if (this.flags.boss && !this.flags.won) { this.flags.boss = false; cp = { x: LAIR.x, z: LAIR.z + 24, yaw: 0 }; this.setObjective(OBJ[5]); }
    this.player.spawn(cp.x, cp.z, cp.yaw);
    this.player.ammo = Math.max(this.player.ammo, 6); this.player.reserve = Math.max(this.player.reserve, 12);
    this.player.battery = Math.max(this.player.battery, 0.5); this.player.reloading = 0;
    this.tension = 0; this.fx.fade = 1; this.fx.damage = 0;
    this.timers.skyCool = 25; this.timers.scare = 20;
    this.state = 'play'; this.input.enabled = true; this.input.clearEdges();
    this.snd.ctx.resume().catch(() => {});
    if (!this.input.touch) this.canvas.requestPointerLock?.();
  }

  startBoss() {
    this.flags.boss = true;
    this.voice('v_lair', 'Esse cheiro… é aqui. Apareça, desgraçado!', 'Você');
    this.setObjective('Mate o Skywalker.');
    this.player.reserve = Math.max(this.player.reserve, 12);
    this.timers.bossIn = 4.2;
    this.realDeer.root.removeFromParent(); this.fakeDeer.root.removeFromParent();
    if (this.sky.state !== 'hidden') this.sky.hide();
  }

  bossAppear() {
    const p = this.spot(10, 13, Math.PI, 0.6) ?? this.spot(10, 14, 0, 2) ?? this.world.lairCenter.clone();
    this.sky.boss = true; this.sky.health = 8;
    this.sky.appear(p.x, p.z, Math.atan2(this.player.pos.x - p.x, this.player.pos.z - p.z), 'rise');
    this.snd.play('scream', { pos: p.clone().setY(p.y + 2.5), vol: 1, ref: 10 });
    this.snd.play('stinger', { vol: 1 });
    this.tension = 1; this.fx.flash = 0.3;
  }

  win() {
    this.flags.won = true;
    this.state = 'ending';
    this.snd.play('creature_death', { pos: this.sky.pos.clone().setY(this.sky.pos.y + 1.5), vol: 1, ref: 10 });
    this.timers.endT = 0;
    this.input.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  async endingSequence() {
    $('hud').hidden = true;
    this.loops.drone?.stop(2); this.loops.run?.stop();
    this.show('screen-ending');
    const box = $('ending-lines');
    const line = (t: string, cls = '') => { const p = document.createElement('p'); p.textContent = t; if (cls) p.className = cls; box.append(p); };
    const wait = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
    line('O Skywalker caiu entre os próprios ossos.');
    await wait(1.2);
    this.snd.play('v_win', { bus: 'voice' });
    line('“Acabou. Acabou… Theo? Theo!”');
    await wait(4.2);
    this.snd.play('k_papai', { bus: 'voice', rate: 1.12 });
    line('“Papai?”', 'kid');
    await wait(2.2);
    line('Theo estava vivo, encolhido no oco de um tronco a poucos metros do covil.');
    await wait(2.6);
    line('Ao amanhecer, vocês saíram juntos da floresta.');
    await wait(3.2);
    this.snd.play('deer_call', { vol: 0.5, rate: 0.8 });
    line('Na beira da estrada, um cervo observava os dois. Sem piscar.');
    await wait(3);
    line('FIM', 'end');
    $('ending-menu').hidden = false;
  }

  // ---------------------------------------------------------------- tiro
  shoot() {
    const s = this.player.fire();
    if (!s) return;
    const horiz = Math.hypot(s.d.x, s.d.z);
    // assusta cervos de verdade
    if (this.realDeer.root.parent && this.realDeer.root.position.distanceTo(this.player.pos) < 60) this.realDeer.flee(this.player.pos);
    // Skywalker
    const dk = this.sky.rayHit(s.o, s.d, 70);
    if (dk > 0 && this.world.colliders.ray(s.o.x, s.o.z, s.o.x + s.d.x * dk, s.o.z + s.d.z * dk, 3) > dk * horiz - 0.4) {
      const hit = s.o.clone().addScaledVector(s.d, dk);
      this.bloodPuff(hit);
      const r = this.sky.shot();
      this.snd.play('creature_pain', { pos: hit, vol: 1, ref: 6, rate: 0.9 + Math.random() * 0.2 });
      if (r === 'dead') this.win();
      else if (r === 'retreat') { this.sky.set('retreat'); this.timers.skyCool = 35; }
      return;
    }
    // cervo disfarçado (ou não)
    for (const deer of [this.fakeDeer, this.realDeer]) {
      if (!deer.root.parent) continue;
      const c = deer.root.position.clone().setY(deer.root.position.y + 1.2);
      const t = c.clone().sub(s.o).dot(s.d);
      if (t < 0) continue;
      const closest = s.o.clone().addScaledVector(s.d, t);
      if (closest.distanceTo(c) < 0.85 && this.clearLine(s.o, c)) {
        if (deer.disguised) this.reveal(deer); else deer.flee(this.player.pos);
        return;
      }
    }
  }

  private bloodPuff(p: THREE.Vector3) {
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x2a0404, transparent: true, opacity: 0.9, depthWrite: false }));
      sp.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3));
      sp.scale.setScalar(0.12 + Math.random() * 0.15);
      sp.userData.v = new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 1.2, (Math.random() - 0.5) * 1.2);
      sp.userData.life = 0.7;
      this.world.scene.add(sp); this.blood.push(sp);
    }
  }

  // ---------------------------------------------------------------- HUD
  hud(id: string, text: string) { if (this.hudCache[id] !== text) { this.hudCache[id] = text; $(id).textContent = text; } }

  private nearestItem() {
    let best: Interactive | null = null, bd = 2.4;
    const f = this.player.forward();
    for (const it of this.world.items) {
      if (!it.active || it.taken) continue;
      const d = Math.hypot(it.pos.x - this.player.pos.x, it.pos.z - this.player.pos.z);
      if (d > bd) continue;
      const v = it.pos.clone().sub(this.player.eye).normalize();
      if (d > 1.3 && v.dot(f) < 0.45) continue;
      best = it; bd = d;
    }
    return best;
  }

  private updateHud(dt: number) {
    const P = this.player;
    this.hud('ammo', `${P.reloading > 0 ? '…' : P.ammo} | ${P.reserve}`);
    const bf = $('battery-fill');
    const bw = `${Math.round(P.battery * 100)}%`;
    if (bf.style.width !== bw) { bf.style.width = bw; bf.classList.toggle('low', P.battery < 0.2); }
    $('btn-light').classList.toggle('on', P.lightOn);
    const it = this.nearestItem();
    const use = $('btn-use');
    use.hidden = !it;
    if (it) this.hud('btn-use', it.kind === 'clue' ? `PEGAR · ${CLUES[it.index].title}` : it.kind === 'ammo' ? 'PEGAR · munição' : 'PEGAR · pilhas');
    if (this.subsT > 0) { this.subsT -= dt; if (this.subsT <= 0) $('subs').classList.remove('on'); }
    if (this.cardT > 0) { this.cardT -= dt; if (this.cardT <= 0) $('clue-card').hidden = true; }
    if (this.compassT > 0) {
      this.compassT -= dt;
      const rel = angleDiff(P.yaw, this.camYawTo(this.compassTarget));
      const x = clamp(-rel / (Math.PI / 2), -1, 1);
      $('compass-mark').style.left = `${50 + x * 50}%`;
      $('compass').classList.toggle('on', this.compassT > 0);
    }
  }

  // ---------------------------------------------------------------- laço
  renderLoop = () => {
    requestAnimationFrame(this.renderLoop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.t += dt;
    this.fx.time = this.t;
    if (this.state === 'play' || this.state === 'dead' || this.state === 'ending') this.step(dt);
    if (this.state === 'menu') {
      // fundo do menu: câmera parada olhando a trilha, lanterna balançando
      this.player.yaw = Math.sin(this.t * 0.07) * 0.25; this.player.pitch = -0.05;
      this.player.update(dt, false);
      this.world.update(this.player.cam, this.t, this.player.pos);
      this.fx.fade = damp(this.fx.fade, 0.35, 1, dt);
    }
    if (this.state !== 'pause') this.pipe.render(this.world.scene, this.player.cam, this.state === 'ending' ? null : this.player.vmScene, this.player.vmCam, this.fx, dt);
  };

  step(dt: number) {
    const P = this.player, inp = this.input;
    const playing = this.state === 'play';
    // comandos
    if (playing) {
      if (inp.take('pause')) { this.pause(); return; }
      if (inp.take('fire')) this.shoot();
      if (inp.take('reload')) P.reload();
      if (inp.take('light')) P.toggleLight();
      if (inp.take('use')) { const it = this.nearestItem(); if (it) this.takeItem(it); }
    }
    const look = { x: inp.look.x, y: inp.look.y };
    P.onLookDelta(look.x, look.y);
    P.update(dt, playing);
    const slow = this.state === 'ending' ? 0.45 : 1;
    const lit = this.isLit(this.sky.chest(), 26);
    this.sky.update(dt * slow, P.pos, this.world.colliders, lit);
    for (const d of [this.realDeer, this.fakeDeer]) if (d.root.parent) d.update(dt, P.pos, this.world.beam.lightPos.value, this.world.beam.lightDir.value, this.world.beam.lightOn.value, this.world.colliders);
    this.world.update(P.cam, this.t, P.pos);
    this.snd.updateListener(P.cam);
    if (playing) this.direct(dt);
    // sangue
    for (let i = this.blood.length - 1; i >= 0; i--) {
      const b = this.blood[i]; b.userData.life -= dt;
      b.userData.v.y -= 4 * dt; b.position.addScaledVector(b.userData.v, dt);
      (b.material as THREE.SpriteMaterial).opacity = Math.max(0, b.userData.life);
      if (b.userData.life <= 0) { b.removeFromParent(); this.blood.splice(i, 1); }
    }
    // brilho dos itens na lanterna
    const beam = this.world.beam;
    for (const it of this.world.items) {
      if (!it.active || it.taken) { it.glint.visible = false; continue; }
      it.glint.visible = true;
      const v = it.pos.clone().sub(beam.lightPos.value); const d = v.length();
      const b = THREE.MathUtils.smoothstep(v.normalize().dot(beam.lightDir.value), 0.9, 0.985) * beam.lightOn.value / (1 + 0.02 * d * d);
      const base = it.kind === 'clue' ? 0.16 + Math.sin(this.t * 2.2) * 0.08 : 0.06;
      (it.glint.material as THREE.SpriteMaterial).opacity = d < 32 ? clamp(b * 2.5 + base * (d < 14 ? 1 : 0), 0, 0.75) * THREE.MathUtils.smoothstep(d, 1.6, 4.5) : 0;
      it.glint.scale.setScalar(0.18 + b * 0.25 + (it.kind === 'clue' ? 0.06 : 0));
    }
    // efeitos de tela
    this.tension = Math.max(0, this.tension - dt * 0.06);
    const skyNear = this.sky.root.visible ? clamp(1 - this.sky.pos.distanceTo(P.pos) / 30, 0, 1) : 0;
    const chasing = ['chase', 'attack', 'rise', 'stagger'].includes(this.sky.state);
    if (chasing) this.tension = Math.max(this.tension, 0.75 + skyNear * 0.25);
    this.fx.tension = damp(this.fx.tension, this.tension, 2, dt);
    this.fx.damage = clamp(damp(this.fx.damage, P.hurtT * 0.9 + clamp(1 - P.health / 100, 0, 1) * 0.45, 6, dt), 0, 1);
    this.fx.flash = Math.max(0, this.fx.flash - dt * 2.5);
    this.fx.ca = Math.max(0, this.fx.ca - dt * 1.5) + this.fx.tension * 0.15;
    if (this.state === 'play') this.fx.fade = damp(this.fx.fade, 0, 0.9, dt);
    if (this.state === 'dead') {
      this.fx.fade = damp(this.fx.fade, 0.92, 1.4, dt); this.fx.damage = 1;
      this.timers.deathT -= dt;
      if (this.timers.deathT <= 0 && $('screen-death').hidden) { $('hud').hidden = true; this.show('screen-death'); }
    }
    if (this.state === 'ending') {
      this.timers.endT += dt;
      if (this.timers.endT > 3.2) this.fx.fade = damp(this.fx.fade, 1, 1.2, dt);
      if (this.timers.endT > 5.5 && $('screen-ending').hidden) this.endingSequence();
    }
    // som: drone, batimento, passos da criatura
    this.loops.drone?.setVol(0.12 + this.fx.tension * 0.75, 0.3);
    this.loops.amb?.setVol(0.85 - this.fx.tension * 0.45, 0.5);
    this.beat -= dt;
    if (this.fx.tension > 0.35 && this.beat <= 0 && this.state === 'play') { this.snd.heartbeat(0.25 + this.fx.tension * 0.45); this.beat = 1.05 - this.fx.tension * 0.55; }
    const running = this.sky.root.visible && ['chase', 'retreat', 'runby'].includes(this.sky.state);
    if (running && (!this.loops.run || this.loops.run.ended)) this.loops.run = this.snd.play('creature_run', { pos: this.sky.pos.clone().setY(this.sky.pos.y + 0.5), loop: true, vol: 0.9, ref: 6 }) ?? undefined;
    if (!running && this.loops.run) { this.loops.run.stop(0.3); this.loops.run = undefined; }
    this.loops.run?.setPos(this.sky.pos);
    if (playing) this.updateHud(dt);
  }

  /** diretor: guia (choro), sustos, cervos, criatura, chefe */
  direct(dt: number) {
    const P = this.player, sky = this.sky, T = this.timers;
    for (const k of ['cry', 'scare', 'skyCool', 'forced'] as const) T[k] -= dt;
    // guia: choro vindo da próxima pista (ou do covil)
    if (T.cry <= 0 && !this.flags.boss) {
      const target = this.clues < 5 ? this.world.items.find((i) => i.kind === 'clue' && i.index === this.clues)!.pos : this.world.lairCenter;
      const d = target.distanceTo(P.pos);
      if (d > 6) {
        this.snd.play('child_cry', { pos: target.clone().setY(target.y + 1), vol: 1, ref: 16 });
        this.compassTarget.copy(target); this.compassT = 4.5;
      }
      T.cry = this.clues >= 5 ? 20 : 30;
    }
    // eventos amarrados à história e sustos aleatórios
    if (this.forcedEvent && T.forced <= 0) { if (this.runEvent(this.forcedEvent)) this.forcedEvent = null; else T.forced = 4; }
    else if (T.scare <= 0 && !this.flags.boss) this.scheduleScare();
    // rádio do Theo: a criatura imita a voz dele
    if (T.mimic > 0) {
      T.mimic -= dt;
      if (T.mimic <= 0) {
        this.snd.static(0.35, 1.2);
        setTimeout(() => { this.voice('k_help', 'Papai… me ajuda… papai…', 'Rádio', true, { distort: true, rate: 0.86 }); }, 1100);
        setTimeout(() => { this.snd.static(0.4, 0.8); const g = this.spot(4, 6, Math.PI, 0.6); if (g) this.snd.play('growl', { pos: g, vol: 0.9, ref: 3 }); }, 5600);
        T.mimic = -1;
      }
    }
    // bateria
    if (P.battery < 0.2 && !this.flags.battery) { this.flags.battery = true; this.voice('v_battery', 'A bateria está acabando.', 'Você'); }
    // criatura
    const sp = sky.chest();
    const dist = sky.pos.distanceTo(P.pos);
    const seen = sky.root.visible && this.inView(sp, 40) && this.clearLine(P.eye, sp);
    if (sky.state === 'watch') {
      if (sky.litTime > 0.45) { this.snd.play('growl', { pos: sp, vol: 0.55, ref: 4 }); sky.set('retreat'); }
      else if (dist < 14) { if (this.clues >= 2 && Math.random() < 0.6) { sky.set('chase'); this.snd.play('scream', { pos: sp, vol: 1, ref: 8 }); } else sky.set('retreat'); }
      else if (sky.stateT > 7) { if (!seen) sky.hide(); else sky.set('retreat'); }
    }
    if (sky.state === 'retreat' && !seen && dist > 16 && sky.stateT > 1) sky.hide();
    if (sky.state === 'runby' && sky.stateT > 1.5 && !seen && dist > 18) sky.hide();
    // cervos
    const rd = this.realDeer;
    if (rd.root.parent && (rd.mode === 'gone' || rd.root.position.distanceTo(P.pos) > 70)) rd.root.removeFromParent();
    const fd = this.fakeDeer;
    if (fd.root.parent) {
      const dd = fd.root.position.distanceTo(P.pos);
      const head = fd.root.position.clone().setY(fd.root.position.y + 1.4);
      const looking = this.inView(head, 55);
      if (fd.seenLit > 0.6 && !this.flags.deerLine) { this.flags.deerLine = true; this.voice('v_deer', 'Aquele cervo… não está respirando.', 'Você'); }
      this.lookAwayT = !looking && dd < 24 ? this.lookAwayT + dt : 0;
      this.standoffT += dt;
      if (dd < 9 || this.lookAwayT > 1.4 || (this.standoffT > 16 && dd < 30)) this.reveal(fd);
      else if (dd > 52) { fd.root.removeFromParent(); this.timers.skyCool = 15; }
    }
    // covil
    if (this.clues >= 5 && !this.flags.boss && P.pos.distanceTo(this.world.lairCenter) < 17) this.startBoss();
    if (T.bossIn > 0) { T.bossIn -= dt; if (T.bossIn <= 0) this.bossAppear(); }
    if (this.flags.boss && sky.state === 'hidden' && T.bossIn <= 0 && !this.flags.won) { T.bossIn = 2.5; }
  }

  onResize() {
    const w = innerWidth, h = innerHeight;
    this.pipe.resize(w, h);
    this.player?.resize(w, h);
  }
}

const game = new Game();
game.boot().catch((e) => {
  console.error(e);
  $('load-label').textContent = `Erro ao abrir: ${(e && (e.message || e)) ?? e}`.slice(0, 220);
});
(window as unknown as { game: Game }).game = game;
