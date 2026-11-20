import * as THREE from 'three';
import { LAYER_NO_REFLECT } from '../render/PlanarReflection';

/**
 * GPU rain: N instanced streaks wrapped inside a box that follows the camera. Drops are lit by
 * the baked ground lightmap (so they sparkle under lamps and neon) and stretched along their
 * velocity relative to the moving car.
 */
export class Rain {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;
  private readonly geo: THREE.InstancedBufferGeometry;

  constructor(count: number, lightmap: THREE.Texture, lightRect: THREE.Vector4) {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.attributes.position);
    this.geo.setAttribute('uv', base.attributes.uv);
    const max = 16000;
    const seeds = new Float32Array(max * 4);
    for (let i = 0; i < max; i++) seeds.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    this.geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    this.geo.instanceCount = Math.min(count, max);

    this.mat = new THREE.ShaderMaterial({
      name: 'Rain',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBox: { value: new THREE.Vector3(46, 26, 46) },
        uCenter: { value: new THREE.Vector3() },
        uVel: { value: new THREE.Vector3() },
        uFall: { value: 15 },
        tLight: { value: lightmap },
        uLightRect: { value: lightRect },
        uIntensity: { value: 1 },
        uFlash: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform vec3 uBox;
        uniform vec3 uCenter;
        uniform vec3 uVel;
        uniform float uFall;
        uniform sampler2D tLight;
        uniform vec4 uLightRect;
        varying vec2 vUv;
        varying vec3 vLight;
        varying float vFade;
        void main() {
          vec3 wind = vec3(1.2, 0.0, 0.6);
          float speed = uFall * (0.85 + 0.3 * aSeed.w);
          vec3 p = aSeed.xyz * uBox + (vec3(0.0, -speed, 0.0) + wind) * uTime;
          p = mod(p - uCenter + uBox * 0.5, uBox) - uBox * 0.5 + uCenter;
          p.y = max(p.y, -1.0);
          // velocity relative to the camera/car stretches the streak
          vec3 rel = vec3(0.0, -speed, 0.0) + wind - uVel;
          vec3 dir = normalize(rel);
          float len = clamp(length(rel) * 0.045, 0.35, 1.6);
          vec3 toCam = normalize(cameraPosition - p);
          vec3 side = normalize(cross(dir, toCam)) * 0.012;
          vec3 wp = p + side * position.x * 2.0 + dir * position.y * len;
          vUv = uv;
          vec2 luv = (p.xz - uLightRect.xy) * uLightRect.zw;
          vLight = texture(tLight, luv).rgb * 2.4 + vec3(0.05, 0.06, 0.09);
          float d = length(cameraPosition - p);
          vFade = smoothstep(0.6, 2.5, d) * (1.0 - smoothstep(14.0, 23.0, d));
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uIntensity;
        uniform float uFlash;
        varying vec2 vUv;
        varying vec3 vLight;
        varying float vFade;
        void main() {
          float a = (1.0 - abs(vUv.x - 0.5) * 2.0) * smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
          vec3 c = (vLight + uFlash * 2.0) * a * vFade * 0.55 * uIntensity;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER_NO_REFLECT);
    this.mesh.renderOrder = 20;
    this.mesh.name = 'rain';
  }

  setCount(n: number) { this.geo.instanceCount = Math.min(16000, n); }

  update(t: number, camPos: THREE.Vector3, carVel: THREE.Vector3, flash: number) {
    const u = this.mat.uniforms;
    u.uTime.value = t;
    u.uCenter.value.copy(camPos);
    u.uVel.value.lerp(carVel, 0.2);
    u.uFlash.value = flash;
  }
}
