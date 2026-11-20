// Áudio procedural com Web Audio (sem arquivos): mar ambiente e efeitos curtos.
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private seaGain: GainNode | null = null;
  enabled = true;
  private started = false;

  /** Deve ser chamado após uma interação do usuário (política de autoplay). */
  start() {
    if (this.started) { this.ctx?.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.started = true;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.6 : 0;
    this.master.connect(ctx.destination);
    // mar: ruído marrom filtrado com LFO lento (ondas)
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    this.seaGain = ctx.createGain(); this.seaGain.gain.value = 0.18;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.12;
    lfo.connect(lfoG); lfoG.connect(this.seaGain.gain);
    src.connect(lp); lp.connect(this.seaGain); this.seaGain.connect(this.master);
    src.start(); lfo.start();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.6 : 0, this.ctx.currentTime, 0.05);
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0) {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  step() { this.blip(110 + Math.random() * 40, 0.05, 'triangle', 0.05); }
  jump() { this.blip(320, 0.16, 'square', 0.04, 260); }
  land() { this.blip(140, 0.08, 'triangle', 0.08, -60); }
  ui() { this.blip(660, 0.07, 'sine', 0.06, 120); }
}

export const sfx = new Sfx();
