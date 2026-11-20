import * as THREE from 'three';

/** Surface ids stored per vertex in `aSurf`. */
export const SURF = { road: 0, sidewalk: 1, paintWhite: 2, paintYellow: 3, grass: 4, curb: 5, lot: 6 } as const;

export interface GroundLights {
  headPos: [THREE.Vector3, THREE.Vector3];
  headDir: THREE.Vector3;
  headColor: THREE.Color;
  tailPos: THREE.Vector3;
  tailColor: THREE.Color;
}

const MAX_SHADOW_CARS = 16;

const vertex = /* glsl */ `
attribute float aSurf;
uniform mat4 uTextureMatrix;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vSurf;
varying vec4 vReflUv;
varying float vViewDepth;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vSurf = aSurf;
  vReflUv = uTextureMatrix * wp;
  vec4 mv = viewMatrix * wp;
  vViewDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
precision highp float;
uniform sampler2D tAsphalt;
uniform sampler2D tAsphaltN;
uniform sampler2D tConcrete;
uniform sampler2D tConcreteN;
uniform sampler2D tLight;
uniform sampler2D tReflect;
uniform vec4 uLightRect;
uniform float uLightGain;
uniform float uTime;
uniform float uWet;
uniform float uReflectOn;
uniform float uRipples;
uniform vec3 uAmbient;
uniform vec3 uCamPos;
uniform vec3 uHeadPos[2];
uniform vec3 uHeadDir;
uniform vec3 uHeadColor;
uniform vec3 uTailPos;
uniform vec3 uTailColor;
uniform vec4 uCars[${MAX_SHADOW_CARS}];
uniform int uCarCount;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFlash;

varying vec3 vWorld;
varying vec3 vNormalW;
varying float vSurf;
varying vec4 vReflUv;
varying float vViewDepth;

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }

// Expanding rain-drop rings inside one cell (two layers are combined by the caller).
vec2 ripple(vec2 p, float t) {
  vec2 cell = floor(p);
  vec2 h = hash22(cell);
  vec2 c = cell + 0.25 + 0.5 * h;
  float phase = fract(t * (0.9 + 0.6 * h.x) + h.y);
  vec2 d = p - c;
  float r = length(d);
  float radius = phase * 0.45;
  float ring = sin(clamp((r - radius) * 40.0, -3.14159, 3.14159)) * smoothstep(0.08, 0.0, abs(r - radius));
  return (d / max(r, 1e-3)) * ring * (1.0 - phase);
}

float carShadow(vec2 p, vec4 car, vec2 halfSize) {
  vec2 d = p - car.xy;
  vec2 l = vec2(d.x * car.w - d.y * car.z, d.x * car.z + d.y * car.w);
  vec2 q = abs(l) - halfSize;
  float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  return 1.0 - smoothstep(-0.35, 0.75, dist);
}

void main() {
  vec2 wp = vWorld.xz;
  int surf = int(vSurf + 0.5);
  vec3 albedo;
  float rough;
  vec2 nT = vec2(0.0);
  float wetMask = 1.0;   // how much water this surface keeps
  float puddleBias = 0.0;
  float reflK = 1.0;

  if (surf == 0 || surf == 6 || surf == 2 || surf == 3) {
    vec2 uv = wp * 0.24;
    vec4 t = texture(tAsphalt, uv);
    vec4 t2 = texture(tAsphalt, wp * 0.043 + 0.37);
    albedo = mix(t.rgb, t2.rgb, 0.35) * 0.8;
    rough = t.a;
    nT = (texture(tAsphaltN, uv).xy * 2.0 - 1.0) * 0.8;
    // large scale wear: darker oily strips along the lanes, lighter patches
    float patchN = fbm(wp * 0.035);
    albedo *= 0.75 + 0.5 * patchN;
    if (surf == 6) { albedo *= 0.9; puddleBias = 0.08; }
    if (surf == 2 || surf == 3) {
      vec3 paint = surf == 2 ? vec3(0.62, 0.62, 0.6) : vec3(0.72, 0.46, 0.08);
      float worn = smoothstep(0.35, 0.65, vnoise(wp * 3.1) * 0.6 + vnoise(wp * 13.0) * 0.4);
      albedo = mix(paint, albedo, worn * 0.55);
      rough = mix(0.45, rough, worn * 0.5);
      nT *= 0.4;
      puddleBias = -0.1;
    }
  } else if (surf == 1 || surf == 5) {
    vec2 uv = (surf == 5) ? vec2(wp.x + wp.y, vWorld.y) * 0.5 : wp * 0.33;
    vec4 t = texture(tConcrete, uv);
    albedo = t.rgb * 0.72;
    rough = t.a;
    nT = (texture(tConcreteN, uv).xy * 2.0 - 1.0) * 0.6;
    if (surf == 1) {
      vec2 g = abs(fract(wp / 1.5) - 0.5);
      float joint = smoothstep(0.465, 0.495, max(g.x, g.y));
      albedo *= 1.0 - joint * 0.55;
      vec2 sid = floor(wp / 1.5);
      albedo *= 0.85 + 0.3 * hash12(sid);
      puddleBias = -0.12;
    } else {
      albedo *= 1.1;
      wetMask = 0.7;
    }
  } else {
    // grass / planter soil
    float n = fbm(wp * 0.9);
    albedo = mix(vec3(0.012, 0.022, 0.008), vec3(0.035, 0.05, 0.018), n);
    rough = 0.9;
    wetMask = 0.25;
    reflK = 0.15;
    puddleBias = -1.0;
  }

  // ---- water: puddles + rain ripples
  float puddle = 0.0;
  if (surf != 5) {
    float pn = fbm(wp * 0.075 + 3.1) * 0.7 + vnoise(wp * 0.55) * 0.3;
    puddle = smoothstep(0.5, 0.62, pn + puddleBias) * uWet;
  }
  float wet = uWet * wetMask;
  albedo *= mix(1.0, 0.5, wet);
  albedo *= mix(1.0, 0.6, puddle);
  rough = mix(rough, rough * 0.45 + 0.08, wet);
  rough = mix(rough, 0.02, puddle);
  nT *= mix(1.0, 0.08, puddle);
  if (uRipples > 0.0) {
    vec2 rp = ripple(wp * 2.2, uTime * 1.1) + ripple(wp * 2.2 + 7.3, uTime * 1.1 + 0.5);
    nT += rp * (0.15 + 0.85 * puddle) * 0.35 * uRipples * wet;
  }

  vec3 N = surf == 5 ? normalize(vNormalW + vec3(nT.x, 0.0, nT.y) * 0.2) : normalize(vec3(nT.x, 1.0, nT.y));
  vec3 V = normalize(uCamPos - vWorld);
  float NdV = clamp(dot(N, V), 0.0, 1.0);

  // ---- diffuse lighting
  vec2 luv = (wp - uLightRect.xy) * uLightRect.zw;
  vec3 baked = texture(tLight, luv).rgb * uLightGain;
  vec3 irr = uAmbient * (1.0 + uFlash * 6.0) + baked;
  for (int i = 0; i < 2; i++) {
    vec3 L = uHeadPos[i] - vWorld;
    float d = length(L);
    L /= d;
    float cd = dot(-L, uHeadDir);
    float cone = smoothstep(0.82, 0.97, cd);
    float hot = smoothstep(0.955, 0.995, cd);
    irr += uHeadColor * (cone + hot * 1.2) * max(dot(N, L), 0.0) * (34.0 / (1.0 + d * d * 0.05));
  }
  {
    vec3 L = uTailPos - vWorld;
    float d = length(L);
    irr += uTailColor * max(dot(N, L / d), 0.0) / (1.0 + d * d * 1.6);
  }
  float shadow = 0.0;
  for (int i = 0; i < ${MAX_SHADOW_CARS}; i++) {
    if (i >= uCarCount) break;
    shadow = max(shadow, carShadow(wp, uCars[i], vec2(1.0, 2.25)));
  }
  irr *= 1.0 - shadow * 0.88;
  vec3 col = albedo * irr;

  // ---- specular reflection
  float F0 = 0.025;
  float fres = F0 + (1.0 - F0) * pow(1.0 - NdV, 5.0);
  float specAmt = clamp(fres * 1.25 + puddle * 0.35, 0.0, 1.0) * mix(0.25, 1.0, wet) * reflK;
  specAmt *= 1.0 - rough * 0.55;
  if (uReflectOn > 0.5) {
    vec2 ruv = vReflUv.xy / vReflUv.w;
    ruv += N.xz * (0.035 + rough * 0.06);
    float lod = rough * 5.5;
    float stretch = 0.004 + rough * 0.03;
    vec3 refl = vec3(0.0);
    refl += textureLod(tReflect, ruv + vec2(0.0, -2.0 * stretch), lod).rgb * 0.10;
    refl += textureLod(tReflect, ruv + vec2(0.0, -1.0 * stretch), lod).rgb * 0.20;
    refl += textureLod(tReflect, ruv, lod).rgb * 0.30;
    refl += textureLod(tReflect, ruv + vec2(0.0, 1.0 * stretch), lod).rgb * 0.22;
    refl += textureLod(tReflect, ruv + vec2(0.0, 2.2 * stretch), lod + 0.5).rgb * 0.12;
    refl += textureLod(tReflect, ruv + vec2(0.0, 3.6 * stretch), lod + 1.0).rgb * 0.06;
    col += refl * specAmt * (1.0 - shadow * 0.6);
  } else {
    // cheap fallback: glossy sheen of the baked lights
    col += baked * specAmt * 0.9 + uFogColor * specAmt * 0.6;
  }

  // ---- fog
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vViewDepth * vViewDepth);
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createWetGroundMaterial(tex: {
  asphalt: THREE.Texture; asphaltN: THREE.Texture; concrete: THREE.Texture; concreteN: THREE.Texture; light: THREE.Texture; reflect: THREE.Texture;
}, lightRect: THREE.Vector4) {
  const cars: THREE.Vector4[] = [];
  for (let i = 0; i < MAX_SHADOW_CARS; i++) cars.push(new THREE.Vector4());
  return new THREE.ShaderMaterial({
    name: 'WetGround',
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      tAsphalt: { value: tex.asphalt },
      tAsphaltN: { value: tex.asphaltN },
      tConcrete: { value: tex.concrete },
      tConcreteN: { value: tex.concreteN },
      tLight: { value: tex.light },
      tReflect: { value: tex.reflect },
      uTextureMatrix: { value: new THREE.Matrix4() },
      uLightRect: { value: lightRect },
      uLightGain: { value: 3.2 },
      uTime: { value: 0 },
      uWet: { value: 1 },
      uReflectOn: { value: 1 },
      uRipples: { value: 1 },
      uAmbient: { value: new THREE.Color(0.012, 0.014, 0.024) },
      uCamPos: { value: new THREE.Vector3() },
      uHeadPos: { value: [new THREE.Vector3(), new THREE.Vector3()] },
      uHeadDir: { value: new THREE.Vector3(0, 0, 1) },
      uHeadColor: { value: new THREE.Color(0, 0, 0) },
      uTailPos: { value: new THREE.Vector3() },
      uTailColor: { value: new THREE.Color(0, 0, 0) },
      uCars: { value: cars },
      uCarCount: { value: 0 },
      uFogColor: { value: new THREE.Color() },
      uFogDensity: { value: 0.006 },
      uFlash: { value: 0 },
    },
  });
}

export const GROUND_MAX_SHADOW_CARS = MAX_SHADOW_CARS;
