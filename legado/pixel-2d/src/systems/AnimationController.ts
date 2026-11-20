// Escolhe a animação e o quadro do spritesheet a partir do estado lógico do ator.
// A cadência da caminhada/corrida é sincronizada com a velocidade real
// (sem "patinar"), e caminhar↔correr preserva a fase do ciclo de passos.
import { CONFIG } from '../config';
import { Actor } from '../entities/Actor';

export interface SheetLayout { cols: number; layout: Record<string, { start: number; frames: number }> }

export class AnimationController {
  private phase = 0;     // fase 0..1 do ciclo de passos
  private idleT = Math.random() * 3;
  anim = 'idle';
  frameInAnim = 0;

  constructor(private sheet: SheetLayout) {}

  update(a: Actor, dt: number): number {
    const L = this.sheet.layout;
    let anim = 'idle';
    let fi = 0;
    switch (a.state) {
      case 'walk':
      case 'run': {
        const cyc = a.state === 'run' ? CONFIG.anim.runCycleTiles : CONFIG.anim.walkCycleTiles;
        this.phase = (this.phase + (a.speed * dt) / cyc) % 1;
        anim = a.state === 'run' && L.run ? 'run' : 'walk';
        fi = Math.floor(this.phase * L[anim].frames) % L[anim].frames;
        break;
      }
      case 'jumpPrep': anim = 'jump'; fi = 0; break;
      case 'air': {
        anim = 'jump';
        const v = a.vz, v0 = CONFIG.player.jumpVelocity;
        if (v > v0 * 0.7) fi = 1;           // impulso
        else if (v > v0 * 0.25) fi = 2;     // subida
        else if (v > -v0 * 0.3) fi = 3;     // ápice
        else fi = 4;                        // descida
        break;
      }
      case 'land': anim = 'jump'; fi = 5; break;
      default: {
        this.idleT += dt;
        anim = 'idle';
        fi = Math.floor(this.idleT * CONFIG.anim.idleFps) % L.idle.frames;
        // ao parar, começa o próximo passo no meio do ciclo (pés juntos)
        this.phase = 0.25;
      }
    }
    if (!L[anim]) { anim = 'idle'; fi = 0; }
    this.anim = anim; this.frameInAnim = fi;
    return a.shownFacing * this.sheet.cols + L[anim].start + fi;
  }
}
