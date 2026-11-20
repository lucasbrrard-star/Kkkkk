import * as THREE from 'three';
import type { CarModel } from '../vehicle/CarModel';
import type { CollisionWorld } from '../vehicle/Collision';
import type { Collider } from '../world/CityLayout';

interface TrafficCar { root: THREE.Object3D; spins: THREE.Object3D[]; x: number; z: number; dir: 1 | -1; speed: number; cruise: number; collider: Collider }

/**
 * Boulevard traffic: clones of the player's car model (shared geometry, own paint and tail-light
 * materials, no extra lights) cruising in their lanes, slowing behind the player and acting as
 * dynamic colliders.
 */
export class Traffic {
  readonly cars: TrafficCar[] = [];

  constructor(model: CarModel, scene: THREE.Scene, private readonly collision: CollisionWorld) {
    const colors = [0xb8bcc4, 0x7a0d14, 0x1b2f6b, 0x2b2d30, 0xdedfe3, 0x0f4a3a];
    const lanes: [number, 1 | -1, number][] = [[-3.4, 1, 40], [-6.8, 1, -150], [-3.4, 1, 120], [3.4, -1, 60], [6.8, -1, -40], [3.4, -1, -120]];
    lanes.forEach(([x, dir, z], i) => {
      const root = model.root.clone(true);
      const kill: THREE.Object3D[] = [];
      root.traverse((o) => {
        if ((o as THREE.Light).isLight || (o as THREE.Sprite).isSprite) kill.push(o);
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (m.material === model.paint) {
          const p = model.paint.clone();
          p.color.setHex(colors[i % colors.length]);
          m.material = p;
        } else if (m.material === model.tailMaterial) {
          m.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 0.18, 0.1) });
        }
      });
      for (const k of kill) k.removeFromParent();
      const spins: THREE.Object3D[] = [];
      model.root.children.forEach((c, k) => { if (model.wheels.some((w) => w.pivot === c)) spins.push(root.children[k].children[0].children[0]); });
      root.name = 'traffic-car';
      scene.add(root);
      const collider: Collider = { kind: 'box', x, z, hx: 1.0, hz: 2.25, rot: dir > 0 ? 0 : Math.PI, tag: 'car' };
      const cruise = 11 + (i % 3) * 2.5;
      this.cars.push({ root, spins, x, z, dir, speed: cruise, cruise, collider });
    });
  }

  update(dt: number, player: { x: number; z: number }) {
    this.collision.dynamic.length = 0;
    for (const c of this.cars) {
      // keep a safe gap behind the player and behind other traffic in the same lane
      let target = c.cruise;
      const gap = (ox: number, oz: number, len: number) => {
        const ahead = (oz - c.z) * c.dir;
        if (Math.abs(ox - c.x) < 2.0 && ahead > 0 && ahead < len) target = Math.min(target, Math.max(0, (ahead - 7) * 1.2));
      };
      gap(player.x, player.z, 26);
      for (const o of this.cars) if (o !== c) gap(o.x, o.z, 22);
      c.speed += (target - c.speed) * (1 - Math.exp(-(target < c.speed ? 3 : 0.8) * dt));
      c.z += c.speed * c.dir * dt;
      if (c.z > 182) c.z = -182; else if (c.z < -182) c.z = 182;
      c.root.position.set(c.x, 0, c.z);
      c.root.rotation.y = c.dir > 0 ? 0 : Math.PI;
      for (const s of c.spins) s.rotation.x += (c.speed / 0.34) * dt;
      c.collider.x = c.x; c.collider.z = c.z;
      this.collision.dynamic.push(c.collider);
    }
  }
}
