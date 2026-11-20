// Fully synthesized sound effects (WebAudio) - no audio files needed.
export class Sfx {
  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.ambient();
  }
  get ok() { return !!this.ctx && this.ctx.state !== 'closed'; }
  _noise(t0, dur, type, freq, q, vol, attack = 0.002) {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
    return f;
  }
  _osc(t0, dur, type, f0, f1, vol) {
    const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  shot() {
    if (!this.ok) return; const t = this.ctx.currentTime;
    this._noise(t, 0.09, 'bandpass', 2400, 0.6, 0.9);
    this._noise(t, 0.4, 'lowpass', 700, 0.5, 0.45);
    this._osc(t, 0.16, 'sine', 140, 38, 0.8);
  }
  empty() { if (!this.ok) return; const t = this.ctx.currentTime; this._osc(t, 0.04, 'square', 1800, 900, 0.15); }
  reload() {
    if (!this.ok) return; const t = this.ctx.currentTime;
    this._noise(t + 0.25, 0.05, 'highpass', 3000, 0.7, 0.35); this._osc(t + 0.25, 0.05, 'square', 600, 300, 0.12);
    this._noise(t + 1.25, 0.06, 'highpass', 2500, 0.7, 0.45); this._osc(t + 1.45, 0.07, 'square', 900, 400, 0.18);
  }
  hit(head) { if (!this.ok) return; const t = this.ctx.currentTime; this._noise(t, 0.09, 'bandpass', head ? 900 : 450, 1.5, 0.6); if (head) this._osc(t, 0.08, 'triangle', 1400, 1100, 0.12); }
  hurt() { if (!this.ok) return; const t = this.ctx.currentTime; this._osc(t, 0.25, 'sine', 110, 45, 0.7); this._noise(t, 0.2, 'lowpass', 500, 1, 0.4); }
  pickup() { if (!this.ok) return; const t = this.ctx.currentTime; this._osc(t, 0.12, 'sine', 600, 900, 0.25); this._osc(t + 0.1, 0.18, 'sine', 900, 1300, 0.22); }
  groan(vol = 0.3, pitch = 1) {
    if (!this.ok || vol < 0.02) return; const c = this.ctx, t = c.currentTime, dur = 0.7 + Math.random() * 0.7;
    const o = c.createOscillator(); o.type = 'sawtooth'; const base = (70 + Math.random() * 40) * pitch;
    o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 0.75, t + dur);
    const lfo = c.createOscillator(); lfo.frequency.value = 6 + Math.random() * 5; const lg = c.createGain(); lg.gain.value = 9; lfo.connect(lg); lg.connect(o.frequency);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500 + Math.random() * 300; f.Q.value = 2.5;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }
  ambient() {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = c.createGain(); g.gain.value = 0.06;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.08; const lg = c.createGain(); lg.gain.value = 160; lfo.connect(lg); lg.connect(f.frequency);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(); lfo.start();
  }
}
