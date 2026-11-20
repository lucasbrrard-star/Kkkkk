import { approach, clamp } from './math';
import type { DriveInput } from '../vehicle/VehiclePhysics';

type Action = 'camera' | 'reset' | 'pause' | 'lights' | 'horn';

/**
 * Merges keyboard, gamepad and on-screen touch controls into one DriveInput.
 * Digital steering is smoothed so keyboard play feels analog; touch/gamepad are analog already.
 */
export class Input {
  readonly state: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  /** Values written by the touch UI (each pointer is tracked independently). */
  readonly touch = { throttle: 0, brake: 0, steer: 0, handbrake: false, active: false };
  private keys = new Set<string>();
  private listeners = new Map<Action, (() => void)[]>();
  private kbSteer = 0;
  enabled = true;

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const k = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(k);
    if (k === 'KeyC') this.emit('camera');
    if (k === 'KeyR') this.emit('reset');
    if (k === 'Escape' || k === 'KeyP') this.emit('pause');
    if (k === 'KeyL') this.emit('lights');
    if (k === 'KeyH') this.emit('horn');
  };
  private readonly onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private readonly onBlur = () => { this.keys.clear(); };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  on(a: Action, fn: () => void) {
    const arr = this.listeners.get(a) ?? [];
    arr.push(fn);
    this.listeners.set(a, arr);
  }
  emit(a: Action) { for (const fn of this.listeners.get(a) ?? []) fn(); }

  private down(...codes: string[]) { return codes.some((c) => this.keys.has(c)); }

  update(dt: number) {
    const s = this.state;
    if (!this.enabled) { s.throttle = s.brake = s.steer = 0; s.handbrake = false; return s; }
    const up = this.down('KeyW', 'ArrowUp');
    const dn = this.down('KeyS', 'ArrowDown');
    const left = this.down('KeyA', 'ArrowLeft');
    const right = this.down('KeyD', 'ArrowRight');
    const kbTarget = (right ? 1 : 0) - (left ? 1 : 0);
    this.kbSteer = approach(this.kbSteer, kbTarget, dt * (kbTarget === 0 ? 6 : 3.6));

    let throttle = up ? 1 : 0, brake = dn ? 1 : 0, steer = this.kbSteer, hand = this.down('Space');

    // gamepad (standard mapping): RT throttle, LT brake, left stick steer, A/B handbrake
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const lx = Math.abs(p.axes[0]) > 0.12 ? p.axes[0] : 0;
      if (lx) steer = clamp(lx, -1, 1);
      throttle = Math.max(throttle, p.buttons[7]?.value ?? 0);
      brake = Math.max(brake, p.buttons[6]?.value ?? 0);
      hand = hand || !!p.buttons[0]?.pressed || !!p.buttons[1]?.pressed;
      break;
    }
    if (this.touch.active) {
      throttle = Math.max(throttle, this.touch.throttle);
      brake = Math.max(brake, this.touch.brake);
      if (Math.abs(this.touch.steer) > 0.01) steer = this.touch.steer;
      hand = hand || this.touch.handbrake;
    }
    s.throttle = throttle; s.brake = brake; s.steer = clamp(steer, -1, 1); s.handbrake = hand;
    return s;
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.listeners.clear();
  }
}
