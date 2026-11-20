import type { Game } from '../Game';
import type { QualityLevel } from '../config';
import { PAINTS } from '../vehicle/CarModel';
import { Minimap } from './Minimap';
import { TouchControls } from './TouchControls';

const ICON = {
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><rect x="2.5" y="6.5" width="13" height="11" rx="2"/><path d="M15.5 10.5l5-3v9l-5-3z" fill="#fff"/></svg>',
  reset: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19 4.5v4h-4"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="#fff"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

/** DOM user interface: loading, title, HUD (speedometer, gear, minimap, buttons), pause menu, touch. */
export class UI {
  readonly root: HTMLElement;
  private loading = el('div', 'screen');
  private title = el('div', 'screen hidden');
  private hud = el('div', 'hidden');
  private pauseScr = el('div', 'screen hidden');
  private barFill!: HTMLElement;
  private loadLabel!: HTMLElement;
  private speedVal!: HTMLElement;
  private gearEl!: HTMLElement;
  private arc!: SVGPathElement;
  private rpmArc!: SVGPathElement;
  private fpsEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private hitEl!: HTMLElement;
  private minimap: Minimap | null = null;
  touch: TouchControls | null = null;
  private game: Game | null = null;
  private toastTimer = 0;
  showFps = false;
  paint = 0;
  onPlay?: () => void;
  onQuality?: (q: QualityLevel | 'auto') => void;
  onPaint?: (i: number) => void;
  onVolume?: (v: number) => void;

  constructor(root: HTMLElement) {
    this.root = root;
    this.buildLoading();
    this.buildTitle();
    this.buildHud();
    this.buildPause();
    root.append(this.loading, this.title, this.hud, this.pauseScr);
  }

  // ------------------------------------------------------------ loading
  private buildLoading() {
    this.loading.id = 'loading';
    this.loading.innerHTML = `<div class="logo"><span class="l1">NIGHT DRIVE</span><span class="l2">NEON CITY</span></div>
      <div class="bar"><i></i></div><div class="load-label">Iniciando</div>`;
    this.barFill = this.loading.querySelector('.bar i')!;
    this.loadLabel = this.loading.querySelector('.load-label')!;
  }
  setProgress(p: number, label: string) {
    this.barFill.style.width = `${Math.round(p * 100)}%`;
    this.loadLabel.textContent = label;
  }
  showError(msg: string) {
    this.loading.classList.remove('hidden');
    const box = el('div', 'error-box', msg);
    this.loading.querySelector('.bar')?.remove();
    this.loadLabel.replaceWith(box);
  }

  // ------------------------------------------------------------ title
  private buildTitle() {
    this.title.id = 'title';
    const isTouch = matchMedia('(pointer: coarse)').matches;
    this.title.innerHTML = `<div class="logo"><span class="l1">NIGHT DRIVE</span><span class="l2">NEON CITY</span></div>
      <button class="btn-play" data-act="play">JOGAR</button>
      <div class="title-opts">
        <div class="paints interactive"></div>
        <select class="chip" data-act="quality" aria-label="Qualidade gráfica">
          <option value="auto">Gráficos: Auto</option><option value="low">Gráficos: Baixo</option><option value="medium">Gráficos: Médio</option>
          <option value="high">Gráficos: Alto</option><option value="ultra">Gráficos: Ultra</option>
        </select>
      </div>
      <div class="keys">${isTouch
        ? 'Volante à esquerda (arraste) · Acelerador, freio/ré e freio de mão à direita · Botões no topo: câmera, reiniciar, pausa'
        : '<b>W</b>/<b>↑</b> acelerar · <b>S</b>/<b>↓</b> frear e ré · <b>A</b> <b>D</b> virar · <b>Espaço</b> freio de mão · <b>C</b> câmera · <b>R</b> reiniciar · <b>L</b> faróis · <b>Esc</b> pausa'}</div>`;
    const paints = this.title.querySelector('.paints')!;
    PAINTS.forEach((p, i) => {
      const b = el('button', 'paint' + (i === 0 ? ' sel' : ''));
      b.style.background = `#${p.color.toString(16).padStart(6, '0')}`;
      b.title = p.name;
      b.setAttribute('aria-label', `Pintura ${p.name}`);
      b.onclick = () => {
        this.paint = i;
        paints.querySelectorAll('.paint').forEach((n, k) => n.classList.toggle('sel', k === i));
        this.onPaint?.(i);
      };
      paints.appendChild(b);
    });
    (this.title.querySelector('[data-act=play]') as HTMLButtonElement).onclick = () => this.onPlay?.();
    const q = this.title.querySelector('[data-act=quality]') as HTMLSelectElement;
    q.onchange = () => { this.onQuality?.(q.value as QualityLevel | 'auto'); this.syncQuality(q.value); };
  }

  private syncQuality(v: string) {
    this.root.querySelectorAll<HTMLSelectElement>('select[data-act=quality]').forEach((s) => { s.value = v; });
  }

  // ------------------------------------------------------------ HUD
  private buildHud() {
    this.hud.id = 'hud';
    const R = 100, cx = 125, cy = 125;
    const a0 = (140 * Math.PI) / 180, a1 = (400 * Math.PI) / 180; // 260° sweep
    const pt = (a: number, r: number) => `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
    const arcPath = (r: number, from: number, to: number) => `M ${pt(from, r)} A ${r} ${r} 0 ${to - from > Math.PI ? 1 : 0} 1 ${pt(to, r)}`;
    let ticks = '';
    const maxKmh = 300;
    for (let v = 0; v <= maxKmh; v += 10) {
      const a = a0 + ((a1 - a0) * v) / maxKmh;
      const major = v % 50 === 0;
      ticks += `<line x1="${pt(a, R - (major ? 13 : 7)).split(' ')[0]}" y1="${pt(a, R - (major ? 13 : 7)).split(' ')[1]}" x2="${pt(a, R).split(' ')[0]}" y2="${pt(a, R).split(' ')[1]}" stroke="${v >= 250 ? '#ff3355' : 'rgba(255,255,255,.75)'}" stroke-width="${major ? 2.2 : 1.2}"/>`;
      if (major) {
        const [tx, ty] = pt(a, R - 26).split(' ');
        ticks += `<text x="${tx}" y="${ty}" fill="rgba(255,255,255,.8)" font-size="12" font-family="Rajdhani" font-weight="600" text-anchor="middle" dominant-baseline="middle" font-style="italic">${v}</text>`;
      }
    }
    this.hud.innerHTML = `
      <div class="hit-flash"></div>
      <div class="minimap"><canvas width="340" height="340"></canvas></div>
      <div class="top-btns">
        <button class="round" data-act="cam" aria-label="Alternar câmera" title="Câmera (C)">${ICON.camera}</button>
        <button class="round" data-act="reset" aria-label="Reiniciar veículo" title="Reiniciar (R)">${ICON.reset}</button>
        <button class="round" data-act="pause" aria-label="Pausar" title="Pausa (Esc)">${ICON.pause}</button>
      </div>
      <div class="speedo">
        <svg viewBox="0 0 250 250">
          <circle cx="125" cy="125" r="112" fill="rgba(6,6,12,.5)" stroke="rgba(255,255,255,.12)"/>
          <path d="${arcPath(R + 6, a0, a1)}" stroke="rgba(255,255,255,.1)" stroke-width="5" fill="none"/>
          <path class="spd-arc" d="${arcPath(R + 6, a0, a1)}" stroke="url(#sg)" stroke-width="5" fill="none" stroke-linecap="round"/>
          <path d="${arcPath(R - 40, a0, a1)}" stroke="rgba(255,255,255,.08)" stroke-width="3" fill="none"/>
          <path class="rpm-arc" d="${arcPath(R - 40, a0, a1)}" stroke="#ff3355" stroke-width="3" fill="none"/>
          <defs><linearGradient id="sg" x1="0" x2="1"><stop offset="0" stop-color="#2ee6ff"/><stop offset=".7" stop-color="#ff3fd0"/><stop offset="1" stop-color="#ff3355"/></linearGradient></defs>
          ${ticks}
        </svg>
        <div class="val">0</div><div class="unit">km/h</div><div class="gear">N</div>
      </div>
      <div class="fps" hidden></div>
      <div class="toast"></div>
      <div id="touch"></div>`;
    this.speedVal = this.hud.querySelector('.val')!;
    this.gearEl = this.hud.querySelector('.gear')!;
    this.arc = this.hud.querySelector('.spd-arc')!;
    this.rpmArc = this.hud.querySelector('.rpm-arc')!;
    this.fpsEl = this.hud.querySelector('.fps')!;
    this.toastEl = this.hud.querySelector('.toast')!;
    this.hitEl = this.hud.querySelector('.hit-flash')!;
    for (const p of [this.arc, this.rpmArc]) {
      const len = p.getTotalLength?.() || 600;
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
      p.dataset.len = String(len);
    }
  }

  // ------------------------------------------------------------ pause
  private buildPause() {
    this.pauseScr.id = 'pause';
    this.pauseScr.innerHTML = `<div class="panel interactive" role="dialog" aria-label="Pausa">
      <h2>PAUSA</h2>
      <button class="menu-btn" data-act="resume">Continuar</button>
      <button class="menu-btn" data-act="restart">Reiniciar veículo</button>
      <button class="menu-btn" data-act="cam">Câmera: <span class="cam-name">Próxima</span></button>
      <div class="row"><span>Gráficos</span><select class="chip" data-act="quality">
        <option value="auto">Auto</option><option value="low">Baixo</option><option value="medium">Médio</option><option value="high">Alto</option><option value="ultra">Ultra</option></select></div>
      <div class="row"><span>Volume</span><input type="range" min="0" max="1" step="0.05" value="0.7" data-act="volume" aria-label="Volume"/></div>
      <div class="row"><span>Mostrar FPS</span><input type="checkbox" data-act="fps" aria-label="Mostrar FPS"/></div>
      <button class="menu-btn" data-act="title">Menu inicial</button>
      <div class="help">Teclado: W/↑ acelerar · S/↓ frear e ré · A/D virar · Espaço freio de mão · C câmera · R reiniciar · L faróis · Esc pausa. Controle (gamepad) também funciona.</div>
    </div>`;
  }

  // ------------------------------------------------------------ wiring
  bind(game: Game) {
    this.game = game;
    this.minimap = new Minimap(this.hud.querySelector('.minimap canvas')!, game.world.city);
    const touchRoot = this.hud.querySelector('#touch') as HTMLElement;
    this.touch = new TouchControls(touchRoot, game.input);
    const camNames: Record<string, string> = { near: 'Próxima', far: 'Distante', hood: 'Capô' };
    const camLabel = () => { const n = this.pauseScr.querySelector('.cam-name'); if (n) n.textContent = camNames[game.chase.mode]; };
    const act = (a: string) => {
      if (a === 'cam') { game.cycleCamera(); camLabel(); this.toast(`Câmera: ${camNames[game.chase.mode]}`); }
      if (a === 'reset') { game.resetCar(); this.toast('Veículo reiniciado'); }
      if (a === 'pause') game.togglePause();
      if (a === 'resume') game.resume();
      if (a === 'restart') { game.resetCar(); game.resume(); }
      if (a === 'title') { game.setState('title'); }
    };
    this.root.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) => {
      const a = b.dataset.act!;
      if (a === 'play') return;
      b.addEventListener('click', (e) => { e.stopPropagation(); act(a); (b as HTMLElement).blur(); });
    });
    const q = this.pauseScr.querySelector('select[data-act=quality]') as HTMLSelectElement;
    q.onchange = () => { this.onQuality?.(q.value as QualityLevel | 'auto'); this.syncQuality(q.value); };
    (this.pauseScr.querySelector('[data-act=volume]') as HTMLInputElement).oninput = (e) => this.onVolume?.(Number((e.target as HTMLInputElement).value));
    (this.pauseScr.querySelector('[data-act=fps]') as HTMLInputElement).onchange = (e) => { this.showFps = (e.target as HTMLInputElement).checked; this.fpsEl.hidden = !this.showFps; };
    game.input.on('camera', () => { camLabel(); this.toast(`Câmera: ${camNames[game.chase.mode]}`); });
    game.input.on('reset', () => this.toast('Veículo reiniciado'));
    game.input.on('pause', () => game.togglePause());
    game.input.on('lights', () => this.toast(game.lights ? 'Faróis ligados' : 'Faróis desligados'));
    camLabel();
  }

  setQualityValue(v: string) { this.syncQuality(v); }

  onState(s: string) {
    this.loading.classList.add('hidden');
    this.title.classList.toggle('hidden', s !== 'title');
    this.hud.classList.toggle('hidden', s !== 'playing' && s !== 'paused');
    this.pauseScr.classList.toggle('hidden', s !== 'paused');
    if (s === 'paused') (this.pauseScr.querySelector('[data-act=resume]') as HTMLElement)?.focus();
    if (s === 'title') (this.title.querySelector('[data-act=play]') as HTMLElement)?.focus();
  }

  toast(msg: string) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 1400);
  }

  impact(strength: number) {
    this.hitEl.classList.add('on');
    this.hitEl.style.opacity = String(Math.min(1, strength));
    requestAnimationFrame(() => requestAnimationFrame(() => this.hitEl.classList.remove('on')));
  }

  /** Called every frame. */
  update() {
    const g = this.game;
    if (!g || (g.state !== 'playing' && g.state !== 'paused')) return;
    const p = g.physics;
    const kmh = Math.round(p.kmh);
    this.speedVal.textContent = String(kmh);
    const gear = p.gear === -1 ? 'R' : p.speed < 0.3 && g.input.state.throttle < 0.05 ? 'N' : String(p.gear);
    if (this.gearEl.textContent !== gear) { this.gearEl.textContent = gear; this.gearEl.classList.toggle('r', gear === 'R'); }
    const len = Number(this.arc.dataset.len);
    this.arc.style.strokeDashoffset = String(len * (1 - Math.min(1, kmh / 300)));
    const rl = Number(this.rpmArc.dataset.len);
    this.rpmArc.style.strokeDashoffset = String(rl * (1 - Math.min(1, p.rpm / 8000)));
    this.minimap?.draw(g.car.root.position.x, g.car.root.position.z, g.car.root.rotation.y);
    if (this.showFps) this.fpsEl.textContent = `${g.fps.toFixed(0)} FPS · ${g.quality} · ${(g.resScale * 100).toFixed(0)}%`;
  }
}
