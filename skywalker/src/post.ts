// Pipeline de render: cena → alvo HDR → (mãos por cima) → passe final com tone mapping ACES,
// gradação de cor, granulação de filme, vinheta, aberração cromática, sangue e flash.
// Com resolução dinâmica para manter a taxa de quadros no celular.
import * as THREE from 'three';

export interface Fx { time: number; damage: number; fade: number; flash: number; ca: number; tension: number; low: number }

export class Pipeline {
  renderer: THREE.WebGLRenderer;
  rt: THREE.WebGLRenderTarget | null = null;
  private quad: THREE.Mesh;
  private qs = new THREE.Scene();
  private qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  scale = 1;
  basePR: number;
  private frames: number[] = [];
  private lastAdjust = 0;
  hdr: boolean;
  w = 1; h = 1;

  constructor(canvas: HTMLCanvasElement, public mobile: boolean, public quality: 'high' | 'low') {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false }));
    r.shadowMap.enabled = true;
    r.shadowMap.type = quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    r.autoClear = false;
    this.basePR = Math.min(window.devicePixelRatio || 1, mobile ? 1.6 : 1.5);
    this.scale = mobile ? 0.85 : 1;
    const gl = r.getContext() as WebGL2RenderingContext;
    this.hdr = !!(r.capabilities.isWebGL2 && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float')));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, time: { value: 0 }, damage: { value: 0 }, fade: { value: 0 }, flash: { value: 0 },
        ca: { value: 0 }, tension: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, exposure: { value: 1.12 }, low: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        varying vec2 vUv; uniform sampler2D tDiffuse; uniform float time, damage, fade, flash, ca, tension, exposure, low; uniform vec2 res;
        vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        void main(){
          vec2 uv = vUv; vec2 c = uv - 0.5;
          float r2 = dot(c, c);
          // tremor de pânico na visão
          uv += c * sin(time*1.7) * 0.004 * tension;
          float ab = (0.0015 + ca * 0.012 + tension * 0.002) * r2 * 4.0;
          vec3 col;
          col.r = texture2D(tDiffuse, uv + c * ab).r;
          col.g = texture2D(tDiffuse, uv).g;
          col.b = texture2D(tDiffuse, uv - c * ab).b;
          col *= exposure;
          col = aces(col);
          // gradação: sombras frias, luz quente, leve dessaturação
          float l = dot(col, vec3(0.299,0.587,0.114));
          col = mix(vec3(l), col, 0.9);
          col += vec3(-0.004, 0.004, 0.014) * (1.0 - smoothstep(0.0, 0.35, l));
          col *= mix(vec3(1.0), vec3(1.04, 1.0, 0.94), smoothstep(0.3, 0.9, l));
          col = pow(col, vec3(1.0/2.2));
          // vinheta + sangue nas bordas
          float vig = smoothstep(0.85, 0.18, r2 * (1.6 + tension * 0.5));
          col *= mix(0.35, 1.0, vig);
          float edge = smoothstep(0.08, 0.5, r2);
          col = mix(col, vec3(0.35, 0.0, 0.0) * (0.6 + 0.4*sin(time*5.0)), damage * edge * 0.85);
          // granulação de filme
          float g = h(uv * res + fract(time * 13.7) * 91.0) - 0.5;
          col += g * (0.045 + tension * 0.02) * (1.0 - l * 0.6);
          col = mix(col, vec3(1.0, 0.96, 0.9), flash);
          col *= 1.0 - fade;
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.qs.add(this.quad);
    if (!this.hdr) {
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.25;
    }
  }

  resize(w: number, h: number) {
    this.w = w; this.h = h;
    const pr = this.basePR * this.scale;
    // com HDR a tela fica na resolução base e só o alvo intermediário muda (sem piscar)
    this.renderer.setPixelRatio(this.hdr ? Math.min(this.basePR, 1.25) : pr);
    this.renderer.setSize(w, h, false);
    if (this.hdr) {
      const W = Math.max(2, Math.floor(w * pr)), H = Math.max(2, Math.floor(h * pr));
      if (!this.rt) {
        this.rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: this.mobile ? 0 : 4, depthBuffer: true });
      } else this.rt.setSize(W, H);
      this.mat.uniforms.res.value.set(W, H);
    }
  }

  render(scene: THREE.Scene, cam: THREE.Camera, vm: THREE.Scene | null, vmCam: THREE.Camera, fx: Fx, dt: number) {
    const r = this.renderer;
    if (this.hdr && this.rt) {
      r.setRenderTarget(this.rt);
      r.clear();
      r.render(scene, cam);
      if (vm) { r.clearDepth(); r.render(vm, vmCam); }
      r.setRenderTarget(null);
      const u = this.mat.uniforms;
      u.tDiffuse.value = this.rt.texture;
      u.time.value = fx.time; u.damage.value = Math.min(1, Math.max(0, fx.damage)); u.fade.value = fx.fade; u.flash.value = fx.flash;
      u.ca.value = fx.ca; u.tension.value = fx.tension; u.low.value = fx.low;
      r.render(this.qs, this.qc);
    } else {
      r.setRenderTarget(null);
      r.clear();
      r.render(scene, cam);
      if (vm) { r.clearDepth(); r.render(vm, vmCam); }
      const ov = document.getElementById('fx-overlay');
      if (ov) { ov.style.opacity = String(Math.min(1, fx.damage * 0.8)); }
      const fd = document.getElementById('fade');
      if (fd) fd.style.opacity = String(Math.max(fx.fade, 0));
    }
    this.adapt(dt);
  }

  /** resolução dinâmica: mira ~45 fps no celular */
  private adapt(dt: number) {
    this.frames.push(dt);
    if (this.frames.length > 40) this.frames.shift();
    const now = performance.now();
    if (now - this.lastAdjust < 1500 || this.frames.length < 30) return;
    const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
    const target = this.mobile ? 1 / 45 : 1 / 55;
    let s = this.scale;
    if (avg > target * 1.15) s = Math.max(0.5, s - 0.08);
    else if (avg < target * 0.75) s = Math.min(this.mobile ? 1 : 1.15, s + 0.05);
    if (s !== this.scale) { this.scale = s; if (this.hdr && this.rt) { const pr = this.basePR * s; this.rt.setSize(Math.max(2, Math.floor(this.w * pr)), Math.max(2, Math.floor(this.h * pr))); this.mat.uniforms.res.value.set(this.rt.width, this.rt.height); } else this.resize(this.w, this.h); this.lastAdjust = now; this.frames.length = 0; }
  }
}
