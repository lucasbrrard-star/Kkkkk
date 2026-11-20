// HUD do jogo: perfil, moedas, online, missões de boas-vindas, minimapa, chat,
// joystick/botões (celular), emotes, botão de interação contextual, avisos e painéis.
import type { AnimState, Profile } from '../../../shared/protocol';
import { CHAT_MAX } from '../../../shared/protocol';
import { Input, Joystick } from '../player/input';
import { esc, fmt, h, icon, isTouch, prefs } from './dom';

export interface Quest { id: string; text: string }
export const QUESTS: Quest[] = [
  { id: 'lia', text: 'Fale com a Guia Lia no pórtico' },
  { id: 'corretora', text: 'Visite a Corretora Cidade Viva' },
  { id: 'lote', text: 'Veja um terreno livre de perto' },
  { id: 'sentar', text: 'Sente num banco da praça' },
  { id: 'oi', text: 'Diga “oi” no chat' },
  { id: 'emote', text: 'Faça um emote' },
];

const EMOTES: { a: AnimState; e: string; t: string }[] = [
  { a: 'wave', e: '👋', t: 'Acenar' }, { a: 'dance', e: '💃', t: 'Dançar' }, { a: 'agree', e: '👍', t: 'Sim' },
  { a: 'headShake', e: '🙅', t: 'Não' },
];

export class Hud {
  root: HTMLElement;
  tagsLayer = h('div', { id: 'tags', class: 'pass' });
  minimapCanvas = h('canvas');
  private nameEl = h('b');
  private lvlEl = h('span', { class: 'lvl' }, 'Nv 1');
  private coinsEl = h('span');
  private gemsEl = h('span');
  private onlineEl = h('span');
  private chatLog = h('div', { class: 'chat' });
  private chatBar!: HTMLDivElement;
  private chatInput!: HTMLInputElement;
  private interactBtn = h('button', { id: 'interact', class: 'glass hidden' });
  private emotePanel!: HTMLDivElement;
  private runBtn!: HTMLButtonElement;
  private questsEl = h('div', { class: 'quests glass' });
  private toasts = h('div', { id: 'toasts' });
  private fpsEl = h('div', { id: 'fps', class: 'hidden pass' });
  private initialEl = h('div', { class: 'avatar-chip' }, '?');
  private done = new Set<string>(prefs.get<string[]>('quests', []));
  private sheetWrap: HTMLDivElement | null = null;
  chatOpen = false;
  on: {
    chat?: (text: string) => void; emote?: (a: AnimState) => void; interact?: () => void;
    settings?: () => void; map?: () => void; jump?: () => void;
  } = {};

