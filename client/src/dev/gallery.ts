// Galeria de assets (ferramenta de desenvolvimento): mostra os modelos otimizados lado a lado
// com a mesma iluminação do jogo. Uso: /gallery.html?keys=bench,palm,palm_far&cols=4
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Assets } from '../core/assets';

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfd8e3);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xffe2c0, 2.5); sun.position.set(-20, 30, 25); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 200 });
scene.add(sun, new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, 0.5));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0xb8b0a0 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 1000);
const controls = new OrbitControls(camera, renderer.domElement);

const assets = new Assets();
await assets.init();
const keys = (params.get('keys') ?? Object.keys(assets.manifest.models).join(',')).split(',');
const cols = Number(params.get('cols') ?? 5);
const gap = Number(params.get('gap') ?? 0);
let x = 0, z = 0, rowDepth = 0, maxX = 0;
const lines: string[] = [];
for (let i = 0; i < keys.length; i++) {
  const k = keys[i];
  const info = assets.manifest.models[k];
  if (!info) continue;
  const g = await assets.model(k);
  const o = g.scene.clone(true);
  const w = info.bounds.max[0] - info.bounds.min[0], d = info.bounds.max[2] - info.bounds.min[2];
  const cell = Math.max(w, d, 2) + 1 + gap;
  o.position.set(x + cell / 2, 0, z);
  o.traverse((m) => { const me = m as THREE.Mesh; if (me.isMesh) { me.castShadow = me.receiveShadow = true; } });
  scene.add(o);
  lines.push(`${k}: ${info.tris} tris · ${(info.bytes / 1024) | 0} KB`);
  x += cell; rowDepth = Math.max(rowDepth, d + 2 + gap); maxX = Math.max(maxX, x);
  if ((i + 1) % cols === 0) { x = 0; z += rowDepth; rowDepth = 0; }
}
document.getElementById('info')!.textContent = lines.join('\n');
const cz = (z + rowDepth) / 2, span = Math.max(maxX, z + rowDepth);
controls.target.set(maxX / 2, 1.5, cz);
const fit = Number(params.get('zoom') ?? 1);
camera.position.set(maxX / 2, (span * 0.18 + 2) / fit, cz + (span * 0.62 + 3) / fit);
controls.update();
renderer.setAnimationLoop(() => renderer.render(scene, camera));
(window as unknown as { __ready: boolean }).__ready = true;
