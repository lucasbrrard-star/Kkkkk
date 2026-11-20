// Utilitários de DOM para a interface (sem framework, leve para celular).

type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export const fmt = (n: number) => n.toLocaleString('pt-BR');

export const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

/** Preferências locais do jogador. */
export const prefs = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem('cidadeviva.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem('cidadeviva.' + k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
};

// ícones SVG inline (traço simples, herdam a cor do texto)
const I = (d: string, extra = '') => `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
export const icon = {
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  chat: I('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20l1.1-4.2A8 8 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/>'),
  smile: I('<circle cx="12" cy="12" r="9.5"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/>'),
  jump: I('<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>'),
  run: I('<circle cx="14" cy="4.5" r="1.8"/><path d="M8 21l3-6 3 2v5"/><path d="M6 12l3-3 4 1 3 3 3 1"/><path d="M11 15l2-5"/>'),
  hand: I('<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'),
  map: I('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'),
  close: I('<path d="M18 6L6 18M6 6l12 12"/>'),
  send: I('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>'),
  coin: '<svg viewBox="0 0 24 24" width="1em" height="1em"><circle cx="12" cy="12" r="10" fill="#ffc83d" stroke="#d9971a" stroke-width="2"/><path d="M14.8 9.2A3.4 3.4 0 0 0 12 8a4 4 0 0 0 0 8 3.4 3.4 0 0 0 2.8-1.2" fill="none" stroke="#a8670a" stroke-width="2.2" stroke-linecap="round"/></svg>',
  gem: '<svg viewBox="0 0 24 24" width="1em" height="1em"><path d="M6 3h12l4 6-10 12L2 9z" fill="#5fd4ff" stroke="#1c8fd1" stroke-width="1.6" stroke-linejoin="round"/><path d="M2 9h20M9 3l3 6 3-6M12 9v12" stroke="#1c8fd1" stroke-width="1.2" fill="none"/></svg>',
  pin: I('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
  user: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  shirt: I('<path d="M20.4 6.6L16 4a4 4 0 0 1-8 0L3.6 6.6a1 1 0 0 0-.5 1.2l1.4 3.9a1 1 0 0 0 1.2.6L7 12v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-8l1.3.3a1 1 0 0 0 1.2-.6l1.4-3.9a1 1 0 0 0-.5-1.2z"/>'),
  check: I('<path d="M20 6L9 17l-5-5"/>'),
  sound: I('<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'),
};
