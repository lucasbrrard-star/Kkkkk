import type { Game } from '../Game';
import { clamp } from '../core/math';

/**
 * Procedural WebAudio sound design (no audio files): engine harmonics following RPM and load,
 * rain ambience, tyre hiss on the wet road, skid squeal, impacts and distant thunder.
 * The AudioContext is created on the first user gesture (Play button) as browsers require.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engine: { oscs: OscillatorNode[]; gains: GainNode[]; filter: BiquadFilterNode; out: GainNode } | null = null;
  private rainGain!: GainNode;
  private hissGain!: GainNode;
  private hissFilter!: BiquadFilterNode;
  private skidGain!: GainNode;
  private noise!: AudioBuffer;
  private volume = 0.7;
  private active = false;
  private lastFlash = 0;

  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch { return; }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    // shared noise buffer (2 s of pink-ish noise)
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    const loopNoise = () => { const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.loopStart = Math.random(); s.start(0, Math.random() * 1.5); return s; };

    // rain: two band-passed noise layers
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0.0;
    for (const [f, q, g] of [[1800, 0.6, 0.55], [5200, 0.9, 0.35]]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const gg = ctx.createGain(); gg.gain.value = g;
      loopNoise().connect(bp).connect(gg).connect(this.rainGain);
    }
    this.rainGain.connect(this.master);

    // tyres on wet asphalt
    this.hissFilter = ctx.createBiquadFilter(); this.hissFilter.type = 'bandpass'; this.hissFilter.frequency.value = 900; this.hissFilter.Q.value = 0.5;
    this.hissGain = ctx.createGain(); this.hissGain.gain.value = 0;
    loopNoise().connect(this.hissFilter).connect(this.hissGain).connect(this.master);

    // skid squeal
    const sk = ctx.createBiquadFilter(); sk.type = 'bandpass'; sk.frequency.value = 1300; sk.Q.value = 6;
    this.skidGain = ctx.createGain(); this.skidGain.gain.value = 0;
    loopNoise().connect(sk).connect(this.skidGain).connect(this.master);

    // engine: firing-order harmonics through a load-dependent low-pass + soft clipper
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 900; filter.Q.value = 2.5;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.2); }
    shaper.curve = curve;
    const out = ctx.createGain(); out.gain.value = 0;
    const oscs: OscillatorNode[] = [], gains: GainNode[] = [];
    const parts: [OscillatorType, number, number][] = [['sawtooth', 1, 0.5], ['square', 0.5, 0.35], ['sawtooth', 2, 0.22], ['triangle', 3, 0.12]];
    for (const [type, , g] of parts) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = 60;
      const gg = ctx.createGain(); gg.gain.value = g;
      o.connect(gg).connect(shaper);
      o.start();
      oscs.push(o); gains.push(gg);
    }
    shaper.connect(filter).connect(out).connect(this.master);
    this.engine = { oscs, gains, filter, out };
  }

  setActive(on: boolean) {
    this.active = on;
    if (!this.ctx) return;
    if (on) void this.ctx.resume();
    const t = this.ctx.currentTime;
    this.engine?.out.gain.setTargetAtTime(on ? 0.16 : 0, t, 0.2);
    this.rainGain?.gain.setTargetAtTime(on ? 0.22 : 0.0, t, 0.5);
    if (!on) { this.hissGain?.gain.setTargetAtTime(0, t, 0.1); this.skidGain?.gain.setTargetAtTime(0, t, 0.1); }
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  update(g: Game, dt: number) {
    void dt;
    if (!this.ctx || !this.engine || !this.active) return;
    const t = this.ctx.currentTime;
    const p = g.physics;
    const thr = g.input.state.throttle;
    // V8: 4 firing pulses per crank revolution
    const base = (p.rpm / 60) * 2;
    const mults = [1, 0.5, 2, 3];
    this.engine.oscs.forEach((o, i) => o.frequency.setTargetAtTime(base * mults[i], t, 0.03));
    this.engine.filter.frequency.setTargetAtTime(500 + p.rpm * 0.18 + thr * 1400, t, 0.05);
    this.engine.out.gain.setTargetAtTime(0.1 + thr * 0.12 + (p.rpm / 8000) * 0.05, t, 0.05);
    const sp = clamp(p.speed / 50, 0, 1);
    this.hissGain.gain.setTargetAtTime(sp * 0.45, t, 0.1);
    this.hissFilter.frequency.setTargetAtTime(500 + sp * 1600, t, 0.1);
    const skid = clamp((Math.abs(p.slip) - 0.12) * 3, 0, 1) * clamp(p.speed / 8, 0, 1) + (g.input.state.handbrake && p.speed > 4 ? 0.4 : 0);
    this.skidGain.gain.setTargetAtTime(Math.min(skid, 1) * 0.35, t, 0.05);
    // thunder after lightning
    if (g.world.flash > 0.9 && t - this.lastFlash > 3) {
      this.lastFlash = t;
      setTimeout(() => this.thunder(), 600 + Math.random() * 1800);
    }
  }

  impact(speed: number) {
    if (!this.ctx || !this.active) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600 + speed * 60;
    const g = ctx.createGain();
    const v = clamp(speed / 15, 0.15, 1);
    g.gain.setValueAtTime(v * 0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35 + v * 0.4);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + 1);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.3);
    const og = ctx.createGain(); og.gain.setValueAtTime(v * 0.7, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + 0.4);
  }

  private thunder() {
    if (!this.ctx || !this.active) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.25, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
    s.connect(f).connect(g).connect(this.master);
    s.start(t); s.stop(t + 4.6);
  }
}
