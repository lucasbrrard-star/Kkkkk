// Renderização de um ator: sprite (spritesheet de 8 direções) + sombra no chão
// que encolhe/clareia com a altura do pulo.
import Phaser from 'phaser';
import { CONFIG } from '../config';
import { depthOf, toScreen } from '../core/iso';
import { DEPTH } from '../world/World';
import { Actor } from './Actor';
import { AnimationController, SheetLayout } from '../systems/AnimationController';

export class CharacterView {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  anim: AnimationController;
  depth = 0;

  constructor(scene: Phaser.Scene, texture: string, sheet: SheetLayout, fw: number, fh: number, ax: number, ay: number) {
    this.sprite = scene.add.sprite(0, 0, texture, 0).setOrigin(ax / fw, ay / fh);
    this.shadow = scene.add.image(0, 0, 'objects', 'shadow_blob').setDepth(DEPTH.shadows + 10);
    this.anim = new AnimationController(sheet);
  }

  sync(a: Actor, dt: number, snap: number) {
    const frame = this.anim.update(a, dt);
    this.sprite.setFrame(frame);
    const g = toScreen(a.x, a.y);
    const s = (v: number) => Math.round(v * snap) / snap;
    this.sprite.setPosition(s(g.x), s(g.y - a.z * CONFIG.iso.heightPx));
    const k = Math.max(0.55, 1 - a.z * 0.35);
    this.shadow.setPosition(s(g.x), s(g.y)).setScale(k).setAlpha(0.9 - a.z * 0.25);
    this.depth = depthOf(a.x, a.y);
  }

  setDepth(d: number) { this.sprite.setDepth(d); }
  destroy() { this.sprite.destroy(); this.shadow.destroy(); }
}
