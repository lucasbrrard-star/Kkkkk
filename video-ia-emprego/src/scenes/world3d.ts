import * as THREE from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {camV, camZ} from '../lib/cameraCore';
import {clamp, inOutCubic, inOutSine, lerp, outCubic, prog, seeded} from '../lib/ease';

// Mundo automatizado: cidade-servidor infinita, avenida de dados e o núcleo de IA no horizonte.
// Renderização determinística: tudo depende apenas de t (segundos).

const W = 1080;
const H = 1920;
const FOG = new THREE.Color('#071225');
const DENSITY = 0.0021;
const CORE = new THREE.Vector3(0, 100, -1150);

type World = {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  uniforms: {uTime: {value: number}; camPos: {value: THREE.Vector3}};
  trails: THREE.InstancedMesh;
  trailData: {x: number; y: number; z0: number; len: number; sp: number; dir: number}[];
  drones: THREE.Points;
  droneData: Float32Array;
  rings: THREE.Mesh[];
  zoom: ShaderPass;
  canvas: HTMLCanvasElement;
  lastT: number;
};

let world: World | null = null;

const fogChunk = /* glsl */ `
  uniform vec3 uFog; uniform float uDensity; uniform vec3 camPos;
  vec3 applyFog(vec3 col, vec3 w){ float d = length(w - camPos); float f = 1.0 - exp(-uDensity*uDensity*d*d); return mix(col, uFog, f); }
`;

