import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, BOUND } from './world.js';
import { createHumanoid, solveArmIK, legCycle } from './humanoid.js';
import { Sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const rr = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
function lerpAngle(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; }

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const LOW = new URLSearchParams(location.search).get('q') === 'low';
if (isTouch) document.body.classList.add('touch');

// ---------------- renderer / scene ----------------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.25 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG = 0x0b1019;
scene.background = new THREE.Color(FOG);
scene.fog = new THREE.FogExp2(FOG, 0.03);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 260);

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: isTouch || LOW ? 0 : 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.5, 0.8);
if (!LOW) composer.addPass(bloom);
composer.addPass(new OutputPass());
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------------- lights ----------------
scene.add(new THREE.HemisphereLight(0x55688f, 0x0c0e12, 0.85));
const moon = new THREE.DirectionalLight(0x9db4e0, 0.75);
moon.castShadow = true;
moon.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
Object.assign(moon.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 130 });
moon.shadow.bias = -0.0005;
moon.shadow.normalBias = 0.04;
scene.add(moon, moon.target);
const MOON_OFF = new THREE.Vector3(-25, 48, 20);

const world = buildWorld(scene);
const spots = [];
for (let i = 0; i < 6; i++) {
  const s = new THREE.SpotLight(0xffc98a, 110, 26, 0.85, 0.6, 1.4);
  scene.add(s, s.target); spots.push(s);
}
for (const f of world.floods) {
  const s = new THREE.SpotLight(0xdfe8ff, 1400, 75, 0.42, 0.5, 1.6);
  s.position.copy(f.pos); s.target.position.copy(f.target); scene.add(s, s.target);
}
const muzzleLight = new THREE.PointLight(0xffb050, 0, 14, 2);
scene.add(muzzleLight);

// ash / ember particles drifting in the air
const ASH = 1400;
const ashGeo = new THREE.BufferGeometry();
const ashPos = new Float32Array(ASH * 3);
for (let i = 0; i < ASH; i++) { ashPos[i * 3] = rr(-30, 30); ashPos[i * 3 + 1] = rr(0, 16); ashPos[i * 3 + 2] = rr(-30, 30); }
ashGeo.setAttribute('position', new THREE.BufferAttribute(ashPos, 3));
const ash = new THREE.Points(ashGeo, new THREE.PointsMaterial({ color: 0x9a948a, size: 0.05, transparent: true, opacity: 0.7, depthWrite: false }));
ash.frustumCulled = false;
scene.add(ash);
// low ground fog banks
const fogMat = new THREE.SpriteMaterial({ map: world.textures.smoke, color: 0x6a7a96, transparent: true, opacity: 0.12, depthWrite: false });
for (let i = 0; i < 40; i++) {
  const s = new THREE.Sprite(fogMat); s.position.set(rr(-50, 50), rr(0.6, 1.6), rr(-50, 50)); s.scale.setScalar(rr(9, 16)); scene.add(s);
}

// ---------------- materials / textures for characters ----------------
function clothTex(base, blood) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  for (let i = 0; i < blood; i++) {
    const x = Math.random() * 128, y = Math.random() * 128, r = rr(6, 22);
    const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(70,0,0,0.95)'); grd.addColorStop(1, 'rgba(60,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  }
  for (let i = 0; i < blood / 2; i++) { g.fillStyle = 'rgba(10,6,6,0.9)'; g.beginPath(); const x = Math.random() * 128, y = Math.random() * 128; g.moveTo(x, y); for (let k = 0; k < 5; k++) g.lineTo(x + rr(-12, 12), y + rr(-12, 12)); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const zClothes = ['#3a3f4a', '#5a4a3a', '#2e3a2e', '#6a6560', '#4a2a2a', '#2a3550'].map((b) => clothTex(b, 6));
const zSkinTex = clothTex('#c8c8c8', 3);
const Z_SKINS = [0x7f8a6e, 0x8c8a78, 0x6f7a66, 0x9a8f80, 0x77806a];
const zEyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.4, 0.1) });
const zShoe = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.9 });
const zHair = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 1 });
const zPants = [0x1f2633, 0x2e2a22, 0x22251e, 0x3a3530].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, map: clothTex('#b0b0b0', 3) }));

// ---------------- player ----------------
const pm = {
  skin: new THREE.MeshStandardMaterial({ color: 0xc19276, roughness: 0.6 }),
  shirt: new THREE.MeshStandardMaterial({ color: 0x343a2a, roughness: 0.75, map: clothTex('#d0d0d0', 0) }),
  pants: new THREE.MeshStandardMaterial({ color: 0x232a3a, roughness: 0.9 }),
  shoes: new THREE.MeshStandardMaterial({ color: 0x2a1e14, roughness: 0.8 }),
  hair: new THREE.MeshStandardMaterial({ color: 0x17110c, roughness: 0.95 }),
  eye: new THREE.MeshStandardMaterial({ color: 0x111111 }),
  pack: new THREE.MeshStandardMaterial({ color: 0x2f3a46, roughness: 0.85 }),
};
pm.sleeve = pm.shirt; pm.forearm = pm.shirt;
const ph = createHumanoid(pm);
scene.add(ph.root);

function makeRifle() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.4, metalness: 0.8 });
  const poly = new THREE.MeshStandardMaterial({ color: 0x2b2924, roughness: 0.7, metalness: 0.2 });
  const part = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; g.add(m); return m; };
  part(new THREE.BoxGeometry(0.06, 0.09, 0.36), metal, 0, 0, 0.05);
  part(new THREE.BoxGeometry(0.068, 0.075, 0.28), poly, 0, 0, 0.36);
  const bar = new THREE.CylinderGeometry(0.014, 0.014, 0.26, 8); bar.rotateX(Math.PI / 2);
  part(bar, metal, 0, 0.005, 0.6);
  const fh = new THREE.CylinderGeometry(0.022, 0.02, 0.06, 8); fh.rotateX(Math.PI / 2);
  part(fh, metal, 0, 0.005, 0.75);
  part(new THREE.BoxGeometry(0.05, 0.1, 0.24), poly, 0, -0.02, -0.24);
  part(new THREE.BoxGeometry(0.04, 0.11, 0.05), poly, 0, -0.085, -0.03, 0.3);
  const mag = part(new THREE.BoxGeometry(0.045, 0.17, 0.07), metal, 0, -0.12, 0.13, -0.18);
  part(new THREE.BoxGeometry(0.03, 0.025, 0.3), metal, 0, 0.055, 0.1);
  const sc = new THREE.CylinderGeometry(0.024, 0.024, 0.13, 10); sc.rotateX(Math.PI / 2);
  part(sc, metal, 0, 0.09, 0.07);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.005, 0.79); g.add(muzzle);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: world.textures.glow, color: new THREE.Color(6, 3.6, 1.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flash.scale.setScalar(0.5); flash.visible = false; muzzle.add(flash);
  return { g, muzzle, mag, flash };
}
const rifle = makeRifle();
ph.spine.add(rifle.g);
const GRIP_R = new THREE.Vector3(0, -0.07, -0.02), GRIP_L = new THREE.Vector3(0, -0.035, 0.34);
const POUCH = new THREE.Vector3(0.12, 0.05, 0.14);
const POSE = {
  aim: { p: new THREE.Vector3(-0.08, 0.44, 0.2), r: new THREE.Euler(0, 0, 0) },
  low: { p: new THREE.Vector3(-0.1, 0.3, 0.22), r: new THREE.Euler(0.5, 0.45, 0) },
  run: { p: new THREE.Vector3(-0.04, 0.34, 0.2), r: new THREE.Euler(0.3, 0.95, 0.3) },
};
const POLE_R = new THREE.Vector3(-1, -0.7, -0.5), POLE_L = new THREE.Vector3(1, -1, -0.3);
const _tR = new THREE.Vector3(), _tL = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

