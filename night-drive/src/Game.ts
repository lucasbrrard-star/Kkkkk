import * as THREE from 'three';
import { CONFIG, QUALITY, type QualityLevel, type QualityPreset } from './config';
import { Input } from './core/Input';
import { clamp } from './core/math';
import { World, FOG_COLOR, FOG_DENSITY } from './world/World';
import { CarModel } from './vehicle/CarModel';
import { VehiclePhysics } from './vehicle/VehiclePhysics';
import { ChaseCamera, type CameraMode } from './camera/ChaseCamera';
import { PlanarReflection, LAYER_NO_REFLECT } from './render/PlanarReflection';
import { PostFX } from './render/PostFX';
import { Environment } from './render/Environment';
import { LightPool } from './render/LightPool';

export type GameState = 'loading' | 'title' | 'playing' | 'paused';

export interface GameEvents {
  onState?: (s: GameState) => void;
  onImpact?: (speed: number) => void;
  onFrame?: (g: Game, dt: number) => void;
}

/** Owns the renderer, scene, systems and the main loop. */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly input = new Input();
  readonly physics = new VehiclePhysics();
  readonly chase: ChaseCamera;
  readonly world = new World();
  car!: CarModel;
  post!: PostFX;
  reflection!: PlanarReflection;
  env!: Environment;
  lightPool!: LightPool;
  state: GameState = 'loading';
  quality: QualityLevel;
  preset: QualityPreset;
  lights = true;
  events: GameEvents = {};
  fps = 60;
  /** Dynamic resolution factor (auto quality). */
  resScale = 1;
  autoQuality = true;
  /** When true the chase camera is not updated (screenshots / debugging). */
  freeCamera = false;

  private clock = new THREE.Timer();
  private acc = 0;
  private time = 0;
  private prev = { x: 0, z: 0, h: 0, y: 0 };
  private raf = 0;
  private frameTimes: number[] = [];
  private lastResCheck = 0;
  private readonly carVel = new THREE.Vector3();
  private readonly tmpV = new THREE.Vector3();
  private impactCooldown = 0;
  private disposed = false;
  private readonly onResize = () => this.resize();

  constructor(private readonly container: HTMLElement, quality: QualityLevel) {
    this.quality = quality;
    this.preset = QUALITY[quality];
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.preset.pixelRatio));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.NoToneMapping; // done in post
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);
    this.chase = new ChaseCamera(container.clientWidth / Math.max(1, container.clientHeight));
    this.chase.camera.layers.enable(LAYER_NO_REFLECT);
    this.scene.fog = new THREE.FogExp2(FOG_COLOR.getHex(), FOG_DENSITY);
    this.scene.background = FOG_COLOR.clone();
    window.addEventListener('resize', this.onResize);
  }

  async init(onProgress: (p: number, label: string) => void) {
    onProgress(0.02, 'Preparando renderizador');
    this.reflection = new PlanarReflection(this.preset.reflection || 0.35);
    this.reflection.enabled = this.preset.reflection > 0;
    this.env = new Environment(this.renderer);
    this.env.setDynamic(this.preset.envUpdate > 0, this.scene);
    this.scene.environmentIntensity = 0.85;

    // ambient night lighting: dim purple sky, near-black ground bounce, faint moon
    this.scene.add(new THREE.HemisphereLight(0x3a3360, 0x0a0806, 0.35));
    const moon = new THREE.DirectionalLight(0x8a96c8, 0.18);
    moon.position.set(-80, 140, -60);
    this.scene.add(moon);

    onProgress(0.08, 'Carregando cidade');
    await this.world.init(this.reflection.target.texture, this.preset.rain, (p) => onProgress(0.08 + p * 0.5, 'Construindo a cidade'));
    this.world.groundMat.uniforms.uReflectOn.value = this.reflection.enabled ? 1 : 0;
    this.scene.add(this.world.group);
    this.lightPool = new LightPool(this.world.props.lampLights, this.preset.pointLights);
    this.scene.add(this.lightPool.group);

    onProgress(0.6, 'Carregando o carro');
    const base = import.meta.env.BASE_URL;
    this.car = await CarModel.load(`${base}models/car.glb`, `${base}models/car.json`, (p) => onProgress(0.6 + p * 0.3, 'Carregando o carro'));
    this.scene.add(this.car.root);
    this.resetCar();

    this.post = new PostFX(this.renderer, this.scene, this.chase.camera, this.preset.msaa);
    this.post.setBloom(this.preset.bloom);
    this.resize();

    onProgress(0.95, 'Compilando shaders');
    // warm-up: compile every material once so the first frames do not stutter
    this.updateWorld(0.016);
    this.chase.update(0.016, this.chaseTarget());
    await this.renderer.compileAsync(this.scene, this.chase.camera).catch(() => this.renderer.compile(this.scene, this.chase.camera));
    this.input.on('camera', () => this.cycleCamera());
    this.input.on('reset', () => { if (this.state === 'playing') this.resetCar(); });
    this.input.on('lights', () => { this.lights = !this.lights; });
    onProgress(1, 'Pronto');
    this.setState('title');
    this.loop();
  }

  setState(s: GameState) {
    this.state = s;
    this.input.enabled = s === 'playing';
    if (s === 'playing') this.chase.snap();
    this.events.onState?.(s);
  }

  start() { this.setState('playing'); }
  pause() { if (this.state === 'playing') this.setState('paused'); }
  resume() { if (this.state === 'paused') this.setState('playing'); }
  togglePause() { if (this.state === 'playing') this.pause(); else if (this.state === 'paused') this.resume(); }

  cycleCamera(): CameraMode { return this.chase.next(); }

  resetCar() {
    const s = this.world.city.spawn;
    // restart at the nearest lane centre to where the car is, facing along the road
    this.physics.reset(s.x, s.z, s.heading, (x, z) => this.world.city.groundHeight(x, z));
    this.prev = { x: s.x, z: s.z, h: s.heading, y: this.physics.y };
    this.chase.snap();
  }

  setQuality(q: QualityLevel) {
    this.quality = q;
    this.preset = QUALITY[q];
    this.resScale = 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.preset.pixelRatio));
    this.reflection.scale = this.preset.reflection || 0.35;
    this.reflection.enabled = this.preset.reflection > 0;
    this.world.groundMat.uniforms.uReflectOn.value = this.reflection.enabled ? 1 : 0;
    this.world.rain.setCount(this.preset.rain);
    this.env.setDynamic(this.preset.envUpdate > 0, this.scene);
    this.post.setBloom(this.preset.bloom);
    this.post.setMultisampling(this.preset.msaa);
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const pr = Math.min(window.devicePixelRatio, this.preset.pixelRatio) * this.resScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.chase.camera.aspect = w / Math.max(1, h);
    this.chase.camera.updateProjectionMatrix();
    if (this.post) this.post.setSize(w, h);
    if (this.reflection) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.reflection.setSize(size.x, size.y);
    }
  }

  private chaseTarget() {
    const p = this.physics;
    return { x: this.car?.root.position.x ?? p.x, y: p.y, z: this.car?.root.position.z ?? p.z, heading: this.car?.root.rotation.y ?? p.heading, vx: p.vx, vz: p.vz, speed: p.speed, forwardSpeed: p.forwardSpeed, yawRate: p.yawRate };
  }

  private stepPhysics(dt: number) {
    const H = 1 / CONFIG.physics.hz;
    this.acc += dt;
    let steps = 0;
    const ground = (x: number, z: number) => this.world.city.groundHeight(x, z);
    const inp = this.input.update(dt);
    while (this.acc >= H && steps < 8) {
      this.prev = { x: this.physics.x, z: this.physics.z, h: this.physics.heading, y: this.physics.y };
      this.physics.step(H, inp, ground);
      const impact = this.world.collision.resolveCar(this.physics, this.car.halfSize.x - 0.02, this.car.halfSize.y - 0.05);
      if (impact && impact.speed > 1.2 && this.impactCooldown <= 0) {
        this.chase.addShake(clamp(impact.speed / 14, 0.1, 1));
        this.events.onImpact?.(impact.speed);
        this.impactCooldown = 0.25;
      }
      if (this.physics.curbHit > 0) this.chase.addShake(0.12);
      this.acc -= H;
      steps++;
    }
    if (steps === 8) this.acc = 0;
    this.impactCooldown -= dt;
  }

  /** Runs the fixed-step simulation for `seconds` with a given input (frame-rate independent). */
  simulate(seconds: number, inp: { throttle: number; brake: number; steer: number; handbrake: boolean }) {
    const H = 1 / CONFIG.physics.hz;
    const ground = (x: number, z: number) => this.world.city.groundHeight(x, z);
    let maxImpact = 0;
    for (let t = 0; t < seconds; t += H) {
      this.physics.step(H, inp, ground);
      const hit = this.world.collision.resolveCar(this.physics, this.car.halfSize.x - 0.02, this.car.halfSize.y - 0.05);
      if (hit) maxImpact = Math.max(maxImpact, hit.speed);
    }
    this.prev = { x: this.physics.x, z: this.physics.z, h: this.physics.heading, y: this.physics.y };
    this.acc = 0;
    return { kmh: this.physics.kmh, x: this.physics.x, z: this.physics.z, heading: this.physics.heading, impact: maxImpact, gear: this.physics.gear };
  }

  private updateWorld(dt: number) {
    const p = this.physics;
    const a = this.acc * CONFIG.physics.hz; // interpolation factor between physics states
    const x = this.prev.x + (p.x - this.prev.x) * a;
    const z = this.prev.z + (p.z - this.prev.z) * a;
    const h = this.prev.h + (p.heading - this.prev.h) * a;
    this.car.root.position.set(x, p.y, z);
    this.car.root.rotation.y = h;
    this.car.update(dt, {
      speed: p.forwardSpeed, steer: p.steer, brake: p.brakeLight, reverse: p.gear === -1 && p.forwardSpeed < -0.2,
      lights: this.lights, pitch: p.pitch, roll: p.roll, wheelSpin: p.wheelSpin, suspension: p.suspension,
    });
    this.carVel.set(p.vx, 0, p.vz);
    // ground shader: headlight / tail light / contact shadow uniforms
    const u = this.world.groundMat.uniforms;
    const hl = this.car.headlights;
    hl[0].getWorldPosition(u.uHeadPos.value[0]);
    hl[1].getWorldPosition(u.uHeadPos.value[1]);
    u.uHeadDir.value.set(Math.sin(h), -0.06, Math.cos(h)).normalize();
    u.uHeadColor.value.setRGB(0.85, 0.9, 1).multiplyScalar(this.lights ? 1 : 0);
    this.car.tailLight.getWorldPosition(u.uTailPos.value);
    u.uTailColor.value.copy(this.car.tailLight.color).multiplyScalar(this.car.tailLight.intensity * 0.6);
    u.uCars.value[0].set(x, z, Math.sin(h), Math.cos(h));
    u.uCarCount.value = 1;
    this.world.update(this.time, dt, this.chase.camera.position, this.carVel);
    this.lightPool.update(this.tmpV.set(x + Math.sin(h) * 6, 0, z + Math.cos(h) * 6));
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.clock.update();
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.time += dt;
    if (this.state === 'playing') this.stepPhysics(dt);
    this.updateWorld(dt);
    if (this.state === 'playing' || this.state === 'paused') {
      this.chase.occlusion = (ax, az, bx, bz, y) => this.world.collision.raycastBuildings(ax, az, bx, bz, y, this.world.heightOf);
      if (this.state === 'playing' && !this.freeCamera) this.chase.update(dt, this.chaseTarget());
    } else if (!this.freeCamera) {
      this.chase.orbit(dt, this.car.root.position);
    }
    this.render(dt);
    this.events.onFrame?.(this, dt);
    this.measure(dt);
  };

  render(dt: number) {
    const cam = this.chase.camera;
    cam.updateMatrixWorld();
    this.env.update(this.scene, this.car.root.position, this.preset.envUpdate, this.car.root);
    if (this.reflection.enabled) {
      this.reflection.render(this.renderer, this.scene, cam);
      this.world.groundMat.uniforms.uTextureMatrix.value.copy(this.reflection.textureMatrix);
    }
    this.post.update(clamp(this.physics.speed / 60, 0, 1), this.world.flash);
    this.post.render(dt);
  }

  /** Auto quality: dynamic resolution between 60% and 100% of the preset's pixel ratio. */
  private measure(dt: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((s, v) => s + v, 0) / this.frameTimes.length;
    this.fps = 1 / Math.max(avg, 1e-4);
    if (!this.autoQuality || this.time - this.lastResCheck < 2 || this.frameTimes.length < 60) return;
    this.lastResCheck = this.time;
    if (this.fps < 45 && this.resScale > 0.6) { this.resScale = Math.max(0.6, this.resScale - 0.1); this.resize(); }
    else if (this.fps > 58 && this.resScale < 1) { this.resScale = Math.min(1, this.resScale + 0.05); this.resize(); }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.post?.dispose();
    this.reflection?.dispose();
    this.renderer.dispose();
  }
}
