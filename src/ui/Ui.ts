// Interface em DOM (nítida em qualquer DPI) no estilo da referência:
// HUD com recursos, clima e relógio; menu lateral; catálogo de construção;
// joystick multitoque; botões de ação; painéis, diálogo, minimapa e menu de pausa.
import { CONFIG } from '../config';
import { events } from '../core/events';
import { InputController } from '../systems/InputController';
import { Interactable } from '../world/MapData';
import { sfx } from '../audio/Sfx';
import { ICON } from './icons';

const KIND_LABEL: Record<string, string> = { house: 'Ver casa', lot: 'Ver terreno', busstop: 'Ver parada', npc: 'Conversar', cart: 'Ver carrinho', sign: 'Ler placa', shop: 'Ver café', landmark: 'Ver atração' };

const CATALOG: Record<string, { name: string; price: number; frame: string }[]> = {
  Casas: [
    { name: 'Casa Padrão', price: 8000, frame: 'casa1' }, { name: 'Casa Moderna', price: 12000, frame: 'casa2' },
    { name: 'Café', price: 15000, frame: 'cafe' }, { name: 'Casa de Praia', price: 20000, frame: 'casa3' },
  ],
  'Decorações': [
    { name: 'Buganvília', price: 350, frame: 'boug0' }, { name: 'Canteiro', price: 280, frame: 'bed_x' },
    { name: 'Chafariz', price: 2400, frame: 'fountain_0' }, { name: 'Vaso', price: 120, frame: 'pot0' },
  ],
  'Vegetação': [
    { name: 'Ipê Rosa', price: 900, frame: 'ipe0' }, { name: 'Ipê Amarelo', price: 900, frame: 'ama0' },
    { name: 'Jacarandá', price: 950, frame: 'jac0' }, { name: 'Coqueiro', price: 700, frame: 'palm0_0' },
  ],
  Urbano: [
    { name: 'Poste', price: 400, frame: 'lamp' }, { name: 'Banco', price: 250, frame: 'bench_x' },
    { name: 'Lixeira', price: 90, frame: 'trash' }, { name: 'Ponto de Ônibus', price: 1800, frame: 'busstop' },
  ],
  Lazer: [
    { name: 'Guarda-sol', price: 300, frame: 'umb0' }, { name: 'Espreguiçadeira', price: 260, frame: 'lounger0' },
    { name: 'Piscina', price: 6000, frame: 'pool_0' }, { name: 'Mesa de Café', price: 320, frame: 'cafetable' },
  ],
};
const TAB_ICON: Record<string, string> = { Casas: ICON.house, 'Decorações': ICON.flower, 'Vegetação': ICON.tree, Urbano: ICON.bench, Lazer: ICON.ball };

export interface Settings { sound: boolean; zoom: number; fps: boolean; touch: 'auto' | 'on' | 'off'; name: string; time: 'tarde' | 'noite' }

export class Ui {
  root: HTMLElement;
  paused = false;
  panelOpen = false;
  settings: Settings;
  private el: Record<string, HTMLElement> = {};
  private joyId: number | null = null;
  private focus: Interactable | null = null;
  private labels = new Map<string, HTMLElement>();
  private tab = 'Casas';
  onSettings?: (s: Settings) => void;
  onRestart?: () => void;
  onMap?: () => void;
  thumb?: (frame: string) => HTMLCanvasElement | null;

