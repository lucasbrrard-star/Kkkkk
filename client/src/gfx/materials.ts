// Materiais e shaders: chão PBR com quebra de repetição em espaço de mundo, água
// estilizada-realista (duas normais animadas + fresnel + espuma na orla) e
// bordas animadas dos terrenos livres.
import * as THREE from 'three';
import { Assets } from '../core/assets';

/** Textura de ruído (tileável) gerada em canvas — usada para variar cor e para a água. */
function noiseCanvas(size: number, seed: number, scale: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rnd = (x: number, y: number) => { const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return h - Math.floor(h); };
  const grid = (x: number, y: number, p: number) => rnd(((x % p) + p) % p, ((y % p) + p) % p);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, amp = 0.5, tot = 0;
    for (let o = 0; o < 4; o++) {
      const p = scale * (1 << o), fx = (x / size) * p, fy = (y / size) * p;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smooth(fx - x0), ty = smooth(fy - y0);
      const a = grid(x0, y0, p), b = grid(x0 + 1, y0, p), c2 = grid(x0, y0 + 1, p), d = grid(x0 + 1, y0 + 1, p);
      v += (a + (b - a) * tx + (c2 - a) * ty + (a - b - c2 + d) * tx * ty) * amp; tot += amp; amp *= 0.5;
    }
    const g = Math.round((v / tot) * 255), i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = g; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

let macroNoise: THREE.Texture | null = null;
function macro(): THREE.Texture {
  if (!macroNoise) {
    macroNoise = new THREE.CanvasTexture(noiseCanvas(128, 3, 4));
    macroNoise.wrapS = macroNoise.wrapT = THREE.RepeatWrapping;
  }
  return macroNoise;
}

/** MeshStandardMaterial com UV em espaço de mundo (x,z) e variação macro de cor (evita "ladrilhado"). */
export function groundMaterial(assets: Assets, key: string, tileMeters: number, o: { tint?: number; variation?: number; roughness?: number; normalScale?: number } = {}): THREE.MeshStandardMaterial {
  const has = assets.manifest.textures.includes(key);
  const m = new THREE.MeshStandardMaterial({
    color: o.tint ?? 0xffffff,
    map: has ? assets.texture(`${key}_diff`, true) : null,
    normalMap: has ? assets.texture(`${key}_nor`, false) : null,
    roughnessMap: has ? assets.texture(`${key}_rough`, false) : null,
    roughness: o.roughness ?? 1,
    metalness: 0,
  });
  m.normalScale.setScalar(o.normalScale ?? 0.8);
  const variation = o.variation ?? 0.18;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTile = { value: 1 / tileMeters };
    sh.uniforms.uMacro = { value: macro() };
    sh.uniforms.uVar = { value: variation };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    // todas as amostras de textura usam UV de mundo
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform float uTile; uniform sampler2D uMacro; uniform float uVar;')
      .replace('#include <map_fragment>', `
        vec2 wuv = vWPos.xz * uTile;
        #ifdef USE_MAP
          vec4 texelColor = texture2D(map, wuv);
          diffuseColor *= texelColor;
        #endif
        float mn = texture2D(uMacro, vWPos.xz * 0.012).r;
        diffuseColor.rgb *= mix(1.0 - uVar, 1.0 + uVar * 0.6, mn);`)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          roughnessFactor *= texture2D(roughnessMap, wuv).g;
        #endif`)
      .replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          // superfície horizontal: T = +x, B = +z, N = +y (em espaço de mundo) → espaço de visão
          vec3 mapN = texture2D(normalMap, wuv).xyz * 2.0 - 1.0;
          mapN.xy *= normalScale;
          normal = normalize((viewMatrix * vec4(normalize(vec3(mapN.x, mapN.z, mapN.y)), 0.0)).xyz);
        #endif`);
  };
  m.customProgramCacheKey = () => `ground-${key}-${tileMeters}`;
  return m;
}

