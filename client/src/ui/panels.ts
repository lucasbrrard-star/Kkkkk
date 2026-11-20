// Painéis do jogo: terreno, corretora, prefeitura, café, loja de roupas, galeria,
// diálogo da guia, configurações e mapa completo.
import { LOTS, Lot } from '../../../shared/city';
import { AvatarId, LotState, OUTFITS, Profile } from '../../../shared/protocol';
import type { QualitySetting } from '../core/quality';
import { fmt, h, icon } from './dom';
import { Hud } from './hud';

export interface Settings { quality: QualitySetting; volume: number; sensitivity: number; fps: boolean; names: boolean }

export function lotSheet(hud: Hud, lot: Lot, state: LotState | undefined, profile: Profile, onBuy: (id: string) => void) {
  const owned = !!state?.owner;
  const mine = profile.lots.includes(lot.id);
  const canPay = profile.coins >= lot.price;
  hud.sheet((close) => [
    h('div', { class: 'kicker' }, owned ? (mine ? 'Seu terreno' : 'Terreno ocupado') : 'Terreno livre · à venda'),
    h('h2', {}, `Terreno ${lot.id}`),
    h('p', {}, `${lot.street} · Centro de Boas-Vindas`),
    h('div', { class: `lot-plan ${owned ? 'owned' : ''}` }, owned ? (mine ? '🏡 Seu! Construção chega na próxima versão' : `Dono(a): ${state!.ownerName}`) : `${lot.w} m × ${lot.d} m`),
    h('div', { class: 'stats' },
      h('div', {}, h('b', {}, `${lot.w * lot.d} m²`), h('small', {}, 'Área')),
      h('div', {}, h('b', { html: `${icon.coin} ${fmt(lot.price)}` }), h('small', {}, 'Preço')),
      h('div', {}, h('b', {}, `${profile.lots.length}/2`), h('small', {}, 'Seus terrenos'))),
    owned
      ? h('button', { class: 'btn block', onclick: close }, 'Fechar')
      : h('button', { class: 'btn ok block', disabled: !canPay || profile.lots.length >= 2, onclick: () => { onBuy(lot.id); close(); } },
        canPay ? (profile.lots.length >= 2 ? 'Limite de 2 terrenos' : `Comprar por ₵ ${fmt(lot.price)}`) : 'Moedas insuficientes'),
    h('p', { style: 'font-size:12px;margin:10px 0 0;color:#a9a2c8;text-align:center' }, 'A compra é validada pelo servidor. Depois de comprar, o terreno fica com seu nome para todos.'),
  ]);
}

export function brokerSheet(hud: Hud, lots: Map<string, LotState>, onGo: (lot: Lot) => void) {
  const free = LOTS.filter((l) => !lots.get(l.id)?.owner).length;
  hud.sheet((close) => [
    h('div', { class: 'kicker' }, 'Corretora Cidade Viva'),
    h('h2', {}, 'Terrenos do Centro'),
    h('p', {}, `${free} de ${LOTS.length} terrenos livres. Toque em “Ir até” para marcar no mapa e siga o marcador rosa.`),
    h('div', { class: 'list' }, ...LOTS.map((l) => {
      const s = lots.get(l.id);
      return h('div', { class: 'item' },
        h('span', { class: `tag ${s?.owner ? 'owned' : ''}` }, l.id),
        h('div', {}, h('b', {}, s?.owner ? `de ${s.ownerName}` : `${l.w}×${l.d} m · ₵ ${fmt(l.price)}`), l.street),
        h('button', { class: 'btn', onclick: () => { onGo(l); close(); } }, 'Ir até'));
    })),
  ]);
}

