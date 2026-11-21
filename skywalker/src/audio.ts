// Áudio do jogo (Web Audio): sons 2D e 3D posicionais, ambientes em loop, batimento cardíaco
// e estática sintetizados, passos fatiados de uma gravação.
import * as THREE from 'three';
import type { SoundKey } from './assets';

export interface PlayOpts {
  vol?: number; rate?: number; loop?: boolean; pos?: THREE.Vector3; bus?: 'sfx' | 'voice' | 'amb' | 'music';
  offset?: number; duration?: number; distort?: boolean; lowpass?: number; ref?: number;
}

export interface Handle {
  src: AudioBufferSourceNode; gain: GainNode; panner?: PannerNode;
  stop(fade?: number): void; setPos(p: THREE.Vector3): void; setVol(v: number, t?: number): void; ended: boolean;
}

export class Sound {
  ctx: AudioContext;
  master: GainNode;
  bus: Record<'sfx' | 'voice' | 'amb' | 'music', GainNode>;
  buffers: Partial<Record<SoundKey, AudioBuffer>> = {};
  private stepOffsets: number[] = [];
  private noiseBuf: AudioBuffer;
  private hrtf: boolean;

  constructor(mobile: boolean) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.hrtf = !mobile;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9;
    this.master.connect(comp).connect(this.ctx.destination);
    const mk = (v: number) => { const g = this.ctx.createGain(); g.gain.value = v; g.connect(this.master); return g; };
    this.bus = { sfx: mk(1), voice: mk(1.15), amb: mk(0.55), music: mk(0.5) };
    const n = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  setBuffers(b: Partial<Record<SoundKey, AudioBuffer>>) {
    this.buffers = b;
    if (b.footsteps) this.stepOffsets = findOnsets(b.footsteps);
  }

  async unlock() { if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {}); }

  play(key: SoundKey, o: PlayOpts = {}): Handle | null {
    const buf = this.buffers[key];
    if (!buf) return null;
    return this.playBuffer(buf, o);
  }

  playBuffer(buf: AudioBuffer, o: PlayOpts = {}): Handle {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = !!o.loop;
    src.playbackRate.value = o.rate ?? 1;
    const gain = c.createGain(); gain.gain.value = o.vol ?? 1;
    let node: AudioNode = src;
    if (o.distort) {
      const ws = c.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 3.2) * 0.9; }
      ws.curve = curve;
      node.connect(ws); node = ws;
    }
    if (o.lowpass) {
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lowpass;
      node.connect(f); node = f;
    }
    let panner: PannerNode | undefined;
    if (o.pos) {
      panner = c.createPanner();
      panner.panningModel = this.hrtf ? 'HRTF' : 'equalpower';
      panner.distanceModel = 'inverse'; panner.refDistance = o.ref ?? 4; panner.rolloffFactor = 1.1; panner.maxDistance = 120;
      setP(panner, o.pos);
      node.connect(panner); node = panner;
    }
    node.connect(gain).connect(this.bus[o.bus ?? 'sfx']);
    if (o.duration) src.start(0, o.offset ?? 0, o.duration); else src.start(0, o.offset ?? 0);
    const h: Handle = {
      src, gain, panner, ended: false,
      stop: (fade = 0.05) => {
        if (h.ended) return;
        const t = c.currentTime;
        gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t); gain.gain.linearRampToValueAtTime(0, t + fade);
        try { src.stop(t + fade + 0.02); } catch { /* já parado */ }
        h.ended = true;
      },
      setPos: (p) => { if (panner) setP(panner, p); },
      setVol: (vv, tt = 0.2) => { const t = c.currentTime; gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t); gain.gain.linearRampToValueAtTime(vv, t + tt); },
    };
    src.onended = () => { h.ended = true; };
    return h;
  }

  /** passo: fatia aleatória da gravação de passos em folhas secas */
  step(vol: number, rate = 1) {
    const b = this.buffers.footsteps;
    if (!b || !this.stepOffsets.length) return;
    const off = this.stepOffsets[(Math.random() * this.stepOffsets.length) | 0];
    this.playBuffer(b, { vol, rate: rate * (0.92 + Math.random() * 0.16), offset: Math.max(0, off - 0.02), duration: 0.42 });
  }

  /** batimento cardíaco sintetizado (duas batidas graves) */
  heartbeat(vol: number) {
    const c = this.ctx, t = c.currentTime;
    for (const [dt, a] of [[0, 1], [0.24, 0.7]] as const) {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(62, t + dt); o.frequency.exponentialRampToValueAtTime(34, t + dt + 0.16);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t + dt); g.gain.linearRampToValueAtTime(vol * a, t + dt + 0.015); g.gain.exponentialRampToValueAtTime(0.0008, t + dt + 0.22);
      o.connect(g).connect(this.bus.sfx); o.start(t + dt); o.stop(t + dt + 0.3);
    }
  }

  /** estática de rádio (walkie-talkie) */
  static(vol: number, dur: number) {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.7;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.setValueAtTime(vol, t + dur - 0.08); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(bp).connect(g).connect(this.bus.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  /** clique seco (gatilho sem bala / lanterna) */
  click(vol = 0.5, freq = 2400) {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f).connect(g).connect(this.bus.sfx); s.start(t, Math.random()); s.stop(t + 0.07);
  }

  updateListener(cam: THREE.Camera) {
    const l = this.ctx.listener;
    const p = new THREE.Vector3(), f = new THREE.Vector3(), u = new THREE.Vector3();
    cam.getWorldPosition(p); cam.getWorldDirection(f); u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02); l.forwardY.setTargetAtTime(f.y, t, 0.02); l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.setTargetAtTime(u.x, t, 0.02); l.upY.setTargetAtTime(u.y, t, 0.02); l.upZ.setTargetAtTime(u.z, t, 0.02);
    } else {
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(p.x, p.y, p.z);
      (l as unknown as { setOrientation(a: number, b: number, c: number, d: number, e: number, f: number): void }).setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }
}

function setP(p: PannerNode, v: THREE.Vector3) {
  if (p.positionX) { const t = p.context.currentTime; p.positionX.setTargetAtTime(v.x, t, 0.03); p.positionY.setTargetAtTime(v.y, t, 0.03); p.positionZ.setTargetAtTime(v.z, t, 0.03); }
  else (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(v.x, v.y, v.z);
}

/** encontra o início de cada passo na gravação (picos de energia separados por ≥ 0,3 s) */
function findOnsets(b: AudioBuffer) {
  const d = b.getChannelData(0), sr = b.sampleRate, win = Math.floor(sr * 0.01);
  const env: number[] = [];
  for (let i = 0; i < d.length; i += win) { let s = 0; for (let j = i; j < Math.min(d.length, i + win); j++) s += d[j] * d[j]; env.push(Math.sqrt(s / win)); }
  const max = Math.max(...env);
  const out: number[] = [];
  let last = -1;
  for (let i = 1; i < env.length - 1; i++) {
    const t = (i * win) / sr;
    if (env[i] > max * 0.35 && env[i] >= env[i - 1] && env[i] >= env[i + 1] && t - last > 0.3 && t < b.duration - 0.45) { out.push(t); last = t; }
  }
  return out.length ? out : [0];
}
