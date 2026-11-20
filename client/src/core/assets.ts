// Carregamento de modelos (GLB com meshopt + WebP) e texturas, com cache e progresso.
import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface ModelInfo { category: string; bounds: { min: number[]; max: number[] }; tris: number; bytes: number }
export interface Manifest { models: Record<string, ModelInfo>; textures: string[]; clips: string[] }

export class Assets {
  private loader = new GLTFLoader();
  private tex = new THREE.TextureLoader();
  private cache = new Map<string, Promise<GLTF>>();
  private texCache = new Map<string, THREE.Texture>();
  manifest!: Manifest;
  loaded = 0; total = 0;
  onProgress?: (f: number) => void;
  anisotropy = 4;

  constructor(private base = 'assets/') { this.loader.setMeshoptDecoder(MeshoptDecoder); }

  async init() {
    this.manifest = await (await fetch(this.base + 'manifest.json')).json();
  }

  private track<T>(p: Promise<T>): Promise<T> {
    this.total++;
    this.onProgress?.(this.loaded / this.total);
    return p.finally(() => { this.loaded++; this.onProgress?.(this.loaded / this.total); });
  }

  /** Extensão dos modelos: '.glb' normalmente; a prévia hospedada publica os mesmos bytes com outro nome. */
  modelExt = (window as unknown as { CIDADE_VIVA_MODEL_EXT?: string }).CIDADE_VIVA_MODEL_EXT ?? '.glb';

  model(key: string): Promise<GLTF> {
    if (!this.cache.has(key)) this.cache.set(key, this.track(this.loader.loadAsync(`${this.base}models/${key}${this.modelExt}`)));
    return this.cache.get(key)!;
  }

  /** Textura PBR do chão (tileável), espaço de cor correto para cor/dados. */
  texture(name: string, color: boolean): THREE.Texture {
    if (this.texCache.has(name)) return this.texCache.get(name)!;
    const t = this.tex.load(`${this.base}textures/${name}.webp`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = this.anisotropy;
    this.texCache.set(name, t);
    return t;
  }

  bounds(key: string) { return this.manifest.models[key]?.bounds; }
}
