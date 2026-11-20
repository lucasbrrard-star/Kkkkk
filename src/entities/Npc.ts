// NPC simples: caminha entre pontos, pausa, e vira para o jogador ao conversar.
import { CONFIG } from '../config';
import { dirIndexFromWorld } from '../core/iso';
import { CollisionSystem } from '../systems/CollisionSystem';
import { NpcDef } from '../world/MapData';
import { Actor, stepFacing } from './Actor';

export class Npc {
  actor: Actor;
  private target = 1;
  private wait = 1;
  talking = 0;
  lineIdx = 0;

  constructor(public def: NpcDef, private col: CollisionSystem, public index: number) {
    const p = def.path[0];
    this.actor = new Actor(p.x, p.y, 0.3, `npc${index}`);
    this.wait = Math.random() * 2;
  }

  talkTo(px: number, py: number): string {
    this.talking = 4;
    const a = this.actor;
    a.facing = dirIndexFromWorld(px - a.x, py - a.y);
    a.vx = a.vy = 0;
    const line = this.def.lines[this.lineIdx % this.def.lines.length];
    this.lineIdx++;
    return line;
  }

  update(dt: number, playerX: number, playerY: number) {
    const a = this.actor;
    a.stateTime += dt;
    if (this.talking > 0) {
      this.talking -= dt;
      a.facing = dirIndexFromWorld(playerX - a.x, playerY - a.y);
      a.vx = a.vy = 0; a.speed = 0;
      a.setState('idle');
    } else if (this.wait > 0) {
      this.wait -= dt;
      a.speed = 0;
      a.setState('idle');
    } else {
      const t = this.def.path[this.target];
      const dx = t.x - a.x, dy = t.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.2) {
        this.target = (this.target + 1) % this.def.path.length;
        this.wait = 1 + Math.random() * 2.5;
      } else {
        const sp = this.def.speed * (CONFIG.player.walkSpeed / 2.2);
        a.vx = (dx / d) * sp; a.vy = (dy / d) * sp;
        a.facing = dirIndexFromWorld(dx, dy);
        const r = this.col.move(a.x, a.y, a.vx * dt, a.vy * dt, a.radius, 0, a.id);
        a.speed = Math.hypot(r.x - a.x, r.y - a.y) / Math.max(dt, 1e-4);
        a.x = r.x; a.y = r.y;
        a.setState(a.speed > 0.1 ? 'walk' : 'idle');
        if (a.speed < 0.05) this.wait = 0.6; // bloqueado: espera
      }
    }
    stepFacing(a, dt, 0.06);
  }
}
