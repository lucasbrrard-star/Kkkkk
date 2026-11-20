import * as THREE from 'three';
import { LAYER_NO_REFLECT } from './PlanarReflection';

/** Objects only visible to the environment cube camera. */
export const LAYER_ENV_ONLY = 2;

/**
 * Environment lighting for PBR materials (car paint, glass, windows).
 *  - static: a small "neon studio" scene (colored light strips over a dark wet floor) prefiltered
 *    with PMREM once; cheap and always available.
 *  - dynamic (high/ultra): a cube camera follows the car and captures the real city every few
 *    frames, so street lamps and signs slide across the paint while driving.
 */
export class Environment {
  readonly staticEnv: THREE.Texture;
  private cubeRT: THREE.WebGLCubeRenderTarget | null = null;
  private cubeCam: THREE.CubeCamera | null = null;
  private frame = 0;
  private envFloor: THREE.Mesh | null = null;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020306);
    const add = (w: number, h: number, color: THREE.ColorRepresentation, intensity: number, pos: [number, number, number], look: [number, number, number] = [0, 1, 0]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.set(...pos);
      m.lookAt(...look);
      scene.add(m);
    };
    // overcast sky glow
    add(40, 40, 0x2a1630, 0.6, [0, 14, 0], [0, 0, 0]);
    // street lamps in a row on both sides (warm), neon strips (magenta / cyan), shop windows
    for (let i = -3; i <= 3; i++) {
      add(0.6, 1.4, 0xffb070, 18, [-7, 7, i * 6], [0, 7, i * 6]);
      add(0.6, 1.4, 0xffb070, 18, [7, 7, i * 6 + 3], [0, 7, i * 6 + 3]);
    }
    add(10, 0.5, 0xff2bd6, 10, [-9, 4, -4], [0, 3, -4]);
    add(8, 0.5, 0x28e8ff, 10, [9, 5, 6], [0, 3, 6]);
    add(12, 3, 0xffc890, 2.5, [-9, 1.6, 8], [0, 1.6, 8]);
    add(12, 3, 0xbfd8ff, 2.2, [9, 1.6, -8], [0, 1.6, -8]);
    add(6, 2, 0x6a5cff, 4, [0, 3, -12], [0, 3, 0]);
    add(6, 2, 0xff5a3c, 3, [0, 3, 12], [0, 3, 0]);
    // dark wet floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0x050507 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    this.staticEnv = pmrem.fromScene(scene, 0.035).texture;
    pmrem.dispose();
  }

  /** Enables/disables the dynamic cube capture. */
  setDynamic(enabled: boolean, scene: THREE.Scene) {
    if (enabled && !this.cubeRT) {
      this.cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: false });
      this.cubeCam = new THREE.CubeCamera(0.5, 600, this.cubeRT);
      this.cubeCam.layers.set(0);
      this.cubeCam.layers.disable(LAYER_NO_REFLECT);
      this.cubeCam.layers.enable(LAYER_ENV_ONLY);
      scene.add(this.cubeCam);
      if (!this.envFloor) {
        // dark wet floor seen only by the cube camera (the real ground is excluded from captures)
        this.envFloor = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshBasicMaterial({ color: 0x030305 }));
        this.envFloor.rotation.x = -Math.PI / 2;
        this.envFloor.layers.set(LAYER_ENV_ONLY);
        scene.add(this.envFloor);
      }
    }
    if (!enabled && this.cubeRT) {
      scene.remove(this.cubeCam!);
      this.cubeRT.dispose();
      this.cubeRT = null;
      this.cubeCam = null;
    }
    scene.environment = this.cubeRT ? this.cubeRT.texture : this.staticEnv;
  }

  /** Captures the city around `pos` every `every` frames; `hide` is hidden during capture. */
  update(scene: THREE.Scene, pos: THREE.Vector3, every: number, hide: THREE.Object3D) {
    if (!this.cubeCam || every <= 0) return;
    if (this.frame++ % every !== 0) return;
    this.cubeCam.position.set(pos.x, pos.y + 1.0, pos.z);
    this.envFloor?.position.set(pos.x, 0, pos.z);
    const vis = hide.visible;
    hide.visible = false;
    this.cubeCam.update(this.renderer, scene);
    hide.visible = vis;
  }

  get isDynamic() { return !!this.cubeRT; }
}