export function serviceSheet(hud: Hud, id: string) {
  const info: Record<string, { k: string; t: string; p: string[] }> = {
    prefeitura: { k: 'Prefeitura', t: 'Bem-vindo(a), cidadão!', p: ['Esta é a cidade inicial onde todos os novos moradores chegam. Cada servidor tem várias instâncias desta cidade (até 40 pessoas cada) para ninguém ficar sozinho.', 'Regras de convivência: respeite todo mundo, nada de spam, nada de dados pessoais no chat. Mensagens ofensivas são filtradas automaticamente.'] },
    cafe: { k: 'Café & Lounge', t: 'Um café para conhecer gente', p: ['O interior do café abre numa próxima atualização, com mesas, música e cardápio.', 'Enquanto isso, a praça tem bancos para sentar e conversar — e a orla é ótima para um passeio ao pôr do sol.'] },
    galeria: { k: 'Galeria Comercial', t: 'Lojas em breve', p: ['A galeria vai reunir lojas de móveis e decoração para você mobiliar a casa no seu terreno.'] },
  };
  const s = info[id] ?? { k: 'Cidade Viva', t: 'Em breve', p: ['Este espaço abre numa próxima atualização.'] };
  hud.sheet((close) => [h('div', { class: 'kicker' }, s.k), h('h2', {}, s.t), ...s.p.map((x) => h('p', {}, x)), h('button', { class: 'btn primary block', onclick: close }, 'Entendi')]);
}

export function wardrobeSheet(hud: Hud, cur: { avatar: AvatarId; outfit: number }, onApply: (avatar: AvatarId, outfit: number) => void, onPreview?: (avatar: AvatarId, outfit: number) => void) {
  let avatar = cur.avatar, outfit = cur.outfit;
  const seg = h('div', { class: 'seg' });
  const sw = h('div', { class: 'swatches' });
  const render = () => {
    seg.replaceChildren(...(['avatar_m', 'avatar_f'] as AvatarId[]).map((a) => h('button', { class: a === avatar ? 'on' : '', onclick: () => { avatar = a; render(); onPreview?.(avatar, outfit); } }, a === 'avatar_m' ? 'Visual A' : 'Visual B')));
    sw.replaceChildren(...OUTFITS.map((o, i) => h('button', { class: i === outfit ? 'on' : '', title: o.name, 'aria-label': o.name, style: `background:${o.color}`, onclick: () => { outfit = i; render(); onPreview?.(avatar, outfit); } })));
  };
  render();
  hud.sheet((close) => [
    h('div', { class: 'kicker' }, 'Loja de Roupas'),
    h('h2', {}, 'Provador'),
    h('p', {}, 'Escolha o visual e a paleta de roupas. Todo mundo na cidade verá a mudança.'),
    h('div', { class: 'field' }, h('label', {}, 'Personagem'), seg),
    h('div', { class: 'field', style: 'margin-top:12px' }, h('label', {}, 'Paleta'), sw),
    h('div', { style: 'height:14px' }),
    h('button', { class: 'btn primary block', onclick: () => { onApply(avatar, outfit); close(); } }, 'Vestir'),
  ], { onClose: () => onPreview?.(cur.avatar, cur.outfit) });
}

export function guideSheet(hud: Hud, name: string, onDone: () => void) {
  const pages = [
    { t: `Oi, ${name}! Eu sou a Lia.`, p: 'Sou a guia do Centro de Boas-Vindas da Cidade Viva. Todo mundo que entra no servidor chega aqui, na praça do chafariz.' },
    { t: 'Terrenos vazios', p: 'Os terrenos com borda verde estão à venda. Chegue perto e toque em “Ver terreno” para ver o tamanho e o preço. Você começa com ₵ 30.000!' },
    { t: 'A Corretora', p: 'Na Corretora (quadra leste, Rua dos Ipês) você vê a lista de todos os terrenos e marca o caminho no mapa.' },
    { t: 'Faça amigos', p: 'Use o chat 💬 para conversar, os emotes 😊 para acenar e dançar, e sente-se nos bancos da praça. A orla e a praia ficam a leste.' },
  ];
  let i = 0;
  const body = h('div');
  const render = (close: () => void) => {
    const pg = pages[i];
    body.replaceChildren(
      h('div', { class: 'npc-face' }, 'L'),
      h('div', { class: 'kicker' }, 'Guia Lia'),
      h('h2', {}, pg.t),
      h('p', { style: 'clear:both' }, pg.p),
      h('div', { class: 'steps' }, ...pages.map((_, j) => h('i', { class: j === i ? 'on' : '' }))),
      h('button', { class: 'btn primary block', onclick: () => { if (i < pages.length - 1) { i++; render(close); } else { close(); } } }, i < pages.length - 1 ? 'Próximo' : 'Vamos lá!'),
    );
  };
  hud.sheet((close) => { render(close); return [body]; }, { onClose: onDone });
}