/** Textura de calçadão em ondas (pedra portuguesa), gerada em canvas. */
export function wavePavementTexture(light = '#efe7d6', dark = '#26252b'): THREE.Texture {
  const s = 512, c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = light; ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = dark;
  for (let band = -1; band < 3; band++) {
    ctx.beginPath();
    for (let x = 0; x <= s; x += 4) {
      const y = band * (s / 2) + Math.sin((x / s) * Math.PI * 2) * s * 0.11 + s * 0.12;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let x = s; x >= 0; x -= 4) ctx.lineTo(x, band * (s / 2) + Math.sin((x / s) * Math.PI * 2) * s * 0.11 + s * 0.12 + s * 0.2);
    ctx.closePath(); ctx.fill();
  }
  // pedrinhas
  const img = ctx.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 26; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < s; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < s; x += 8) ctx.strokeRect(x, y, 8, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Água do mar: PBR + duas normais em movimento, cor por profundidade e espuma junto à areia. */
export function waterMaterial(shoreX: number): THREE.MeshStandardMaterial {
  const nCanvas = noiseCanvas(256, 9, 8);
  // converte altura → mapa de normais
  const ctx = nCanvas.getContext('2d')!;
  const src = ctx.getImageData(0, 0, 256, 256), dst = ctx.createImageData(256, 256);
  const h = (x: number, y: number) => src.data[(((y + 256) % 256) * 256 + ((x + 256) % 256)) * 4] / 255;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * 3, dy = (h(x, y + 1) - h(x, y - 1)) * 3;
    const l = Math.hypot(dx, dy, 1), i = (y * 256 + x) * 4;
    dst.data[i] = (-dx / l * 0.5 + 0.5) * 255; dst.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; dst.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; dst.data[i + 3] = 255;
  }
  ctx.putImageData(dst, 0, 0);
  const nTex = new THREE.CanvasTexture(nCanvas);
  nTex.wrapS = nTex.wrapT = THREE.RepeatWrapping;
  const m = new THREE.MeshStandardMaterial({ color: 0x1f6e8c, roughness: 0.08, metalness: 0.0, normalMap: nTex, transparent: false });
  m.normalScale.setScalar(0.35);
  const uTime = { value: 0 };
  m.userData.uTime = uTime;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uShore = { value: shoreX };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform float uTime; uniform float uShore;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float depthT = clamp((vWPos.x - uShore) / 28.0, 0.0, 1.0);
        diffuseColor.rgb = mix(vec3(0.16, 0.62, 0.62), vec3(0.04, 0.24, 0.38), depthT);`)
      .replace('#include <normal_fragment_maps>', `
        vec2 uvA = vWPos.xz * 0.045 + vec2(uTime * 0.018, uTime * 0.011);
        vec2 uvB = vWPos.xz * 0.11 - vec2(uTime * 0.025, -uTime * 0.017);
        vec3 nA = texture2D(normalMap, uvA).xyz * 2.0 - 1.0;
        vec3 nB = texture2D(normalMap, uvB).xyz * 2.0 - 1.0;
        vec2 nxy = (nA.xy + nB.xy) * normalScale;
        normal = normalize((viewMatrix * vec4(normalize(vec3(nxy.x, 1.0, nxy.y)), 0.0)).xyz);`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        // espuma junto à areia (ondas que chegam e voltam)
        float d = vWPos.x - uShore;
        float wave = sin(vWPos.z * 0.35 + uTime * 0.9) * 0.6 + sin(uTime * 0.7) * 0.9;
        float foam = smoothstep(2.6, 0.0, d - wave) * (0.55 + 0.45 * texture2D(normalMap, vWPos.xz * 0.3 + uTime * 0.05).r);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.95, 0.97, 0.96), clamp(foam, 0.0, 0.85));`);
  };
  m.customProgramCacheKey = () => 'water';
  return m;
}

/** Borda tracejada animada dos terrenos livres (aditiva, sem iluminação). */
export function lotBorderMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: color } },
    vertexShader: /* glsl */`attribute float aDist; varying float vDist; varying float vV; void main(){ vDist = aDist; vV = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`uniform float uTime; uniform vec3 uColor; varying float vDist; varying float vV;
      void main(){ float dash = step(0.45, fract(vDist * 0.5 - uTime * 0.6)); float edge = 1.0 - abs(vV - 0.5) * 2.0;
        float a = (0.35 + 0.65 * dash) * smoothstep(0.0, 0.5, edge) * (0.75 + 0.25 * sin(uTime * 3.0));
        gl_FragColor = vec4(uColor * (1.2 + dash), a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

/** Feixe de luz vertical do marcador de destino (aditivo, some no topo, pulsa). */
export function beaconMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: color } },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      void main(){ float a = pow(1.0 - vUv.y, 2.2) * (0.55 + 0.25 * sin(uTime * 3.0 + vUv.y * 12.0));
        float rim = 0.6 + 0.4 * abs(sin(vUv.x * 6.2831 * 2.0 + uTime));
        gl_FragColor = vec4(uColor * 1.4, a * rim); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
}

/** Billboard cilíndrico instanciado (impostor de árvore distante): sempre de frente para a
 *  câmera no eixo Y, recorte alfa, com neblina. 2 triângulos por árvore. */
export function impostorMaterial(tex: THREE.Texture, w: number, h: number): THREE.ShaderMaterial {
  const m = makeImpostorMaterial(w, h);
  m.uniforms.map.value = tex;
  return m;
}

function makeImpostorMaterial(w: number, h: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uSize: { value: new THREE.Vector2(w, h) } }]),
    vertexShader: /* glsl */`
      uniform vec2 uSize; varying vec2 vUv;
      #include <common>
      #include <fog_pars_vertex>
      void main(){
        vUv = uv;
        vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float sc = length(instanceMatrix[0].xyz);
        vec3 toCam = cameraPosition - center; toCam.y = 0.0; toCam = normalize(toCam + vec3(1e-5));
        vec3 right = vec3(toCam.z, 0.0, -toCam.x);
        vec3 wp = center + right * position.x * uSize.x * sc + vec3(0.0, 1.0, 0.0) * position.y * uSize.y * sc;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; varying vec2 vUv;
      #include <common>
      #include <fog_pars_fragment>
      void main(){
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.45) discard;
        gl_FragColor = vec4(c.rgb / max(c.a, 0.001), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
    side: THREE.DoubleSide,
  });
  // (UniformsUtils.merge clona valores; a textura é atribuída depois)
}
