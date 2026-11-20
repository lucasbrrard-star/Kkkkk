// Lógica de movimento do jogador: aceleração analógica, corrida, pulo em 2.5D
// (altura z independente da posição no chão), colisões coerentes com a altura.
import { CONFIG } from '../config';
import { dirIndexFromWorld, screenVecToWorld } from '../core/iso';
import { CollisionSystem } from '../systems/CollisionSystem';
import { InputState } from '../systems/InputController';
import { Actor, stepFacing } from './Actor';

export class PlayerController {
  onJump?: () => void;
  onLand?: () => void;
  onStep?: () => void;
  private stepAcc = 0;

  constructor(public actor: Actor, private col: CollisionSystem) {}

  update(inp: InputState, dt: number) {
    const a = this.actor;
    const P = CONFIG.player;
    a.stateTime += dt;

    // entrada analógica → direção no mundo
    let mag = Math.min(1, Math.hypot(inp.mx, inp.my));
    const w = screenVecToWorld(inp.mx, inp.my);
    const wl = Math.hypot(w.x, w.y);
    const dirX = wl > 1e-4 ? w.x / wl : 0, dirY = wl > 1e-4 ? w.y / wl : 0;
    // joystick totalmente inclinado também corre (opcional ao segurar o botão)
    a.running = inp.run && mag > 0.1;
    const top = a.running ? P.runSpeed : P.walkSpeed;
    if (a.state === 'jumpPrep' || a.state === 'land') mag *= 0.35;
    const tvx = dirX * top * mag, tvy = dirY * top * mag;
    const k = a.onGround ? (mag > 0.05 ? P.accel : P.decel) : P.airAccel;
    const f = 1 - Math.exp(-k * dt);
    a.vx += (tvx - a.vx) * f;
    a.vy += (tvy - a.vy) * f;
    if (mag > 0.1) a.facing = dirIndexFromWorld(dirX, dirY);
    stepFacing(a, dt, P.turnStep);

    // pulo: preparação → ar → aterrissagem
    if (inp.jump && (a.state === 'idle' || a.state === 'walk' || a.state === 'run')) {
      a.setState('jumpPrep');
    }
    if (a.state === 'jumpPrep' && a.stateTime >= P.jumpPrep) {
      a.setState('air');
      a.vz = P.jumpVelocity;
      this.onJump?.();
    }
    if (a.state === 'air') {
      a.vz -= P.gravity * dt;
      a.z += a.vz * dt;
      if (a.z <= 0) {
        a.z = 0; a.vz = 0;
        a.setState('land');
        this.onLand?.();
        // se aterrissou sobre algo baixo, o deslizamento abaixo empurra para fora
      }
    }
    if (a.state === 'land' && a.stateTime >= P.landTime) a.setState('idle');

    // integração com colisão (z permite passar por cima de obstáculos baixos)
    const res = this.col.move(a.x, a.y, a.vx * dt, a.vy * dt, a.radius, a.z, a.id);
    const realVx = (res.x - a.x) / Math.max(dt, 1e-4), realVy = (res.y - a.y) / Math.max(dt, 1e-4);
    a.x = res.x; a.y = res.y;
    if (res.hit) { a.vx = realVx * 0.9 + a.vx * 0.1; a.vy = realVy * 0.9 + a.vy * 0.1; }
    a.speed = Math.hypot(realVx, realVy);

    if (a.state === 'idle' || a.state === 'walk' || a.state === 'run') {
      if (a.speed < 0.25 && mag < 0.05) a.setState('idle');
      else if (a.running && a.speed > P.walkSpeed * 1.05) a.setState('run');
      else if (a.speed > 0.2) a.setState(a.running && a.speed > P.walkSpeed * 0.9 ? 'run' : 'walk');
      else a.setState('idle');
    }

    // passos (som)
    if (a.onGround && a.speed > 0.5) {
      this.stepAcc += a.speed * dt;
      const stride = a.state === 'run' ? CONFIG.anim.runCycleTiles / 2 : CONFIG.anim.walkCycleTiles / 2;
      if (this.stepAcc > stride) { this.stepAcc = 0; this.onStep?.(); }
    }
  }
}