export function settingsSheet(hud: Hud, s: Settings, level: string, apply: (s: Settings) => void, extra: { onWardrobe: () => void; onLeave: () => void; mode: string; ping: number }) {
  const toggle = (on: boolean, f: (v: boolean) => void) => {
    const t = h('button', { class: `toggle ${on ? 'on' : ''}`, role: 'switch', 'aria-checked': String(on) });
    t.addEventListener('click', () => { on = !on; t.classList.toggle('on', on); t.setAttribute('aria-checked', String(on)); f(on); });
    return t;
  };
  const q = h('select', {}, ...(['auto', 'baixa', 'media', 'alta'] as QualitySetting[]).map((v) => h('option', { value: v, selected: v === s.quality }, { auto: 'Automática', baixa: 'Baixa', media: 'Média', alta: 'Alta' }[v])));
  q.addEventListener('change', () => { s.quality = q.value as QualitySetting; apply(s); });
  const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.volume });
  vol.addEventListener('input', () => { s.volume = Number(vol.value); apply(s); });
  const sens = h('input', { type: 'range', min: 0.4, max: 2, step: 0.1, value: s.sensitivity });
  sens.addEventListener('input', () => { s.sensitivity = Number(sens.value); apply(s); });
  hud.sheet(() => [
    h('div', { class: 'kicker' }, 'Configurações'),
    h('h2', {}, 'Ajustes'),
    h('div', { class: 'setting' }, h('div', {}, 'Gráficos', h('small', {}, `Atual: ${level}. “Automática” ajusta pelo FPS do aparelho.`)), q),
    h('div', { class: 'setting' }, h('div', {}, 'Volume', h('small', {}, 'Mar, chafariz, passos e interface')), vol),
    h('div', { class: 'setting' }, h('div', {}, 'Sensibilidade da câmera'), sens),
    h('div', { class: 'setting' }, h('div', {}, 'Mostrar nomes'), toggle(s.names, (v) => { s.names = v; apply(s); })),
    h('div', { class: 'setting' }, h('div', {}, 'Mostrar FPS'), toggle(s.fps, (v) => { s.fps = v; apply(s); })),
    h('div', { class: 'setting' }, h('div', {}, 'Conexão', h('small', {}, extra.mode === 'online' ? `Servidor online · ${extra.ping} ms` : 'Modo offline (prévia): moradores simulados'))),
    h('div', { class: 'row', style: 'margin-top:14px' },
      h('button', { class: 'btn', style: 'flex:1', html: `${icon.shirt} Visual`, onclick: extra.onWardrobe }),
      h('button', { class: 'btn', style: 'flex:1', onclick: extra.onLeave }, 'Sair')),
  ]);
}

export function mapSheet(hud: Hud, base: HTMLCanvasElement, me: { x: number; z: number }) {
  const c = h('canvas', { style: 'width:100%;border-radius:16px;display:block' });
  c.width = base.width; c.height = base.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(base, 0, 0);
  const px = (me.x + 130) * 3, pz = (me.z + 130) * 3;
  ctx.fillStyle = '#ff4f9a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(px, pz, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  hud.sheet(() => [
    h('div', { class: 'kicker' }, 'Mapa'),
    h('h2', {}, 'Centro de Boas-Vindas'),
    c,
    h('p', { style: 'font-size:13px' }, '🟩 terreno livre · 🟧 terreno com dono · 🟪 serviços · ⚪ você está no ponto rosa'),
  ]);
}