const player = {
  pos: ph.root.position, vel: new THREE.Vector3(), facing: Math.PI, onGround: true,
  hp: 100, maxHp: 100, mag: 30, magSize: 30, reserve: 120, reloading: 0, reloadTime: 1.9,
  fireCd: 0, lastShot: -10, aimT: 0, anim: 0, running: false, dead: false, deadT: 0, lastHurt: -10,
};
const cam = { yaw: Math.PI, pitch: -0.08, pivot: new THREE.Vector3(), boom: 3, shake: 0, fov: 70 };

// ---------------- input ----------------
const keys = {};
const input = { fire: false, aim: false, jump: false, lookX: 0, lookY: 0, touchMove: new THREE.Vector2(), touchRun: false, touchAim: false };
let state = 'menu';
let pointerLocked = false, lastLockLoss = 0, mouseDownLook = false, pausedAt = 0, freeLook = false;

addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') { input.jump = true; e.preventDefault(); }
  if (e.code === 'KeyR') reload();
  if (e.code === 'Escape' || e.code === 'KeyP') {
    const now = performance.now();
    if (state === 'playing') setPaused(true);
    else if (state === 'paused' && now - lastLockLoss > 400 && now - pausedAt > 400) setPaused(false);
  }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; input.fire = false; });
renderer.domElement.addEventListener('mousedown', (e) => {
  if (state !== 'playing' || isTouch) return;
  if (!document.pointerLockElement) { lockPointer(); mouseDownLook = true; }
  if (e.button === 0) input.fire = true;
  if (e.button === 2) input.aim = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) input.fire = false; if (e.button === 2) input.aim = false; mouseDownLook = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (state !== 'playing' || isTouch) return;
  if (document.pointerLockElement || mouseDownLook || freeLook) { input.lookX += e.movementX * 0.0022; input.lookY += e.movementY * 0.0022; }
});
function lockPointer() {
  if (isTouch) return;
  try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => { freeLook = true; }); } catch (_) { freeLook = true; /* fallback: mouse look without lock */ }
}
document.addEventListener('pointerlockerror', () => { freeLook = true; });
document.addEventListener('pointerlockchange', () => {
  const was = pointerLocked; pointerLocked = !!document.pointerLockElement;
  if (was && !pointerLocked && state === 'playing') { lastLockLoss = performance.now(); setPaused(true); }
});

// touch controls (multi-touch via pointer ids)
const stick = $('stick'), knob = $('knob');
let movePid = null; const moveOrigin = new THREE.Vector2();
const lookPids = new Map();
function setupTouch() {
  $('touch').classList.remove('hidden');
  const mz = $('moveZone'), lz = $('lookZone');
  mz.addEventListener('pointerdown', (e) => {
    if (movePid !== null) return; movePid = e.pointerId; mz.setPointerCapture(e.pointerId);
    moveOrigin.set(e.clientX, e.clientY); stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; knob.style.transform = '';
  });
  mz.addEventListener('pointermove', (e) => {
    if (e.pointerId !== movePid) return;
    const dx = e.clientX - moveOrigin.x, dy = e.clientY - moveOrigin.y; const l = Math.hypot(dx, dy), m = Math.min(l, 55);
    const nx = l > 0 ? dx / l * m : 0, ny = l > 0 ? dy / l * m : 0;
    knob.style.transform = `translate(${nx}px,${ny}px)`; input.touchMove.set(nx / 55, -ny / 55);
  });
  const endMove = (e) => { if (e.pointerId !== movePid) return; movePid = null; input.touchMove.set(0, 0); knob.style.transform = ''; };
  mz.addEventListener('pointerup', endMove); mz.addEventListener('pointercancel', endMove);
  const lookStart = (el) => (e) => { el.setPointerCapture(e.pointerId); lookPids.set(e.pointerId, { x: e.clientX, y: e.clientY }); };
  const lookMove = (e) => { const p = lookPids.get(e.pointerId); if (!p) return; input.lookX += (e.clientX - p.x) * 0.0055; input.lookY += (e.clientY - p.y) * 0.0055; p.x = e.clientX; p.y = e.clientY; };
  const lookEnd = (e) => { lookPids.delete(e.pointerId); };
  for (const el of [lz, $('bFire')]) { el.addEventListener('pointerdown', lookStart(el)); el.addEventListener('pointermove', lookMove); el.addEventListener('pointerup', lookEnd); el.addEventListener('pointercancel', lookEnd); }
  const fire = $('bFire');
  fire.addEventListener('pointerdown', () => { input.fire = true; fire.classList.add('on'); });
  const fireUp = () => { input.fire = false; fire.classList.remove('on'); };
  fire.addEventListener('pointerup', fireUp); fire.addEventListener('pointercancel', fireUp);
  const tap = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.stopPropagation(); fn($(id)); });
  tap('bAim', (el) => { input.touchAim = !input.touchAim; el.classList.toggle('on', input.touchAim); });
  tap('bRun', (el) => { input.touchRun = !input.touchRun; el.classList.toggle('on', input.touchRun); });
  tap('bReload', () => reload());
  tap('bJump', () => { input.jump = true; });
  tap('bPause', () => setPaused(true));
}

// ---------------- collision helpers ----------------
function collideCircle(p, r, feetY, stepH) {
  for (const c of world.colliders) {
    if (c.top <= feetY + stepH) continue;
    if (p.x < c.minX - r || p.x > c.maxX + r || p.z < c.minZ - r || p.z > c.maxZ + r) continue;
    const cx = clamp(p.x, c.minX, c.maxX), cz = clamp(p.z, c.minZ, c.maxZ);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x += dx / d * (r - d); p.z += dz / d * (r - d); }
    else {
      const l = p.x - c.minX, rt = c.maxX - p.x, b = p.z - c.minZ, t = c.maxZ - p.z, m = Math.min(l, rt, b, t);
      if (m === l) p.x = c.minX - r; else if (m === rt) p.x = c.maxX + r; else if (m === b) p.z = c.minZ - r; else p.z = c.maxZ + r;
    }
  }
  p.x = clamp(p.x, -BOUND, BOUND); p.z = clamp(p.z, -BOUND, BOUND);
}
function groundHeight(x, z, feetY) {
  let g = world.baseGround(x, z);
  for (const c of world.colliders) {
    if (c.top > feetY + 0.4 || c.top > 3) continue;
    if (x > c.minX - 0.15 && x < c.maxX + 0.15 && z > c.minZ - 0.15 && z < c.maxZ + 0.15) g = Math.max(g, c.top);
  }
  return g;
}
// segment vs AABB (for camera boom)
function segmentHit(a, b) {
  let best = 1; const d = new THREE.Vector3().subVectors(b, a);
  for (const c of world.colliders) {
    let t0 = 0, t1 = 1;
    const ax = [[a.x, d.x, c.minX - 0.15, c.maxX + 0.15], [a.y, d.y, -1, c.top + 0.15], [a.z, d.z, c.minZ - 0.15, c.maxZ + 0.15]];
    let ok = true;
    for (const [o, dd, mn, mx] of ax) {
      if (Math.abs(dd) < 1e-6) { if (o < mn || o > mx) { ok = false; break; } continue; }
      let ta = (mn - o) / dd, tb = (mx - o) / dd; if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break; }
    }
    if (ok && t0 < best) best = t0;
  }
  return best;
}

