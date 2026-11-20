import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }

  preload() {
    const fill = document.getElementById('ld-fill');
    this.load.on('progress', (v: number) => { if (fill) fill.style.width = `${Math.round(v * 100)}%`; });
    this.load.setPath('assets/');
    this.load.json('meta', 'meta.json');
    this.load.image('tiles', 'tiles.png');
    this.load.multiatlas('objects', 'objects.json', 'assets/');
    this.load.image('player-img', 'player.png');
    // folhas dos NPCs: quantidade definida no meta.json
    this.load.once('filecomplete-json-meta', (_k: string, _t: string, meta: { character: { npcCount: number } }) => {
      for (let i = 0; i < meta.character.npcCount; i++) this.load.image(`npc${i}-img`, `npc${i}.png`);
    });
  }

  create() {
    const meta = this.cache.json.get('meta');
    const { frameW, frameH, npcCount } = meta.character;
    const keys = ['player', ...Array.from({ length: npcCount }, (_, i) => `npc${i}`)];
    for (const k of keys) {
      const src = this.textures.get(`${k}-img`).getSourceImage() as HTMLImageElement;
      this.textures.addSpriteSheet(k, src, { frameWidth: frameW, frameHeight: frameH });
    }
    this.scene.start('game');
  }
}
