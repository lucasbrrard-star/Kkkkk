// Personagens jogáveis/NPCs a partir de modelos 3D gratuitos do BlenderKit com
// esqueleto Rigify: pose procedural (art/character.ts) + skinning (art/skin.ts)
// + render em pixel art HD (art/hd.ts) nas 8 direções.

import { loadRig, poseRig, Rig } from './skin';
import { BVH } from './mesh';
import { renderHD } from './hd';
import { Image, setCameraElevation, resetCamera } from './rt';
import { idlePose, walkPose, runPose, jumpPose, DIR_VEC, DIRS } from './character';

export const C3 = { FW: 96, FH: 124, AX: 48, AY: 114, K: 2.13, ELEV: 20 };

export interface CharDef {
  key: string; file: string; name: string;
  hideUnderClothes?: RegExp;          // pele coberta pela roupa (ossos)
  skinMat?: RegExp;
  hide?: RegExp;                      // materiais ocultos (córnea, dentes…)
  eyes?: RegExp;                      // materiais de olho com textura escura → olho procedural
  hair?: { mat: RegExp; color: [number, number, number] };
  recolor?: { mat: RegExp; color?: [number, number, number]; tint?: [number, number, number]; hue?: number; sat?: number }[];
  exposure?: number;
}

export const PLAYER_DEF: CharDef = {
  key: 'player', file: 'tools/models/char_28.glb', name: 'Jogador',
  skinMat: /SKIN/i, hideUnderClothes: /^DEF-(spine(\.00[0-3])?$|pelvis|thigh|shin|upper_arm|forearm|breast|shoulder)/,
  hide: /eyeGLASS|TEETH/i, eyes: /^eye\.[LR]/i, hair: { mat: /HAIR/i, color: [40, 30, 28] }, exposure: 1.18,
};

const HIDE = /teeth|teet|tongue|tongle|gum|mouth|cornea|eyeglass/i;
export const NPC_DEFS: CharDef[] = [
  { key: 'npc0', file: 'tools/models/char_3.glb', name: 'Seu Bené · Pescador', skinMat: /^Skin/i,
    hideUnderClothes: /^DEF-(spine(\.00[0-3])?$|pelvis|thigh|upper_arm|breast|shoulder)/, hide: /Mouth|Gums|Tongue/i, eyes: /^Eye/i,
    hair: { mat: /^Hair/i, color: [30, 22, 20] }, recolor: [{ mat: /^Skin/i, color: [150, 96, 66] }] },
  { key: 'npc1', file: 'tools/models/char_37.glb', name: 'Tomás', hide: HIDE },
  { key: 'npc2', file: 'tools/models/char_25.glb', name: 'Vitória', hide: HIDE },
  { key: 'npc3', file: 'tools/models/char_23.glb', name: 'Seu Oscar · Corretor', hide: HIDE },
  { key: 'npc4', file: 'tools/models/char_30.glb', name: 'Ana', skinMat: /^body_bsd$/i, hideUnderClothes: /^DEF-(spine(\.00[0-3])?$|pelvis|breast)/, hide: /teeth/i, eyes: /eye_[lr]/i },
  { key: 'npc5', file: 'tools/models/char_29.glb', name: 'Zé · Mestre de Obras', hide: HIDE },
];

const ANIMS = {
  idle: { frames: 6, pose: (i: number) => idlePose(i, 6) },
  walk: { frames: 8, pose: (i: number) => walkPose(i, 8) },
  run: { frames: 8, pose: (i: number) => runPose(i, 8) },
  jump: { frames: 6, pose: (i: number) => jumpPose(i) },
};

async function prepare(def: CharDef): Promise<Rig> {
  const rig = await loadRig(def.file, { skinMat: def.skinMat, hideUnderClothes: def.hideUnderClothes });
  for (const m of rig.mats) {
    if (def.hide?.test(m.name)) m.hidden = true;
    if (def.eyes?.test(m.name)) m.fn = (_p, n) => { const d = n[0] * rig.forward[0] + n[2] * rig.forward[2]; return d > 0.93 ? [20, 14, 12] : d > 0.8 ? [92, 58, 36] : [236, 232, 226]; };
    if (def.hair?.mat.test(m.name)) { const c = def.hair.color; m.fn = () => c; }
    for (const r of def.recolor ?? []) if (r.mat.test(m.name)) {
      if (r.color) { const c = r.color; m.fn = () => c; }
      if (r.tint) m.tint = r.tint;
      if (r.hue) m.hue = r.hue;
      if (r.sat) m.sat = r.sat;
    }
  }
  return rig;
}

export async function renderSheet3D(def: CharDef, anims: (keyof typeof ANIMS)[], log?: (m: string) => void) {
  const rig = await prepare(def);
  const { FW, FH, AX, AY, K } = C3;
  const layout: Record<string, { start: number; frames: number }> = {};
  let cols = 0;
  for (const a of anims) { layout[a] = { start: cols, frames: ANIMS[a].frames }; cols += ANIMS[a].frames; }
  const img: Image = { w: cols * FW, h: DIRS.length * FH, ox: 0, oy: 0, data: new Uint8ClampedArray(cols * FW * DIRS.length * FH * 4) };
  setCameraElevation(C3.ELEV);
  for (const a of anims) {
    for (let f = 0; f < ANIMS[a].frames; f++) {
      const mesh = poseRig(rig, ANIMS[a].pose(f) as never);
      const bvh = new BVH(mesh);
      DIRS.forEach((d, row) => {
        const [dx, dz] = DIR_VEC[d];
        const yaw = Math.atan2(dx, dz) - Math.atan2(rig.forward[0], rig.forward[2]);
        const r = renderHD([], [{ mesh, bvh, group: 1 }], { scale: K, ss: 3, colors: 36, width: FW, height: FH, ox: AX, oy: AY, yaw, ambient: 0.45, exposure: def.exposure ?? 1.15 });
        const col = layout[a].start + f;
        for (let y = 0; y < FH; y++) img.data.set(r.img.data.subarray(y * FW * 4, (y + 1) * FW * 4), ((row * FH + y) * img.w + col * FW) * 4);
      });
    }
    log?.(`${def.key}: ${a}`);
  }
  resetCamera();
  return { img, layout, cols };
}