// ---------------- navigation grid (flow field) ----------------
const NAV_MIN = -58, NAV_N = 116;
const blocked = new Uint8Array(NAV_N * NAV_N), flow = new Int16Array(NAV_N * NAV_N), queue = new Int32Array(NAV_N * NAV_N);
const cellIdx = (x, z) => clamp(Math.floor(z - NAV_MIN), 0, NAV_N - 1) * NAV_N + clamp(Math.floor(x - NAV_MIN), 0, NAV_N - 1);
for (let iz = 0; iz < NAV_N; iz++) for (let ix = 0; ix < NAV_N; ix++) {
  const x = NAV_MIN + ix + 0.5, z = NAV_MIN + iz + 0.5;
  for (const c of world.colliders) if (c.top > 0.4 && x > c.minX - 0.45 && x < c.maxX + 0.45 && z > c.minZ - 0.45 && z < c.maxZ + 0.45) { blocked[iz * NAV_N + ix] = 1; break; }
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function computeFlow(px, pz) {
  flow.fill(-1);
  let start = cellIdx(px, pz);
  if (blocked[start]) { // seed from nearest free cell
    const sx = start % NAV_N, sz = (start / NAV_N) | 0; let found = -1;
    for (let r = 1; r < 6 && found < 0; r++) for (let dz = -r; dz <= r && found < 0; dz++) for (let dx = -r; dx <= r; dx++) {
      const nx = sx + dx, nz = sz + dz; if (nx < 0 || nz < 0 || nx >= NAV_N || nz >= NAV_N) continue;
      if (!blocked[nz * NAV_N + nx]) { found = nz * NAV_N + nx; break; }
    }
    if (found >= 0) start = found;
  }
  let head = 0, tail = 0; flow[start] = 0; queue[tail++] = start;
  while (head < tail) {
    const c = queue[head++], cx = c % NAV_N, cz = (c / NAV_N) | 0, d = flow[c] + 1;
    for (const [dx, dz] of DIRS) {
      const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= NAV_N || nz >= NAV_N) continue;
      const ni = nz * NAV_N + nx; if (blocked[ni] || flow[ni] >= 0) continue;
      if (dx && dz && (blocked[cz * NAV_N + nx] || blocked[nz * NAV_N + cx])) continue;
      flow[ni] = d; queue[tail++] = ni;
    }
  }
}
function bestNeighbor(c) {
  const cx = c % NAV_N, cz = (c / NAV_N) | 0; let best = -1, bv = flow[c] >= 0 && !blocked[c] ? flow[c] : 1e9;
  for (const [dx, dz] of DIRS) {
    const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= NAV_N || nz >= NAV_N) continue;
    const ni = nz * NAV_N + nx; if (blocked[ni] || flow[ni] < 0) continue;
    if (dx && dz && (blocked[cz * NAV_N + nx] || blocked[nz * NAV_N + cx])) continue;
    if (flow[ni] < bv) { bv = flow[ni]; best = ni; }
  }
  return best;
}
function hasLOS(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.5);
  for (let i = 1; i < n; i++) { const t = i / n; if (blocked[cellIdx(ax + (bx - ax) * t, az + (bz - az) * t)]) return false; }
  return true;
}
function randomFreePoint(cx, cz, r) {
  for (let i = 0; i < 20; i++) {
    const x = clamp(cx + rr(-r, r), -BOUND + 2, BOUND - 2), z = clamp(cz + rr(-r, r), -BOUND + 2, BOUND - 2);
    if (!blocked[cellIdx(x, z)]) return new THREE.Vector3(x, 0, z);
  }
  return new THREE.Vector3(cx, 0, cz);
}

// ---------------- effects ----------------
const PMAX = 600;
const partMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), PMAX);
partMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
partMesh.frustumCulled = false;
const parts = [];
const _m4 = new THREE.Matrix4(), _c = new THREE.Color(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
for (let i = 0; i < PMAX; i++) { parts.push({ life: 0 }); partMesh.setMatrixAt(i, _m4.makeScale(0, 0, 0)); partMesh.setColorAt(i, _c.setRGB(1, 1, 1)); }
scene.add(partMesh);
let partCursor = 0;
function emit(pos, n, kind, dir) {
  for (let i = 0; i < n; i++) {
    const p = parts[partCursor]; partCursor = (partCursor + 1) % PMAX;
    p.x = pos.x; p.y = pos.y; p.z = pos.z; p.kind = kind;
    const sp = kind === 'spark' ? 7 : kind === 'blood' ? 3.5 : kind === 'casing' ? 2 : 1.6;
    p.vx = rr(-1, 1) * sp; p.vy = rr(0, 1) * sp; p.vz = rr(-1, 1) * sp;
    if (dir) { p.vx += dir.x * sp * 0.8; p.vy += dir.y * sp * 0.8; p.vz += dir.z * sp * 0.8; }
    p.max = p.life = kind === 'spark' ? rr(0.12, 0.3) : kind === 'casing' ? 1.2 : kind === 'dust' ? rr(0.4, 0.8) : rr(0.4, 0.9);
    p.size = kind === 'spark' ? 0.025 : kind === 'blood' ? rr(0.03, 0.08) : kind === 'casing' ? 0.035 : rr(0.04, 0.1);
    p.grav = kind === 'dust' ? -1 : 14;
    if (kind === 'spark') _c.setRGB(6, 3.5, 1.2); else if (kind === 'blood') _c.setRGB(rr(0.25, 0.45), 0.01, 0.01); else if (kind === 'casing') _c.setRGB(1.6, 1.1, 0.35); else _c.setRGB(0.35, 0.33, 0.3);
    partMesh.setColorAt(partCursor === 0 ? PMAX - 1 : partCursor - 1, _c);
  }
  partMesh.instanceColor.needsUpdate = true;
}
function updateParticles(dt) {
  for (let i = 0; i < PMAX; i++) {
    const p = parts[i]; if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { partMesh.setMatrixAt(i, _m4.makeScale(0, 0, 0)); continue; }
    p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; }
    const s = p.size * (p.kind === 'dust' ? 1 + (1 - p.life / p.max) * 4 : 1);
    _q.setFromAxisAngle(_v.set(0.3, 1, 0.2).normalize(), p.life * 10);
    partMesh.setMatrixAt(i, _m4.compose(_v2.set(p.x, p.y, p.z), _q, _s.set(s, s, p.kind === 'spark' ? s * 6 : s)));
  }
  partMesh.instanceMatrix.needsUpdate = true;
}
// tracers
const tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1); tracerGeo.translate(0, 0, 0.5);
const tracers = [];
for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 1.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.visible = false; m.userData.t = 0; scene.add(m); tracers.push(m); }
let tracerIdx = 0;
function tracer(a, b) { const m = tracers[tracerIdx++ % tracers.length]; m.position.copy(a); m.lookAt(b); m.scale.z = a.distanceTo(b); m.visible = true; m.userData.t = 0.06; m.material.opacity = 1; }
// decals
const holeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const grd = g.createRadialGradient(16, 16, 1, 16, 16, 15); grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.35, 'rgba(10,10,10,0.8)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(0, 0, 32, 32); const t = new THREE.CanvasTexture(c); return t; })();
const holeMat = new THREE.MeshBasicMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
const bloodDecalMat = new THREE.MeshStandardMaterial({ map: world.textures.blood, transparent: true, depthWrite: false, roughness: 0.25, polygonOffset: true, polygonOffsetFactor: -3 });
const decals = []; let decalIdx = 0;
const decalGeo = new THREE.PlaneGeometry(1, 1);
for (let i = 0; i < 60; i++) { const m = new THREE.Mesh(decalGeo, holeMat); m.visible = false; scene.add(m); decals.push(m); }
function decal(pos, normal, mat, size) {
  const m = decals[decalIdx++ % decals.length]; m.material = mat; m.visible = true;
  m.position.copy(pos).addScaledVector(normal, 0.01); m.lookAt(_v.copy(pos).add(normal)); m.rotateZ(Math.random() * 6); m.scale.setScalar(size);
}