  constructor(private input: InputController) {
    this.root = document.getElementById('ui')!;
    let saved: Partial<Settings> = {};
    try { saved = JSON.parse(localStorage.getItem('cv-settings') || '{}'); } catch { /* sem storage */ }
    this.settings = { sound: true, zoom: 0, fps: false, touch: 'auto', name: 'Visitante', ...saved, time: saved.time === 'noite' ? 'noite' : 'tarde' };
    this.build();
    this.bindTouch();
    this.applyTouchMode();
    this.tickClock();
    setInterval(() => this.tickClock(), 15000);
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
    r.append(this.h('<div id="labels" class="labels"></div>'));
    r.append(this.h(`
      <div class="hud-top">
        <div class="player-card">
          <div class="avatar-ring"><canvas id="avatar" width="34" height="34"></canvas></div>
          <div class="pc-text"><b id="pname"></b><span>Nível 1</span><div class="xp"><i style="width:35%"></i></div></div>
        </div>
        <div class="res">
          <div class="pill gold"><i>${ICON.coin}</i><b id="coins"></b><button class="plus" data-soon="Loja de moedas">+</button></div>
          <div class="pill gem"><i>${ICON.gem}</i><b id="gems"></b><button class="plus" data-soon="Loja de diamantes">+</button></div>
          <div class="pill pop hide-s"><i>${ICON.people}</i><b id="pop"></b></div>
          <div class="pill nrg hide-s"><i>${ICON.leaf}</i><b id="nrg"></b></div>
        </div>
        <div class="right-top">
          <div class="weather hide-xs"><i>${ICON.weather}</i><div><b>28°C</b><span id="date"></span><span id="clock"></span></div></div>
          <button class="icon-btn" id="btn-menu" aria-label="Configurações e menu">${ICON.gear}</button>
        </div>
      </div>`));
    r.append(this.h(`<div class="region-chip"><i>${ICON.pin}</i><span id="region">Ilha Inicial</span></div>`));
    r.append(this.h(`
      <nav class="side-menu" aria-label="Menu do jogo">
        <button data-side="map"><i>${ICON.map}</i><span>Mapa</span></button>
        <button data-side="build"><i>${ICON.build}</i><span>Construir</span></button>
        <button data-side="decor"><i>${ICON.decor}</i><span>Decorar</span></button>
        <button data-side="shop"><i>${ICON.shop}</i><span>Loja</span></button>
        <button data-side="events"><i>${ICON.mail}</i><span>Eventos</span><em>!</em></button>
        <button data-side="hoods"><i>${ICON.hood}</i><span>Bairros</span></button>
      </nav>`));
    r.append(this.h('<div id="fps" class="fps hidden"></div>'));
    r.append(this.h(`<div id="prompt" class="prompt hidden"><kbd>E</kbd><span id="prompt-text"></span></div>`));
    r.append(this.h(`
      <div id="touch" class="touch">
        <div id="joy" class="joy" aria-label="Analógico"><div class="joy-ring"><i class="ar up"></i><i class="ar down"></i></div><div id="knob" class="knob"></div></div>
      </div>`));
    r.append(this.h(`
      <div class="actions">
        <button id="b-run" class="act" aria-label="Correr (segure)">${ICON.run}</button>
        <button id="b-chat" class="act" aria-label="Chat rápido">${ICON.chat}</button>
        <button id="b-jump" class="act small" aria-label="Pular">${ICON.jump}</button>
        <button id="b-interact" class="act big disabled" aria-label="Interagir">${ICON.hand}<span id="b-interact-l"></span></button>
      </div>`));
    r.append(this.h(`
      <div id="catalog" class="catalog hidden">
        <div class="tabs" id="tabs"></div>
        <div class="cards-wrap"><button class="nav prev" aria-label="Anterior">‹</button><div class="cards" id="cards"></div><button class="nav next" aria-label="Próximo">›</button></div>
        <button class="x" id="catalog-x" aria-label="Fechar">${ICON.close}</button>
      </div>`));
    r.append(this.h(`<div id="panel" class="panel hidden" role="dialog"><button class="x" id="panel-x" aria-label="Fechar">${ICON.close}</button><div id="panel-body"></div></div>`));
    r.append(this.h(`<div id="dialog" class="dialog hidden"><div class="d-name" id="d-name"></div><div class="d-text" id="d-text"></div><div class="d-hint">toque ou E para continuar</div></div>`));
    r.append(this.h(`<div id="chatbox" class="chatbox hidden"></div>`));
    r.append(this.h(`<div id="bubble" class="bubble hidden"></div>`));
    r.append(this.h(`<div id="toast" class="toast hidden"></div>`));
    r.append(this.h(`<div id="minimap" class="modal hidden"><div class="sheet map-sheet"><h2>Mapa da Ilha</h2><div id="map-holder"></div><p class="muted">Ponto vermelho: você · Verde: terrenos livres · Vermelho: construções</p><button class="mbtn primary" data-close="minimap">Fechar</button></div></div>`));
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
            <label class="row"><span>Horário</span><select id="s-time"><option value="tarde">Pôr do sol</option><option value="noite">Noite</option></select></label>
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
            <p class="muted">No celular: analógico à esquerda (movimento proporcional à inclinação); à direita, <b>Correr</b> (segure), <b>Pular</b>, <b>Chat</b> e <b>Interagir</b> (mão).</p>
            <button class="mbtn primary" data-act="back">Voltar</button>
          </div>
        </div>
      </div>`));
    for (const id of ['coins', 'gems', 'pop', 'nrg', 'pname', 'region', 'prompt', 'prompt-text', 'touch', 'joy', 'knob', 'b-interact', 'b-interact-l', 'b-jump', 'b-run', 'b-chat', 'panel', 'panel-body', 'panel-x', 'dialog', 'd-name', 'd-text', 'toast', 'menu', 'menu-main', 'menu-settings', 'menu-controls', 'fps', 'btn-menu', 's-zoom', 'catalog', 'tabs', 'cards', 'catalog-x', 'labels', 'minimap', 'map-holder', 'chatbox', 'bubble', 'date', 'clock']) {
      this.el[id] = document.getElementById(id)!;
    }
    this.setCoins(CONFIG.economy.startCoins);
    this.el.gems.textContent = String(CONFIG.economy.startGems);
    this.el.pop.textContent = CONFIG.economy.population.toLocaleString('pt-BR');
    this.el.nrg.textContent = `${CONFIG.economy.energy}/${CONFIG.economy.energy}`;
    this.el.pname.textContent = this.settings.name;

    this.el['btn-menu'].addEventListener('click', () => this.openMenu());
    this.el['panel-x'].addEventListener('click', () => this.closePanel());
    this.el.dialog.addEventListener('pointerdown', () => this.closeDialog());
    this.root.querySelectorAll('[data-soon]').forEach((b) => b.addEventListener('click', () => this.toast(`${(b as HTMLElement).dataset.soon}: em breve`)));
    // menu lateral
    this.root.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => {
      sfx.ui();
      const k = (b as HTMLElement).dataset.side;
      if (k === 'map') this.onMap?.();
      else if (k === 'build') this.toggleCatalog('Casas');
      else if (k === 'decor') this.toggleCatalog('Decorações');
      else if (k === 'shop') this.toast('Loja: em breve');
      else if (k === 'events') this.toast('Evento de inauguração da Ilha: em breve!');
      else if (k === 'hoods') this.toast('Bairros: Beira-Mar (aberto) · novos bairros em breve');
    }));
    this.el['catalog-x'].addEventListener('click', () => this.toggleCatalog());
    this.el.catalog.querySelector('.prev')!.addEventListener('click', () => this.el.cards.scrollBy({ left: -220, behavior: 'smooth' }));
    this.el.catalog.querySelector('.next')!.addEventListener('click', () => this.el.cards.scrollBy({ left: 220, behavior: 'smooth' }));
    this.root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => document.getElementById((b as HTMLElement).dataset.close!)!.classList.add('hidden')));
    // chat rápido
    const phrases = ['Olá! 👋', 'Que pôr do sol lindo!', 'Bora pra praia?', 'Quero construir minha casa aqui!', 'Até mais!'];
    this.el.chatbox.innerHTML = phrases.map((p) => `<button>${p}</button>`).join('');
    this.el.chatbox.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { this.say(b.textContent || ''); this.el.chatbox.classList.add('hidden'); }));
    this.el['b-chat'].addEventListener('click', () => { sfx.ui(); this.el.chatbox.classList.toggle('hidden'); });

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

  private tickClock() {
    const d = new Date();
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'], meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    this.el.date.textContent = `${dias[d.getDay()]}, ${d.getDate()} ${meses[d.getMonth()]}`;
    this.el.clock.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

  // ----------------------------------------------------------------- catálogo de construção
  toggleCatalog(tab?: string) {
    const open = this.el.catalog.classList.contains('hidden') || (tab && tab !== this.tab);
    if (!open) { this.el.catalog.classList.add('hidden'); document.body.classList.remove('catalog-open'); return; }
    if (tab) this.tab = tab;
    this.el.tabs.innerHTML = Object.keys(CATALOG).map((k) => `<button class="${k === this.tab ? 'on' : ''}" data-tab="${k}"><i>${TAB_ICON[k]}</i>${k}</button>`).join('');
    this.el.tabs.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { sfx.ui(); this.toggleCatalog((b as HTMLElement).dataset.tab); }));
    this.el.cards.innerHTML = '';
    for (const it of CATALOG[this.tab]) {
      const card = this.h(`<button class="card-item"><div class="thumb"></div><b>${it.name}</b><span><i>${ICON.coin}</i>${it.price.toLocaleString('pt-BR')}</span></button>`);
      const c = this.thumb?.(it.frame);
      if (c) card.querySelector('.thumb')!.append(c);
      card.addEventListener('click', () => { sfx.ui(); this.toast(`${it.name}: escolha um terreno livre — compra em breve`); });
      this.el.cards.append(card);
    }
    this.el.catalog.classList.remove('hidden');
    document.body.classList.add('catalog-open');
  }

  showMinimap(c: HTMLCanvasElement) {
    this.el['map-holder'].innerHTML = '';
    this.el['map-holder'].append(c);
    this.el.minimap.classList.remove('hidden');
  }

  // ----------------------------------------------------------------- rótulos no mundo
  addWorldLabel(id: string, html: string, kind: string) {
    const e = this.h(`<div class="wlabel ${kind}"><i>${ICON.house}</i><div>${html}</div></div>`);
    this.el.labels.append(e);
    this.labels.set(id, e);
  }
  placeWorldLabel(id: string, x: number, y: number, visible: boolean) {
    const e = this.labels.get(id); if (!e) return;
    const on = visible && x > -100 && y > -60 && x < innerWidth + 100 && y < innerHeight + 60;
    e.style.display = on ? '' : 'none';
    if (on) e.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }

  // ----------------------------------------------------------------- toque
  private bindTouch() {
    const joy = this.el.joy, knob = this.el.knob;
    const R = () => joy.getBoundingClientRect().width * 0.38;
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
      mag = mag < dead ? 0 : (mag - dead) / (1 - dead);
      const n = d > 0 ? 1 / d : 0;
      this.input.touchVec = { x: (e.clientX - cx) * n * mag, y: (e.clientY - cy) * n * mag };
      this.input.lastDevice = 'touch';
      joy.classList.toggle('active', mag > 0);
    };
    joy.addEventListener('pointerdown', (e) => { if (this.joyId !== null) return; this.joyId = e.pointerId; joy.setPointerCapture(e.pointerId); sfx.start(); update(e); e.preventDefault(); });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === this.joyId) update(e); });
    const end = (e: PointerEvent) => { if (e.pointerId !== this.joyId) return; this.joyId = null; this.input.touchVec = { x: 0, y: 0 }; setKnob(0, 0); joy.classList.remove('active'); };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end); joy.addEventListener('lostpointercapture', end);

    const run = this.el['b-run'];
    const runIds = new Set<number>();
    run.addEventListener('pointerdown', (e) => { runIds.add(e.pointerId); run.setPointerCapture(e.pointerId); this.input.touchRun = true; run.classList.add('on'); e.preventDefault(); });
    const runEnd = (e: PointerEvent) => { runIds.delete(e.pointerId); if (!runIds.size) { this.input.touchRun = false; run.classList.remove('on'); } };
    run.addEventListener('pointerup', runEnd); run.addEventListener('pointercancel', runEnd); run.addEventListener('lostpointercapture', runEnd);
    const tap = (btn: HTMLElement, fn: () => void) => btn.addEventListener('pointerdown', (e) => { e.preventDefault(); sfx.start(); btn.classList.add('on'); fn(); setTimeout(() => btn.classList.remove('on'), 120); });
    tap(this.el['b-jump'], () => this.input.press('jump'));
    tap(this.el['b-interact'], () => this.input.press('interact'));
    document.addEventListener('touchmove', (e) => { if (!(e.target as HTMLElement).closest('.sheet,.panel,.cards')) e.preventDefault(); }, { passive: false });
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
  say(text: string) {
    const b = this.el.bubble;
    b.textContent = text; b.classList.remove('hidden');
    clearTimeout((b as unknown as { _h: number })._h);
    (b as unknown as { _h: number })._h = window.setTimeout(() => b.classList.add('hidden'), 2600);
  }

  private setFocus(it: Interactable | null) {
    this.focus = it;
    const b = this.el['b-interact'];
    if (it && !this.panelOpen) {
      this.el['prompt-text'].textContent = `${KIND_LABEL[it.kind] ?? 'Interagir'} · ${it.title}`;
      this.el.prompt.classList.remove('hidden');
      b.classList.remove('disabled');
      this.el['b-interact-l'].textContent = KIND_LABEL[it.kind] ?? '';
    } else {
      this.el.prompt.classList.add('hidden');
      b.classList.toggle('disabled', !it);
      if (!it) this.el['b-interact-l'].textContent = '';
    }
    if (!it && this.panelOpen) this.closePanel();
  }

  showInfo(it: Interactable, extra: Record<string, string> = {}) {
    const rows = { ...it.info, ...extra };
    const status = rows['Situação'];
    const badge = status ? `<span class="badge ${status.startsWith('Disponível') ? 'ok' : ''}">${status}</span>` : '';
    const kinds: Record<string, string> = { house: 'Residência', lot: 'Terreno', busstop: 'Ponto de ônibus', cart: 'Comércio', sign: 'Sinalização', shop: 'Comércio', landmark: 'Atração' };
    this.el['panel-body'].innerHTML = `
      <div class="p-head"><div class="p-kind">${kinds[it.kind] ?? ''}</div>
      <h3>${it.title}</h3>${it.subtitle ? `<div class="p-sub">${it.subtitle}</div>` : ''}${badge}</div>
      <dl>${Object.entries(rows).filter(([k]) => k !== 'Situação' && k !== 'Observação').map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      ${rows['Observação'] ? `<p class="note">${rows['Observação']}</p>` : ''}
      ${it.kind === 'lot' ? '<button class="mbtn primary" disabled>Comprar terreno · em breve</button>' : ''}`;
    this.el.panel.classList.remove('hidden');
    this.panelOpen = true;
    this.el.prompt.classList.add('hidden');
    sfx.ui();
  }
  closePanel() { if (!this.panelOpen) return; this.panelOpen = false; this.el.panel.classList.add('hidden'); this.setFocus(this.focus); }

  showDialog(name: string, text: string) {
    this.el['d-name'].textContent = name;
    this.el['d-text'].textContent = '';
    this.el.dialog.classList.remove('hidden');
    this.panelOpen = true;
    this.el.prompt.classList.add('hidden');
    let i = 0;
    const tick = () => { if (i <= text.length && !this.el.dialog.classList.contains('hidden')) { this.el['d-text'].textContent = text.slice(0, i++); setTimeout(tick, 18); } };
    tick();
    sfx.ui();
  }
  closeDialog() { if (this.el.dialog.classList.contains('hidden')) return; this.el.dialog.classList.add('hidden'); this.panelOpen = false; this.setFocus(this.focus); }
  get dialogOpen() { return !this.el.dialog.classList.contains('hidden'); }

  get anyOverlay() { return this.panelOpen || !this.el.catalog.classList.contains('hidden') || !this.el.minimap.classList.contains('hidden') || !this.el.chatbox.classList.contains('hidden'); }
  closeOverlays() {
    this.closePanel(); this.closeDialog();
    this.el.catalog.classList.add('hidden'); document.body.classList.remove('catalog-open');
    this.el.minimap.classList.add('hidden'); this.el.chatbox.classList.add('hidden');
  }

  toast(msg: string) {
    const t = this.el.toast;
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout((t as unknown as { _h: number })._h);
    (t as unknown as { _h: number })._h = window.setTimeout(() => t.classList.add('hidden'), 2400);
  }

  openMenu() { this.paused = true; this.input.clear(); this.showMenuPage('main'); this.el.menu.classList.remove('hidden'); sfx.ui(); }
  closeMenu() { this.paused = false; this.el.menu.classList.add('hidden'); (document.activeElement as HTMLElement | null)?.blur?.(); }
  toggleMenu() { if (this.paused) this.closeMenu(); else this.openMenu(); }
  private showMenuPage(p: 'main' | 'settings' | 'controls') {
    this.el['menu-main'].classList.toggle('hidden', p !== 'main');
    this.el['menu-settings'].classList.toggle('hidden', p !== 'settings');
    this.el['menu-controls'].classList.toggle('hidden', p !== 'controls');
  }
}
