import * as THREE from 'three';

/** Overcast night sky: low clouds lit from below by the city glow, plus lightning flashes. */
export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      name: 'Sky',
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uHorizon: { value: new THREE.Color(0.11, 0.05, 0.12) },
        uGlow: { value: new THREE.Color(0.28, 0.1, 0.18) },
        uZenith: { value: new THREE.Color(0.004, 0.006, 0.014) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uFlash;
        uniform vec3 uHorizon;
        uniform vec3 uGlow;
        uniform vec3 uZenith;
        varying vec3 vDir;
        float h(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
        float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.1 + 3.7; a *= 0.5; } return s; }
        void main() {
          vec3 d = normalize(vDir);
          float y = max(d.y, 0.0);
          vec3 col = mix(uHorizon, uZenith, pow(y, 0.45));
          col += uGlow * exp(-y * 9.0) * 0.9;
          // cloud deck projected on a plane
          vec2 uv = d.xz / (d.y + 0.08) * 0.6 + vec2(uTime * 0.004, uTime * 0.002);
          float c = fbm(uv * 1.3);
          float c2 = fbm(uv * 3.1 + 5.0);
          float cloud = smoothstep(0.35, 0.8, c * 0.75 + c2 * 0.35);
          vec3 lit = mix(uGlow * 0.55, uHorizon * 1.2, smoothstep(0.0, 0.6, y));
          col = mix(col, lit * (0.6 + 0.6 * c2), cloud * smoothstep(0.0, 0.08, y) * 0.85);
          col += vec3(0.55, 0.6, 0.8) * uFlash * (0.4 + cloud) * smoothstep(-0.05, 0.3, d.y);
          if (d.y < 0.0) col = uHorizon * 0.8;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.mesh.name = 'sky';
  }

  update(t: number, flash: number, camPos: THREE.Vector3) {
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uFlash.value = flash;
    this.mesh.position.copy(camPos);
  }
}
