// Áudio ambiente sintetizado (sem arquivos): mar, chafariz, pássaros, passos e cliques
// de interface. Volume do mar e do chafariz varia com a posição do jogador.
import { CITY } from '../../shared/city';

export class Ambience {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sea!: GainNode;
  private fountain!: GainNode;
  private birdsAt = 4;
  private t = 0;
  volume = 0.7;

  /** Precisa de um gesto do usuário (política dos navegadores). */
  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    // ruído base (2 s em loop)
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.985 * b + 0.15 * w; d[i] = b * 0.6 + w * 0.05; }
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2); return s; };
    // mar: ruído marrom passa-baixa com ondulação lenta
    const seaF = ctx.createBiquadFilter(); seaF.type = 'lowpass'; seaF.frequency.value = 520;
    this.sea = ctx.createGain(); this.sea.gain.value = 0;
    const swell = ctx.createGain(); swell.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.35;
    lfo.connect(lfoG).connect(swell.gain); lfo.start();
    noise().connect(seaF).connect(swell).connect(this.sea).connect(this.master);
    // chafariz: ruído agudo filtrado
    const fF = ctx.createBiquadFilter(); fF.type = 'bandpass'; fF.frequency.value = 2400; fF.Q.value = 0.6;
    this.fountain = ctx.createGain(); this.fountain.gain.value = 0;
    noise().connect(fF).connect(this.fountain).connect(this.master);
  }

  setVolume(v: number) { this.volume = v; if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }

  update(dt: number, x: number, z: number) {
    if (!this.ctx) return;
    this.t += dt;
    const now = this.ctx.currentTime;
    const seaD = Math.max(0, CITY.shoreX - x);
    this.sea.gain.setTargetAtTime(0.06 + 0.5 * Math.exp(-seaD / 45), now, 0.3);
    const fD = Math.hypot(x, z);
    this.fountain.gain.setTargetAtTime(0.18 * Math.exp(-fD / 9), now, 0.3);
    this.birdsAt -= dt;
    if (this.birdsAt <= 0) { this.birdsAt = 5 + Math.random() * 9; this.bird(); }
  }

  private bird() {
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 3), base = 2600 + Math.random() * 1600;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + i * 0.16;
      o.type = 'sine';
      o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * 1.45, t + 0.07); o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.12);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.15);
    }
  }

  step(run: boolean) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(), len = 0.06 * ctx.sampleRate | 0, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = run ? 1400 : 900 + Math.random() * 200;
    const g = ctx.createGain(); g.gain.value = run ? 0.16 : 0.1;
    s.connect(f).connect(g).connect(this.master); s.start(t);
  }

  ui(kind: 'click' | 'ok' | 'msg' = 'click') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const notes = kind === 'ok' ? [660, 880, 1320] : kind === 'msg' ? [880, 1175] : [740];
    notes.forEach((fq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), tt = t + i * 0.08;
      o.type = 'triangle'; o.frequency.value = fq;
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.08, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.18);
      o.connect(g).connect(this.master); o.start(tt); o.stop(tt + 0.2);
    });
  }
}
