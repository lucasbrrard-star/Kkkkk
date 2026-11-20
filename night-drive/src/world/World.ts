import * as THREE from 'three';
import { CityLayout, CURB_HEIGHT, type Collider } from './CityLayout';
import { buildGroundGeometry } from './Ground';
import { createWetGroundMaterial } from './WetGroundMaterial';
import { bakeGroundLightmap } from './Lightmap';
import { Buildings } from './Buildings';
import { StreetProps } from './StreetProps';
import { Vegetation } from './Vegetation';
import { Signs } from './Signs';
import { Rain } from './Rain';
import { Sky } from './Sky';
import { CollisionWorld } from '../vehicle/Collision';
import { LAYER_NO_REFLECT } from '../render/PlanarReflection';

export const FOG_COLOR = new THREE.Color(0.045, 0.03, 0.055);
export const FOG_DENSITY = 0.0062;

async function loadTexture(loader: THREE.TextureLoader, url: string, srgb: boolean) {
  try {
    const t = await loader.loadAsync(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  } catch (e) {
    console.warn('[world] texture failed, using flat fallback:', url, e);
    const d = new THREE.DataTexture(new Uint8Array(srgb ? [40, 40, 42, 140] : [128, 128, 255, 255]), 1, 1);
    d.wrapS = d.wrapT = THREE.RepeatWrapping;
    d.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    d.needsUpdate = true;
    return d;
  }
}

/** Assembles the whole city scene graph and its per-frame animation. */
export class World {
  readonly city = new CityLayout();
  readonly group = new THREE.Group();
  readonly collision: CollisionWorld;
  groundMat!: THREE.ShaderMaterial;
  ground!: THREE.Mesh;
  buildings!: Buildings;
  props!: StreetProps;
  signs!: Signs;
  rain!: Rain;
  sky!: Sky;
  lightmap!: ReturnType<typeof bakeGroundLightmap>;
  private buildingHeight = new Map<Collider, number>();
  flash = 0;
  private nextFlash = 14;
  private flashSeq: number[] = [];

  constructor() {
    this.collision = new CollisionWorld(this.city.colliders);
    for (const c of this.city.colliders) this.buildingHeight.set(c, 0.9);
    for (const b of this.city.buildings) {
      const c = this.city.colliders.find((k) => k.tag === 'building' && Math.abs(k.x - (b.minX + b.maxX) / 2) < 0.01 && Math.abs(k.z - (b.minZ + b.maxZ) / 2) < 0.01);
      if (c) this.buildingHeight.set(c, b.height + CURB_HEIGHT);
    }
    for (const c of this.city.colliders) if (c.tag === 'wall') this.buildingHeight.set(c, 60);
  }

  heightOf = (c: Collider) => this.buildingHeight.get(c) ?? 0;

  async init(reflectTex: THREE.Texture, rainCount: number, onProgress: (p: number) => void) {
    const loader = new THREE.TextureLoader();
    const base = import.meta.env.BASE_URL;
    const [asphalt, asphaltN, concrete, concreteN] = await Promise.all([
      loadTexture(loader, `${base}textures/asphalt_color.webp`, true),
      loadTexture(loader, `${base}textures/asphalt_normal.webp`, false),
      loadTexture(loader, `${base}textures/concrete_color.webp`, true),
      loadTexture(loader, `${base}textures/concrete_normal.webp`, false),
    ]);
    onProgress(0.3);
    this.lightmap = bakeGroundLightmap(this.city);
    this.groundMat = createWetGroundMaterial({ asphalt, asphaltN, concrete, concreteN, light: this.lightmap.texture, reflect: reflectTex }, this.lightmap.rect);
    this.groundMat.uniforms.uFogColor.value.copy(FOG_COLOR);
    this.groundMat.uniforms.uFogDensity.value = FOG_DENSITY;
    this.ground = new THREE.Mesh(buildGroundGeometry(this.city), this.groundMat);
    this.ground.name = 'ground';
    this.ground.layers.set(LAYER_NO_REFLECT);
    this.ground.frustumCulled = false;
    this.group.add(this.ground);
    onProgress(0.5);

    this.buildings = new Buildings(this.city);
    this.group.add(this.buildings.group);
    this.props = new StreetProps(this.city);
    this.group.add(this.props.group);
    onProgress(0.7);
    const palms = this.city.palms.map((p) => ({ x: p.x, y: this.city.groundHeight(p.x, p.z), z: p.z, rot: p.rot, scale: p.h / 10 }));
    const trees = this.city.trees.map((t) => ({ x: t.x, y: CURB_HEIGHT, z: t.z, rot: t.x * 1.7 + t.z, scale: t.s }));
    this.group.add(new Vegetation(palms, trees).group);
    this.signs = new Signs(this.city);
    this.group.add(this.signs.mesh, this.signs.boards);
    this.rain = new Rain(rainCount, this.lightmap.texture, this.lightmap.rect);
    this.group.add(this.rain.mesh);
    this.sky = new Sky();
    this.group.add(this.sky.mesh);
    onProgress(0.9);
  }

  /** Lightning: random double/triple flashes every 15–40 s. Returns the current flash level. */
  private updateLightning(t: number, dt: number) {
    if (t > this.nextFlash) {
      this.nextFlash = t + 15 + Math.random() * 25;
      const n = 1 + Math.floor(Math.random() * 3);
      let s = t;
      this.flashSeq = [];
      for (let i = 0; i < n; i++) { s += 0.06 + Math.random() * 0.18; this.flashSeq.push(s); }
    }
    let target = 0;
    for (const f of this.flashSeq) if (t >= f && t < f + 0.09) target = 1;
    this.flash = Math.max(target, this.flash - dt * 5);
    return this.flash;
  }

  update(t: number, dt: number, camPos: THREE.Vector3, carVel: THREE.Vector3) {
    const flash = this.updateLightning(t, dt);
    this.groundMat.uniforms.uTime.value = t;
    this.groundMat.uniforms.uCamPos.value.copy(camPos);
    this.groundMat.uniforms.uFlash.value = flash;
    this.buildings.update(t);
    this.props.update(t, dt);
    this.signs.update(t);
    this.rain.update(t, camPos, carVel, flash);
    this.sky.update(t, flash, camPos);
  }
}
