// Cor final e pós-processamento, pensados para celular:
//  • A gradação de cor (contraste, saturação, toque quente) roda DENTRO do tone mapping
//    (CustomToneMapping) — custo zero, nenhum passe extra em "baixa" e "média".
//  • Só em "alta": render target com MSAA + bloom leve + passe final (tone mapping,
//    sRGB e vinheta) num único shader.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { QualityPreset } from '../core/quality';

/** Instala o tone mapping personalizado (ACES + gradação "fim de tarde"). Chamar antes de compilar shaders. */
export function installGrading() {
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  if (chunk.includes('CIDADE_VIVA_GRADE')) return;
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(
    'vec3 CustomToneMapping( vec3 color ) { return color; }',
    /* glsl */`// CIDADE_VIVA_GRADE
    vec3 CustomToneMapping( vec3 color ) {
      color *= vec3( 1.035, 1.0, 0.955 );                       // luz quente
      vec3 c = ACESFilmicToneMapping( color );
      c = 0.18 * pow( max( c, vec3( 0.0 ) ) / 0.18, vec3( 1.045 ) ); // contraste em torno do cinza médio
      float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
      c = mix( vec3( l ), c, 1.14 );                             // saturação
      c += vec3( 0.004, 0.002, 0.008 ) * ( 1.0 - c );            // sombras levemente frias
      return clamp( c, 0.0, 1.0 );
    }`,
  );
}

/** Passe final (só "alta"): tone mapping personalizado + sRGB + vinheta. */
const FinalShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, toneMappingExposure: { value: 1 }, uVignette: { value: 0.28 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uVignette; varying vec2 vUv;
    #include <tonemapping_pars_fragment>
    #include <colorspace_pars_fragment>
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb = CustomToneMapping(c.rgb);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - dot(d, d) * uVignette * 2.0;
      gl_FragColor = sRGBTransferOETF(c);
    }`,
};

export class Post {
  composer: EffectComposer | null = null;
  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {}

  configure(p: QualityPreset) {
    this.composer?.dispose();
    this.composer = null;
    if (p.post !== 'completo') return;
    const size = this.renderer.getSize(new THREE.Vector2());
    const pr = this.renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
    const c = new EffectComposer(this.renderer, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (p.bloom) c.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.16, 0.35, 1.0));
    const fin = new ShaderPass(FinalShader);
    c.addPass(fin);
    this.composer = c;
    this.resize();
  }

  resize() {
    if (!this.composer) return;
    const s = this.renderer.getSize(new THREE.Vector2());
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(s.x, s.y);
  }

  render(dt: number) {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
