// Câmera: segue o jogador com suavização exponencial + leve antecipação na
// direção do movimento, zoom inteiro (pixels nítidos) e limites do mapa.
import Phaser from 'phaser';
import { CONFIG } from '../config';
import { toScreen } from '../core/iso';
import { Actor } from '../entities/Actor';

export class CameraController {
  zoom = 3;
  zoomOffset = 0;
  private cx = 0; private cy = 0;
  private bounds: Phaser.Geom.Rectangle;

  constructor(private cam: Phaser.Cameras.Scene2D.Camera, mapSize: number) {
    const halfW = mapSize * CONFIG.iso.tileW / 2;
    // limites (em px do mundo) com margem de mar
    this.bounds = new Phaser.Geom.Rectangle(-halfW + 120, 60, halfW * 2 - 240, mapSize * CONFIG.iso.tileH - 100);
    this.applyZoom();
  }

  applyZoom() {
    // paisagem: mostra uma boa porção da cidade (como a referência); em pé: aproxima
    const W = this.cam.width, H = this.cam.height;
    const auto = W >= H ? Math.max(1, Math.round(W / 1500)) : Math.max(1, Math.round(W / 560));
    this.zoom = Math.max(1, auto + this.zoomOffset);
    this.cam.setZoom(this.zoom);
  }

  snapTo(a: Actor) {
    const p = toScreen(a.x, a.y, 0);
    this.cx = p.x; this.cy = p.y - 16;
    this.apply();
  }

  update(a: Actor, dt: number) {
    const p = toScreen(a.x + a.vx * CONFIG.camera.lookAhead, a.y + a.vy * CONFIG.camera.lookAhead, 0);
    const tx = p.x, ty = p.y - 16 - a.z * 4; // acompanha pouco a altura do pulo (evita trancos)
    const k = 1 - Math.exp(-CONFIG.camera.lerp * dt);
    this.cx += (tx - this.cx) * k;
    this.cy += (ty - this.cy) * k;
    this.apply();
  }

  private apply() {
    const vw = this.cam.width / this.zoom, vh = this.cam.height / this.zoom;
    const b = this.bounds;
    let x = this.cx, y = this.cy;
    if (vw < b.width) x = Phaser.Math.Clamp(x, b.x + vw / 2, b.right - vw / 2); else x = b.centerX;
    if (vh < b.height) y = Phaser.Math.Clamp(y, b.y + vh / 2, b.bottom - vh / 2); else y = b.centerY;
    // alinha ao pixel físico para evitar tremulação da pixel art
    const snap = (v: number) => Math.round(v * this.zoom) / this.zoom;
    this.cam.centerOn(snap(x), snap(y));
  }
}
