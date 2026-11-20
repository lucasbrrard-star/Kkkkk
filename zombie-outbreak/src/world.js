// Procedural night city: streets, buildings, houses, park, military checkpoint,
// cars, lamps, props. Returns colliders (AABBs) and raycast solids.
import * as THREE from 'three';

let seed = 1337;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rr = (a, b) => a + rnd() * (b - a);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

export const BOUND = 56;

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function noise(g, w, h, n, a, light = false) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${rnd() * a})`;
    const s = rnd() * 3 + 1;
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

// ---------- textures ----------
function makeTextures() {
  const T = {};
  T.asphalt = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#2a2b2e'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 9000, 0.35); noise(g, w, h, 5000, 0.08, true);
    g.strokeStyle = 'rgba(10,10,10,0.6)'; g.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) {
      g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += rr(-25, 25); y += rr(-25, 25); g.lineTo(x, y); }
      g.stroke();
    }
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(0,0,0,${rr(0.1, 0.25)})`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, rr(20, 60), rr(10, 40), rnd() * 3, 0, 7); g.fill(); }
  });
  T.asphaltRough = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) { g.fillStyle = `rgba(0,0,0,${rr(0.4, 0.7)})`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, rr(15, 45), rr(8, 30), rnd() * 3, 0, 7); g.fill(); }
    noise(g, w, h, 3000, 0.3, true);
  }, false);
  T.concrete = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5d5d5a'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 4000, 0.25); noise(g, w, h, 2000, 0.06, true);
    g.strokeStyle = 'rgba(20,20,20,0.7)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
  });
  T.grass = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#1f2a17'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) { g.fillStyle = `hsla(${rr(70, 110)},40%,${rr(8, 24)}%,0.8)`; g.fillRect(rnd() * w, rnd() * h, 1, rr(2, 5)); }
  });
  T.wallPlain = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8a8a86'; g.fillRect(0, 0, w, h); noise(g, w, h, 3000, 0.2);
    for (let i = 0; i < 20; i++) { const x = rnd() * w; const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, 'rgba(0,0,0,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x, 0, rr(3, 12), rr(40, 200)); }
  });
  T.shingles = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#2a201c'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 * 12; x < w; x += 24) { g.fillStyle = `hsl(15,${rr(10, 25)}%,${rr(10, 20)}%)`; g.fillRect(x + 1, y + 1, 22, 14); }
  });
  T.container = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#888'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { const grd = g.createLinearGradient(x, 0, x + 16, 0); grd.addColorStop(0, '#666'); grd.addColorStop(0.5, '#bbb'); grd.addColorStop(1, '#555'); g.fillStyle = grd; g.fillRect(x, 0, 16, h); }
    noise(g, w, h, 1500, 0.3);
    for (let i = 0; i < 25; i++) { g.fillStyle = `rgba(90,40,10,${rr(0.2, 0.5)})`; g.fillRect(rnd() * w, rnd() * h, rr(2, 10), rr(5, 30)); }
  });
  T.stripes = canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c4381b'; g.fillRect(0, 0, w, h * 0.45);
    noise(g, w, h, 600, 0.3);
  });
  T.shutter = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#6c6f73'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 6) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, w, 1.5); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, y + 2, w, 1); }
    noise(g, w, h, 800, 0.3);
    const cols = ['#b8322a', '#2a62b8', '#d9c23a', '#2aa860'];
    for (let i = 0; i < 3; i++) { g.strokeStyle = pick(cols); g.lineWidth = rr(3, 7); g.beginPath(); g.moveTo(rr(0, w), rr(40, 120)); g.bezierCurveTo(rr(0, w), rr(0, h), rr(0, w), rr(0, h), rr(0, w), rr(40, 120)); g.stroke(); }
  });
  T.blood = canvasTex(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30); grd.addColorStop(0, 'rgba(90,0,0,0.95)'); grd.addColorStop(1, 'rgba(60,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  T.glow = canvasTex(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  T.smoke = canvasTex(64, 64, (g, w, h) => {
    for (let i = 0; i < 12; i++) { const x = rr(18, 46), y = rr(18, 46); const grd = g.createRadialGradient(x, y, 0, x, y, rr(10, 20)); grd.addColorStop(0, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, w, h); }
  });
  return T;
}

function facade(kind) {
  const base = { brick: '#5a2e22', concrete: '#6e6b66', plaster: '#7d7360', teal: '#3f5b58', dark: '#3b3d42' }[kind];
  const lit = [];
  const map = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    noise(g, w, h, 8000, 0.25); noise(g, w, h, 3000, 0.06, true);
    if (kind === 'brick') {
      g.strokeStyle = 'rgba(30,20,15,0.6)'; g.lineWidth = 1;
      for (let y = 0; y < h; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 8) % 2 * 8; x < w; x += 16) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke(); } }
    }
    for (let i = 0; i < 30; i++) { const x = rnd() * w; const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, 'rgba(0,0,0,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x, rnd() * h, rr(4, 18), rr(60, 260)); }
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const x = c * 128 + 30, y = r * 128 + 26, ww = 68, hh = 76;
      g.fillStyle = 'rgba(200,200,190,0.55)'; g.fillRect(x - 5, y - 5, ww + 10, hh + 12);
      const st = rnd();
      if (st < 0.12) { g.fillStyle = '#4a3420'; g.fillRect(x, y, ww, hh); g.fillStyle = '#5e4429'; for (let k = 0; k < 4; k++) g.fillRect(x - 3, y + 8 + k * 18, ww + 6, 11); }
      else {
        const grd = g.createLinearGradient(x, y, x + ww, y + hh); grd.addColorStop(0, '#1a2430'); grd.addColorStop(1, '#07090c');
        g.fillStyle = grd; g.fillRect(x, y, ww, hh);
        g.fillStyle = 'rgba(160,190,220,0.12)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + ww * 0.6, y); g.lineTo(x, y + hh * 0.7); g.fill();
        g.fillStyle = 'rgba(200,200,190,0.55)'; g.fillRect(x + ww / 2 - 2, y, 4, hh);
        if (st > 0.82) lit.push([x, y, ww, hh]);
      }
    }
  });
  const emissive = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (const [x, y, ww, hh] of lit) {
      const grd = g.createLinearGradient(x, y, x, y + hh); grd.addColorStop(0, '#ffcf8a'); grd.addColorStop(1, '#c4782c');
      g.fillStyle = grd; g.fillRect(x, y, ww, hh);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + ww / 2 - 2, y, 4, hh);
    }
  });
  return { map, emissive };
}