  constructor(parent: HTMLElement, private input: Input) {
    this.root = h('div', { id: 'hud', class: 'pass', style: 'position:absolute;inset:0' });
    parent.appendChild(this.root);
    const touch = isTouch();
    // topo esquerdo
    const tl = h('div', { class: 'hud-tl' },
      h('div', { class: 'profile glass' }, this.initialEl, h('div', {}, this.nameEl, h('small', {}, this.lvlEl, 'Morador(a) novo(a)'))),
      h('div', { class: 'pill glass online' }, h('i', { class: 'dot' }), this.onlineEl),
      this.questsEl,
    );
    // topo direito
    const settingsBtn = h('button', { class: 'icon-btn glass', title: 'Configurações', 'aria-label': 'Configurações', html: icon.gear, onclick: () => this.on.settings?.() });
    const mapWrap = h('div', { id: 'minimap', class: 'glass', title: 'Abrir mapa', onclick: () => this.on.map?.() }, this.minimapCanvas, h('div', { class: 'n' }, 'N'));
    const tr = h('div', { class: 'hud-tr' },
      h('div', { class: 'tr-row' },
        h('div', { class: 'money' },
          h('div', { class: 'pill glass', title: 'Moedas' }, h('span', { html: icon.coin }), this.coinsEl),
          h('div', { class: 'pill glass', title: 'Diamantes' }, h('span', { html: icon.gem }), this.gemsEl)),
        settingsBtn),
      mapWrap,
    );
    // ações
    const jump = h('button', { class: 'act big', 'aria-label': 'Pular', html: icon.jump, onpointerdown: (e: Event) => { e.preventDefault(); this.input.press('Space'); this.on.jump?.(); } });
    this.runBtn = h('button', { class: 'act glass', 'aria-label': 'Correr', html: icon.run, onclick: () => { this.input.runToggle = !this.input.runToggle; this.runBtn.classList.toggle('on', this.input.runToggle); } });
    const emoteBtn = h('button', { class: 'act glass', 'aria-label': 'Emotes', html: icon.smile, onclick: () => this.toggleEmotes() });
    const chatBtn = h('button', { class: 'act glass', 'aria-label': 'Chat', html: icon.chat, onclick: () => this.openChat() });
    const actions = h('div', { class: 'actions' }, chatBtn, this.runBtn, emoteBtn, jump);
    // painel de emotes
    this.emotePanel = h('div', { class: 'emotes glass hidden' }, ...EMOTES.map((em) => h('button', { onclick: () => { this.on.emote?.(em.a); this.toggleEmotes(false); } }, em.e, h('span', {}, em.t))));
    // chat
    this.chatInput = h('input', { type: 'text', maxlength: CHAT_MAX, placeholder: 'Diga algo para a cidade…', enterkeyhint: 'send', autocomplete: 'off' });
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { this.sendChat(); e.preventDefault(); }
      if (e.key === 'Escape') this.closeChat();
      e.stopPropagation();
    });
    this.chatBar = h('div', { class: 'chatbar glass hidden' }, this.chatInput, h('button', { class: 'btn primary', 'aria-label': 'Enviar', html: icon.send, onclick: () => this.sendChat() }));
    this.interactBtn.addEventListener('click', () => this.on.interact?.());
    this.root.append(this.tagsLayer, tl, tr, this.chatLog, this.emotePanel, actions, this.interactBtn, this.chatBar, this.toasts, this.fpsEl);
    if (touch) {
      const zone = h('div', { id: 'joyzone' });
      const ghost = h('div', { class: 'joy-ghost' }, 'arraste\npara andar');
      this.root.prepend(zone, ghost);
      new Joystick(zone, input);
      zone.addEventListener('pointerdown', () => ghost.remove(), { once: true });
    } else {
      this.root.append(h('div', { class: 'hint pass' }, 'WASD andar · Shift correr · Espaço pular · E interagir · Enter chat · arraste o mouse para girar'));
    }
    // atalhos de teclado
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
      if (e.key === 'Enter' && !this.sheetWrap) { this.openChat(); e.preventDefault(); }
      if (e.key === 'Escape') { this.closeSheet(); this.toggleEmotes(false); }
      if (e.code === 'KeyE' && !this.sheetWrap) this.on.interact?.();
      if (e.code === 'KeyM' && !this.sheetWrap) this.on.map?.();
      if (/^Digit[1-4]$/.test(e.code) && !this.sheetWrap) this.on.emote?.(EMOTES[Number(e.code.slice(5)) - 1].a);
    });
    this.renderQuests();
  }

  // ------------------------------------------------------------ perfil e status
  setProfile(p: Profile) {
    this.nameEl.textContent = p.name;
    this.initialEl.textContent = (p.name[0] ?? '?').toUpperCase();
    this.lvlEl.textContent = `Nv ${p.level}`;
    this.coinsEl.textContent = fmt(p.coins);
    this.gemsEl.textContent = fmt(p.gems);
  }
  setOnline(count: number, room: string, mode: string) {
    this.onlineEl.textContent = `${count} online · ${room}${mode === 'offline' ? '' : ''}`;
  }
  setFps(show: boolean, fps?: number, extra = '') {
    this.fpsEl.classList.toggle('hidden', !show);
    if (show && fps !== undefined) this.fpsEl.textContent = `${fps} FPS ${extra}`;
  }

  // ------------------------------------------------------------ missões
  quest(id: string) {
    if (this.done.has(id) || !QUESTS.some((q) => q.id === id)) return;
    this.done.add(id);
    prefs.set('quests', [...this.done]);
    const q = QUESTS.find((x) => x.id === id)!;
    this.toast(`Missão concluída: ${q.text}`, 'success');
    this.renderQuests();
    if (this.done.size === QUESTS.length) setTimeout(() => this.toast('Você completou o roteiro de boas-vindas! 🎉', 'success'), 1200);
  }
  private renderQuests() {
    const min = prefs.get('questsMin', false);
    const left = QUESTS.length - this.done.size;
    this.questsEl.classList.toggle('min', min);
    this.questsEl.classList.toggle('hidden', left === 0 && min);
    this.questsEl.replaceChildren(
      h('h4', {}, `Boas-vindas · ${this.done.size}/${QUESTS.length}`, h('button', { onclick: () => { prefs.set('questsMin', !min); this.renderQuests(); } }, min ? 'mostrar' : 'ocultar')),
      h('ul', {}, ...QUESTS.map((q) => h('li', { class: this.done.has(q.id) ? 'done' : '' }, h('i', { html: this.done.has(q.id) ? icon.check : '' }), q.text))),
    );
  }

  // ------------------------------------------------------------ chat
  openChat() {
    this.chatOpen = true;
    this.input.enabled = false;
    this.chatBar.classList.remove('hidden');
    this.chatLog.classList.add('open');
    this.toggleEmotes(false);
    setTimeout(() => this.chatInput.focus(), 0);
  }
  closeChat() {
    this.chatOpen = false;
    this.input.enabled = true;
    this.chatBar.classList.add('hidden');
    this.chatLog.classList.remove('open');
    this.chatInput.blur();
  }
  private sendChat() {
    const t = this.chatInput.value.trim();
    this.chatInput.value = '';
    if (t) this.on.chat?.(t);
    this.closeChat();
  }
  addChat(name: string, text: string, kind: 'me' | 'other' | 'sys' = 'other') {
    const m = h('div', { class: `msg ${kind === 'me' ? 'me' : kind === 'sys' ? 'sys' : ''}`, html: kind === 'sys' ? esc(text) : `<b>${esc(name)}</b>${esc(text)}` });
    this.chatLog.appendChild(m);
    while (this.chatLog.children.length > 7) this.chatLog.firstChild!.remove();
    setTimeout(() => m.classList.add('old'), 10000);
  }

  // ------------------------------------------------------------ emotes / interação
  toggleEmotes(force?: boolean) { this.emotePanel.classList.toggle('hidden', force === undefined ? undefined : !force); }

  setInteract(label: string | null) {
    if (!label) { this.interactBtn.classList.add('hidden'); this.interactBtn.dataset.l = ''; return; }
    if (this.interactBtn.dataset.l === label && !this.interactBtn.classList.contains('hidden')) return;
    this.interactBtn.dataset.l = label;
    this.interactBtn.innerHTML = `<kbd>${isTouch() ? '👆' : 'E'}</kbd>${esc(label)}`;
    this.interactBtn.classList.remove('hidden');
  }

  // ------------------------------------------------------------ avisos
  toast(text: string, level: 'info' | 'success' | 'error' = 'info') {
    const t = h('div', { class: `toast ${level}` }, text);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild!.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, 3200);
  }
  banner(kicker: string, title: string) {
    const b = h('div', { class: 'banner' }, h('div', { class: 'kicker' }, kicker), h('h1', {}, title));
    this.root.appendChild(b);
    setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 1100); }, 3200);
  }

  // ------------------------------------------------------------ painéis
  sheet(build: (close: () => void) => (Node | string)[], opts: { onClose?: () => void } = {}) {
    this.closeSheet();
    const close = () => { this.closeSheet(); opts.onClose?.(); };
    const sheet = h('div', { class: 'sheet glass' }, h('button', { class: 'x', 'aria-label': 'Fechar', html: icon.close, onclick: close }), ...build(close));
    const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } }, sheet);
    this.sheetWrap = wrap;
    this.input.enabled = false;
    this.root.appendChild(wrap);
    return sheet;
  }
  closeSheet() {
    if (!this.sheetWrap) return;
    this.sheetWrap.remove();
    this.sheetWrap = null;
    if (!this.chatOpen) this.input.enabled = true;
  }
  get sheetOpen() { return !!this.sheetWrap; }
}