// ---------------- pickups ----------------
const pickups = [];
const ammoMat = new THREE.MeshStandardMaterial({ color: 0x3f4a2a, roughness: 0.6, metalness: 0.3, emissive: 0x223311 });
const medTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#eee'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#c11'; g.fillRect(24, 10, 16, 44); g.fillRect(10, 24, 44, 16); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const medMat = new THREE.MeshStandardMaterial({ map: medTex, roughness: 0.5, emissive: 0x331111 });
const pickGlow = new THREE.SpriteMaterial({ map: world.textures.glow, color: new THREE.Color(1.2, 1.0, 0.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 });
function spawnPickup(pos, kind) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(kind === 'ammo' ? 0.5 : 0.45, 0.28, 0.32), kind === 'ammo' ? ammoMat : medMat); m.castShadow = true; g.add(m);
  if (kind === 'ammo') { const st = new THREE.Mesh(new THREE.BoxGeometry(0.51, 0.06, 0.33), new THREE.MeshBasicMaterial({ color: 0xd8b020 })); g.add(st); }
  const gl = new THREE.Sprite(pickGlow); gl.scale.setScalar(1.3); g.add(gl);
  g.position.set(pos.x, world.baseGround(pos.x, pos.z) + 0.4, pos.z);
  scene.add(g); pickups.push({ g, kind, t: Math.random() * 6 });
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]; p.t += dt; p.g.rotation.y += dt * 1.5; p.g.children[0].position.y = Math.sin(p.t * 3) * 0.06;
    if (!player.dead && Math.hypot(p.g.position.x - player.pos.x, p.g.position.z - player.pos.z) < 1.3) {
      if (p.kind === 'ammo') { player.reserve += 45; showMsg('+45 MUNIÇÃO'); }
      else { if (player.hp >= player.maxHp) continue; player.hp = Math.min(player.maxHp, player.hp + 40); showMsg('+40 VIDA'); }
      sfx.pickup(); scene.remove(p.g); pickups.splice(i, 1);
    }
  }
}

