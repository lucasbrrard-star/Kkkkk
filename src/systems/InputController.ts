// Unifica teclado (WASD/setas, Shift, Espaço, E, Esc) e controles de toque
// (joystick analógico + botões) em um estado por quadro.

export interface InputState {
  mx: number; my: number;     // vetor de movimento em espaço de TELA (direita, baixo), magnitude 0..1
  run: boolean;
  jump: boolean;              // borda (pressionado neste quadro)
  interact: boolean;          // borda
  menu: boolean;              // borda
}

const KEYMAP: Record<string, string> = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run', Space: 'jump', KeyE: 'interact', Escape: 'menu', Enter: 'interact',
};

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export class InputController {
  private keys = new Set<string>();
  private edges = new Set<string>();
  // toque
  touchVec = { x: 0, y: 0 };
  touchRun = false;
  enabled = true;
  lastDevice: 'keyboard' | 'touch' = 'keyboard';

  constructor() {
    window.addEventListener('keydown', (e) => {
      const k = KEYMAP[e.code];
      if (!k) return;
      // nunca captura teclas enquanto o usuário digita em um campo de texto
      if (isTyping(e.target)) { if (k === 'menu') (e.target as HTMLElement).blur(); return; }
      e.preventDefault();
      this.lastDevice = 'keyboard';
      if (!this.keys.has(k) && !e.repeat) this.edges.add(k);
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => {
      const k = KEYMAP[e.code];
      if (k) this.keys.delete(k);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.touchVec = { x: 0, y: 0 }; this.touchRun = false; });
  }

  press(action: 'jump' | 'interact' | 'menu') { this.edges.add(action); this.lastDevice = 'touch'; }

  read(): InputState {
    let mx = 0, my = 0;
    if (this.keys.has('left')) mx -= 1;
    if (this.keys.has('right')) mx += 1;
    if (this.keys.has('up')) my -= 1;
    if (this.keys.has('down')) my += 1;
    const kl = Math.hypot(mx, my);
    if (kl > 0) { mx /= kl; my /= kl; }
    const tl = Math.hypot(this.touchVec.x, this.touchVec.y);
    if (tl > 0.001 && kl === 0) { mx = this.touchVec.x; my = this.touchVec.y; }
    const st: InputState = {
      mx: this.enabled ? mx : 0, my: this.enabled ? my : 0,
      run: this.enabled && (this.keys.has('run') || this.touchRun),
      jump: this.enabled && this.edges.has('jump'),
      interact: this.edges.has('interact'),
      menu: this.edges.has('menu'),
    };
    this.edges.clear();
    return st;
  }

  clear() { this.keys.clear(); this.edges.clear(); this.touchVec = { x: 0, y: 0 }; this.touchRun = false; }
}
