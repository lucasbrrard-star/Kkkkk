// Entrada unificada: teclado (WASD/setas, Shift, Espaço, E), joystick virtual
// multitoque e botões da HUD. Ignora o teclado quando o foco está num campo de texto.

export class Input {
  move = { x: 0, y: 0 };          // -1..1 (x → direita, y → frente)
  run = false;                    // alternado pelo botão no celular / Shift no teclado
  runToggle = false;
  private keys = new Set<string>();
  private pressed = new Set<string>();
  joy = { x: 0, y: 0, active: false };
  enabled = true;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (this.typing(e)) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.joy.active = false; this.joy.x = this.joy.y = 0; });
  }

  private typing(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  /** Verdadeiro uma única vez por pressionamento. */
  hit(code: string) { const h = this.pressed.has(code); this.pressed.delete(code); return h; }
  press(code: string) { this.pressed.add(code); }
  down(code: string) { return this.keys.has(code); }

  update() {
    let x = 0, y = 0;
    if (this.enabled) {
      if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
      if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
      if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
      if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
      if (this.joy.active) { x += this.joy.x; y += this.joy.y; }
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.move.x = x; this.move.y = y;
    const keyboardRun = this.down('ShiftLeft') || this.down('ShiftRight');
    // no joystick, empurrar até a borda também corre
    this.run = keyboardRun || this.runToggle || (this.joy.active && Math.hypot(this.joy.x, this.joy.y) > 0.92);
  }

  endFrame() { this.pressed.clear(); }
}

/** Joystick virtual: aparece onde o polegar toca (metade esquerda da tela). */
export class Joystick {
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private id: number | null = null;
  private cx = 0; private cy = 0;
  private radius = 56;

  constructor(private zone: HTMLElement, private input: Input) {
    this.base = document.createElement('div');
    this.base.className = 'joy-base';
    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.base.appendChild(this.knob);
    zone.appendChild(this.base);
    zone.addEventListener('pointerdown', (e) => this.start(e));
    window.addEventListener('pointermove', (e) => this.moveTo(e));
    window.addEventListener('pointerup', (e) => this.end(e));
    window.addEventListener('pointercancel', (e) => this.end(e));
  }

  private start(e: PointerEvent) {
    if (this.id !== null) return;
    e.preventDefault();
    this.id = e.pointerId;
    const r = this.zone.getBoundingClientRect();
    this.cx = e.clientX; this.cy = e.clientY;
    this.base.style.left = `${this.cx - r.left}px`;
    this.base.style.top = `${this.cy - r.top}px`;
    this.base.classList.add('on');
    this.input.joy.active = true;
    this.moveTo(e);
  }

  private moveTo(e: PointerEvent) {
    if (e.pointerId !== this.id) return;
    let dx = e.clientX - this.cx, dy = e.clientY - this.cy;
    const l = Math.hypot(dx, dy);
    if (l > this.radius) { dx *= this.radius / l; dy *= this.radius / l; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const dead = 0.12;
    const nx = dx / this.radius, ny = -dy / this.radius;
    const m = Math.hypot(nx, ny);
    const k = m < dead ? 0 : (m - dead) / (1 - dead) / (m || 1);
    this.input.joy.x = nx * k; this.input.joy.y = ny * k;
  }

  private end(e: PointerEvent) {
    if (e.pointerId !== this.id) return;
    this.id = null;
    this.base.classList.remove('on');
    this.knob.style.transform = '';
    this.input.joy.active = false; this.input.joy.x = this.input.joy.y = 0;
  }
}