// ---------------- zombies ----------------
const zombies = [];
const ZT = {
  walker: { hp: 100, speed: [1.6, 2.3], dmg: 12, scale: [0.95, 1.08] },
  runner: { hp: 70, speed: [3.7, 4.3], dmg: 9, scale: [0.92, 1.0] },
  brute: { hp: 320, speed: [1.3, 1.6], dmg: 26, scale: [1.28, 1.36] },
};
function spawnZombie(pos, type = 'walker', alerted = false) {
  const T = ZT[type];
  const skin = new THREE.MeshStandardMaterial({ color: pick(Z_SKINS), roughness: 0.75, map: zSkinTex });
  const shirt = new THREE.MeshStandardMaterial({ map: pick(zClothes), roughness: 0.9, color: type === 'brute' ? 0x8a7a6a : 0xffffff });
  const pants = pick(zPants).clone();
  const mats = { skin, shirt, sleeve: Math.random() < 0.6 ? shirt : skin, forearm: Math.random() < 0.65 ? skin : shirt, pants, shoes: zShoe, hair: Math.random() < 0.55 ? zHair : null, eye: zEyeMat };
  const h = createHumanoid(mats);
  h.root.scale.setScalar(rr(...T.scale));
  h.root.position.set(pos.x, world.baseGround(pos.x, pos.z), pos.z);
  scene.add(h.root);
  const z = {
    type, h, mats: [skin, shirt, pants], hp: T.hp, maxHp: T.hp, speed: rr(...T.speed), dmg: T.dmg,
    pos: h.root.position, vel: new THREE.Vector3(), yaw: Math.random() * 6.28, state: alerted ? 'chase' : 'patrol',
    wp: null, waitT: rr(0, 2), attackT: 0, struck: false, flash: 0, stagger: 0, anim: Math.random() * 6, deadT: 0,
    groanT: rr(1, 6), tilt: rr(-1, 1), stuckT: 0, stuckRef: new THREE.Vector3().copy(pos), side: 0, sideT: 0,
  };
  h.root.userData.zombie = z;
  zombies.push(z);
  return z;
}
function alertZombie(z) { if (z.state === 'patrol') { z.state = 'chase'; z.groanT = 0.1; } }
const _dir = new THREE.Vector2();
function zombieNav(z, dx, dz, dist) {
  if (dist < 2.5 || hasLOS(z.pos.x, z.pos.z, player.pos.x, player.pos.z)) return _dir.set(dx, dz);
  let c = cellIdx(z.pos.x, z.pos.z);
  const n1 = bestNeighbor(c); if (n1 < 0) return _dir.set(dx, dz);
  const n2 = bestNeighbor(n1); c = n2 >= 0 ? n2 : n1;
  const tx = NAV_MIN + (c % NAV_N) + 0.5, tz = NAV_MIN + ((c / NAV_N) | 0) + 0.5;
  return _dir.set(tx - z.pos.x, tz - z.pos.z);
}
function moveZombie(z, dx, dz, speed, dt) {
  for (const o of zombies) {
    if (o === z || o.state === 'dead') continue;
    const ox = z.pos.x - o.pos.x, oz = z.pos.z - o.pos.z, d2 = ox * ox + oz * oz;
    if (d2 < 0.81 && d2 > 1e-6) { const d = Math.sqrt(d2), k = (0.9 - d) * 3; dx += ox / d * k; dz += oz / d * k; }
  }
  if (z.side) { dx += -dz * 0.8 * z.side; dz += dx * 0.8 * z.side; }
  const l = Math.hypot(dx, dz);
  const tvx = l > 1e-4 ? dx / l * speed : 0, tvz = l > 1e-4 ? dz / l * speed : 0;
  const a = damp(8, dt); z.vel.x += (tvx - z.vel.x) * a; z.vel.z += (tvz - z.vel.z) * a;
  z.pos.x += z.vel.x * dt; z.pos.z += z.vel.z * dt;
  collideCircle(z.pos, 0.36 * z.h.root.scale.x, 0, 0.05);
  // don't overlap player
  const px = z.pos.x - player.pos.x, pz = z.pos.z - player.pos.z, pd = Math.hypot(px, pz);
  if (pd < 0.75 && pd > 1e-4) { z.pos.x = player.pos.x + px / pd * 0.75; z.pos.z = player.pos.z + pz / pd * 0.75; }
  z.pos.y += (world.baseGround(z.pos.x, z.pos.z) - z.pos.y) * damp(12, dt);
  if (Math.hypot(z.vel.x, z.vel.z) > 0.2) z.yaw = lerpAngle(z.yaw, Math.atan2(z.vel.x, z.vel.z), damp(7, dt));
}
function damageZombie(z, dmg, dir, head) {
  if (z.state === 'dead') return false;
  z.hp -= dmg; z.flash = 0.1; z.stagger = head ? 0.35 : 0.2;
  z.vel.x += dir.x * 1.8; z.vel.z += dir.z * 1.8;
  alertZombie(z);
  if (z.hp <= 0) {
    z.state = 'dead'; z.deadT = 0; z.fallSide = rr(-0.3, 0.3); kills++;
    for (const m of z.mats) m.emissive.setRGB(0, 0, 0);
    _v.set(z.pos.x, 0.03, z.pos.z); decal(_v, _v2.set(0, 1, 0), bloodDecalMat, rr(1.4, 2.2));
    const r = Math.random();
    if (r < 0.32) spawnPickup(z.pos, 'ammo'); else if (r < 0.46) spawnPickup(z.pos, 'med');
    if (Math.random() < 0.5) sfx.groan(0.25, 0.7);
    return true;
  }
  return false;
}
function poseZombie(z, dt, moving, spd) {
  const h = z.h, run = z.type === 'runner';
  if (moving) { z.anim += dt * (1.6 + spd * 2.2); legCycle(h, z.anim, run ? 0.7 : 0.5, run ? 1.0 : 0.7); }
  else { z.anim += dt; legCycle(h, 0, 0, 0); h.lKnee.rotation.x = 0.12; h.rKnee.rotation.x = 0.08; }
  const sway = Math.sin(z.anim * 0.5);
  h.hips.position.y = 0.92 - (moving ? Math.abs(Math.sin(z.anim)) * 0.05 : 0);
  h.spine.rotation.set((run ? 0.5 : 0.3) + Math.sin(z.anim * 2) * 0.04, sway * 0.12, Math.sin(z.anim) * 0.08 + z.tilt * 0.06);
  h.head.rotation.set(-0.3, sway * 0.2, z.tilt * 0.35);
  let la = -1.35 + Math.sin(z.anim) * 0.15, ra = -1.25 + Math.sin(z.anim + 1.3) * 0.15;
  if (z.state === 'patrol' && !moving) { la = -0.25 + sway * 0.1; ra = -0.3 - sway * 0.1; }
  if (z.state === 'attack') {
    const t = z.attackT;
    const k = t < 0.5 ? -2.4 * (t / 0.5) : t < 0.7 ? -2.4 + 2.0 * ((t - 0.5) / 0.2) : -0.4 - 0.9 * Math.min(1, (t - 0.7) / 0.4);
    la = k; ra = k + 0.15; h.spine.rotation.x = 0.35 + (t > 0.5 && t < 0.8 ? 0.3 : 0);
  }
  if (z.stagger > 0) h.spine.rotation.x -= z.stagger * 1.2;
  h.lShoulder.rotation.set(la, 0, 0.15); h.rShoulder.rotation.set(ra, 0, -0.15);
  h.lElbow.rotation.set(-0.3, 0, 0); h.rElbow.rotation.set(-0.2, 0, 0);
  h.root.rotation.y = z.yaw;
}
let flowT = 0;
function updateZombies(dt) {
  flowT -= dt;
  if (flowT <= 0) { computeFlow(player.pos.x, player.pos.z); flowT = 0.3; }
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    if (z.state === 'dead') {
      z.deadT += dt;
      const k = Math.min(1, z.deadT / 0.65), e = k * k;
      z.h.body.rotation.set(-e * Math.PI / 2 * 0.96, 0, z.fallSide * e);
      z.h.body.position.y = e * 0.14;
      z.h.lShoulder.rotation.x += (-2.6 - z.h.lShoulder.rotation.x) * damp(5, dt);
      z.h.rShoulder.rotation.x += (-2.2 - z.h.rShoulder.rotation.x) * damp(5, dt);
      if (z.deadT > 9) z.pos.y -= dt * 0.3;
      if (z.deadT > 12) { scene.remove(z.h.root); zombies.splice(i, 1); }
      continue;
    }
    const dx = player.pos.x - z.pos.x, dz = player.pos.z - z.pos.z, dist = Math.hypot(dx, dz), dy = player.pos.y - z.pos.y;
    if (z.flash > 0) { z.flash -= dt; const f = z.flash > 0 ? 0.6 : 0; for (const m of z.mats) m.emissive.setRGB(f, 0, 0); }
    if (z.stagger > 0) z.stagger -= dt;
    const spdMul = z.stagger > 0 ? 0.25 : 1;
    let moving = false;
    if (player.dead && z.state !== 'patrol') { z.state = 'patrol'; z.wp = null; }
    if (z.state === 'patrol') {
      if (!player.dead && (dist < 17 || (dist < 28 && player.running))) alertZombie(z);
      if (z.state === 'patrol') {
        if (!z.wp || z.pos.distanceTo(z.wp) < 1) {
          z.waitT -= dt;
          if (z.waitT <= 0) { z.wp = randomFreePoint(z.pos.x, z.pos.z, 10); z.waitT = rr(1.5, 4); }
          moveZombie(z, 0, 0, 0, dt);
        } else {
          zombieNavTo(z, z.wp); moveZombie(z, _dir.x, _dir.y, z.speed * 0.4, dt); moving = true;
          z.stuckT += dt; if (z.stuckT > 6) { z.wp = null; z.stuckT = 0; }
        }
      }
    }
    if (z.state === 'chase') {
      if (dist < (z.type === 'brute' ? 1.75 : 1.45) && dy < 1.7) { z.state = 'attack'; z.attackT = 0; z.struck = false; }
      else {
        zombieNav(z, dx, dz, dist); moveZombie(z, _dir.x, _dir.y, z.speed * spdMul, dt); moving = true;
        // stuck recovery: sidestep if barely moved
        z.stuckT += dt;
        if (z.stuckT > 1.2) { if (z.pos.distanceTo(z.stuckRef) < 0.35 && dist > 2) { z.side = Math.random() < 0.5 ? -1 : 1; z.sideT = 0.9; } z.stuckRef.copy(z.pos); z.stuckT = 0; }
        if (z.sideT > 0) { z.sideT -= dt; if (z.sideT <= 0) z.side = 0; }
      }
    }
    if (z.state === 'attack') {
      z.attackT += dt * (z.type === 'runner' ? 1.25 : 1);
      z.yaw = lerpAngle(z.yaw, Math.atan2(dx, dz), damp(10, dt));
      moveZombie(z, 0, 0, 0, dt);
      if (!z.struck && z.attackT >= 0.55) {
        z.struck = true;
        if (dist < (z.type === 'brute' ? 2.2 : 1.9) && dy < 1.7 && !player.dead) hurtPlayer(z.dmg, z);
      }
      if (z.attackT >= 1.15) { if (dist > 1.8 || player.dead) z.state = 'chase'; else { z.attackT = 0; z.struck = false; } }
    }
    z.groanT -= dt;
    if (z.groanT <= 0) { z.groanT = rr(3, 8); if (dist < 30) sfx.groan(0.35 * (1 - dist / 30), z.type === 'brute' ? 0.7 : z.type === 'runner' ? 1.3 : 1); }
    poseZombie(z, dt, moving, Math.hypot(z.vel.x, z.vel.z));
  }
}
function zombieNavTo(z, wp) {
  if (hasLOS(z.pos.x, z.pos.z, wp.x, wp.z)) return _dir.set(wp.x - z.pos.x, wp.z - z.pos.z);
  z.wp = null; return _dir.set(0, 0);
}

