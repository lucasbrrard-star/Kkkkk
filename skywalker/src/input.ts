// Controles: toque (joystick à esquerda, arrastar à direita para olhar, botões) e teclado/mouse.

export class Input {
  move = { x: 0, y: 0 };
  look = { x: 0, y: 0 };
  sprint = false;
  private edges = new Set<string>();
  fireHeld = false;
  touch: boolean;
  sens = 1;
  enabled = false;
  private keys = new Set<string>();
  private joyId: number | null = null;
  private joyO = { x: 0, y: 0 };
  private lookIds = new Map<number, { x: number; y: number }>();
  private joyBase: HTMLElement;
  private joyKnob: HTMLElement;

  constructor(private canvas: HTMLCanvasElement) {
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.joyBase = document.getElementById('joy')!;
    this.joyKnob = document.getElementById('joy-knob')!;
    const layer = document.getElementById('touch-layer')!;
    layer.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    layer.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    layer.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    layer.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
    this.bindButton('btn-fire', 'fire', true);
    this.bindButton('btn-reload', 'reload');
    this.bindButton('btn-light', 'light');
    this.bindButton('btn-use', 'use');
    this.bindButton('btn-pause', 'pause');
    const run = document.getElementById('btn-run')!;
    const runDown = (e: Event) => { e.preventDefault(); e.stopPropagation(); this.sprint = !this.sprint; run.classList.toggle('on', this.sprint); };
    run.addEventListener('touchstart', runDown, { passive: false });
    run.addEventListener('mousedown', runDown);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const map: Record<string, string> = { KeyR: 'reload', KeyF: 'light', KeyE: 'use', Escape: 'pause', KeyP: 'pause' };
      if (map[e.code]) this.edges.add(map[e.code]);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    canvas.addEventListener('mousedown', (e) => {
      if (this.touch || !this.enabled) return;
      if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
      if (e.button === 0) { this.edges.add('fire'); this.fireHeld = true; }
    });
    window.addEventListener('mouseup', () => { this.fireHeld = false; });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) { this.look.x += e.movementX * 0.0022 * this.sens; this.look.y += e.movementY * 0.0022 * this.sens; }
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas && this.enabled && !this.touch) this.edges.add('pause');
    });
  }

  private bindButton(id: string, edge: string, lookToo = false) {
    const el = document.getElementById(id)!;
    el.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.edges.add(edge);
      el.classList.add('down');
      if (edge === 'fire') this.fireHeld = true;
      if (lookToo) for (const t of Array.from(e.changedTouches)) this.lookIds.set(t.identifier, { x: t.clientX, y: t.clientY });
    }, { passive: false });
    const up = (e: TouchEvent) => {
      e.preventDefault();
      el.classList.remove('down');
      if (edge === 'fire') this.fireHeld = false;
      for (const t of Array.from(e.changedTouches)) this.lookIds.delete(t.identifier);
    };
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
    el.addEventListener('touchmove', (e) => { e.preventDefault(); this.onTouchMove(e); }, { passive: false });
    el.addEventListener('click', (e) => { if (!this.touch) { e.stopPropagation(); this.edges.add(edge); } });
  }

  private onTouchStart(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < window.innerWidth * 0.42 && this.joyId === null) {
        this.joyId = t.identifier; this.joyO = { x: t.clientX, y: t.clientY };
        this.joyBase.style.transform = `translate(${t.clientX - 60}px, ${t.clientY - 60}px)`;
        this.joyBase.classList.add('active');
        this.joyKnob.style.transform = 'translate(0px, 0px)';
      } else {
        this.lookIds.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    }
  }

  private onTouchMove(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.joyId) {
        let dx = t.clientX - this.joyO.x, dy = t.clientY - this.joyO.y;
        const d = Math.hypot(dx, dy), R = 52;
        if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
        this.move.x = dx / R; this.move.y = -dy / R;
        this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      } else {
        const p = this.lookIds.get(t.identifier);
        if (p) {
          const k = 0.0052 * this.sens;
          this.look.x += (t.clientX - p.x) * k; this.look.y += (t.clientY - p.y) * k;
          p.x = t.clientX; p.y = t.clientY;
        }
      }
    }
  }

  private onTouchEnd(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.joyId) {
        this.joyId = null; this.move.x = 0; this.move.y = 0;
        this.joyBase.classList.remove('active');
      }
      this.lookIds.delete(t.identifier);
    }
  }

  /** lê e limpa um comando de toque único */
  take(name: string) { const h = this.edges.has(name); this.edges.delete(name); return h; }
  clearEdges() { this.edges.clear(); this.look.x = this.look.y = 0; }

  poll() {
    if (!this.touch || this.keys.size) {
      const k = this.keys;
      const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      if (this.joyId === null) { this.move.x = x; this.move.y = y; }
      if (k.has('ShiftLeft') || k.has('ShiftRight')) this.sprint = true;
      else if (!this.touch) this.sprint = false;
    }
  }

  consumeLook() { const l = { x: this.look.x, y: this.look.y }; this.look.x = this.look.y = 0; return l; }
}
