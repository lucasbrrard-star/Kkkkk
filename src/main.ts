import Phaser from 'phaser';
import './style.css';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';

// Renderiza em pixels físicos (DPR) e aplica zoom inteiro de câmera: pixel art nítida.
const dpr = () => Math.min(window.devicePixelRatio || 1, 3);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1d6e9e',
  pixelArt: true,
  antialias: false,
  roundPixels: false,
  width: Math.round(window.innerWidth * dpr()),
  height: Math.round(window.innerHeight * dpr()),
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr() },
  fps: { target: 60, smoothStep: true },
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  render: { powerPreference: 'high-performance', batchSize: 4096 },
  scene: [BootScene, GameScene],
});

function resize() {
  const d = dpr();
  game.scale.setZoom(1 / d);
  game.scale.resize(Math.round(window.innerWidth * d), Math.round(window.innerHeight * d));
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