function signTex(text, color) {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, w, h);
    g.font = 'bold 74px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 25; g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 4);
    g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = 0.6; g.fillText(text, w / 2, h / 2 + 4);
  });
}

export function buildWorld(scene) {
  seed = 1337;
  const T = makeTextures();
  const colliders = [];
  const solids = [];
  const lamps = [];
  const flicker = [];
  const updaters = [];

  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    asphalt: std({ map: T.asphalt, roughnessMap: T.asphaltRough, roughness: 0.75, metalness: 0.05, bumpMap: T.asphaltRough, bumpScale: 0.6 }),
    concrete: std({ map: T.concrete, roughness: 0.9, bumpMap: T.concrete, bumpScale: 0.8 }),
    grass: std({ map: T.grass, roughness: 1 }),
    curb: std({ color: 0x77756f, roughness: 0.85 }),
    line: std({ color: 0xd8d2c0, roughness: 0.7 }),
    yline: std({ color: 0xc9a227, roughness: 0.7 }),
    metal: std({ color: 0x3a3d42, roughness: 0.45, metalness: 0.8 }),
    darkMetal: std({ color: 0x1d1f22, roughness: 0.5, metalness: 0.7 }),
    rubber: std({ color: 0x111111, roughness: 0.9 }),
    glass: std({ color: 0x0a0e14, roughness: 0.08, metalness: 0.9 }),
    wood: std({ color: 0x4a3423, roughness: 0.85 }),
    trunk: std({ color: 0x2b1f17, roughness: 1 }),
    leaf: [std({ color: 0x1d3317, roughness: 0.95, flatShading: true }), std({ color: 0x24401c, roughness: 0.95, flatShading: true }), std({ color: 0x2f3d18, roughness: 0.95, flatShading: true })],
    barrier: std({ map: T.stripes, roughness: 0.6 }),
    jersey: std({ color: 0x8d8a83, roughness: 0.9, map: T.concrete }),
    shutter: std({ map: T.shutter, roughness: 0.55, metalness: 0.6 }),
    roof: std({ color: 0x2c2c2e, roughness: 0.95 }),
    shingles: std({ map: T.shingles, roughness: 0.9 }),
    burnt: std({ color: 0x141210, roughness: 0.95, metalness: 0.3 }),
    olive: std({ color: 0x3c4429, roughness: 0.85 }),
    sand: std({ color: 0x6f6347, roughness: 1 }),
    bulb: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.1, 2.8) }),
    redLight: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.15, 0.05) }),
    amber: new THREE.MeshBasicMaterial({ color: 0xffa020 }),
  };
  T.asphalt.repeat.set(1, 1);

  const add = (obj, solid = true, x = 0, y = 0, z = 0) => {
    obj.position.set(x, y, z); scene.add(obj);
    if (solid) obj.traverse((o) => { if (o.isMesh) solids.push(o); });
    return obj;
  };
  const box = (w, h, d, mat, cast = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = cast; m.receiveShadow = true; return m; };
  const collider = (cx, cz, sx, sz, top) => colliders.push({ minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2, top });
  // rotated footprint helper (rot multiple of PI/2)
  const rotCollider = (x, z, w, d, rot, top) => { const q = Math.abs(Math.round(rot / (Math.PI / 2))) % 2 === 1; collider(x, z, q ? d : w, q ? w : d, top); };

  // ---------- ground ----------
  const roadGeo = new THREE.PlaneGeometry(130, 130); roadGeo.rotateX(-Math.PI / 2);
  roadGeo.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 13; });
  const road = new THREE.Mesh(roadGeo, M.asphalt); road.receiveShadow = true; add(road, true);
  const concreteTex = T.concrete; concreteTex.repeat.set(1, 1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const size = 52, c = 6 + size / 2;
    const slabGeo = new THREE.BoxGeometry(size, 0.12, size);
    slabGeo.attributes.uv.array.forEach((v, i, a) => { a[i] = v * size / 4; });
    const slab = new THREE.Mesh(slabGeo, M.concrete); slab.receiveShadow = true;
    add(slab, true, sx * c, 0.06, sz * c);
    const curbX = box(0.22, 0.16, size, M.curb, false); add(curbX, false, sx * 6.1, 0.07, sz * c);
    const curbZ = box(size, 0.16, 0.22, M.curb, false); add(curbZ, false, sx * c, 0.07, sz * 6.1);
  }
  // park grass (Q3)
  { const gg = new THREE.PlaneGeometry(46, 46); gg.rotateX(-Math.PI / 2); gg.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 10; });
    const grass = new THREE.Mesh(gg, M.grass); grass.receiveShadow = true; add(grass, false, -33, 0.125, -33);
    // path
    const pg = new THREE.PlaneGeometry(2.4, 46); pg.rotateX(-Math.PI / 2); pg.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 6; });
    const p1 = new THREE.Mesh(pg, M.concrete); p1.receiveShadow = true; add(p1, false, -24, 0.13, -33);
    const p2 = p1.clone(); p2.rotation.y = Math.PI / 2; add(p2, false, -33, 0.131, -24);
  }
  // road markings
  const dash = new THREE.PlaneGeometry(0.18, 2.4); dash.rotateX(-Math.PI / 2);
  const dashes = new THREE.InstancedMesh(dash, M.yline, 80); let di = 0; const mtx = new THREE.Matrix4();
  for (let s = -54; s <= 54; s += 5) {
    if (Math.abs(s) < 10) continue;
    mtx.makeTranslation(0, 0.012, s); dashes.setMatrixAt(di++, mtx);
    mtx.makeRotationY(Math.PI / 2).setPosition(s, 0.012, 0); dashes.setMatrixAt(di++, mtx);
  }
  dashes.count = di; dashes.receiveShadow = true; scene.add(dashes);
  const zebra = new THREE.PlaneGeometry(0.7, 4); zebra.rotateX(-Math.PI / 2);
  const zebras = new THREE.InstancedMesh(zebra, M.line, 60); let zi = 0;
  for (const s of [-1, 1]) for (let k = -5; k <= 5; k++) {
    mtx.makeTranslation(k * 1.1, 0.013, s * 8.2); zebras.setMatrixAt(zi++, mtx);
    mtx.makeRotationY(Math.PI / 2).setPosition(s * 8.2, 0.013, k * 1.1); zebras.setMatrixAt(zi++, mtx);
  }
  zebras.count = zi; zebras.receiveShadow = true; scene.add(zebras);

  // ---------- buildings ----------
  const facades = { brick: facade('brick'), concrete: facade('concrete'), plaster: facade('plaster'), teal: facade('teal'), dark: facade('dark') };
  const signs = [['FARMÁCIA', '#33ff88'], ['BAR 24H', '#ff3a6a'], ['HOTEL', '#ff9a2a'], ['MERCADO', '#3ac8ff'], ['PIZZA', '#ffd23a'], ['LAVANDERIA', '#b06aff']];
  let signIdx = 0;
  function building(x, z, w, d, h, rot, style, opt = {}) {
    const g = new THREE.Group();
    const f = facades[style];
    const mk = (rw) => { const map = f.map.clone(); map.repeat.set(rw / 16, h / 14); map.needsUpdate = true; const em = f.emissive.clone(); em.repeat.copy(map.repeat); em.needsUpdate = true;
      return std({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 1.4, roughness: 0.85 }); };
    const front = mk(w), side = mk(d);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, M.roof, M.roof, front, front]);
    b.position.y = h / 2; b.castShadow = true; b.receiveShadow = true; g.add(b);
    const ledge = box(w + 0.5, 0.45, d + 0.5, M.curb); ledge.position.y = h + 0.1; g.add(ledge);
    const band = box(w + 0.2, 0.25, d + 0.2, M.curb); band.position.y = 3.7; g.add(band);
    // storefront
    const sf = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.86, 3.2), rnd() < 0.55 ? M.shutter : M.glass);
    sf.position.set(0, 1.75, d / 2 + 0.03); g.add(sf);
    const frame = box(w * 0.9, 0.2, 0.25, M.darkMetal); frame.position.set(0, 3.4, d / 2 + 0.1); g.add(frame);
    if (opt.awning !== false) {
      const aw = box(w * 0.7, 0.12, 1.6, std({ color: pick([0x5b1a17, 0x1c3b52, 0x2a4a2a, 0x4a3b18]), roughness: 0.8 }));
      aw.position.set(0, 3.05, d / 2 + 0.8); aw.rotation.x = 0.22; g.add(aw);
    }
    if (opt.sign) {
      const [txt, col] = signs[signIdx++ % signs.length];
      const sm = new THREE.MeshBasicMaterial({ map: signTex(txt, col), toneMapped: false });
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.6, 5.5), 1.2), sm);
      sg.position.set(0, 4.5, d / 2 + 0.06); g.add(sg);
      if (rnd() < 0.5) flicker.push({ mat: sm, base: new THREE.Color(1, 1, 1), t: rnd() * 10 });
    }
    // roof props
    for (let i = 0; i < 2 + Math.floor(rnd() * 3); i++) {
      const ac = box(rr(1, 2), rr(0.6, 1.2), rr(1, 2), M.metal); ac.position.set(rr(-w / 2 + 1.5, w / 2 - 1.5), h + 0.6, rr(-d / 2 + 1.5, d / 2 - 1.5)); g.add(ac);
    }
    if (rnd() < 0.4) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2, 14), M.wood); tank.castShadow = true;
      tank.position.set(rr(-w / 4, w / 4), h + 2.4, rr(-d / 4, d / 4)); g.add(tank);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.8, 14), M.roof); cone.position.copy(tank.position); cone.position.y += 1.4; g.add(cone);
      for (const [lx, lz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) { const leg = box(0.12, 1.4, 0.12, M.darkMetal); leg.position.set(tank.position.x + lx, h + 0.7, tank.position.z + lz); g.add(leg); }
    }
    g.rotation.y = rot;
    add(g, true, x, 0.12, z);
    rotCollider(x, z, w, d, rot, h);
  }

  function house(x, z, w, d, rot, wallColor) {
    const g = new THREE.Group();
    const wm = std({ map: T.wallPlain, color: wallColor, roughness: 0.9 });
    const body = box(w, 3.4, d, wm); body.position.y = 1.7; g.add(body);
    const shape = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.5, 0), new THREE.Vector2(w / 2 + 0.5, 0), new THREE.Vector2(0, 2.4)]);
    const rg = new THREE.ExtrudeGeometry(shape, { depth: d + 0.8, bevelEnabled: false }); rg.translate(0, 0, -(d + 0.8) / 2);
    const roof = new THREE.Mesh(rg, M.shingles); roof.position.y = 3.4; roof.castShadow = true; roof.receiveShadow = true; g.add(roof);
    const chim = box(0.7, 1.8, 0.7, M.curb); chim.position.set(w / 4, 4.8, -d / 4); g.add(chim);
    const door = box(1.1, 2.2, 0.1, M.wood); door.position.set(-w / 4, 1.1, d / 2 + 0.03); g.add(door);
    for (const wx of [w / 6, w / 3 + 0.3]) {
      const lit = rnd() < 0.35;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.3), lit ? new THREE.MeshStandardMaterial({ color: 0x110a04, emissive: 0xffb060, emissiveIntensity: 1.6 }) : M.glass);
      win.position.set(wx, 1.8, d / 2 + 0.04); g.add(win);
      const fr = box(1.4, 0.12, 0.15, M.curb); fr.position.set(wx, 1.08, d / 2 + 0.06); g.add(fr);
    }
    // porch
    const porch = box(w * 0.55, 0.25, 2, M.wood); porch.position.set(-w / 6, 0.12, d / 2 + 1); g.add(porch);
    const proof = box(w * 0.6, 0.12, 2.3, M.shingles); proof.position.set(-w / 6, 2.7, d / 2 + 1.05); g.add(proof);
    for (const px of [-w / 6 - w * 0.26, -w / 6 + w * 0.26]) { const post = box(0.14, 2.6, 0.14, M.wood); post.position.set(px, 1.35, d / 2 + 2); g.add(post); }
    g.rotation.y = rot;
    add(g, true, x, 0.12, z);
    rotCollider(x, z, w, d, rot, 5);
  }

  // Q1 downtown (+x,+z)
  building(13.5, 14, 10, 9, 13, -Math.PI / 2, 'brick', { sign: true });
  building(14, 27, 12, 10, 20, -Math.PI / 2, 'concrete', { sign: true });
  building(13.5, 38.5, 9, 9, 9, -Math.PI / 2, 'teal', { sign: true });
  building(14, 50, 11, 10, 15, -Math.PI / 2, 'dark');
  building(27, 14, 10, 10, 11, Math.PI, 'plaster', { sign: true });
  building(41, 14, 12, 10, 17, Math.PI, 'brick');
  building(52.5, 14, 7, 10, 8, Math.PI, 'concrete', { sign: true });
  building(30, 40, 14, 12, 24, Math.PI, 'dark', { awning: false });
  // Q2 residential (-x,+z)
  house(-16, 16, 9, 8, Math.PI / 2, 0x8a7f6a);
  house(-16, 31, 9, 8, Math.PI / 2, 0x6a7a80);
  house(-16, 46, 9, 8, Math.PI / 2, 0x7e6a5c);
  house(-32, 16, 9, 8, Math.PI, 0x6f7a62);
  house(-47, 16, 9, 8, Math.PI, 0x8a8478);
  building(-38, 42, 12, 12, 14, Math.PI / 2, 'brick', { awning: false });
  // Q3 edge buildings
  building(-14, -50, 10, 10, 16, Math.PI / 2, 'concrete', { sign: true });
  building(-50, -14, 10, 9, 12, 0, 'teal', { sign: true });

  // ---------- skyline (beyond bounds, fog silhouettes) ----------
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2; const r = rr(72, 90);
    const w = rr(10, 18), h = rr(18, 45);
    const st = pick(['concrete', 'dark', 'brick']);
    const mat = std({ map: facades[st].map, emissiveMap: facades[st].emissive, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.9 });
    const b = box(w, h, w, mat, false); add(b, false, Math.cos(a) * r, h / 2, Math.sin(a) * r);
  }

  // ---------- perimeter wall ----------
  const wallMat = std({ map: T.concrete, roughness: 0.95, color: 0x8a8a8a });
  const wire = std({ color: 0x55585c, metalness: 0.8, roughness: 0.4 });
  for (const [cx, cz, sx, sz] of [[0, 58.5, 118, 1], [0, -58.5, 118, 1], [58.5, 0, 1, 118], [-58.5, 0, 1, 118]]) {
    const wgeo = new THREE.BoxGeometry(sx, 4, sz); wgeo.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 20; });
    const wall = new THREE.Mesh(wgeo, wallMat); wall.receiveShadow = true; add(wall, true, cx, 2, cz);
    const wr = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, Math.max(sx, sz), 6), wire);
    wr.rotation.set(sx > sz ? 0 : Math.PI / 2, 0, sx > sz ? Math.PI / 2 : 0); add(wr, false, cx, 4.3, cz);
    collider(cx, cz, sx, sz, 4);
  }

  // ---------- cars ----------
  const carColors = [0x6b1414, 0x1d2f4a, 0x9a9a96, 0x2a2a2a, 0x3e4a2c, 0x7a5a1a, 0xc8c4bc];
  function car(x, z, rot, opt = {}) {
    const g = new THREE.Group();
    const paint = opt.burnt ? M.burnt : std({ color: pick(carColors), roughness: 0.35, metalness: 0.6 });
    const bodyGeo = new THREE.BoxGeometry(1.9, 0.62, 4.3, 2, 1, 4);
    const pos = bodyGeo.attributes.position; // round the nose / tail a bit
    for (let i = 0; i < pos.count; i++) { const zz = pos.getZ(i), yy = pos.getY(i); if (Math.abs(zz) > 2 && yy > 0) pos.setY(i, yy - 0.12); }
    bodyGeo.computeVertexNormals();
    const body = new THREE.Mesh(bodyGeo, paint); body.position.y = 0.62; body.castShadow = true; body.receiveShadow = true; g.add(body);
    const cabGeo = new THREE.BoxGeometry(1.7, 0.55, 2.3);
    const cp = cabGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) if (cp.getY(i) > 0) { cp.setZ(i, cp.getZ(i) * 0.72 - 0.1); cp.setX(i, cp.getX(i) * 0.9); }
    cabGeo.computeVertexNormals();
    const cab = new THREE.Mesh(cabGeo, opt.burnt ? M.burnt : M.glass); cab.position.set(0, 1.2, -0.15); cab.castShadow = true; g.add(cab);
    const top = box(1.42, 0.06, 1.55, paint); top.position.set(0, 1.49, -0.25); g.add(top);
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 16); wheelGeo.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [[-0.86, 1.35], [0.86, 1.35], [-0.86, -1.35], [0.86, -1.35]]) {
      if (opt.burnt && rnd() < 0.3) continue;
      const wh = new THREE.Mesh(wheelGeo, M.rubber); wh.position.set(wx, 0.36, wz); wh.castShadow = true; g.add(wh);
    }
    const bump = box(1.95, 0.22, 0.2, M.darkMetal); bump.position.set(0, 0.45, 2.17); g.add(bump);
    const bump2 = bump.clone(); bump2.position.z = -2.17; g.add(bump2);
    if (!opt.burnt) {
      for (const sx of [-0.65, 0.65]) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.05), opt.lights ? M.bulb : M.curb); hl.position.set(sx, 0.75, 2.16); g.add(hl);
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.05), M.redLight); tl.position.set(sx, 0.78, -2.16); g.add(tl);
      }
    }
    g.rotation.y = rot; if (opt.tilt) g.rotation.z = opt.tilt;
    add(g, true, x, 0, z);
    const q = Math.abs(Math.sin(rot)) > 0.7;
    collider(x, z, q ? 4.4 : 2.0, q ? 2.0 : 4.4, 1.5);
    return g;
  }
  car(4.6, 16, 0.05); car(-4.6, 26, Math.PI - 0.04, { lights: true }); car(4.5, 34, 0.02); car(-4.7, 44, Math.PI);
  car(1.5, -16, 0.5 - Math.PI / 2 + Math.PI / 2, { burnt: true }); car(4.7, -40, 0.03);
  car(18, 4.6, Math.PI / 2 + 0.03); car(30, -4.6, -Math.PI / 2); car(-20, -4.5, Math.PI / 2, { lights: true }); car(-34, 4.6, -Math.PI / 2 + 0.06); car(44, 3.5, 1.2);
  const burning = car(2, 22, 0.35, { burnt: true });
  car(-14.5, 23.6, 0, {}); // driveway
  // barricades at road ends
  for (const [x, z, r] of [[-3, 52, Math.PI / 2], [3.5, 53.5, Math.PI / 2 + 0.2], [52, 2, 0.1], [-52, -2.5, 0], [0, -53, Math.PI / 2]]) car(x, z, r, { burnt: rnd() < 0.5 });

  // bus (long vehicle)
  {
    const g = new THREE.Group();
    const bm = std({ map: canvasTex(256, 64, (gg, w, h) => { gg.fillStyle = '#d8d2c6'; gg.fillRect(0, 0, w, h); gg.fillStyle = '#b52418'; gg.fillRect(0, h * 0.55, w, h * 0.18); gg.fillStyle = '#0d1217'; for (let x = 8; x < w - 8; x += 26) gg.fillRect(x, h * 0.12, 20, h * 0.35); noise(gg, w, h, 900, 0.3); }), roughness: 0.5, metalness: 0.3 });
    const b = box(2.5, 2.9, 11, [bm, bm, M.roof, M.roof, M.glass, M.glass].length ? bm : bm); b.position.y = 1.85; g.add(b);
    const wg = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14); wg.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [[-1.2, 3.6], [1.2, 3.6], [-1.2, -3.6], [1.2, -3.6]]) { const wh = new THREE.Mesh(wg, M.rubber); wh.position.set(wx, 0.5, wz); g.add(wh); }
    g.rotation.y = 0.12; add(g, true, -3, 0, -30);
    collider(-3, -30, 3.6, 11.4, 3.3);
  }

  // ---------- barriers / checkpoint (Q4) ----------
  function jersey(x, z, rot, striped = true) {
    const shp = new THREE.Shape([new THREE.Vector2(-0.35, 0), new THREE.Vector2(0.35, 0), new THREE.Vector2(0.15, 0.3), new THREE.Vector2(0.12, 0.9), new THREE.Vector2(-0.12, 0.9), new THREE.Vector2(-0.15, 0.3)]);
    const geo = new THREE.ExtrudeGeometry(shp, { depth: 2, bevelEnabled: false }); geo.translate(0, 0, -1);
    const m = new THREE.Mesh(geo, striped ? M.barrier : M.jersey); m.castShadow = true; m.receiveShadow = true; m.rotation.y = rot;
    add(m, true, x, 0.0, z);
    const q = Math.abs(Math.sin(rot)) > 0.7; collider(x, z, q ? 2 : 0.7, q ? 0.7 : 2, 0.9);
  }
  for (let i = 0; i < 4; i++) jersey(-2.5 + i * 2.05, -8.8 + (i % 2) * 0.3, Math.PI / 2, true);
  for (let i = 0; i < 6; i++) jersey(12 + i * 2.1, -10.2, Math.PI / 2, i % 2 === 0);
  for (let i = 0; i < 6; i++) jersey(10.2, -14 - i * 2.1, 0, i % 2 === 1);
  jersey(-8.8, 11, 0, true); jersey(-8.8, 13.2, 0, true);
  // containers
  function container(x, z, rot, color, y = 0) {
    const mat = std({ map: T.container, color, roughness: 0.6, metalness: 0.5, bumpMap: T.container, bumpScale: 1 });
    const c = box(2.45, 2.6, 6.1, mat); c.rotation.y = rot; add(c, true, x, y + 1.3 + 0.12, z);
    if (y === 0) { const q = Math.abs(Math.sin(rot)) > 0.7; collider(x, z, q ? 6.1 : 2.45, q ? 2.45 : 6.1, 2.7); }
  }
  container(22, -22, 0, 0x8a3a22); container(22, -22, 0, 0x2a4a6a, 2.6); container(25.5, -22, 0, 0x3a5a3a);
  container(40, -18, Math.PI / 2, 0x6a6a6a); container(46, -30, 0, 0x8a3a22); container(16, -44, Math.PI / 2, 0x2a4a6a); container(16, -44, Math.PI / 2, 0x7a6a2a, 2.6);
  // gate wall with orange lit door
  {
    const wallB = box(20, 7, 2, wallMat); add(wallB, true, 38, 3.6, -54.5); collider(38, -54.5, 20, 2, 7);
    const doorTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#7a3a1c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3a1a0a'; g.lineWidth = 10; g.strokeRect(10, 10, w - 20, h - 20); g.beginPath(); g.moveTo(10, 10); g.lineTo(w - 10, h - 10); g.moveTo(w - 10, 10); g.lineTo(10, h - 10); g.stroke(); noise(g, w, h, 1500, 0.3); });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(7, 5), std({ map: doorTex, emissive: 0xff5a1a, emissiveIntensity: 0.35, emissiveMap: doorTex, roughness: 0.6, metalness: 0.4 }));
    add(door, false, 38, 2.6, -53.45);
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.4), M.barrier); add(stripe, false, 38, 5.4, -53.44);
  }
  // tent
  {
    const g = new THREE.Group();
    const tb = box(5, 2.2, 7, M.olive); tb.position.y = 1.1; g.add(tb);
    const sh = new THREE.Shape([new THREE.Vector2(-2.8, 0), new THREE.Vector2(2.8, 0), new THREE.Vector2(0, 1.6)]);
    const rg = new THREE.ExtrudeGeometry(sh, { depth: 7.4, bevelEnabled: false }); rg.translate(0, 0, -3.7);
    const roof = new THREE.Mesh(rg, M.olive); roof.position.y = 2.2; roof.castShadow = true; g.add(roof);
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (gg) => { gg.fillStyle = '#ddd'; gg.fillRect(0, 0, 64, 64); gg.fillStyle = '#b11'; gg.fillRect(24, 8, 16, 48); gg.fillRect(8, 24, 48, 16); }) }));
    cross.position.set(2.51, 1.4, 0); cross.rotation.y = Math.PI / 2; g.add(cross);
    add(g, true, 34, 0.12, -38); collider(34, -38, 5, 7, 3.5);
  }
  // sandbags (instanced)
  {
    const sg = new THREE.SphereGeometry(0.4, 10, 6); sg.scale(1, 0.38, 0.62);
    const inst = new THREE.InstancedMesh(sg, M.sand, 140); let k = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const wallOf = (x0, z0, along, n) => { for (let row = 0; row < 3; row++) for (let i = 0; i < n; i++) { const o = i * 0.75 + (row % 2) * 0.37; p.set(along ? x0 + o : x0, 0.27 + row * 0.27, along ? z0 : z0 + o); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (along ? 0 : Math.PI / 2) + rr(-0.15, 0.15)); m4.compose(p, q, s); if (k < 140) inst.setMatrixAt(k++, m4); } };
    wallOf(28, -30, true, 8); wallOf(14, -26, false, 7); wallOf(44, -42, true, 6);
    inst.count = k; inst.castShadow = true; inst.receiveShadow = true; scene.add(inst); solids.push(inst);
    collider(31, -30, 6.3, 0.9, 0.85); collider(14, -23.6, 0.9, 5.6, 0.85); collider(46, -42, 4.8, 0.9, 0.85);
  }
  // czech hedgehogs
  function hedgehog(x, z) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) { const b = box(0.18, 0.18, 2.2, M.darkMetal); b.rotation.set(i === 0 ? 0.8 : 0, i === 1 ? 0.8 : 0, i === 2 ? 0.8 : 0); if (i === 2) b.rotation.set(Math.PI / 2, 0.8, 0); g.add(b); }
    g.rotation.y = rnd() * 3; add(g, true, x, 0.7, z); collider(x, z, 1.4, 1.4, 1.4);
  }
  hedgehog(5, -24); hedgehog(-4, -45); hedgehog(28, -2.5); hedgehog(-28, 2.5); hedgehog(36, -48); hedgehog(48, -48);

  // ---------- lamps ----------
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.022, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const coneGeo = new THREE.ConeGeometry(3.2, 6.6, 20, 1, true); coneGeo.translate(0, -3.3, 0);
  function lamp(x, z, dirX, dirZ, broken = false) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 7, 8), M.metal); pole.position.y = 3.5; pole.castShadow = true; g.add(pole);
    const arm = box(0.08, 0.08, 1.6, M.metal); arm.position.set(0, 6.9, 0.75); g.add(arm);
    const head = box(0.45, 0.16, 0.7, M.darkMetal); head.position.set(0, 6.85, 1.45); g.add(head);
    const bulb = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.55), broken ? M.curb : M.bulb); bulb.rotation.x = Math.PI / 2; bulb.position.set(0, 6.76, 1.45); g.add(bulb);
    let cone = null;
    if (!broken) { cone = new THREE.Mesh(coneGeo, coneMat); cone.position.set(0, 6.75, 1.45); g.add(cone); }
    g.rotation.y = Math.atan2(dirX, dirZ);
    add(g, false, x, 0.12, z);
    solids.push(pole);
    collider(x, z, 0.3, 0.3, 7);
    const wp = new THREE.Vector3(0, 6.7, 1.45).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    if (!broken) lamps.push({ pos: wp, bulb, cone, flick: rnd() < 0.2 });
  }
  for (const z of [-46, -30, -14, 14, 30, 46]) { lamp(7.6, z, -1, 0, z === 30); lamp(-7.6, z + 8, 1, 0); }
  for (const x of [-46, -30, 22, 38]) { lamp(x, 7.6, 0, -1, x === -46); lamp(x + 8, -7.6, 0, 1); }
  // park lamps
  for (const [x, z] of [[-22, -22], [-22, -44], [-44, -22], [-35, -35]]) lamp(x, z, 1, 0);

  // floodlight towers (checkpoint)
  const floods = [];
  for (const [x, z, tx, tz] of [[20, -50, 30, -30], [50, -20, 32, -28]]) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 10, 8), M.metal); pole.position.y = 5; g.add(pole);
    const panel = box(2.4, 1.2, 0.3, M.darkMetal); panel.position.set(0, 10, 0); g.add(panel);
    const lg = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 8, 8) })); lg.position.set(0, 10, 0.16); g.add(lg);
    g.lookAt(tx, 10, tz); g.rotation.x = 0; g.rotation.y = Math.atan2(tx - x, tz - z);
    add(g, false, x, 0, z); solids.push(pole); collider(x, z, 0.4, 0.4, 10);
    floods.push({ pos: new THREE.Vector3(x, 10, z), target: new THREE.Vector3(tx, 0, tz) });
  }

  // traffic lights (blinking amber)
  const amberMat = new THREE.MeshBasicMaterial({ color: 0xffa020, toneMapped: false });
  for (const [x, z, r] of [[7, 7, -Math.PI * 0.75], [-7, -7, Math.PI * 0.25]]) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 5.5, 8), M.metal); pole.position.y = 2.75; g.add(pole);
    const arm = box(0.1, 0.1, 4, M.metal); arm.position.set(0, 5.3, 2); g.add(arm);
    const hb = box(0.35, 1.0, 0.3, M.darkMetal); hb.position.set(0, 4.7, 3.8); g.add(hb);
    const am = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), amberMat); am.position.set(0, 4.7, 3.96); g.add(am);
    const rd = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), M.curb); rd.position.set(0, 5.0, 3.96); g.add(rd);
    g.rotation.y = r; add(g, false, x, 0.12, z); solids.push(pole); collider(x, z, 0.3, 0.3, 5.5);
  }
  updaters.push((t) => { const k = Math.sin(t * 4) > 0 ? 3 : 0.05; amberMat.color.setRGB(k, k * 0.55, k * 0.08); });

  // ---------- trees, bushes, props ----------
  function tree(x, z, s = 1) {
    const g = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.22 * s, 3.2 * s, 7), M.trunk); tr.position.y = 1.6 * s; tr.castShadow = true; g.add(tr);
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(1.1, 1.6) * s, 1), pick(M.leaf));
      f.position.set(rr(-1, 1) * s, (3.2 + rr(0, 1.6)) * s, rr(-1, 1) * s); f.castShadow = true; f.receiveShadow = true; g.add(f);
    }
    add(g, false, x, 0.12, z); solids.push(tr); collider(x, z, 0.5 * s, 0.5 * s, 3);
  }
  function bush(x, z) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(0.5, 0.9), 1), pick(M.leaf)); b.scale.y = 0.7; b.castShadow = true; b.receiveShadow = true; add(b, false, x, 0.4, z); }
  for (const [x, z] of [[-30, -18], [-40, -28], [-28, -40], [-48, -40], [-40, -48], [-50, -30], [-18, -32], [-30, -50], [-46, -16]]) tree(x, z, rr(0.9, 1.3));
  for (const [x, z] of [[-11, 24], [-11, 38], [-24, 11], [-40, 11], [-11, 52], [11, 20], [11, 45], [20, 11], [-11, -20], [-11, -38], [24, -11]]) tree(x, z, rr(0.8, 1.05));
  for (let i = 0; i < 30; i++) bush(rr(-52, -14), rr(-52, -14));
  for (let i = 0; i < 10; i++) bush(rr(-24, -12), rr(12, 50));

  function bench(x, z, rot) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) { const s = box(1.8, 0.05, 0.12, M.wood); s.position.set(0, 0.45, i * 0.14 - 0.14); g.add(s); }
    const back = box(1.8, 0.4, 0.05, M.wood); back.position.set(0, 0.75, -0.24); back.rotation.x = -0.15; g.add(back);
    for (const lx of [-0.8, 0.8]) { const l = box(0.06, 0.45, 0.4, M.darkMetal); l.position.set(lx, 0.22, -0.05); g.add(l); }
    g.rotation.y = rot; add(g, true, x, 0.12, z); collider(x, z, Math.abs(Math.sin(rot)) > 0.7 ? 0.6 : 1.9, Math.abs(Math.sin(rot)) > 0.7 ? 1.9 : 0.6, 0.6);
  }
  bench(-22.2, -30, Math.PI / 2); bench(-22.2, -40, Math.PI / 2); bench(-30, -22.2, Math.PI); bench(-42, -22.2, Math.PI); bench(8, 24, -Math.PI / 2);
  function bin(x, z) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.9, 12), M.darkMetal); b.castShadow = true; add(b, true, x, 0.57, z); collider(x, z, 0.6, 0.6, 1); }
  bin(8, 10.5); bin(-8, -12); bin(8.2, 40); bin(-21, 8.2); bin(33, -8.3);
  function dumpster(x, z, rot) { const g = new THREE.Group(); const b = box(1.9, 1.3, 1.2, std({ color: 0x24442c, roughness: 0.6, metalness: 0.5 })); b.position.y = 0.75; g.add(b); const lid = box(2, 0.08, 1.3, M.darkMetal); lid.position.y = 1.45; lid.rotation.x = -0.2; g.add(lid); g.rotation.y = rot; add(g, true, x, 0.12, z); collider(x, z, 2.1, 2.1, 1.5); }
  dumpster(10.5, 20.3, 0); dumpster(20.5, 10.5, Math.PI / 2); dumpster(33.5, 21, 0);
  function hydrant(x, z) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.7, 10), std({ color: 0x8a1a12, roughness: 0.6 })); h.castShadow = true; add(h, true, x, 0.47, z); collider(x, z, 0.4, 0.4, 0.8); }
  hydrant(7.4, 20); hydrant(-7.4, -24); hydrant(16, 7.4);
  // newsstand kiosk in park
  { const k = box(3, 2.6, 2.4, std({ color: 0x2c4b38, roughness: 0.7 })); add(k, true, -28, 1.42, -28); collider(-28, -28, 3, 2.4, 2.6); const kr = box(3.6, 0.15, 3, M.roof); add(kr, false, -28, 2.8, -28); }
  // fountain
  { const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 0.6, 24), M.jersey); base.receiveShadow = true; add(base, true, -38, 0.42, -38);
    const water = new THREE.Mesh(new THREE.CircleGeometry(2.7, 24), std({ color: 0x0a1418, roughness: 0.05, metalness: 0.6 })); water.rotation.x = -Math.PI / 2; add(water, false, -38, 0.66, -38);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.8, 12), M.jersey); add(col, true, -38, 1.2, -38); collider(-38, -38, 6, 6, 0.75); }
  // debris & blood pools
  { const dg = new THREE.BoxGeometry(1, 1, 1); const inst = new THREE.InstancedMesh(dg, M.curb, 160); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < 160; i++) { p.set(rr(-50, 50), 0.05, rr(-50, 50)); if (rnd() < 0.6) { if (rnd() < 0.5) p.x = rr(-6, 6); else p.z = rr(-6, 6); } e.set(rr(0, 3), rr(0, 3), rr(0, 3)); q.setFromEuler(e); s.set(rr(0.05, 0.35), rr(0.03, 0.15), rr(0.05, 0.3)); m4.compose(p, q, s); inst.setMatrixAt(i, m4); }
    inst.castShadow = true; inst.receiveShadow = true; scene.add(inst);
    const bm = new THREE.MeshStandardMaterial({ map: T.blood, transparent: true, depthWrite: false, roughness: 0.2, polygonOffset: true, polygonOffsetFactor: -2 });
    for (let i = 0; i < 14; i++) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(rr(1, 2.5), rr(1, 2.5)), bm); pl.rotation.x = -Math.PI / 2; pl.rotation.z = rnd() * 3; add(pl, false, rr(-5, 5), 0.02, rr(-50, 50)); }
    const wet = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.05, metalness: 0.8, transparent: true, opacity: 0.7, polygonOffset: true, polygonOffsetFactor: -1 });
    for (let i = 0; i < 18; i++) { const pd = new THREE.Mesh(new THREE.CircleGeometry(rr(0.8, 2.2), 16), wet); pd.scale.y = rr(0.4, 1); pd.rotation.x = -Math.PI / 2; add(pd, false, rr(-5, 5), 0.015, rr(-50, 50)); }
  }

  // ---------- fire on burning car ----------
  const fireLight = new THREE.PointLight(0xff6a20, 60, 22, 1.6);
  fireLight.position.set(2, 2.2, 22); scene.add(fireLight);
  const fireMat = new THREE.SpriteMaterial({ map: T.glow, color: 0xff7a20, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const smokeMat = new THREE.SpriteMaterial({ map: T.smoke, color: 0x222222, depthWrite: false, transparent: true, opacity: 0.6 });
  const flames = [];
  for (let i = 0; i < 26; i++) { const sp = new THREE.Sprite(i < 18 ? fireMat.clone() : smokeMat.clone()); sp.userData = { t: rnd(), smoke: i >= 18 }; scene.add(sp); flames.push(sp); }
  updaters.push((t, dt) => {
    fireLight.intensity = 45 + Math.sin(t * 13) * 10 + Math.sin(t * 31) * 8 + rnd() * 6;
    for (const f of flames) {
      const u = f.userData; u.t += dt * (u.smoke ? 0.25 : 1.3); if (u.t > 1) { u.t = 0; u.ox = rr(-0.9, 0.9); u.oz = rr(-1.4, 1.4); }
      const k = u.t;
      if (u.smoke) { f.position.set(2 + (u.ox || 0) + k * 1.5, 1.6 + k * 9, 22 + (u.oz || 0)); f.scale.setScalar(1.5 + k * 5); f.material.opacity = 0.45 * (1 - k); }
      else { f.position.set(2 + (u.ox || 0) * (1 - k), 1.1 + k * 2.2, 22 + (u.oz || 0) * (1 - k)); f.scale.setScalar((1 - k) * 1.8 + 0.3); f.material.opacity = 1 - k; f.material.color.setHSL(0.03 + (1 - k) * 0.08, 1, 0.5); }
    }
  });
  void burning;

  // ---------- flickering signs / lamps ----------
  updaters.push((t) => {
    for (const f of flicker) { const on = Math.sin(t * 7 + f.t) > -0.85 && Math.sin(t * 23 + f.t * 3) > -0.95; f.mat.color.setScalar(on ? 1 : 0.15); }
  });

  // nav-relevant spawn points (road ends + alleys)
  const spawnPoints = [[0, 50], [-2, -49], [50, -2], [-50, 3], [20, 20], [-25, -25], [45, -10], [-12, 52], [30, -48], [-50, -45], [50, 50], [-30, 52]].map(([x, z]) => new THREE.Vector3(x, 0, z));

  return {
    colliders, solids, lamps, floods, spawnPoints, textures: T,
    update(t, dt) { for (const u of updaters) u(t, dt); },
    baseGround(x, z) { return (Math.abs(x) < 6 || Math.abs(z) < 6) ? 0 : 0.12; },
  };
}
