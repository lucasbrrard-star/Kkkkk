// Carregamento de modelos (GLB com meshopt), texturas e sons, com progresso.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const BASE = 'assets/';
/** extensão dos modelos: .glb no build normal; .json (glTF com recursos embutidos) na versão publicada como Artifact */
const MODEL_EXT = (window as unknown as { __SW_MODEL_EXT?: string }).__SW_MODEL_EXT ?? 'glb';

export const MODEL_KEYS = [
  'skywalker', 'deer',
  'tree_evergreen', 'tree_evergreen_far', 'tree_pine', 'tree_pine_far', 'tree_dead_bare', 'tree_dead_bare_far',
  'tree_dead_twisted', 'tree_dead_twisted_far', 'tree_half_dead', 'tree_half_dead_far',
  'stump_scan', 'stump', 'dead_trunk', 'rock_moss_1', 'rock_moss_2', 'boulder', 'fern', 'branches', 'roots',
  'cabin', 'campfire', 'bone_pile', 'human_skull', 'deer_skull',
  'kids_shoe', 'teddy', 'toy_car', 'walkie', 'revolver', 'flashlight_hand',
] as const;
export type ModelKey = (typeof MODEL_KEYS)[number];

export const SOUND_KEYS = [
  'ambience', 'drone', 'music_box', 'scream', 'growl', 'transform', 'stinger', 'deer_call', 'creature_run',
  'creature_pain', 'creature_death', 'whispers', 'child_cry', 'gunshot', 'reload', 'footsteps', 'twig', 'hurt', 'clue',
  'v_intro', 'v_clue1', 'v_clue2', 'v_clue3', 'v_clue4', 'v_clue5', 'v_lair', 'v_deer', 'v_followed', 'v_battery', 'v_win',
  'k_help', 'k_papai',
] as const;
export type SoundKey = (typeof SOUND_KEYS)[number];

export interface Assets {
  models: Record<ModelKey, GLTF>;
  tex: Record<string, THREE.Texture>;
  sounds: Partial<Record<SoundKey, AudioBuffer>>;
  manifest: { models: Record<string, { bounds: { min: number[]; max: number[] }; tris: number; kb: number }> };
}

export async function loadAll(audioCtx: AudioContext, onProgress: (f: number, label: string) => void): Promise<Assets> {
  const manifest = await (await fetch(BASE + 'manifest.json')).json();
  const gltf = new GLTFLoader();
  gltf.setMeshoptDecoder(MeshoptDecoder);
  const texLoader = new THREE.TextureLoader();

  const jobs: { w: number; label: string; run: () => Promise<void> }[] = [];
  const models = {} as Record<ModelKey, GLTF>;
  const tex: Record<string, THREE.Texture> = {};
  const sounds: Partial<Record<SoundKey, AudioBuffer>> = {};

  for (const k of MODEL_KEYS) {
    jobs.push({ w: manifest.models[k]?.kb ?? 200, label: 'modelos', run: async () => { models[k] = await gltf.loadAsync(`${BASE}models/${k}.${MODEL_EXT}`); } });
  }
  for (const t of ['ground', 'ground2']) for (const m of ['diff', 'nor', 'rough']) {
    jobs.push({ w: 150, label: 'texturas', run: async () => {
      const tx = await texLoader.loadAsync(`${BASE}textures/${t}_${m}.webp`);
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
      tx.colorSpace = m === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tx.anisotropy = 4;
      tex[`${t}_${m}`] = tx;
    } });
  }
  for (const s of SOUND_KEYS) {
    jobs.push({ w: 40, label: 'sons', run: async () => {
      try {
        const buf = await (await fetch(`${BASE}audio/${s}.mp3`)).arrayBuffer();
        sounds[s] = await audioCtx.decodeAudioData(buf);
      } catch (e) { console.warn('som falhou', s, e); }
    } });
  }
  const total = jobs.reduce((a, j) => a + j.w, 0);
  let done = 0;
  // baixa em paralelo, no máximo 6 por vez
  let i = 0;
  const worker = async () => {
    while (i < jobs.length) {
      const j = jobs[i++];
      await j.run();
      done += j.w;
      onProgress(done / total, j.label);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  return { models, tex, sounds, manifest };
}
