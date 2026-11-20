import type { Input } from '../core/Input';
import { clamp } from '../core/math';

/**
 * On-screen controls for touch devices. Every control captures its own pointer id, so steering,
 * throttle, brake and handbrake work simultaneously with multi-touch.
 */
export class TouchControls {
  constructor(root: HTMLElement, private readonly input: Input) {
    root.innerHTML = `
      <div class="t-steer" aria-label="Volante"><span class="arrow l">◀</span><span class="arrow r">▶</span><div class="knob"></div></div>
      <div class="t-pedal t-hand" data-k="handbrake" aria-label="Freio de mão">FREIO<br>MÃO</div>
      <div class="t-pedal t-brake" data-k="brake" aria-label="Freio e ré">FREIO</div>
      <div class="t-pedal t-gas" data-k="throttle" aria-label="Acelerar">ACEL</div>`;
    const steer = root.querySelector('.t-steer') as HTMLElement;
    const knob = steer.querySelector('.knob') as HTMLElement;
    let steerId = -1;
    const setSteer = (clientX: number) => {
      const r = steer.getBoundingClientRect();
      const range = r.width / 2 - 36;
      const dx = clamp(clientX - (r.left + r.width / 2), -range, range);
      knob.style.transform = `translateX(${dx}px)`;
      // slight expo curve for finer control around the centre
      const v = dx / range;
      this.input.touch.steer = Math.sign(v) * Math.pow(Math.abs(v), 1.35);
    };
    steer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      steerId = e.pointerId;
      steer.setPointerCapture(e.pointerId);
      this.activate();
      setSteer(e.clientX);
    });
    steer.addEventListener('pointermove', (e) => { if (e.pointerId === steerId) setSteer(e.clientX); });
    const endSteer = (e: PointerEvent) => {
      if (e.pointerId !== steerId) return;
      steerId = -1;
      this.input.touch.steer = 0;
      knob.style.transform = 'translateX(0px)';
    };
    steer.addEventListener('pointerup', endSteer);
    steer.addEventListener('pointercancel', endSteer);
    steer.addEventListener('lostpointercapture', endSteer);

    root.querySelectorAll<HTMLElement>('.t-pedal').forEach((p) => {
      const k = p.dataset.k as 'throttle' | 'brake' | 'handbrake';
      const ids = new Set<number>();
      const set = (on: boolean) => {
        p.classList.toggle('on', on);
        if (k === 'handbrake') this.input.touch.handbrake = on; else this.input.touch[k] = on ? 1 : 0;
      };
      p.addEventListener('pointerdown', (e) => { e.preventDefault(); ids.add(e.pointerId); p.setPointerCapture(e.pointerId); this.activate(); set(true); });
      const up = (e: PointerEvent) => { ids.delete(e.pointerId); if (!ids.size) set(false); };
      p.addEventListener('pointerup', up);
      p.addEventListener('pointercancel', up);
      p.addEventListener('lostpointercapture', up);
    });
    if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) document.body.classList.add('touch');
    window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private activate() { this.input.touch.active = true; }
}