// ---------------- waves ----------------
const W = { n: 0, toSpawn: 0, spawnT: 0, breakT: 0 };
let kills = 0, playTime = 0;
function startWave(n) {
  W.n = n; W.toSpawn = 4 + n * 3; W.spawnT = 1.5; W.breakT = 0;
  showBanner(`ONDA ${n}`, n === 1 ? 'Sobreviva o máximo que puder' : 'Eles estão chegando...');
}
function pickType() {
  const r = Math.random();
  if (W.n >= 3 && r < 0.12) return 'brute';
  if (W.n >= 2 && r < 0.35) return 'runner';
  return 'walker';
}
function spawnFromEdge(alerted) {
  const pts = world.spawnPoints.filter((p) => p.distanceTo(player.pos) > 22);
  const p = pick(pts.length ? pts : world.spawnPoints);
  spawnZombie(new THREE.Vector3(p.x + rr(-1.5, 1.5), 0, p.z + rr(-1.5, 1.5)), pickType(), alerted);
}
function updateWaves(dt) {
  const alive = zombies.filter((z) => z.state !== 'dead').length;
  if (W.breakT > 0) { W.breakT -= dt; if (W.breakT <= 0) startWave(W.n + 1); return alive; }
  if (W.toSpawn > 0) {
    W.spawnT -= dt;
    if (W.spawnT <= 0 && alive < 6 + W.n * 2) { spawnFromEdge(Math.random() < 0.35 + W.n * 0.1); W.toSpawn--; W.spawnT = Math.max(0.6, 2.4 - W.n * 0.2); }
  } else if (alive === 0) { W.breakT = 6; showBanner('ONDA CONCLUÍDA', 'Recarregue e se prepare'); }
  return alive;
}

// ---------------- combat ----------------
const sfx = new Sfx();
const raycaster = new THREE.Raycaster();
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _muz = new THREE.Vector3();
function reload() {
  if (state !== 'playing' || player.dead || player.reloading > 0 || player.mag >= player.magSize || player.reserve <= 0) return;
  player.reloading = player.reloadTime; sfx.reload();
}
function fire() {
  if (player.reloading > 0 || player.fireCd > 0 || player.dead) return;
  if (player.mag <= 0) { sfx.empty(); player.fireCd = 0.3; if (player.reserve > 0) reload(); else showMsg('SEM MUNIÇÃO'); return; }
  player.mag--; player.fireCd = 0.1; player.lastShot = playTime;
  const moving = Math.hypot(player.vel.x, player.vel.z) > 0.5;
  const spread = (player.aimT > 0.5 ? 0.004 : 0.016) + (moving ? 0.012 : 0) + (player.onGround ? 0 : 0.03);
  camera.getWorldDirection(_fwd);
  _fwd.x += rr(-spread, spread); _fwd.y += rr(-spread, spread); _fwd.z += rr(-spread, spread); _fwd.normalize();
  raycaster.set(camera.position, _fwd); raycaster.far = 220;
  const targets = world.solids.slice();
  for (const z of zombies) if (z.state !== 'dead') targets.push(z.h.root);
  const hits = raycaster.intersectObjects(targets, true);
  rifle.muzzle.getWorldPosition(_muz);
  let end = _v2.copy(camera.position).addScaledVector(_fwd, 120);
  const camToPlayer = camera.position.distanceTo(player.pos) - 0.6;
  for (const h of hits) {
    if (h.distance < camToPlayer * 0.5) continue;
    end = _v2.copy(h.point);
    let o = h.object, z = null;
    while (o) { if (o.userData.zombie) { z = o.userData.zombie; break; } o = o.parent; }
    if (z) {
      const head = h.object.userData.part === 'head', limb = h.object.userData.part === 'arm' || h.object.userData.part === 'leg';
      const dmg = (head ? 100 : limb ? 24 : 36) * (z.type === 'brute' && head ? 0.8 : 1);
      const killed = damageZombie(z, dmg, _fwd, head);
      emit(h.point, head ? 18 : 10, 'blood', _fwd);
      hitMarker(killed, head); sfx.hit(head);
    } else {
      emit(h.point, 6, 'spark', h.face ? _v.copy(h.face.normal).transformDirection(h.object.matrixWorld) : null);
      emit(h.point, 4, 'dust', null);
      if (h.face) { _v.copy(h.face.normal).transformDirection(h.object.matrixWorld); decal(h.point, _v, holeMat, 0.12); }
    }
    break;
  }
  tracer(_muz, end);
  rifle.flash.visible = true; rifle.flash.material.rotation = Math.random() * 6; rifle.flash.scale.setScalar(rr(0.35, 0.6));
  muzzleLight.position.copy(_muz); muzzleLight.intensity = 30; flashT = 0.05;
  // casing
  _v.set(-1, 0.6, 0).applyQuaternion(ph.root.quaternion);
  emit(_muz.clone().addScaledVector(_fwd, -0.5), 1, 'casing', _v);
  // recoil
  cam.pitch += rr(0.008, 0.014) * (player.aimT > 0.5 ? 0.6 : 1); cam.yaw += rr(-0.006, 0.006);
  sfx.shot();
  for (const z of zombies) if (z.state === 'patrol' && z.pos.distanceTo(player.pos) < 45) alertZombie(z);
}
let flashT = 0;
function hurtPlayer(dmg, z) {
  if (player.dead) return;
  player.hp -= dmg; player.lastHurt = playTime; cam.shake = 0.35; sfx.hurt();
  damageFlash = 1;
  if (z) { const dx = player.pos.x - z.pos.x, dz = player.pos.z - z.pos.z, d = Math.hypot(dx, dz) || 1; player.vel.x += dx / d * 4; player.vel.z += dz / d * 4; }
  if (player.hp <= 0) { player.hp = 0; player.dead = true; player.deadT = 0; input.fire = false; state = 'dying'; }
}

