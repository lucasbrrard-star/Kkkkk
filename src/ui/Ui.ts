// Interface em DOM (nítida em qualquer DPI): HUD, joystick analógico multitoque,
// botões de ação, painéis de informação, diálogo de NPC e menu de pausa.
import { CONFIG } from '../config';
import { events } from '../core/events';
import { InputController } from '../systems/InputController';
import { Interactable } from '../world/MapData';
import { sfx } from '../audio/Sfx';

const ICON = {
  coin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#f6c343" stroke="#b07a12" stroke-width="2"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="800" fill="#8a5a06" font-family="system-ui">$</text></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="#ff8a5c"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
  run: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="14.5" cy="4" r="2.2"/><path d="M10.2 8.3 7 9.8l-1.4 3.4 1.8.7 1.1-2.6 1.6-.7-1.6 5.6-3.7 3.4 1.3 1.4 4.2-3.9 1.1-2.4 2.3 2.2V22h1.9v-5.9l-2.4-2.5.9-3.3 1 1.8 3.5 1.1.6-1.8-2.8-.9-1.6-3a2.3 2.3 0 0 0-2.7-1.1z"/></svg>',
  jump: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/><path d="M5 22h14" opacity=".5"/></svg>',
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

const KIND_LABEL: Record<string, string> = { house: 'Ver casa', lot: 'Ver terreno', busstop: 'Ver parada', npc: 'Conversar', cart: 'Ver carrinho', sign: 'Ler placa' };

export interface Settings { sound: boolean; zoom: number; fps: boolean; touch: 'auto' | 'on' | 'off'; name: string; time: 'dia' | 'tarde' | 'noite' }

export class Ui {
  root: HTMLElement;
  paused = false;
  panelOpen = false;
  settings: Settings;
  private el: Record<string, HTMLElement> = {};
  private joyId: number | null = null;
  private focus: Interactable | null = null;
  onSettings?: (s: Settings) => void;
  onRestart?: () => void;
  onInteract?: () => void;

  constructor(private input: InputController) {
    this.root = document.getElementById('ui')!;
    let saved: Partial<Settings> = {};
    try { saved = JSON.parse(localStorage.getItem('cv-settings') || '{}'); } catch { /* sem storage */ }
    this.settings = { sound: true, zoom: 0, fps: false, touch: 'auto', name: 'Visitante', time: 'dia', ...saved };
    this.build();
    this.bindTouch();
    this.applyTouchMode();
    events.on('interact:focus', (it: Interactable | null) => this.setFocus(it));
  }

  private h(html: string): HTMLElement {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild as HTMLElement;
  }

  private build() {
    const r = this.root;
    r.innerHTML = '';
    r.append(this.h(`
      <div class="hud-top">
        <div class="card player-card">
          <canvas id="avatar" width="24" height="24"></canvas>
          <div class="pc-text"><b id="pname"></b><span class="region"><i>${ICON.pin}</i><span id="region">Ilha Inicial</span></span></div>
        </div>
        <div class="hud-right">
          <div class="card pill coins"><i>${ICON.coin}</i><b id="coins"></b></div>
          <button class="icon-btn" id="btn-menu" aria-label="Configurações e menu">${ICON.gear}</button>
        </div>
      </div>`));
    r.append(this.h('<div id="fps" class="fps hidden"></div>'));
    r.append(this.h(`<div id="prompt" class="prompt hidden"><kbd>E</kbd><span id="prompt-text"></span></div>`));
    r.append(this.h(`
      <div id="touch" class="touch">
        <div id="joy" class="joy" aria-label="Analógico"><div class="joy-ring"></div><div id="knob" class="knob"></div></div>
        <div class="actions">
          <button id="b-interact" class="act big disabled" aria-label="Interagir">${ICON.hand}<span id="b-interact-l">Interagir</span></button>
          <button id="b-jump" class="act" aria-label="Pular">${ICON.jump}<span>Pular</span></button>
          <button id="b-run" class="act" aria-label="Correr (segure)">${ICON.run}<span>Correr</span></button>
        </div>
      </div>`));
    r.append(this.h(`<div id="panel" class="panel hidden" role="dialog"><button class="x" id="panel-x" aria-label="Fechar">${ICON.close}</button><div id="panel-body"></div></div>`));
    r.append(this.h(`<div id="dialog" class="dialog hidden"><div class="d-name" id="d-name"></div><div class="d-text" id="d-text"></div><div class="d-hint">toque ou E para continuar</div></div>`));
    r.append(this.h(`<div id="toast" class="toast hidden"></div>`));
    r.append(this.h(`
      <div id="menu" class="modal hidden" role="dialog" aria-modal="true">
        <div class="sheet">
          <div id="menu-main">
            <h2>Pausado</h2>
            <button class="mbtn primary" data-act="resume">Continuar</button>
            <button class="mbtn" data-act="settings">Configurações</button>
            <button class="mbtn" data-act="controls">Controles</button>
            <button class="mbtn" data-act="restart">Reiniciar demonstração</button>
          </div>
          <div id="menu-settings" class="hidden">
            <h2>Configurações</h2>
            <label class="row"><span>Nome do jogador</span><input id="s-name" maxlength="16" autocomplete="off"></label>
            <label class="row"><span>Som</span><input type="checkbox" id="s-sound"></label>
            <label class="row"><span>Mostrar FPS</span><input type="checkbox" id="s-fps"></label>
            <div class="row"><span>Zoom</span><div class="seg"><button data-z="-1">−</button><b id="s-zoom">Auto</b><button data-z="1">+</button></div></div>
            <label class="row"><span>Controles de toque</span><select id="s-touch"><option value="auto">Automático</option><option value="on">Sempre</option><option value="off">Ocultar</option></select></label>
            <label class="row"><span>Horário</span><select id="s-time"><option value="dia">Dia</option><option value="tarde">Pôr do sol</option><option value="noite">Noite</option></select></label>
            <button class="mbtn primary" data-act="back">Voltar</button>
          </div>
          <div id="menu-controls" class="hidden">
            <h2>Controles</h2>
            <div class="ctl-grid">
              <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / setas</div><div>Mover</div>
              <div><kbd>Shift</kbd></div><div>Correr (segurar)</div>
              <div><kbd>Espaço</kbd></div><div>Pular</div>
              <div><kbd>E</kbd></div><div>Interagir</div>
              <div><kbd>Esc</kbd></div><div>Menu</div>
            </div>
            <p class="muted">No celular: analógico à esquerda (movimento proporcional à inclinação); à direita, <b>Correr</b> (segure), <b>Pular</b> e <b>Interagir</b>.</p>
            <button class="mbtn primary" data-act="back">Voltar</button>
          </div>
        </div>
      </div>`));
    for (const id of ['coins', 'pname', 'region', 'prompt', 'prompt-text', 'touch', 'joy', 'knob', 'b-interact', 'b-interact-l', 'b-jump', 'b-run', 'panel', 'panel-body', 'panel-x', 'dialog', 'd-name', 'd-text', 'toast', 'menu', 'menu-main', 'menu-settings', 'menu-controls', 'fps', 'btn-menu', 's-zoom']) {
      this.el[id] = document.getElementById(id)!;
    }
    this.setCoins(CONFIG.economy.startCoins);
    this.el.pname.textContent = this.settings.name;

    this.el['btn-menu'].addEventListener('click', () => this.openMenu());
    this.el['panel-x'].addEventListener('click', () => this.closePanel());
    this.el.dialog.addEventListener('pointerdown', () => this.closeDialog());
    this.el.menu.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!t) { if (e.target === this.el.menu) this.closeMenu(); return; }
      sfx.ui();
      const act = t.dataset.act;
      if (act === 'resume') this.closeMenu();
      if (act === 'settings') this.showMenuPage('settings');
      if (act === 'controls') this.showMenuPage('controls');
      if (act === 'back') this.showMenuPage('main');
      if (act === 'restart') { this.closeMenu(); this.onRestart?.(); this.toast('Demonstração reiniciada'); }
    });
    // configurações
    const sName = document.getElementById('s-name') as HTMLInputElement;
    const sSound = document.getElementById('s-sound') as HTMLInputElement;
    const sFps = document.getElementById('s-fps') as HTMLInputElement;
    const sTouch = document.getElementById('s-touch') as HTMLSelectElement;
    const sTime = document.getElementById('s-time') as HTMLSelectElement;
    sName.value = this.settings.name; sSound.checked = this.settings.sound; sFps.checked = this.settings.fps; sTouch.value = this.settings.touch; sTime.value = this.settings.time;
    sName.addEventListener('input', () => { this.settings.name = sName.value.trim() || 'Visitante'; this.el.pname.textContent = this.settings.name; this.saveSettings(); });
    sSound.addEventListener('change', () => { this.settings.sound = sSound.checked; this.saveSettings(); });
    sFps.addEventListener('change', () => { this.settings.fps = sFps.checked; this.saveSettings(); });
    sTouch.addEventListener('change', () => { this.settings.touch = sTouch.value as Settings['touch']; this.applyTouchMode(); this.saveSettings(); });
    sTime.addEventListener('change', () => { this.settings.time = sTime.value as Settings['time']; this.saveSettings(); });
    this.el['menu-settings'].querySelectorAll('[data-z]').forEach((b) => b.addEventListener('click', () => {
      this.settings.zoom = Math.max(-2, Math.min(3, this.settings.zoom + Number((b as HTMLElement).dataset.z)));
      this.saveSettings();
    }));
    this.updateZoomLabel();
  }

  private saveSettings() {
    try { localStorage.setItem('cv-settings', JSON.stringify(this.settings)); } catch { /* ignore */ }
    this.el.fps.classList.toggle('hidden', !this.settings.fps);
    this.updateZoomLabel();
    this.onSettings?.(this.settings);
  }

  private updateZoomLabel() { this.el['s-zoom'].textContent = this.settings.zoom === 0 ? 'Auto' : (this.settings.zoom > 0 ? '+' : '') + this.settings.zoom; }

  applyTouchMode() {
    const coarse = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    const show = this.settings.touch === 'on' || (this.settings.touch === 'auto' && coarse);
    this.el.touch.classList.toggle('hidden', !show);
    document.body.classList.toggle('has-touch', show);
    this.el.fps.classList.toggle('hidden', !this.settings.fps);
  }

  // ----------------------------------------------------------------- toque
  private bindTouch() {
    const joy = this.el.joy, knob = this.el.knob;
    const R = () => joy.getBoundingClientRect().width * 0.42;
    const setKnob = (dx: number, dy: number) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
    const update = (e: PointerEvent) => {
      const b = joy.getBoundingClientRect();
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const rad = R();
      const d = Math.hypot(dx, dy);
      if (d > rad) { dx = (dx / d) * rad; dy = (dy / d) * rad; }
      setKnob(dx, dy);
      let mag = Math.min(1, d / rad);
      const dead = 0.14;
      mag = mag < dead ? 0 : (mag - dead) / (1 - dead);   // zona morta + resposta proporcional
      const n = d > 0 ? 1 / d : 0;
      this.input.touchVec = { x: (e.clientX - cx) * n * mag, y: (e.clientY - cy) * n * mag };
      this.input.lastDevice = 'touch';
      joy.classList.toggle('active', mag > 0);
    };
    joy.addEventListener('pointerdown', (e) => {
      if (this.joyId !== null) return;
      this.joyId = e.pointerId; joy.setPointerCapture(e.pointerId); sfx.start(); update(e); e.preventDefault();
    });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === this.joyId) update(e); });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null; this.input.touchVec = { x: 0, y: 0 }; setKnob(0, 0); joy.classList.remove('active');
    };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end); joy.addEventListener('lostpointercapture', end);

    const run = this.el['b-run'];
    const runIds = new Set<number>();
    run.addEventListener('pointerdown', (e) => { runIds.add(e.pointerId); run.setPointerCapture(e.pointerId); this.input.touchRun = true; run.classList.add('on'); e.preventDefault(); });
    const runEnd = (e: PointerEvent) => { runIds.delete(e.pointerId); if (!runIds.size) { this.input.touchRun = false; run.classList.remove('on'); } };
    run.addEventListener('pointerup', runEnd); run.addEventListener('pointercancel', runEnd); run.addEventListener('lostpointercapture', runEnd);

    const tap = (btn: HTMLElement, fn: () => void) => btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); sfx.start(); btn.classList.add('on'); fn(); setTimeout(() => btn.classList.remove('on'), 120);
    });
    tap(this.el['b-jump'], () => this.input.press('jump'));
    tap(this.el['b-interact'], () => this.input.press('interact'));
    // impede gestos do navegador (zoom/rolagem) sobre o jogo
    document.addEventListener('touchmove', (e) => { if (!(e.target as HTMLElement).closest('.sheet,.panel')) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  // ----------------------------------------------------------------- HUD
  setCoins(v: number) { this.el.coins.textContent = v.toLocaleString('pt-BR'); }
  setRegion(n: string) { if (this.el.region.textContent !== n) this.el.region.textContent = n; }
  setFps(v: number) { this.el.fps.textContent = `${v} FPS`; }

  setAvatar(img: HTMLImageElement | HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number) {
    const c = document.getElementById('avatar') as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  }

  private setFocus(it: Interactable | null) {
    this.focus = it;
    const b = this.el['b-interact'];
    if (it && !this.panelOpen) {
      this.el['prompt-text'].textContent = `${KIND_LABEL[it.kind] ?? 'Interagir'} · ${it.title}`;
      this.el.prompt.classList.remove('hidden');
      b.classList.remove('disabled');
      this.el['b-interact-l'].textContent = KIND_LABEL[it.kind] ?? 'Interagir';
    } else {
      this.el.prompt.classList.add('hidden');
      b.classList.toggle('disabled', !it);
      if (!it) this.el['b-interact-l'].textContent = 'Interagir';
    }
    if (!it && this.panelOpen) this.closePanel();
  }

  showInfo(it: Interactable, extra: Record<string, string> = {}) {
    const rows = { ...it.info, ...extra };
    const status = rows['Situação'];
    const badge = status ? `<span class="badge ${status.startsWith('Disponível') ? 'ok' : ''}">${status}</span>` : '';
    const body = `
      <div class="p-head"><div class="p-kind">${({ house: 'Residência', lot: 'Terreno', busstop: 'Ponto de ônibus', cart: 'Comércio', sign: 'Sinalização' } as Record<string, string>)[it.kind] ?? ''}</div>
      <h3>${it.title}</h3>${it.subtitle ? `<div class="p-sub">${it.subtitle}</div>` : ''}${badge}</div>
      <dl>${Object.entries(rows).filter(([k]) => k !== 'Situação' && k !== 'Observação').map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      ${rows['Observação'] ? `<p class="note">${rows['Observação']}</p>` : ''}
      ${it.kind === 'lot' ? '<button class="mbtn primary" disabled>Comprar terreno · em breve</button>' : ''}`;
    this.el['panel-body'].innerHTML = body;
    this.el.panel.classList.remove('hidden');
    this.panelOpen = true;
    this.el.prompt.classList.add('hidden');
    sfx.ui();
  }

  closePanel() {
    if (!this.panelOpen) return;
    this.panelOpen = false;
    this.el.panel.classList.add('hidden');
    this.setFocus(this.focus);
  }

  showDialog(name: string, text: string) {
    this.el['d-name'].textContent = name;
    this.el['d-text'].textContent = '';
    this.el.dialog.classList.remove('hidden');
    this.panelOpen = true;
    this.el.prompt.classList.add('hidden');
    // efeito de máquina de escrever
    let i = 0;
    const tick = () => { if (i <= text.length && !this.el.dialog.classList.contains('hidden')) { this.el['d-text'].textContent = text.slice(0, i++); setTimeout(tick, 18); } };
    tick();
    sfx.ui();
  }

  closeDialog() {
    if (this.el.dialog.classList.contains('hidden')) return;
    this.el.dialog.classList.add('hidden');
    this.panelOpen = false;
    this.setFocus(this.focus);
  }

  get dialogOpen() { return !this.el.dialog.classList.contains('hidden'); }

  toast(msg: string) {
    const t = this.el.toast;
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout((t as unknown as { _h: number })._h);
    (t as unknown as { _h: number })._h = window.setTimeout(() => t.classList.add('hidden'), 2200);
  }

  // ----------------------------------------------------------------- menu
  openMenu() {
    this.paused = true;
    this.input.clear();
    this.showMenuPage('main');
    this.el.menu.classList.remove('hidden');
    sfx.ui();
  }
  closeMenu() {
    this.paused = false;
    this.el.menu.classList.add('hidden');
    (document.activeElement as HTMLElement | null)?.blur?.();
  }
  toggleMenu() { if (this.paused) this.closeMenu(); else this.openMenu(); }
  private showMenuPage(p: 'main' | 'settings' | 'controls') {
    this.el['menu-main'].classList.toggle('hidden', p !== 'main');
    this.el['menu-settings'].classList.toggle('hidden', p !== 'settings');
    this.el['menu-controls'].classList.toggle('hidden', p !== 'controls');
  }
}
