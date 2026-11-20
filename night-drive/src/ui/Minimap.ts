import type { CityLayout } from '../world/CityLayout';

/** Rotating circular minimap (heading-up), drawn from a pre-rendered top view of the city. */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly map: HTMLCanvasElement;
  private readonly ppm = 2; // pixels per metre on the pre-rendered map
  private readonly minX: number;
  private readonly minZ: number;
  others: { x: number; z: number }[] = [];

  constructor(private readonly canvas: HTMLCanvasElement, city: CityLayout) {
    this.ctx = canvas.getContext('2d')!;
    const W = city.world;
    this.minX = W.minX; this.minZ = W.minZ;
    this.map = document.createElement('canvas');
    this.map.width = Math.ceil((W.maxX - W.minX) * this.ppm);
    this.map.height = Math.ceil((W.maxZ - W.minZ) * this.ppm);
    const g = this.map.getContext('2d')!;
    const P = this.ppm;
    const X = (x: number) => (x - W.minX) * P, Z = (z: number) => (z - W.minZ) * P;
    g.fillStyle = '#0b0c14';
    g.fillRect(0, 0, this.map.width, this.map.height);
    g.fillStyle = 'rgba(175,185,215,0.6)';
    for (const r of city.ns) g.fillRect(X(r.pos - r.width / 2), Z(r.from), r.width * P, (r.to - r.from) * P);
    for (const r of city.ew) g.fillRect(X(r.from), Z(r.pos - r.width / 2), (r.to - r.from) * P, r.width * P);
    g.fillStyle = 'rgba(48,40,66,0.95)';
    for (const b of city.buildings) g.fillRect(X(b.minX), Z(b.minZ), (b.maxX - b.minX) * P, (b.maxZ - b.minZ) * P);
    g.fillStyle = 'rgba(30,80,40,0.9)';
    for (const r of city.grass) g.fillRect(X(r.minX), Z(r.minZ), (r.maxX - r.minX) * P, (r.maxZ - r.minZ) * P);
    g.fillStyle = 'rgba(255,63,208,0.7)';
    for (const s of city.signs) g.fillRect(X(s.x) - 2, Z(s.z) - 2, 4, 4);
  }

  draw(x: number, z: number, heading: number) {
    const c = this.ctx, w = this.canvas.width, h = this.canvas.height;
    const scale = 1.25; // screen px per map px
    c.save();
    c.clearRect(0, 0, w, h);
    c.translate(w / 2, h / 2);
    const phi = -Math.PI / 2 - Math.atan2(Math.cos(heading), Math.sin(heading));
    c.rotate(phi);
    c.scale(scale, scale);
    c.drawImage(this.map, -(x - this.minX) * this.ppm, -(z - this.minZ) * this.ppm);
    c.fillStyle = '#ffb02e';
    for (const o of this.others) {
      c.beginPath();
      c.arc((o.x - x) * this.ppm, (o.z - z) * this.ppm, 3.5, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    // player arrow (always pointing up)
    c.save();
    c.translate(w / 2, h / 2);
    c.fillStyle = '#fff';
    c.shadowColor = '#2ee6ff';
    c.shadowBlur = 10;
    c.beginPath();
    c.moveTo(0, -16); c.lineTo(10, 12); c.lineTo(0, 6); c.lineTo(-10, 12); c.closePath();
    c.fill();
    c.restore();
  }
}