// ---------------- player update ----------------
function updatePlayer(dt) {
  // look
  cam.yaw -= input.lookX; cam.pitch = clamp(cam.pitch - input.lookY, -1.1, 0.9);
  input.lookX = 0; input.lookY = 0;
  // movement input
  let mx = 0, mz = 0;
  if (!player.dead) {
    if (keys.KeyW || keys.ArrowUp) mz += 1; if (keys.KeyS || keys.ArrowDown) mz -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1; if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    mx += input.touchMove.x; mz += input.touchMove.y;
  }
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const aiming = !player.dead && (input.aim || input.touchAim) && player.reloading <= 0;
  player.running = !aiming && ml > 0.1 && mz > -0.2 && (keys.ShiftLeft || keys.ShiftRight || input.touchRun) && !player.dead;
  const speed = player.running ? 7.2 : aiming ? 2.6 : 4.3;
  _fwd.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)); _right.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  const tvx = (_fwd.x * mz + _right.x * mx) * speed, tvz = (_fwd.z * mz + _right.z * mx) * speed;
  const acc = damp(player.onGround ? 12 : 2.5, dt);
  player.vel.x += (tvx - player.vel.x) * acc; player.vel.z += (tvz - player.vel.z) * acc;
  if (input.jump && player.onGround && !player.dead) { player.vel.y = 7.2; player.onGround = false; }
  input.jump = false;
  player.vel.y -= 20 * dt;
  player.pos.x += player.vel.x * dt; player.pos.z += player.vel.z * dt; player.pos.y += player.vel.y * dt;
  collideCircle(player.pos, 0.35, player.pos.y, 0.4);
  const gh = groundHeight(player.pos.x, player.pos.z, player.pos.y);
  if (player.pos.y <= gh || (player.vel.y <= 0 && player.pos.y - gh < 0.16)) { player.pos.y = gh; player.vel.y = 0; player.onGround = true; }
  else player.onGround = false;
  // aim & facing
  player.aimT += ((aiming ? 1 : 0) - player.aimT) * damp(12, dt);
  const combat = aiming || playTime - player.lastShot < 0.8 || input.fire;
  const hs = Math.hypot(player.vel.x, player.vel.z);
  if (!player.dead) {
    if (combat) player.facing = lerpAngle(player.facing, cam.yaw + Math.PI, damp(18, dt));
    else if (hs > 0.5) player.facing = lerpAngle(player.facing, Math.atan2(player.vel.x, player.vel.z), damp(10, dt));
  }
  ph.root.rotation.y = player.facing;
  // weapon
  player.fireCd -= dt;
  if (player.reloading > 0) {
    player.reloading -= dt;
    if (player.reloading <= 0) { const need = player.magSize - player.mag, take = Math.min(need, player.reserve); player.mag += take; player.reserve -= take; player.reloading = 0; }
  }
  if (input.fire && state === 'playing') fire();
  if (flashT > 0) { flashT -= dt; if (flashT <= 0) { rifle.flash.visible = false; muzzleLight.intensity = 0; } }
  posePlayer(dt, hs, combat);
}
function posePlayer(dt, hs, combat) {
  const h = ph;
  if (player.dead) {
    player.deadT += dt; const k = Math.min(1, player.deadT / 0.8), e = k * k;
    h.body.rotation.x = -e * Math.PI / 2 * 0.95; h.body.position.y = e * 0.15;
    return;
  }
  h.body.rotation.set(0, 0, 0); h.body.position.y = 0;
  if (!player.onGround) { h.lHip.rotation.set(-0.7, 0, 0); h.rHip.rotation.set(0.25, 0, 0); h.lKnee.rotation.set(1.0, 0, 0); h.rKnee.rotation.set(0.5, 0, 0); }
  else if (hs > 0.4) {
    // walk/run cycle; reverse phase when moving backwards relative to facing
    const fwd = Math.cos(Math.atan2(player.vel.x, player.vel.z) - player.facing);
    player.anim += dt * hs * (player.running ? 1.45 : 1.9) * (fwd < -0.3 ? -1 : 1);
    legCycle(h, player.anim, player.running ? 0.8 : 0.5, player.running ? 1.2 : 0.75);
  } else { h.lHip.rotation.set(0, 0, 0.03); h.rHip.rotation.set(0, 0, -0.03); h.lKnee.rotation.set(0.05, 0, 0); h.rKnee.rotation.set(0.05, 0, 0); }
  const bob = hs > 0.4 && player.onGround ? Math.abs(Math.sin(player.anim)) * (player.running ? 0.07 : 0.04) : Math.sin(playTime * 2) * 0.005;
  h.hips.position.y = 0.92 - bob;
  const aimPitch = combat ? cam.pitch : 0;
  h.spine.rotation.set((player.running ? 0.22 : 0.05) - aimPitch * 0.85, combat ? -0.12 : 0, 0);
  h.head.rotation.set(-aimPitch * 0.15, combat ? 0.12 : 0, 0);
  // gun pose blend
  const target = combat ? POSE.aim : player.running ? POSE.run : POSE.low;
  const k = damp(14, dt);
  rifle.g.position.lerp(target.p, k);
  _qa.setFromEuler(target.r); rifle.g.quaternion.slerp(_qa, k);
  let leftTarget = null;
  if (player.reloading > 0) {
    const p = 1 - player.reloading / player.reloadTime;
    rifle.g.position.lerp(_v.set(-0.05, 0.3, 0.25), 0.8);
    _qb.setFromEuler(new THREE.Euler(0.35, 0.5, 0.7 * Math.sin(p * Math.PI))); rifle.g.quaternion.copy(_qb);
    rifle.mag.visible = !(p > 0.2 && p < 0.65);
    if (p > 0.15 && p < 0.75) leftTarget = POUCH;
  } else rifle.mag.visible = true;
  rifle.g.updateMatrix();
  _tR.copy(GRIP_R).applyMatrix4(rifle.g.matrix);
  if (leftTarget) _tL.copy(leftTarget); else _tL.copy(GRIP_L).applyMatrix4(rifle.g.matrix);
  solveArmIK(h.rShoulder, h.rElbow, _tR, POLE_R);
  solveArmIK(h.lShoulder, h.lElbow, _tL, POLE_L);
}

// ---------------- camera ----------------
const _piv = new THREE.Vector3(), _desired = new THREE.Vector3(), _shoulder = new THREE.Vector3();
function updateCamera(dt) {
  _piv.set(player.pos.x, player.pos.y + 1.55, player.pos.z);
  cam.pivot.lerp(_piv, damp(16, dt));
  const a = player.aimT;
  const back = 3.1 - a * 1.75, side = 0.62 - a * 0.08, up = 0.15 - a * 0.05;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  _fwd.set(-Math.sin(cam.yaw) * cp, sp, -Math.cos(cam.yaw) * cp);
  _right.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  _shoulder.copy(cam.pivot).addScaledVector(_right, side).y += up;
  _desired.copy(_shoulder).addScaledVector(_fwd, -back);
  const t = segmentHit(cam.pivot, _desired);
  const len = cam.pivot.distanceTo(_desired) * t;
  const want = Math.max(0.3, len - 0.2);
  cam.boom = want < cam.boom ? want : cam.boom + (want - cam.boom) * damp(4, dt);
  _desired.subVectors(_desired, cam.pivot).setLength(cam.boom).add(cam.pivot);
  camera.position.copy(_desired);
  if (cam.shake > 0) { cam.shake -= dt; const s = cam.shake * 0.15; camera.position.x += rr(-s, s); camera.position.y += rr(-s, s); }
  camera.rotation.set(cam.pitch, cam.yaw, 0, 'YXZ');
  const fov = 70 - a * 22 + (player.running ? 6 : 0);
  if (Math.abs(fov - camera.fov) > 0.05) { camera.fov += (fov - camera.fov) * damp(10, dt); camera.updateProjectionMatrix(); }
}

// ---------------- environment per-frame ----------------
let lampT = 0;
function updateEnv(dt, center) {
  lampT -= dt;
  if (lampT <= 0) {
    lampT = 0.25;
    const sorted = world.lamps.slice().sort((a, b) => a.pos.distanceToSquared(center) - b.pos.distanceToSquared(center));
    spots.forEach((s, i) => { const l = sorted[i]; s.position.copy(l.pos); s.target.position.set(l.pos.x, 0, l.pos.z); s.userData.lamp = l; });
  }
  for (const s of spots) { const l = s.userData.lamp; if (l && l.flick) { const on = Math.random() > 0.08; s.intensity = on ? 110 : 10; l.bulb.visible = on; } }
  moon.position.copy(center).add(MOON_OFF); moon.target.position.copy(center);
  const p = ashGeo.attributes.position;
  for (let i = 0; i < ASH; i++) {
    let x = p.array[i * 3], y = p.array[i * 3 + 1], z = p.array[i * 3 + 2];
    y -= dt * 0.5; x += dt * 0.35;
    if (y < 0) y += 16;
    if (x - center.x > 30) x -= 60; if (x - center.x < -30) x += 60;
    if (z - center.z > 30) z -= 60; if (z - center.z < -30) z += 60;
    p.array[i * 3] = x; p.array[i * 3 + 1] = y; p.array[i * 3 + 2] = z;
  }
  p.needsUpdate = true;
  for (const t of tracers) if (t.visible) { t.userData.t -= dt; t.material.opacity = Math.max(0, t.userData.t / 0.06); if (t.userData.t <= 0) t.visible = false; }
}

