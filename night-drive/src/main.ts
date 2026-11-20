import './ui/style.css';
import * as THREE from 'three';
import { Game } from './Game';
import { UI } from './ui/UI';
import type { QualityLevel } from './config';
import { AudioEngine } from './audio/AudioEngine';

function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch { return false; }
}

function defaultQuality(): QualityLevel {
  const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mobile) return cores >= 8 ? 'medium' : 'low';
  return 'high';
}

async function boot() {
  const ui = new UI(document.getElementById('ui')!);
  if (!hasWebGL2()) {
    ui.showError('Seu navegador ou dispositivo não suporta WebGL 2, necessário para o jogo.<br>Atualize o navegador (Chrome, Edge, Firefox ou Safari recentes) e ative a aceleração por hardware.');
    return;
  }
  const params = new URLSearchParams(location.search);
  const forced = params.get('quality') as QualityLevel | null;
  let quality: QualityLevel = forced && ['low', 'medium', 'high', 'ultra'].includes(forced) ? forced : defaultQuality();
  let game: Game;
  try {
    game = new Game(document.getElementById('app')!, quality);
  } catch (e) {
    ui.showError(`Não foi possível iniciar o renderizador 3D.<br><small>${String(e)}</small>`);
    return;
  }
  const audio = new AudioEngine();
  game.autoQuality = !forced;
  ui.setQualityValue(forced ? quality : 'auto');
  game.events.onState = (s) => {
    ui.onState(s);
    audio.setActive(s === 'playing');
  };
  game.events.onImpact = (speed) => { ui.impact(speed / 15); audio.impact(speed); };
  game.events.onFrame = (g, dt) => { ui.update(); audio.update(g, dt); };
  ui.onPlay = () => { audio.start(); game.start(); };
  ui.onPaint = (i) => game.car?.setPaint(i);
  ui.onVolume = (v) => audio.setVolume(v);
  ui.onQuality = (q) => {
    if (q === 'auto') { game.autoQuality = true; game.setQuality(defaultQuality()); }
    else { game.autoQuality = false; quality = q; game.setQuality(q); }
  };
  try {
    await game.init((p, label) => ui.setProgress(p, label));
  } catch (e) {
    console.error(e);
    ui.showError(`Falha ao carregar o jogo.<br><small>${String(e)}</small>`);
    return;
  }
  ui.bind(game);
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(); });

  // Small inspection API used by the automated tests (tests/e2e.mjs) and for debugging.
  (window as unknown as { __game: unknown }).__game = {
    game,
    THREE,
    get state() { return game.state; },
    get physics() { const p = game.physics; return { x: p.x, z: p.z, y: p.y, heading: p.heading, kmh: p.kmh, speed: p.speed, gear: p.gear, rpm: p.rpm, steer: p.steer, forward: p.forwardSpeed, slip: p.slip }; },
    get camera() { return game.chase.mode; },
    get fps() { return game.fps; },
    get carFallback() { return game.car.isFallback; },
    info() {
      const r = game.renderer.info;
      return { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures, quality: game.quality, resScale: game.resScale };
    },
    place(x: number, z: number, heading: number) { game.physics.reset(x, z, heading, (a: number, b: number) => game.world.city.groundHeight(a, b)); game.chase.snap(); },
    /** Deterministic simulation independent of the frame rate (tests run on software GL). */
    simulate(seconds: number, inp: { throttle?: number; brake?: number; steer?: number; handbrake?: boolean }) {
      return game.simulate(seconds, { throttle: inp.throttle ?? 0, brake: inp.brake ?? 0, steer: inp.steer ?? 0, handbrake: !!inp.handbrake });
    },
    /** Freezes the chase camera and places it manually (for screenshots). */
    shot(px: number, py: number, pz: number, tx: number, ty: number, tz: number, fov = 40) {
      game.freeCamera = true;
      const c = game.chase.camera;
      c.position.set(px, py, pz); c.lookAt(tx, ty, tz); c.fov = fov; c.updateProjectionMatrix();
    },
    release() { game.freeCamera = false; game.chase.snap(); },
  };
}

boot();
