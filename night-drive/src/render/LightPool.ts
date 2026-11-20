import * as THREE from 'three';

/**
 * A fixed number of real point lights re-assigned every frame to the street lamps / sources
 * nearest to a focus point (the car). Lights fade in/out at the edge of the selection so the
 * hand-over is invisible. The light count never changes at runtime => no shader recompiles.
 */
export class LightPool {
  readonly group = new THREE.Group();
  private readonly lights: THREE.PointLight[] = [];
  private readonly order: number[];
  private readonly dist: Float32Array;

  constructor(private readonly sources: { pos: THREE.Vector3; color: THREE.Color }[], count: number, private intensity = 22) {
    this.order = sources.map((_, i) => i);
    this.dist = new Float32Array(sources.length);
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 26, 1.6);
      l.castShadow = false;
      this.lights.push(l);
      this.group.add(l);
    }
  }

  update(focus: THREE.Vector3) {
    const n = this.lights.length;
    for (let i = 0; i < this.sources.length; i++) {
      const p = this.sources[i].pos;
      const dx = p.x - focus.x, dz = p.z - focus.z;
      this.dist[i] = dx * dx + dz * dz;
    }
    // partial selection sort: only the n+1 nearest are needed
    const ord = this.order;
    for (let i = 0; i <= n && i < ord.length; i++) {
      let m = i;
      for (let j = i + 1; j < ord.length; j++) if (this.dist[ord[j]] < this.dist[ord[m]]) m = j;
      const t = ord[i]; ord[i] = ord[m]; ord[m] = t;
    }
    const edge = Math.sqrt(this.dist[ord[Math.min(n, ord.length - 1)]]);
    for (let i = 0; i < n; i++) {
      const l = this.lights[i];
      if (i >= ord.length) { l.intensity = 0; continue; }
      const s = this.sources[ord[i]];
      const d = Math.sqrt(this.dist[ord[i]]);
      const fade = THREE.MathUtils.clamp((edge - d) / Math.max(4, edge * 0.35), 0, 1);
      l.position.copy(s.pos);
      l.color.copy(s.color);
      l.intensity = this.intensity * fade;
    }
  }
}
