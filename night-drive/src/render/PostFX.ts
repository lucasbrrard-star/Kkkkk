import * as THREE from 'three';
import {
  BlendFunction, BloomEffect, ChromaticAberrationEffect, Effect, EffectComposer, EffectPass, NoiseEffect,
  RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect,
} from 'postprocessing';

/** Exposure + cinematic split toning (teal shadows, warm/magenta highlights) in linear HDR. */
class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', /* glsl */ `
      uniform float uExposure;
      uniform float uSaturation;
      uniform vec3 uShadowTint;
      uniform vec3 uHighTint;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb * uExposure;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float lt = l / (1.0 + l);
        c *= mix(uShadowTint, uHighTint, smoothstep(0.05, 0.7, lt));
        c = mix(vec3(l), c, uSaturation);
        outputColor = vec4(max(c, 0.0), inputColor.a);
      }`, {
      blendFunction: BlendFunction.SET,
      uniforms: new Map<string, THREE.Uniform>([
        ['uExposure', new THREE.Uniform(1.0)],
        ['uSaturation', new THREE.Uniform(1.12)],
        ['uShadowTint', new THREE.Uniform(new THREE.Vector3(0.92, 1.0, 1.1))],
        ['uHighTint', new THREE.Uniform(new THREE.Vector3(1.06, 0.98, 0.96))],
      ]),
    });
  }
}

export class PostFX {
  readonly composer: EffectComposer;
  readonly bloom: BloomEffect;
  private readonly grade: GradeEffect;
  private readonly ca: ChromaticAberrationEffect;
  private readonly renderPass: RenderPass;
  private readonly fxPass: EffectPass;
  exposure = 1.0;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, msaa: number) {
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: msaa });
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.95, luminanceSmoothing: 0.35, intensity: 1.05, radius: 0.72, levels: 7 });
    this.grade = new GradeEffect();
    this.ca = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0006, 0.0004), radialModulation: true, modulationOffset: 0.25 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.62 });
    const noise = new NoiseEffect({ premultiply: false, blendFunction: BlendFunction.OVERLAY });
    noise.blendMode.opacity.value = 0.06;
    this.fxPass = new EffectPass(camera, this.bloom, this.ca, this.grade, tone, vignette, noise);
    this.composer.addPass(this.fxPass);
  }

  setCamera(camera: THREE.Camera) {
    this.renderPass.mainCamera = camera;
    this.fxPass.mainCamera = camera;
  }

  setSize(w: number, h: number) { this.composer.setSize(w, h, false); }
  setBloom(on: boolean) { this.bloom.blendMode.opacity.value = on ? 1 : 0; }
  setMultisampling(n: number) { this.composer.multisampling = n; }

  update(speedK: number, flash: number) {
    (this.grade.uniforms.get('uExposure') as THREE.Uniform).value = this.exposure * (1 + flash * 1.5);
    const o = 0.0005 + speedK * speedK * 0.0022;
    this.ca.offset.set(o, o * 0.6);
  }

  render(dt: number) { this.composer.render(dt); }
  dispose() { this.composer.dispose(); }
}
