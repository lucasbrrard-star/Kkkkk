// Detecta o objeto interativo mais próximo, exibe o indicador sobre ele e
// dispara a ação. As regras ficam aqui; os dados vêm do MapData.
import Phaser from 'phaser';
import { CONFIG } from '../config';
import { toScreen } from '../core/iso';
import { events } from '../core/events';
import { Interactable } from '../world/MapData';
import { DEPTH } from '../world/World';

export class InteractionSystem {
  current: Interactable | null = null;
  private marker: Phaser.GameObjects.Image;
  private t = 0;

  constructor(scene: Phaser.Scene, private items: Interactable[]) {
    this.marker = scene.add.image(0, 0, 'objects', 'marker_0').setDepth(DEPTH.marker).setOrigin(0.5, 1).setVisible(false);
  }

  update(px: number, py: number, dt: number, dynamic: (it: Interactable) => void) {
    this.t += dt;
    let best: Interactable | null = null, bd = Infinity;
    for (const it of this.items) {
      dynamic(it);
      let d = Math.hypot(it.x - px, it.y - py);
      if (it.rect) {
        const cx = Math.max(it.rect.x0, Math.min(px, it.rect.x1)), cy = Math.max(it.rect.y0, Math.min(py, it.rect.y1));
        d = Math.min(d, Math.hypot(px - cx, py - cy) + 0.3);
      }
      if (d < it.radius && d < bd) { bd = d; best = it; }
    }
    if (best !== this.current) {
      this.current = best;
      events.emit('interact:focus', best);
    }
    if (best) {
      const p = toScreen(best.x, best.y, best.markerZ);
      const bob = Math.round(Math.sin(this.t * 4) * 1.5);
      this.marker.setVisible(true).setPosition(Math.round(p.x), Math.round(p.y) + bob).setFrame(`marker_${Math.floor(this.t * 3) % 3}`);
    } else this.marker.setVisible(false);
    void CONFIG;
  }
}
