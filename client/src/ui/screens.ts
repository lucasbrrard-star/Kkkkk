// Telas de entrada: carregamento (com progresso real dos arquivos) e criação/entrada
// do personagem (nome, visual, paleta de roupa, qualidade gráfica).
import { AvatarId, NAME_MAX, OUTFITS } from '../../../shared/protocol';
import type { QualitySetting } from '../core/quality';
import { h, prefs } from './dom';

const TIPS = [
  'Dica: terrenos com borda verde estão à venda.',
  'Dica: fale com a Guia Lia no pórtico da praça.',
  'Dica: arraste a tela para girar a câmera; pinça para aproximar.',
  'Dica: em “Configurações” você ajusta os gráficos para o seu celular.',
];

export class Loading {
  el: HTMLDivElement;
  private bar = h('i');
  private step = h('div', { class: 'step' }, 'Preparando…');
  constructor() {
    this.el = h('div', { id: 'loading' },
      h('div', { class: 'logo', html: 'Cidade Viva<small>CENTRO DE BOAS-VINDAS</small>' }),
      h('div', { class: 'bar' }, this.bar),
      this.step,
      h('div', { class: 'tip' }, TIPS[Math.floor(Math.random() * TIPS.length)]));
    document.body.appendChild(this.el);
  }
  progress(f: number) { this.bar.style.width = `${Math.round(Math.min(1, f) * 100)}%`; }
  text(s: string) { this.step.textContent = s; }
  error(s: string) { this.step.textContent = s; this.step.style.color = '#ff8a8a'; }
  done() { this.el.classList.add('out'); setTimeout(() => this.el.remove(), 700); }
}

export interface LoginResult { name: string; avatar: AvatarId; outfit: number; quality: QualitySetting }

export function loginScreen(parent: HTMLElement, initialQuality: QualitySetting, preview: (avatar: AvatarId, outfit: number) => void): Promise<LoginResult> {
  return new Promise((resolve) => {
    let avatar = prefs.get<AvatarId>('avatar', 'avatar_m');
    let outfit = prefs.get<number>('outfit', 0);
    const name = h('input', { type: 'text', maxlength: NAME_MAX, placeholder: 'Seu nome na cidade', value: prefs.get('name', ''), autocomplete: 'nickname', enterkeyhint: 'go' });
    const seg = h('div', { class: 'seg' });
    const sw = h('div', { class: 'swatches' });
    const q = h('select', {}, ...(['auto', 'baixa', 'media', 'alta'] as QualitySetting[]).map((v) => h('option', { value: v, selected: v === initialQuality }, { auto: 'Automática (recomendado)', baixa: 'Baixa — celulares simples', media: 'Média — celulares medianos', alta: 'Alta — PCs e tops de linha' }[v])));
    const render = () => {
      seg.replaceChildren(...(['avatar_m', 'avatar_f'] as AvatarId[]).map((a) => h('button', { class: a === avatar ? 'on' : '', onclick: () => { avatar = a; render(); preview(avatar, outfit); } }, a === 'avatar_m' ? 'Visual A' : 'Visual B')));
      sw.replaceChildren(...OUTFITS.map((o, i) => h('button', { class: i === outfit ? 'on' : '', title: o.name, 'aria-label': `Paleta ${o.name}`, style: `background:${o.color}`, onclick: () => { outfit = i; render(); preview(avatar, outfit); } })));
    };
    render();
    const go = h('button', { class: 'btn primary block', id: 'enter' }, 'Entrar na cidade');
    const el = h('div', { id: 'login', class: 'glass' },
      h('h1', { html: 'Bem-vindo(a) à <span>Cidade Viva</span>' }),
      h('p', { class: 'sub' }, 'Crie seu morador e entre no servidor. Você chega na praça central da cidade inicial.'),
      h('div', { class: 'field' }, h('label', {}, 'Nome'), name),
      h('div', { class: 'field' }, h('label', {}, 'Personagem'), seg),
      h('div', { class: 'field' }, h('label', {}, 'Paleta de roupa'), sw),
      h('div', { class: 'field' }, h('label', {}, 'Gráficos'), q),
      go,
      h('div', { class: 'server-line' }, h('i', { class: 'dot' }), 'Servidor Brasil · Cidade inicial'));
    const hint = h('div', { class: 'rotate-hint' }, 'Arraste para girar o personagem');
    parent.append(el, hint);
    preview(avatar, outfit);
    const submit = () => {
      const n = name.value.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX) || `Morador${Math.floor(Math.random() * 900 + 100)}`;
      prefs.set('name', n); prefs.set('avatar', avatar); prefs.set('outfit', outfit); prefs.set('quality', q.value);
      el.remove(); hint.remove();
      resolve({ name: n, avatar, outfit, quality: q.value as QualitySetting });
    };
    go.addEventListener('click', submit);
    name.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') submit(); });
  });
}