const makeGlowTexture = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.15, 'rgba(180,240,255,0.75)');
  grd.addColorStop(0.4, 'rgba(80,180,255,0.22)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

const build = (): World => {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, alpha: false});
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(66, W / H, 0.5, 4000);
  const uniforms = {uTime: {value: 0}, camPos: {value: new THREE.Vector3()}};
  const fogU = {uFog: {value: FOG}, uDensity: {value: DENSITY}};
  const r = seeded(42);

  // ---- céu
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(3000, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {coreDir: {value: CORE.clone().normalize()}},
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 coreDir; varying vec3 vDir;
        void main(){
          float h = vDir.y;
          vec3 top = vec3(0.004,0.008,0.02);
          vec3 hor = vec3(0.03,0.07,0.14);
          vec3 col = mix(hor, top, smoothstep(-0.05, 0.5, h));
          float g = max(dot(normalize(vDir), normalize(coreDir)), 0.0);
          col += vec3(0.12,0.45,0.75) * pow(g, 30.0) * 0.6;
          col += vec3(0.05,0.18,0.32) * pow(g, 8.0) * 0.25;
          col += vec3(0.06,0.14,0.26) * exp(-abs(h - 0.02) * 22.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  sky.renderOrder = -10;
  scene.add(sky);

  // ---- chão com grade e pulsos de dados
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(8000, 8000),
    new THREE.ShaderMaterial({
      uniforms: {...uniforms, ...fogU},
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime; ${fogChunk} varying vec3 vW;
        float gl(float x, float w){ float f = abs(fract(x - 0.5) - 0.5) / fwidth(x); return 1.0 - min(f / w, 1.0); }
        float h1(float n){ return fract(sin(n*12.9898)*43758.5453); }
        void main(){
          vec2 p = vW.xz;
          vec3 col = vec3(0.008,0.014,0.026);
          float gx = gl(p.x/20.0, 1.2), gz = gl(p.y/20.0, 1.2);
          col += vec3(0.08,0.4,0.65) * max(gx, gz) * 0.35;
          float ix = floor(p.x/20.0 + 0.5);
          float ph = fract(p.y*0.0035 + uTime*0.55 + h1(ix));
          col += vec3(0.5,0.95,1.0) * gx * smoothstep(0.93, 1.0, ph) * 1.4;
          float iz = floor(p.y/20.0 + 0.5);
          float ph2 = fract(p.x*0.0035 - uTime*0.45 + h1(iz+7.0));
          col += vec3(0.5,0.95,1.0) * gz * smoothstep(0.95, 1.0, ph2) * 1.0;
          float av = 1.0 - smoothstep(14.0, 24.0, abs(p.x));
          col += vec3(0.02,0.08,0.14) * av;
          gl_FragColor = vec4(applyFog(col, vW), 1.0);
        }`,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // ---- prédios (instanciados)
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mats: THREE.Matrix4[] = [];
  const rand: number[] = [];
  const m = new THREE.Matrix4();
  for (let gx = -34; gx <= 34; gx++) {
    for (let gz = -75; gz <= 12; gz++) {
      const x = gx * 22;
      const z = gz * 22;
      if (Math.abs(x) < 26) continue;
      const nearAv = Math.exp(-Math.abs(x) / 90);
      const toCore = Math.exp(-Math.hypot(x - CORE.x, z - CORE.z) / 500);
      const sub = r() > 0.55 ? 2 : 1;
      for (let s = 0; s < sub; s++) {
        const fw = sub === 1 ? 10 + r() * 7 : 6 + r() * 3;
        const fd = 10 + r() * 7;
        const h = 8 + 46 * Math.pow(r(), 2.0) + 70 * nearAv * r() + 160 * toCore * r();
        const ox = sub === 1 ? 0 : (s === 0 ? -5 : 5);
        m.compose(new THREE.Vector3(x + ox + (r() - 0.5) * 2, 0, z + (r() - 0.5) * 2), new THREE.Quaternion(), new THREE.Vector3(fw, h, fd));
        mats.push(m.clone());
        rand.push(r());
      }
    }
  }
  const city = new THREE.InstancedMesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: {...uniforms, ...fogU},
      vertexShader: `attribute float aRand; varying vec3 vW; varying vec3 vN; varying float vR; varying float vH;
        void main(){
          vec4 w = modelMatrix * instanceMatrix * vec4(position,1.0);
          vW = w.xyz; vR = aRand; vH = length(instanceMatrix[1].xyz);
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `uniform float uTime; ${fogChunk} varying vec3 vW; varying vec3 vN; varying float vR; varying float vH;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        void main(){
          vec3 col = vec3(0.014,0.022,0.04);
          float side = 1.0 - step(0.5, abs(vN.y));
          float u = abs(vN.x) > 0.5 ? vW.z : vW.x;
          vec2 g = vec2(u/1.5, vW.y/2.1);
          vec2 cell = floor(g); vec2 f = fract(g);
          float win = step(0.2, f.x)*step(f.x,0.8)*step(0.28,f.y)*step(f.y,0.76);
          float lit = step(0.58 - vR*0.3, h21(cell + vR*91.7));
          float fl = 0.8 + 0.2*sin(uTime*(1.5+h21(cell)*5.0) + h21(cell*1.7)*20.0);
          vec3 wc = mix(vec3(0.3,0.8,1.0), vec3(0.85,0.95,1.0), h21(cell*3.1));
          wc = mix(wc, vec3(1.0,0.66,0.32), step(0.94, h21(cell*7.3)));
          col += wc * win * lit * side * 0.78 * fl;
          float edge = smoothstep(vH - 0.45, vH - 0.05, vW.y) * side;
          col += vec3(0.25,0.8,1.0) * edge * 1.5 * step(0.35, vR);
          float base = (1.0 - smoothstep(0.0, 6.0, vW.y)) * side;
          col += vec3(0.03,0.12,0.2) * base;
          col += vec3(0.01,0.025,0.05) * step(0.5, vN.y);
          gl_FragColor = vec4(applyFog(col, vW), 1.0);
        }`,
    }),
    mats.length,
  );
  mats.forEach((mm, i) => city.setMatrixAt(i, mm));
  city.geometry.setAttribute('aRand', new THREE.InstancedBufferAttribute(new Float32Array(rand), 1));
  city.frustumCulled = false;
  scene.add(city);

  // ---- feixes verticais de dados saindo de alguns prédios
  const beamGeo = new THREE.CylinderGeometry(0.6, 0.6, 1, 8, 1, true);
  beamGeo.translate(0, 0.5, 0);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {...uniforms},
    vertexShader: `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying float vY; void main(){ float a = (1.0 - vY) * (0.55 + 0.45*sin(vY*30.0 - uTime*6.0)); gl_FragColor = vec4(vec3(0.3,0.85,1.0)*a*0.7, a); }`,
  });
  const beams = new THREE.InstancedMesh(beamGeo, beamMat, 40);
  for (let i = 0; i < 40; i++) {
    const side = r() > 0.5 ? 1 : -1;
    const x = side * (40 + r() * 400);
    const z = 40 - r() * 1100;
    m.compose(new THREE.Vector3(x, 20 + r() * 30, z), new THREE.Quaternion(), new THREE.Vector3(1 + r(), 300 + r() * 400, 1 + r()));
    beams.setMatrixAt(i, m);
  }
  beams.frustumCulled = false;
  scene.add(beams);

  // ---- rastros de luz na avenida (tráfego de dados)
  const trailData = Array.from({length: 260}, () => {
    const lane = [-15, -10, -5, 5, 10, 15][Math.floor(r() * 6)];
    const air = r() > 0.6;
    return {
      x: lane + (r() - 0.5) * 1.5,
      y: air ? 48 + r() * 50 : 0.6 + r() * 0.6,
      z0: r() * 1400,
      len: 6 + r() * 18,
      sp: 60 + r() * 120,
      dir: lane < 0 ? 1 : -1,
    };
  });
  const trails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.28, 1), new THREE.MeshBasicMaterial({color: 0xffffff, fog: false}), trailData.length);
  const tcol = new THREE.Color();
  trailData.forEach((d, i) => {
    tcol.setRGB(...((r() > 0.82 ? [2.6, 1.4, 0.5] : r() > 0.5 ? [0.8, 2.0, 2.6] : [1.6, 2.1, 2.4]) as [number, number, number]));
    trails.setColorAt(i, tcol);
  });
  trails.frustumCulled = false;
  scene.add(trails);

  // ---- enxame de drones (pontos) indo ao núcleo
  const N = 900;
  const droneData = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) {
    droneData[i * 6] = (r() - 0.5) * 900;
    droneData[i * 6 + 1] = 45 + r() * 110;
    droneData[i * 6 + 2] = 200 - r() * 200;
    droneData[i * 6 + 3] = r();
    droneData[i * 6 + 4] = 30 + r() * 40;
    droneData[i * 6 + 5] = r();
  }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const drones = new THREE.Points(
    dGeo,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {...uniforms, ...fogU},
      vertexShader: `varying float vF; uniform vec3 camPos; uniform float uDensity;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); float d = -mv.z; gl_PointSize = clamp(900.0/d, 1.5, 9.0); vF = exp(-uDensity*uDensity*d*d*0.6); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying float vF; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); gl_FragColor = vec4(vec3(0.6,0.95,1.0)*a*1.1*vF, a*vF); }`,
    }),
  );
  drones.frustumCulled = false;
  scene.add(drones);

  // ---- núcleo de IA
  const coreGroup = new THREE.Group();
  coreGroup.position.copy(CORE);
  const coreSphere = new THREE.Mesh(new THREE.SphereGeometry(34, 48, 24), new THREE.MeshBasicMaterial({color: new THREE.Color(1.8, 3.2, 4.0), fog: false}));
  coreGroup.add(coreSphere);
  const rings: THREE.Mesh[] = [];
  [80, 112, 150, 196].forEach((R, i) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(R, i === 3 ? 0.9 : 1.6, 8, 220),
      new THREE.MeshBasicMaterial({color: i === 2 ? new THREE.Color(2.4, 1.4, 0.55) : new THREE.Color(0.8, 2.2, 3.0), fog: false}),
    );
    rings.push(ring);
    coreGroup.add(ring);
  });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({map: makeGlowTexture(), color: new THREE.Color(0.22, 0.5, 0.8), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true}));
  glow.scale.set(520, 520, 1);
  coreGroup.add(glow);
  const beamCore = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 14, 3000, 32, 1, true),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; void main(){ float a = pow(1.0 - abs(vUv.x*2.0-1.0), 0.0) * smoothstep(1.0, 0.45, vUv.y) * smoothstep(0.42, 0.5, vUv.y); gl_FragColor = vec4(vec3(0.5,0.9,1.0)*a*0.8, a); }`,
    }),
  );
  coreGroup.add(beamCore);
  scene.add(coreGroup);

  // ---- poeira próxima à câmera
  const dustN = 500;
  const dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    dustPos[i * 3] = (r() - 0.5) * 160;
    dustPos[i * 3 + 1] = r() * 90;
    dustPos[i * 3 + 2] = 220 - r() * 300;
  }
  const dGeo2 = new THREE.BufferGeometry();
  dGeo2.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dGeo2,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = clamp(260.0/(-mv.z), 1.0, 14.0); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)) * 0.35; gl_FragColor = vec4(vec3(0.7,0.9,1.0)*a, a); }`,
    }),
  );
  dust.frustumCulled = false;
  scene.add(dust);

  // ---- pós-processamento
  const rt = new THREE.WebGLRenderTarget(W, H, {type: THREE.HalfFloatType, samples: 4});
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.62, 0.42, 0.9));
  const zoom = new ShaderPass({
    uniforms: {tDiffuse: {value: null}, uStrength: {value: 0}, uCenter: {value: new THREE.Vector2(0.5, 0.45)}},
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uStrength; uniform vec2 uCenter; varying vec2 vUv;
      void main(){
        vec2 dir = vUv - uCenter; vec4 acc = vec4(0.0); float tot = 0.0;
        for (int i = 0; i < 12; i++){ float s = float(i)/11.0; float w = 1.0 - s*0.5; acc += texture2D(tDiffuse, vUv - dir*s*uStrength) * w; tot += w; }
        gl_FragColor = acc / tot;
      }`,
  });
  composer.addPass(zoom);
  composer.addPass(new OutputPass());

  return {renderer, composer, scene, camera, uniforms, trails, trailData, drones, droneData, rings, zoom, canvas, lastT: -1};
};

export const cam3D = (t: number) => {
  const travel = camZ(t) - camZ(5.9);
  const z = 175 - 3.1 * travel - 7.5 * (t - 5.9);
  const rise = inOutCubic(prog(t, 6.25, 8.6));
  const y = 30 + 26 * rise;
  const pitch = lerp(-0.3, 0.1, inOutSine(prog(t, 6.15, 8.45)));
  const yaw = 0.05 * Math.sin((t - 6) * 0.7) - 0.03;
  const roll = lerp(-0.06, 0.0, outCubic(prog(t, 6.0, 7.6)));
  const speed = 3.1 * camV(t) + 7.5;
  return {x: 2 * Math.sin(t * 0.6), y, z, pitch, yaw, roll, speed};
};

export const renderWorld = (t: number): HTMLCanvasElement => {
  if (!world) world = build();
  const w = world;
  if (w.lastT === t) return w.canvas;
  w.lastT = t;
  const c = cam3D(t);
  w.camera.position.set(c.x, c.y, c.z);
  w.camera.rotation.set(0, 0, 0);
  w.camera.rotation.order = 'YXZ';
  w.camera.rotation.y = c.yaw;
  w.camera.rotation.x = c.pitch;
  w.camera.rotation.z = c.roll;
  w.camera.updateMatrixWorld();
  w.uniforms.uTime.value = t;
  w.uniforms.camPos.value.copy(w.camera.position);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  w.trailData.forEach((d, i) => {
    const L = 1400;
    let z = ((d.z0 + d.dir * d.sp * t) % L + L) % L;
    z = 220 - z;
    m.compose(new THREE.Vector3(d.x, d.y, z), q, new THREE.Vector3(1, 1, d.len));
    w.trails.setMatrixAt(i, m);
  });
  w.trails.instanceMatrix.needsUpdate = true;

  const pos = w.drones.geometry.getAttribute('position') as THREE.BufferAttribute;
  const N = pos.count;
  for (let i = 0; i < N; i++) {
    const sx = w.droneData[i * 6], sy = w.droneData[i * 6 + 1], sz = w.droneData[i * 6 + 2];
    const ph = w.droneData[i * 6 + 3], sp = w.droneData[i * 6 + 4], wob = w.droneData[i * 6 + 5];
    const u = (ph + (t * sp) / 1300) % 1;
    const x = lerp(sx, CORE.x + (wob - 0.5) * 160, u * u) + Math.sin(t * 2 + i) * 2;
    const y = lerp(sy, CORE.y + (wob - 0.5) * 120, u) + Math.sin(t * 3 + i * 0.7) * 1.5;
    const z = lerp(sz, CORE.z + 60, u);
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;

  w.rings.forEach((ring, i) => {
    ring.rotation.set(0.9 + i * 0.35 + Math.sin(t * 0.3 + i) * 0.1, t * (0.25 + i * 0.12) * (i % 2 ? -1 : 1), i * 0.6);
  });

  w.zoom.uniforms.uStrength.value = clamp((c.speed - 30) / 140) * 0.035;
  w.composer.render();
  return w.canvas;
};