// ---------------- HUD ----------------
const hud = { hp: -1, mag: -1, res: -1, kills: -1, wave: -1, alive: -1 };
let damageFlash = 0, hitT = 0, bannerT = 0, msgT = 0;
function showBanner(t, sub) { $('banner').innerHTML = `${t}<small>${sub || ''}</small>`; $('banner').style.opacity = 1; bannerT = 2.6; }
function showMsg(t) { $('msg').textContent = t; msgT = 1.8; }
function hitMarker(kill, head) { const h = $('hitmarker'); h.classList.toggle('kill', kill); h.style.opacity = 1; h.style.transform = `scale(${head ? 1.35 : 1})`; hitT = 0.15; }
function updateHUD(dt, alive) {
  if (hud.hp !== Math.ceil(player.hp)) { hud.hp = Math.ceil(player.hp); $('hpfill').style.width = (player.hp / player.maxHp * 100) + '%'; $('hptext').textContent = `${hud.hp} / ${player.maxHp}`; }
  if (hud.mag !== player.mag) { hud.mag = player.mag; $('mag').textContent = player.mag; $('mag').classList.toggle('low', player.mag <= 6); }
  if (hud.res !== player.reserve) { hud.res = player.reserve; $('reserve').textContent = player.reserve; }
  if (hud.kills !== kills) { hud.kills = kills; $('kills').textContent = `☠ ${kills}`; }
  if (hud.wave !== W.n) { hud.wave = W.n; $('wave').textContent = `ONDA ${W.n}`; }
  const rem = alive + W.toSpawn;
  if (hud.alive !== rem) { hud.alive = rem; $('alive').textContent = `${rem} zumbis restantes`; }
  $('reloadbar').firstElementChild.style.width = player.reloading > 0 ? ((1 - player.reloading / player.reloadTime) * 100) + '%' : '0%';
  if (player.mag === 0 && player.reloading <= 0 && msgT <= 0) showMsg(player.reserve > 0 ? 'RECARREGUE  [R]' : 'SEM MUNIÇÃO');
  damageFlash = Math.max(0, damageFlash - dt * 2.5);
  const low = player.hp < 35 ? 0.35 + Math.sin(playTime * 5) * 0.15 : 0;
  $('damage').style.opacity = Math.max(damageFlash, low);
  if (hitT > 0) { hitT -= dt; if (hitT <= 0) $('hitmarker').style.opacity = 0; }
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').style.opacity = 0; }
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) $('msg').textContent = ''; }
  const spread = 1 + (1 - player.aimT) * 0.6 + (Math.hypot(player.vel.x, player.vel.z) > 0.5 ? 0.6 : 0) + (playTime - player.lastShot < 0.12 ? 0.5 : 0);
  for (const [cls, ax, sg] of [['t', 'Y', -1], ['b', 'Y', 1], ['l', 'X', -1], ['r', 'X', 1]]) document.querySelector(`#crosshair .${cls}`).style.transform = `translate${ax}(${sg * (spread - 1) * 6}px)`;
}

// ---------------- game flow ----------------
function resetGame() {
  for (const z of zombies) scene.remove(z.h.root);
  zombies.length = 0;
  for (const p of pickups) scene.remove(p.g);
  pickups.length = 0;
  for (const d of decals) d.visible = false;
  Object.assign(player, { hp: 100, mag: 30, reserve: 120, reloading: 0, fireCd: 0, lastShot: -10, aimT: 0, dead: false, deadT: 0, running: false, onGround: true, facing: Math.PI });
  player.pos.set(0, 0, 2); player.vel.set(0, 0, 0);
  cam.yaw = Math.PI; cam.pitch = -0.08; cam.pivot.set(0, 1.55, 2); cam.boom = 3;
  kills = 0; playTime = 0; input.fire = false; input.aim = false;
  // initial patrol zombies spread across town + starting pickups
  for (const [x, z] of [[1, 20], [-3, 28], [16, 4], [-18, -3], [3, -20], [-25, -30]]) spawnZombie(new THREE.Vector3(x, 0, z), 'walker', false);
  spawnPickup(new THREE.Vector3(-8, 0, 4), 'ammo'); spawnPickup(new THREE.Vector3(8, 0, -14), 'med'); spawnPickup(new THREE.Vector3(-30, 0, -24), 'ammo');
  W.n = 0; startWave(1); W.toSpawn = 3;
  computeFlow(0, 2);
}
function startGame() {
  sfx.init();
  $('menu').classList.add('hidden'); $('gameover').classList.add('hidden'); $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  resetGame();
  state = 'playing';
  if (isTouch) {
    setupTouchOnce();
    try { document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {}); } catch (_) { /* optional */ }
  } else lockPointer();
}
let touchReady = false;
function setupTouchOnce() { if (!touchReady) { setupTouch(); touchReady = true; } $('touch').classList.remove('hidden'); }
function setPaused(p) {
  if (p && state === 'playing') { state = 'paused'; pausedAt = performance.now(); $('pause').classList.remove('hidden'); input.fire = false; if (document.pointerLockElement) document.exitPointerLock(); }
  else if (!p && state === 'paused') { state = 'playing'; $('pause').classList.add('hidden'); lockPointer(); }
}
function gameOver() {
  state = 'dead';
  if (document.pointerLockElement) document.exitPointerLock();
  const m = Math.floor(playTime / 60), s = Math.floor(playTime % 60);
  $('goStats').innerHTML = `Zumbis eliminados: <b>${kills}</b><br/>Onda alcançada: <b>${W.n}</b><br/>Tempo sobrevivido: <b>${m}:${String(s).padStart(2, '0')}</b>`;
  $('gameover').classList.remove('hidden');
}
$('playBtn').addEventListener('click', startGame);
$('restartBtn').addEventListener('click', startGame);
$('restartBtn2').addEventListener('click', startGame);
$('resumeBtn').addEventListener('click', () => setPaused(false));
if (isTouch) { $('ctrlDesk').classList.add('hidden'); $('ctrlTouch').classList.remove('hidden'); }

// ---------------- main loop ----------------
function simulate(dt) {
  playTime += dt;
  updatePlayer(dt);
  updateCamera(dt);
  updateZombies(dt);
  updatePickups(dt);
  const alive = updateWaves(dt);
  updateHUD(dt, alive);
  if (state === 'dying' && player.deadT > 1.8) gameOver();
}
let last = performance.now(), envTime = 0, menuAngle = 0, frameCount = 0;
function frame(now) {
  requestAnimationFrame(frame);
  frameCount++;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  envTime += dt;
  if (state === 'playing' || state === 'dying') simulate(dt);
  else if (state === 'menu') {
    menuAngle += dt * 0.05;
    camera.position.set(Math.sin(menuAngle) * 16, 5.5, Math.cos(menuAngle) * 16 + 6);
    camera.lookAt(0, 1.5, 12);
  }
  updateParticles(dt);
  updateEnv(dt, state === 'menu' ? camera.position : player.pos);
  world.update(envTime, dt);
  composer.render();
}
// populate the menu backdrop
resetGame();
requestAnimationFrame(frame);

// debug/test hooks (used by the automated e2e test)
window.__game = {
  get state() { return state; }, get frames() { return frameCount; }, player, cam, zombies, get kills() { return kills; }, get wave() { return W.n; },
  spawnZombie: (x, z, type = 'walker', alerted = true) => spawnZombie(new THREE.Vector3(x, 0, z), type, alerted),
  clearZombies: () => { for (const z of zombies) scene.remove(z.h.root); zombies.length = 0; W.toSpawn = 0; W.breakT = 9999; },
  lookAt: (x, y, z) => { const dx = x - camera.position.x, dy = y - camera.position.y, dz = z - camera.position.z; cam.yaw = Math.atan2(-dx, -dz); cam.pitch = Math.atan2(dy, Math.hypot(dx, dz)); },
  renderer,
  // advance the real game simulation with a fixed timestep (used by tests on slow software-GL machines)
  step: (sec, h = 1 / 30) => { for (let t = 0; t < sec; t += h) { if (state === 'playing' || state === 'dying') { simulate(h); updateParticles(h); } } return state; },
};
