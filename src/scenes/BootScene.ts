import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }

  preload() {
    const fill = document.getElementById('ld-fill');
    this.load.on('progress', (v: number) => { if (fill) fill.style.width = `${Math.round(v * 100)}%`; });
    this.load.setPath('assets/');
    this.load.json('meta', 'meta.json');
    this.load.image('tiles', 'tiles.png');
    this.load.atlas('objects', 'objects.png', 'objects.json');
    this.load.image('player-img', 'player.png');
    this.load.image('npc-img', 'npc.png');
  }

  create() {
    const meta = this.cache.json.get('meta');
    const { frameW, frameH } = meta.character;
    // spritesheets a partir das imagens (tamanho de quadro vindo do meta)
    for (const k of ['player', 'npc']) {
      const src = this.textures.get(`${k}-img`).getSourceImage() as HTMLImageElement;
      this.textures.addSpriteSheet(k, src, { frameWidth: frameW, frameHeight: frameH });
    }
    this.scene.start('game');
  }
}
