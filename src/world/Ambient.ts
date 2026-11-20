// Vida ambiente: gaivotas com sombra, brilhos no mar, pulsação das luzes e
// iluminação por horário (dia / pôr do sol / noite).
import Phaser from 'phaser';
import { toScreen } from '../core/iso';
import { DEPTH, World } from './World';
import { N, T } from './MapData';

interface Gull { img: Phaser.GameObjects.Image; sh: Phaser.GameObjects.Image; x: number; y: number; z: number; vx: number; vy: number; t: number }

export type TimeOfDay = 'tarde' | 'noite';

export class Ambient {
  private gulls: Gull[] = [];
  private sparkles: { img: Phaser.GameObjects.Rectangle; t: number; life: number }[] = [];
  private overlay: Phaser.GameObjects.Rectangle;
  private spawnT = 2;
  tod: TimeOfDay = 'tarde';

  constructor(private scene: Phaser.Scene, private world: World) {
    this.overlay = scene.add.rectangle(0, 0, 8, 8, 0xffffff).setScrollFactor(0).setDepth(DEPTH.overlay).setOrigin(0.5);
    this.overlay.setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.setTime('tarde');
  }

  setTime(t: TimeOfDay) {
    this.tod = t;
    // a arte já é iluminada ao entardecer; a noite escurece e acende as luzes
    this.overlay.setFillStyle(0x4a5aa0, 1).setVisible(t === 'noite');
    for (const g of this.world.glows) g.img.setVisible(true);
  }

  private spawnGull() {
    const fromLeft = Math.random() < 0.5;
    const y = 10 + Math.random() * 40;
    const x = fromLeft ? -2 : N + 2;
    const sp = 2.2 + Math.random() * 1.2;
    const vx = fromLeft ? sp : -sp, vy = (Math.random() - 0.5) * 1.2;
    for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) {
      const img = this.scene.add.image(0, 0, 'objects', 'gull_0').setDepth(DEPTH.birds).setOrigin(0.5);
      const sh = this.scene.add.image(0, 0, 'objects', 'shadow_blob').setDepth(DEPTH.shadows + 20).setScale(0.5, 0.4).setAlpha(0.45);
      img.setFlipX(vx - vy < 0);
      this.gulls.push({ img, sh, x: x - i * 1.4 * Math.sign(vx), y: y + i * 0.9, z: 7 + Math.random() * 3, vx, vy, t: Math.random() * 4 });
    }
  }

  update(dt: number, time: number, cam: Phaser.Cameras.Scene2D.Camera) {
    // overlay sempre cobrindo a tela
    this.overlay.setPosition(cam.width / 2, cam.height / 2).setSize(cam.width / cam.zoom + 8, cam.height / cam.zoom + 8);
    this.overlay.setDisplaySize(cam.width / cam.zoom + 16, cam.height / cam.zoom + 16);

    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnGull(); this.spawnT = 6 + Math.random() * 8; }
    for (let i = this.gulls.length - 1; i >= 0; i--) {
      const g = this.gulls[i];
      g.t += dt; g.x += g.vx * dt; g.y += g.vy * dt; g.z += Math.sin(g.t * 1.3) * dt * 0.4;
      const glide = Math.sin(g.t * 0.8) > 0.4;
      g.img.setFrame(`gull_${glide ? 1 : Math.floor(g.t * 9) % 4}`);
      const p = toScreen(g.x, g.y, g.z), s = toScreen(g.x, g.y);
      g.img.setPosition(Math.round(p.x), Math.round(p.y));
      g.sh.setPosition(Math.round(s.x), Math.round(s.y));
      if (g.x < -6 || g.x > N + 6 || g.y < -6 || g.y > N + 6) { g.img.destroy(); g.sh.destroy(); this.gulls.splice(i, 1); }
    }

    // brilhos na água (somente na área visível)
    if (Math.random() < dt * 6) {
      const wv = cam.worldView;
      const sx = wv.x + Math.random() * wv.width, sy = wv.y + Math.random() * wv.height;
      const a = sx / 32, b = sy / 16;
      const wx = Math.floor((a + b) / 2), wy = Math.floor((b - a) / 2);
      if (wx < 0 || wy < 0 || wx >= N || wy >= N || this.world.def.terrain[wy * N + wx] === T.Water) {
        const r = this.scene.add.rectangle(Math.round(sx), Math.round(sy), 3, 1, 0xffe2b0).setDepth(DEPTH.foam + 10).setAlpha(0);
        this.sparkles.push({ img: r, t: 0, life: 0.8 + Math.random() * 0.6 });
      }
    }
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i];
      s.t += dt;
      const k = s.t / s.life;
      s.img.setAlpha(Math.sin(Math.PI * Math.min(1, k)) * 0.9);
      s.img.width = k > 0.3 && k < 0.6 ? 5 : 3;
      if (k >= 1) { s.img.destroy(); this.sparkles.splice(i, 1); }
    }

    // luzes: pulsação suave
    for (const g of this.world.glows) g.img.setAlpha(g.base * (this.tod === 'noite' ? 1.9 : 1) + Math.sin(time / 700 + g.phase) * 0.05);
  }
}
