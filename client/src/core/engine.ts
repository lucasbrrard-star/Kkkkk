// Núcleo de renderização: renderer WebGL2, cena, câmera, sol com sombras que seguem
// o jogador, céu atmosférico (cubemap gerado uma vez) usado também como iluminação
// de ambiente PBR, neblina, qualidade adaptativa e laço principal.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { FrameMonitor, guessLevel, PRESETS, QualityLevel, QualityPreset, QualitySetting } from './quality';
import { Post, installGrading } from '../gfx/post';

export type Tick = (dt: number, t: number) => void;

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  post: Post;
  monitor = new FrameMonitor();
  setting: QualitySetting = 'auto';
  level: QualityLevel = 'media';
  preset: QualityPreset = PRESETS.media;
  sunDir = new THREE.Vector3();
  private ticks: Tick[] = [];
  private last = performance.now();
  private elapsed = 0;
  onQuality?: (level: QualityLevel) => void;
  focus = new THREE.Vector3();        // ponto que a sombra deve cobrir (jogador)

  constructor(container: HTMLElement, opts: { antialias?: boolean } = {}) {
    installGrading();
    // MSAA nativo (barato em GPUs de celular "tile-based"); desligado se o jogador escolheu "baixa"
    this.renderer = new THREE.WebGLRenderer({ antialias: opts.antialias ?? true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.CustomToneMapping;
    this.renderer.info.autoReset = false;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.15, 400);

    // céu e sol (fim de tarde)
    const elevation = 16, azimuth = 215;
    const phi = THREE.MathUtils.degToRad(90 - elevation), theta = THREE.MathUtils.degToRad(azimuth);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    this.sun = new THREE.DirectionalLight(0xffe2c0, 3.1);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, 0.35);
    this.scene.add(this.hemi);
    this.buildSky();
    this.post = new Post(this.renderer, this.scene, this.camera);

    window.addEventListener('resize', () => this.resize());
    this.level = guessLevel(this.renderer);
    this.applyQuality(this.level);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Céu de Preetham → cubemap (fundo) + PMREM (iluminação/reflexos PBR). Feito uma vez. */
  private buildSky() {
    const sky = new Sky();
    sky.scale.setScalar(1000);
    const u = sky.material.uniforms;
    u['turbidity'].value = 3.4;
    u['rayleigh'].value = 1.25;
    u['mieCoefficient'].value = 0.005;
    u['mieDirectionalG'].value = 0.82;
    u['sunPosition'].value.copy(this.sunDir);
    const skyScene = new THREE.Scene();
    skyScene.add(sky);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(skyScene, 0, 0.1, 1100);
    this.scene.environment = env.texture;
    const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cubeCam = new THREE.CubeCamera(1, 1100, cubeRT);
    cubeCam.update(this.renderer, skyScene);
    this.scene.background = cubeRT.texture;
    this.scene.backgroundIntensity = 0.9;
    pmrem.dispose();
    this.scene.fog = new THREE.Fog(0xd9d6d0, 90, 300);
  }

  setQuality(s: QualitySetting) {
    this.setting = s;
    this.applyQuality(s === 'auto' ? guessLevel(this.renderer) : s);
  }

  applyQuality(level: QualityLevel) {
    this.level = level;
    this.preset = PRESETS[level];
    const p = this.preset;
    const shadowsChanged = this.renderer.shadowMap.enabled !== p.shadows;
    this.renderer.shadowMap.enabled = p.shadows;
    this.renderer.shadowMap.type = level === 'alta' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.sun.castShadow = p.shadows;
    this.sun.shadow.mapSize.set(p.shadowMap, p.shadowMap);
    this.sun.shadow.map?.dispose(); this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    const cam = this.sun.shadow.camera;
    cam.left = -p.shadowRange; cam.right = p.shadowRange; cam.top = p.shadowRange; cam.bottom = -p.shadowRange;
    cam.near = 1; cam.far = 260; cam.updateProjectionMatrix();
    this.camera.far = p.far; this.camera.updateProjectionMatrix();
    (this.scene.fog as THREE.Fog).far = p.far * 0.95;
    (this.scene.fog as THREE.Fog).near = p.far * 0.3;
    if (shadowsChanged) this.scene.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true)); });
    this.monitor.scale = 1;
    this.resize();
    this.post.configure(p);
    this.onQuality?.(level);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.preset.pixelRatio) * this.monitor.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.resize();
  }

  onTick(f: Tick) { this.ticks.push(f); }

  private frame() {
    const now = performance.now();
    const dtMs = Math.min(100, now - this.last);
    this.last = now;
    const dt = dtMs / 1000;
    this.elapsed += dt;
    for (const f of this.ticks) f(dt, this.elapsed);
    // sombra acompanha o foco (com alinhamento a texels para não tremer)
    const range = this.preset.shadowRange;
    const texel = (range * 2) / this.preset.shadowMap;
    const fx = Math.round(this.focus.x / texel) * texel, fz = Math.round(this.focus.z / texel) * texel;
    this.sun.position.set(fx + this.sunDir.x * 120, this.sunDir.y * 120, fz + this.sunDir.z * 120);
    this.sun.target.position.set(fx, 0, fz);
    this.renderer.info.reset();
    this.post.render(dt);
    const before = this.monitor.scale;
    const change = this.monitor.update(dtMs, this.preset);
    if (Math.abs(this.monitor.scale - before) > 0.001) this.resize();
    if (change && this.setting === 'auto') {
      const order: QualityLevel[] = ['baixa', 'media', 'alta'];
      const i = order.indexOf(this.level) + (change === 'up' ? 1 : -1);
      if (i >= 0 && i < order.length) this.applyQuality(order[i]);
    }
  }
}
