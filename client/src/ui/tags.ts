// Nomes e balões de fala acima dos personagens (DOM projetado do mundo 3D).
import * as THREE from 'three';
import { esc } from './dom';

interface Tag { el: HTMLDivElement; nm: HTMLDivElement; bubble: HTMLDivElement | null; until: number; get: () => THREE.Vector3 | null; height: number; kind: string }

export class Tags {
  private tags = new Map<string, Tag>();
  private v = new THREE.Vector3();
  showNames = true;
  constructor(private layer: HTMLElement) {}

  add(id: string, name: string, get: () => THREE.Vector3 | null, kind: 'player' | 'npc' | 'me' = 'player', height = 2.05) {
    this.remove(id);
    const el = document.createElement('div');
    el.className = `tag3d ${kind}`;
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = name;
    el.appendChild(nm);
    this.layer.appendChild(el);
    this.tags.set(id, { el, nm, bubble: null, until: 0, get, height, kind });
  }

  mark(id: string, on: boolean) {
    const t = this.tags.get(id);
    if (!t) return;
    let m = t.el.querySelector('.mark');
    if (on && !m) { m = document.createElement('div'); m.className = 'mark'; m.textContent = '!'; t.el.insertBefore(m, t.el.firstChild); }
    if (!on && m) m.remove();
  }

  rename(id: string, name: string) { const t = this.tags.get(id); if (t) t.nm.textContent = name; }

  remove(id: string) { const t = this.tags.get(id); if (t) { t.el.remove(); this.tags.delete(id); } }

  say(id: string, text: string) {
    const t = this.tags.get(id);
    if (!t) return;
    t.bubble?.remove();
    const b = document.createElement('div');
    b.className = 'bubble';
    b.innerHTML = esc(text);
    t.el.insertBefore(b, t.nm);
    t.bubble = b;
    t.until = performance.now() + Math.min(9000, 3500 + text.length * 60);
  }

  update(cam: THREE.PerspectiveCamera, w: number, h: number) {
    const now = performance.now();
    for (const t of this.tags.values()) {
      if (t.bubble && now > t.until) { t.bubble.remove(); t.bubble = null; }
      const p = t.get();
      if (!p) { t.el.style.display = 'none'; continue; }
      this.v.set(p.x, p.y + t.height, p.z);
      const dist = cam.position.distanceTo(this.v);
      const maxD = t.bubble ? 45 : t.kind === 'npc' ? 40 : 28;
      this.v.project(cam);
      if (this.v.z > 1 || dist > maxD || Math.abs(this.v.x) > 1.2 || Math.abs(this.v.y) > 1.2) { t.el.style.display = 'none'; continue; }
      const showName = this.showNames || t.kind === 'npc';
      t.nm.style.display = showName && t.kind !== 'me' ? '' : 'none';
      if (!showName && !t.bubble && t.kind !== 'npc') { t.el.style.display = 'none'; continue; }
      t.el.style.display = '';
      const x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h;
      const s = THREE.MathUtils.clamp(9 / dist, 0.6, 1.15);
      t.el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
      t.el.style.zIndex = String(1000 - Math.round(dist * 10));
    }
  }
}
