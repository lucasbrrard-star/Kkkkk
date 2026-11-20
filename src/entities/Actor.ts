// Modelo lógico de um personagem (independente da renderização).
// Posição no chão (x, y em tiles) + altura visual z separada para o pulo 2.5D.

export type MoveState = 'idle' | 'walk' | 'run' | 'jumpPrep' | 'air' | 'land';

export class Actor {
  x: number; y: number; z = 0;
  vx = 0; vy = 0; vz = 0;
  facing = 0;          // direção alvo (0..7)
  shownFacing = 0;     // direção exibida (vira gradualmente)
  turnTimer = 0;
  state: MoveState = 'idle';
  stateTime = 0;
  speed = 0;
  running = false;
  constructor(x: number, y: number, public radius: number, public id: string) { this.x = x; this.y = y; }
  get onGround() { return this.state !== 'air'; }
  setState(s: MoveState) { if (this.state !== s) { this.state = s; this.stateTime = 0; } }
}

/** Gira a direção exibida um octante por vez (transição natural ao virar). */
export function stepFacing(a: Actor, dt: number, stepTime: number) {
  if (a.shownFacing === a.facing) { a.turnTimer = 0; return; }
  a.turnTimer += dt;
  while (a.turnTimer >= stepTime && a.shownFacing !== a.facing) {
    a.turnTimer -= stepTime;
    const diff = ((a.facing - a.shownFacing + 12) % 8) - 4; // -4..3
    a.shownFacing = (a.shownFacing + (diff >= 0 ? 1 : -1) + 8) % 8;
  }
}
