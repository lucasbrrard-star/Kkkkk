// Níveis de qualidade e detecção automática para celulares medianos.
// O modo "auto" começa por uma estimativa do aparelho e ajusta pelo FPS real medido.

export type QualityLevel = 'baixa' | 'media' | 'alta';
export type QualitySetting = QualityLevel | 'auto';

export interface QualityPreset {
  pixelRatio: number;          // teto do devicePixelRatio
  minScale: number;            // escala mínima da resolução dinâmica
  shadows: boolean;
  shadowMap: number;
  shadowRange: number;         // metros cobertos pela sombra ao redor do jogador
  post: 'nenhum' | 'leve' | 'completo';  // leve = só gradação (no tone mapping); completo = MSAA + bloom + vinheta
  bloom: boolean;
  treeDensity: number;
  far: number;                 // distância de desenho
  anisotropy: number;
  remoteAnimDistance: number;  // além disso, avatares remotos animam em taxa reduzida
}

export const PRESETS: Record<QualityLevel, QualityPreset> = {
  baixa: { pixelRatio: 1, minScale: 0.6, shadows: false, shadowMap: 512, shadowRange: 30, post: 'nenhum', bloom: false, treeDensity: 0.5, far: 170, anisotropy: 1, remoteAnimDistance: 25 },
  media: { pixelRatio: 1.5, minScale: 0.7, shadows: true, shadowMap: 1024, shadowRange: 40, post: 'leve', bloom: false, treeDensity: 0.8, far: 230, anisotropy: 2, remoteAnimDistance: 45 },
  alta: { pixelRatio: 2, minScale: 0.8, shadows: true, shadowMap: 2048, shadowRange: 65, post: 'completo', bloom: true, treeDensity: 1, far: 320, anisotropy: 8, remoteAnimDistance: 80 },
};

export function guessLevel(renderer: { getContext(): WebGLRenderingContext | WebGL2RenderingContext }): QualityLevel {
  const gl = renderer.getContext();
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  let gpu = '';
  try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)); } catch { /* ignore */ }
  const weakGpu = /Mali-4|Mali-T|Adreno \(TM\) [1-5]\d\d|PowerVR|SwiftShader|llvmpipe/i.test(gpu);
  if (weakGpu || mem <= 2 || cores <= 4 && mobile) return 'baixa';
  if (mobile) return 'media';
  return 'alta';
}

/** Monitora o FPS e sugere subir/descer nível e a escala de resolução dinâmica. */
export class FrameMonitor {
  private samples: number[] = [];
  private acc = 0;
  fps = 60;
  scale = 1;
  private lowFor = 0; private highFor = 0;

  update(dtMs: number, preset: QualityPreset): 'down' | 'up' | null {
    this.samples.push(dtMs);
    if (this.samples.length > 60) this.samples.shift();
    this.acc += dtMs;
    if (this.acc < 500) return null;
    this.acc = 0;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.fps = Math.round(1000 / avg);
    // resolução dinâmica: mira 50+ FPS
    if (this.fps < 45) this.scale = Math.max(preset.minScale, this.scale - 0.08);
    else if (this.fps > 57) this.scale = Math.min(1, this.scale + 0.04);
    // troca de nível (somente em "auto"): mantém por alguns segundos antes de agir
    if (this.fps < 34 && this.scale <= preset.minScale + 0.01) { this.lowFor += 0.5; this.highFor = 0; }
    else if (this.fps > 58 && this.scale >= 0.99) { this.highFor += 0.5; this.lowFor = 0; }
    else { this.lowFor = 0; this.highFor = 0; }
    if (this.lowFor >= 4) { this.lowFor = 0; this.scale = 1; return 'down'; }
    if (this.highFor >= 12) { this.highFor = 0; return 'up'; }
    return null;
  }
}
