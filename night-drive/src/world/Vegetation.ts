import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../core/math';

/** Paints a single palm leaf (rachis + leaflets) with alpha into a canvas texture. */
function palmLeafTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 512;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 128, 512);
  const r = rng(7);
  // leaflets
  for (let y = 20; y < 500; y += 7) {
    const t = y / 512;
    const len = 58 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 6;
    for (const side of [-1, 1]) {
      g.strokeStyle = `hsl(${95 + r.range(-10, 15)}, ${35 + r.range(0, 20)}%, ${16 + r.range(0, 12)}%)`;
      g.lineWidth = r.range(3, 5);
      g.beginPath();
      g.moveTo(64, y);
      g.quadraticCurveTo(64 + side * len * 0.6, y + 6, 64 + side * len, y + 22 + r.range(0, 8));
      g.stroke();
    }
  }
  g.strokeStyle = '#4b5a2a';
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 512); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Palm: curved ringed trunk (vertex colours) + 13 bent fronds. Height 10 m before instance scale. */
function palmGeometries() {
  const H = 10;
  const trunk = new THREE.CylinderGeometry(0.17, 0.3, H, 10, 24, true);
  trunk.translate(0, H / 2, 0);
  const pos = trunk.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = y / H;
    pos.setX(i, pos.getX(i) + 0.9 * t * t); // gentle lean
    const ring = 0.75 + 0.25 * Math.sin(y * 18.0);
    const c = (0.16 + 0.06 * ring) * (0.7 + 0.3 * t);
    col.set([c * 1.05, c * 0.92, c * 0.78], i * 3);
  }
  trunk.setAttribute('color', new THREE.BufferAttribute(col, 3));
  trunk.computeVertexNormals();

  const fronds: THREE.BufferGeometry[] = [];
  const r = rng(11);
  const topX = 0.9, topY = H;
  const N = 13;
  for (let k = 0; k < N; k++) {
    const L = r.range(3.2, 4.4), Wd = r.range(1.0, 1.3);
    const g = new THREE.PlaneGeometry(Wd, L, 2, 10);
    g.translate(0, L / 2, 0); // base at origin, extends +Y
    const p = g.attributes.position as THREE.BufferAttribute;
    const droop = r.range(0.35, 0.9);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), x = p.getX(i);
      const t = y / L;
      // lay the leaf outwards (+Z) and bend it down; fold the leaflets in a shallow V
      p.setXYZ(i, x, -droop * L * t * t + Math.abs(x) * 0.25 + 0.4 * t, y);
    }
    const elev = k < 4 ? r.range(0.4, 0.8) : r.range(-0.15, 0.35);
    g.rotateX(-elev);
    g.rotateY((k / N) * Math.PI * 2 + r.range(-0.2, 0.2));
    g.translate(topX, topY, 0);
    fronds.push(g);
  }
  const frondGeo = mergeGeometries(fronds)!;
  frondGeo.computeVertexNormals();
  // coconuts / frond base
  const crown = new THREE.SphereGeometry(0.42, 10, 8);
  crown.scale(1, 0.8, 1);
  crown.translate(topX, topY - 0.15, 0);
  const cc = new Float32Array(crown.attributes.position.count * 3).fill(0.09);
  crown.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const trunkGeo = mergeGeometries([trunk, crown])!;
  return { trunkGeo, frondGeo };
}

function treeGeometries() {
  const trunk = new THREE.CylinderGeometry(0.12, 0.2, 3.2, 7, 1);
  trunk.translate(0, 1.6, 0);
  const parts: THREE.BufferGeometry[] = [];
  const r = rng(5);
  for (let k = 0; k < 6; k++) {
    const s = new THREE.IcosahedronGeometry(r.range(1.2, 1.9), 1);
    const p = s.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      v.multiplyScalar(0.85 + 0.3 * Math.sin(v.x * 3.1 + v.y * 2.3 + k));
      p.setXYZ(i, v.x, v.y, v.z);
    }
    s.translate(r.range(-1.2, 1.2), r.range(3.6, 5.2), r.range(-1.2, 1.2));
    parts.push(s);
  }
  const crown = mergeGeometries(parts)!;
  crown.computeVertexNormals();
  return { trunk, crown };
}

export interface PlantInstance { x: number; y: number; z: number; rot: number; scale: number }

export class Vegetation {
  readonly group = new THREE.Group();

  constructor(palms: PlantInstance[], trees: PlantInstance[]) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const place = (mesh: THREE.InstancedMesh, list: PlantInstance[]) => {
      list.forEach((it, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
        s.setScalar(it.scale);
        p.set(it.x, it.y, it.z);
        mesh.setMatrixAt(i, m.compose(p, q, s));
      });
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    };
    if (palms.length) {
      const { trunkGeo, frondGeo } = palmGeometries();
      const trunkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
      const leafMat = new THREE.MeshStandardMaterial({ map: palmLeafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6, color: 0x9fb07a });
      place(new THREE.InstancedMesh(trunkGeo, trunkMat, palms.length), palms);
      place(new THREE.InstancedMesh(frondGeo, leafMat, palms.length), palms);
    }
    if (trees.length) {
      const { trunk, crown } = treeGeometries();
      place(new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x2a1f17, roughness: 0.9 }), trees.length), trees);
      place(new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0x1f3317, roughness: 0.75 }), trees.length), trees);
    }
  }
}
