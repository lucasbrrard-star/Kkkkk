// Personagem chibi em pixel art HD: rig 3D (cápsulas + elipsoides) animado
// proceduralmente e renderizado em 8 direções reais (sem espelhamento).
// O rosto (olhos com brilho, sobrancelhas, boca, blush) é pintado pixel a pixel
// sobre a projeção da cabeça em cada direção, como faria um artista de pixel art.

import { RGB, hex, mix, ramp } from './color';
import {
  Capsule, Ellipsoid, Image, Prim, Sphere, V3, add, cross, mat, mul, norm, render, sub, dot, CAM, setCameraElevation, resetCamera,
} from './rt';

export const DIRS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'] as const;
const R2 = Math.SQRT1_2;
export const DIR_VEC: Record<string, [number, number]> = {
  S: [R2, R2], SE: [1, 0], E: [R2, -R2], NE: [0, -1], N: [-R2, -R2], NW: [-1, 0], W: [-R2, R2], SW: [0, 1],
};

export const CHAR_K = 1.3;      // escala de render (pixel art HD)
export const FRAME_W = 72;
export const FRAME_H = 92;
export const ANCHOR_X = 36;
export const ANCHOR_Y = 84;

export interface Look {
  skin: string; hair: string; eyes: string;
  top: 'hoodie' | 'tee' | 'tank'; topColor: string; inner?: string;
  bottom: 'jeans' | 'shorts'; bottomColor: string;
  shoe: string; shoeTrim: string;
  backpack?: string; hat?: 'straw' | 'cap'; hatColor?: string;
  hair2?: 'messy' | 'long' | 'short' | 'curly' | 'bun' | 'ponytail';
  capColor?: string; shortsTop?: boolean; name?: string;
  mustache?: boolean;
  build?: number;
}

export const PLAYER_LOOK: Look = {
  skin: '#f1b98f', hair: '#2b1810', eyes: '#3a2116',
  top: 'hoodie', topColor: '#d22f2e', inner: '#f3f0ea',
  bottom: 'jeans', bottomColor: '#3c5a9c',
  shoe: '#d3303a', shoeTrim: '#f5f3ef',
  backpack: '#2b2c33', hair2: 'messy',
};

export const NPC_LOOKS: Look[] = [
  { name: 'lia', skin: '#d79a72', hair: '#2a1712', eyes: '#3a2116', top: 'tee', topColor: '#d93a3a', bottom: 'shorts', bottomColor: '#2b2c36', shoe: '#e9e6e0', shoeTrim: '#d33a32', hat: 'cap', hatColor: '#d33a32', hair2: 'ponytail' },
  { name: 'rafa', skin: '#b97a55', hair: '#1d1410', eyes: '#2a1a12', top: 'tank', topColor: '#262830', bottom: 'jeans', bottomColor: '#5a7fb5', shoe: '#2b2c33', shoeTrim: '#f2f0ea', hat: 'cap', hatColor: '#f2f0ea', hair2: 'short', mustache: true },
  { name: 'duda', skin: '#8a5a3c', hair: '#22150f', eyes: '#2a1a12', top: 'tee', topColor: '#f2b632', bottom: 'shorts', bottomColor: '#6b8fc2', shoe: '#f2f0ea', shoeTrim: '#f2b632', hair2: 'curly' },
  { name: 'cida', skin: '#e8b48c', hair: '#c9c4c0', eyes: '#3a2a20', top: 'tee', topColor: '#8e5bb5', bottom: 'jeans', bottomColor: '#6a4c7c', shoe: '#6b4a3a', shoeTrim: '#e9dcc6', hair2: 'bun' },
];

export const NPC_LOOK: Look = {
  skin: '#c98e65', hair: '#4a4038', eyes: '#2a1a12',
  top: 'tee', topColor: '#3b7fc4',
  bottom: 'shorts', bottomColor: '#5f8a4a',
  shoe: '#7a4b2e', shoeTrim: '#e9dcc6',
  hat: 'straw', hatColor: '#e2c272', hair2: 'short', mustache: true,
};
export interface Pose {
  hipL: number; hipR: number; kneeL: number; kneeR: number;
  shL: number; shR: number; elL: number; elR: number;
  abL?: number; abR?: number;  // abdução dos braços
  legAbL?: number; legAbR?: number;
  lean: number; twist: number; bob: number; chest: number; headPitch?: number;
  footL?: number; footR?: number; // inclinação dos pés
  grounded: boolean; lift?: number; sway?: number;
}

const D2R = Math.PI / 180;

// ---- Ciclos de animação -----------------------------------------------------
export function idlePose(i: number, n: number): Pose {
  const t = (i / n) * Math.PI * 2;
  const b = Math.sin(t);
  return {
    hipL: 2, hipR: -2, kneeL: 4, kneeR: 4,
    shL: 4 + 3 * b, shR: 4 - 3 * b, elL: 12 + 4 * b, elR: 12 - 2 * b, abL: 8, abR: 8,
    lean: 1, twist: 0, bob: 0, chest: 0.028 + 0.026 * b, headPitch: -2 * b, grounded: true, sway: 0.012 * Math.sin(t + 0.6),
  };
}

export function walkPose(i: number, n: number): Pose {
  const t = (i / n) * Math.PI * 2;
  const s = Math.sin(t), c = Math.cos(t);
  const swingL = Math.max(0, c) ** 1.6, swingR = Math.max(0, -c) ** 1.6;
  return {
    hipL: 26 * s, hipR: -26 * s,
    kneeL: 6 + 48 * swingL + 6 * Math.max(0, -s), kneeR: 6 + 48 * swingR + 6 * Math.max(0, s),
    footL: -14 * swingL + 10 * Math.max(0, -s), footR: -14 * swingR + 10 * Math.max(0, s),
    shL: -24 * s, shR: 24 * s, elL: 16 + 14 * Math.max(0, -s), elR: 16 + 14 * Math.max(0, s), abL: 6, abR: 6,
    lean: 4, twist: 7 * s, bob: 0, chest: 0.02, headPitch: 0, grounded: true, lift: 0.025 * Math.abs(Math.cos(t)),
  };
}

export function runPose(i: number, n: number): Pose {
  const t = (i / n) * Math.PI * 2;
  const s = Math.sin(t), c = Math.cos(t);
  const swingL = Math.max(0, c) ** 1.2, swingR = Math.max(0, -c) ** 1.2;
  return {
    hipL: 38 * s + 6, hipR: -38 * s + 6,
    kneeL: 18 + 88 * swingL + 10 * Math.max(0, -s), kneeR: 18 + 88 * swingR + 10 * Math.max(0, s),
    footL: -20 * swingL + 16 * Math.max(0, -s), footR: -20 * swingR + 16 * Math.max(0, s),
    shL: -44 * s + 6, shR: 44 * s + 6, elL: 78 + 12 * s, elR: 78 - 12 * s, abL: 10, abR: 10,
    lean: 13, twist: 11 * s, bob: 0, chest: 0.02, headPitch: 5, grounded: true,
    lift: 0.07 * Math.abs(Math.sin(t)),
  };
}

// 0 preparação, 1 impulso, 2 subida, 3 ápice, 4 descida, 5 aterrissagem
export function jumpPose(i: number): Pose {
  const P: Pose[] = [
    { hipL: 34, hipR: 30, kneeL: 66, kneeR: 62, footL: 18, footR: 16, shL: -36, shR: -38, elL: 24, elR: 24, abL: 12, abR: 12, lean: 18, twist: 0, bob: 0, chest: 0.0, headPitch: 8, grounded: true },
    { hipL: -6, hipR: 2, kneeL: 6, kneeR: 10, footL: 34, footR: 28, shL: 120, shR: 112, elL: 20, elR: 24, abL: 14, abR: 14, lean: 2, twist: 0, bob: 0.06, chest: 0.04, headPitch: -8, grounded: false },
    { hipL: 24, hipR: -8, kneeL: 52, kneeR: 22, footL: 10, footR: 20, shL: 150, shR: 140, elL: 16, elR: 22, abL: 20, abR: 20, lean: 2, twist: 0, bob: 0.08, chest: 0.04, headPitch: -6, grounded: false },
    { hipL: 46, hipR: 18, kneeL: 84, kneeR: 58, footL: 6, footR: 8, shL: 100, shR: 90, elL: 30, elR: 34, abL: 46, abR: 46, lean: 6, twist: 0, bob: 0.1, chest: 0.03, headPitch: 0, grounded: false },
    { hipL: 18, hipR: 6, kneeL: 30, kneeR: 18, footL: 4, footR: 4, shL: 50, shR: 44, elL: 26, elR: 26, abL: 62, abR: 62, lean: 4, twist: 0, bob: 0.05, chest: 0.03, headPitch: 4, grounded: false },
    { hipL: 36, hipR: 34, kneeL: 70, kneeR: 66, footL: 16, footR: 16, shL: 26, shR: 22, elL: 30, elR: 30, abL: 28, abR: 28, lean: 16, twist: 0, bob: 0, chest: 0.0, headPitch: 8, grounded: true },
  ];
  return P[i];
}


// ---- Construção do modelo ----------------------------------------------------
function rotAround(v: V3, axis: V3, ang: number): V3 {
  const c = Math.cos(ang), s = Math.sin(ang);
  const k = norm(axis);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}

export interface FaceInfo {
  headC: V3; F: V3; R: V3; U: V3; HR: number; skin: RGB[];
}

export function buildCharacter(L: Look, dirName: string, pose: Pose): { prims: Prim[]; face: FaceInfo } {
  const S = L.build ?? 1;
  const [fx, fz] = DIR_VEC[dirName];
  const F: V3 = [fx, 0, fz];
  const Rv: V3 = [-fz, 0, fx];
  const UP: V3 = [0, 1, 0];
  const DOWN: V3 = [0, -1, 0];

  const HR = 0.45 * S;
  const thigh = 0.29 * S, shin = 0.27 * S, ankleH = 0.1 * S;
  const ua = 0.23 * S, fa = 0.2 * S;
  const hipW = 0.12 * S, shW = 0.27 * S;

  const lean = pose.lean * D2R;
  const tw = pose.twist * D2R;
  const Ft = rotAround(F, UP, tw), Rt = rotAround(Rv, UP, tw);
  const Fp = rotAround(F, UP, -tw * 0.5), Rp = rotAround(Rv, UP, -tw * 0.5);
  const upT = add(mul(UP, Math.cos(lean)), mul(Ft, Math.sin(lean)));

  let pelvis: V3 = [0, (thigh + shin + ankleH) * 0.985 + pose.bob + (pose.lift ?? 0), 0];
  pelvis = add(pelvis, mul(Rv, (pose.sway ?? 0) * 1.5));

  const legFK = (side: number, hip: number, knee: number, foot: number, ab = 0) => {
    const root = add(pelvis, mul(Rp, side * hipW));
    const a = hip * D2R;
    const lat = mul(Rp, side * Math.sin(ab * D2R));
    const d1 = norm(add(add(mul(DOWN, Math.cos(a)), mul(Fp, Math.sin(a))), lat));
    const kneeP = add(root, mul(d1, thigh));
    const a2 = (hip - knee) * D2R;
    const d2 = norm(add(add(mul(DOWN, Math.cos(a2)), mul(Fp, Math.sin(a2))), lat));
    const ankle = add(kneeP, mul(d2, shin));
    const fp = (foot ?? 0) * D2R;
    const fdir = norm(add(mul(Fp, Math.cos(fp)), mul(DOWN, Math.sin(fp))));
    return { root, knee: kneeP, ankle, fdir };
  };
  let legL = legFK(1, pose.hipL, pose.kneeL, pose.footL ?? 0, pose.legAbL ?? 3);
  let legR = legFK(-1, pose.hipR, pose.kneeR, pose.footR ?? 0, pose.legAbR ?? 3);
  if (pose.grounded) {
    const lowest = Math.min(legL.ankle[1], legR.ankle[1]) - ankleH;
    pelvis = sub(pelvis, [0, lowest - (pose.lift ?? 0), 0]);
    legL = legFK(1, pose.hipL, pose.kneeL, pose.footL ?? 0, pose.legAbL ?? 3);
    legR = legFK(-1, pose.hipR, pose.kneeR, pose.footR ?? 0, pose.legAbR ?? 3);
  }

  const chestC = add(pelvis, mul(upT, 0.27 * S + pose.chest * 0.6));
  const shoulderC = add(pelvis, mul(upT, 0.44 * S + pose.chest * 1.2));
  const neck = add(shoulderC, mul(upT, 0.04 * S));
  const hp = (pose.headPitch ?? 0) * D2R;
  const headUp = norm(add(mul(upT, Math.cos(hp)), mul(Ft, Math.sin(hp))));
  const headC = add(neck, mul(headUp, HR * 0.86));
  const headF = norm(sub(Ft, mul(headUp, dot(Ft, headUp))));

  // ---------- materiais
  const skinR = ramp(L.skin, { spread: 0.7, hueShift: 0.3 });
  const hairR = ramp(L.hair, { spread: 0.55 });
  const topR = ramp(L.topColor, { spread: 0.8 });
  const innerR = ramp(L.inner ?? '#f3f0ea', { spread: 0.45 });
  const botR = ramp(L.bottomColor, { spread: 0.75 });
  const botLight = ramp(mix(hex(L.bottomColor), [235, 240, 250], 0.35), { spread: 0.6 });
  const shoeR = ramp(L.shoe, { spread: 0.8 });
  const trimR = ramp(L.shoeTrim, { spread: 0.45 });

  const mSkin = mat(skinR);
  const mHead = mat(skinR, (c) => {
    const l = sub(c.p, headC);
    const f = dot(l, headF) / HR, r = dot(l, Rt) / HR, u = dot(l, headUp) / HR;
    if (L.hair2 !== 'short') {
      const fringe = 0.4 + 0.1 * Math.abs(Math.sin(r * 7.5 + 0.8));
      if (u > fringe) return hairR;
      if (Math.abs(r) > 0.8 && u > -0.25) return hairR;
    } else if (u > 0.42 || (Math.abs(r) > 0.82 && u > 0)) return hairR;
    if (f < -0.25 && u > -0.45) return hairR;
    if (L.mustache && f > 0.5 && u < -0.42 && u > -0.56 && Math.abs(r) < 0.38) return { ramp: hairR, shift: 0 };
    return 0;
  });
  const mHair = mat(hairR, (c) => {
    const l = sub(c.p, headC);
    const u = dot(l, headUp) / HR, r = dot(l, Rt) / HR;
    // mecha de brilho
    if (c.level >= 3 && Math.sin(r * 9 + u * 4) > 0.6) return 0;
    return -1;
  });
  const mTop = mat(topR, (c) => {
    if (L.top !== 'hoodie') return 0;
    const l = sub(c.p, chestC);
    const f = dot(l, Ft), r = dot(l, Rt), u = dot(l, upT);
    if (f > 0.02) {
      const open = 0.075 + Math.max(0, u) * 0.12;
      if (Math.abs(r) < open && u < 0.24) return { ramp: innerR, shift: 0 };
      if (Math.abs(r) < open + 0.03 && u < 0.24) return -1; // zíper / borda
    }
    if (u < -0.15) return -1; // barra
    return 0;
  });
  const mHem = mat(topR, (c) => {
    const l = sub(c.p, chestC);
    const f = dot(l, Ft), r = dot(l, Rt);
    if (L.top === 'hoodie' && f > 0.02 && Math.abs(r) < 0.075) return { ramp: innerR, shift: -1 };
    return -1;
  });
  const mSleeve = mat(topR, (c) => (c.local[0] > 0.82 ? -1 : 0));
  const mBot = mat(botR, (c) => {
    if (L.bottom === 'jeans' && c.local[0] > 0.8) return { ramp: botLight, shift: 0 }; // barra dobrada
    return 0;
  });
  const mPelvis = mat(botR, (c) => {
    const u = dot(sub(c.p, pelvis), upT);
    return u > 0.07 ? -1 : 0;
  });
  const mShoe = mat(shoeR, (c) => {
    if (c.local[1] < -0.05 * S) return { ramp: trimR, shift: 0 };       // solado
    if (c.local[0] > 0.15 * S && c.local[1] < 0.03 * S) return { ramp: trimR, shift: 0 };          // biqueira
    if (c.local[1] > 0.06 * S && Math.abs(c.local[2]) < 0.04) return { ramp: trimR, shift: 1 }; // cadarço
    return 0;
  });

  const prims: Prim[] = [];
  const G = { body: 1, legL: 2, legR: 3, armL: 4, armR: 5, head: 6, pack: 7, shoeL: 8, shoeR: 9, hair: 10 };

  // ---------- pernas
  const leg = (lg: ReturnType<typeof legFK>, g: number, gs: number) => {
    const thickT = L.bottom === 'jeans' ? 0.115 : 0.11;
    if (L.bottom === 'jeans') {
      prims.push(new Capsule(lg.root, lg.knee, thickT * S, mat(botR)).setGroup(g));
      prims.push(new Capsule(lg.knee, add(lg.ankle, [0, 0.03, 0]), 0.1 * S, mBot).setGroup(g));
    } else {
      const mid = add(lg.root, mul(sub(lg.knee, lg.root), 0.85));
      prims.push(new Capsule(lg.root, mid, 0.125 * S, mat(botR)).setGroup(g));
      prims.push(new Capsule(mid, lg.knee, 0.085 * S, mSkin).setGroup(g));
      prims.push(new Capsule(lg.knee, lg.ankle, 0.08 * S, mSkin).setGroup(g));
    }
    const fc = add(add(lg.ankle, mul(lg.fdir, 0.07 * S)), [0, -0.035 * S, 0]);
    const fw = norm(cross(lg.fdir, UP));
    const fu = norm(cross(fw, lg.fdir));
    prims.push(new Ellipsoid(fc, [0.2 * S, 0.11 * S, 0.13 * S], mShoe, [lg.fdir, fu, fw]).setGroup(gs));
  };
  leg(legL, G.legL, G.shoeL);
  leg(legR, G.legR, G.shoeR);

  // ---------- tronco
  const basis: [V3, V3, V3] = [Rt, upT, norm(cross(Rt, upT))];
  prims.push(new Ellipsoid(add(pelvis, mul(upT, 0.02 * S)), [0.23 * S, 0.13 * S, 0.17 * S], mPelvis, basis).setGroup(G.body));
  prims.push(new Ellipsoid(chestC, [0.26 * S, 0.24 * S, 0.19 * S], mTop, basis).setGroup(G.body));
  if (L.top === 'hoodie') {
    prims.push(new Ellipsoid(add(pelvis, mul(upT, 0.1 * S)), [0.27 * S, 0.075 * S, 0.2 * S], mHem, basis).setGroup(G.body));
    // capuz atrás do pescoço
    prims.push(new Ellipsoid(add(add(shoulderC, mul(Ft, -0.15 * S)), mul(upT, 0.02 * S)), [0.22 * S, 0.11 * S, 0.12 * S], mat(topR, () => -1), basis).setGroup(G.body));
    // cordões do capuz
    for (const sd of [-1, 1]) {
      const a0 = add(add(shoulderC, mul(Rt, sd * 0.07 * S)), mul(Ft, 0.15 * S));
      prims.push(new Capsule(a0, add(a0, mul(upT, -0.15 * S)), 0.018 * S, mat(innerR, () => 1)).setGroup(G.body));
    }
  }
  prims.push(new Capsule(add(shoulderC, mul(Rt, -0.16 * S)), add(shoulderC, mul(Rt, 0.16 * S)), 0.11 * S, mTop).setGroup(G.body));

  // ---------- mochila
  if (L.backpack) {
    const pr = ramp(L.backpack, { spread: 0.7 });
    const pm = mat(pr, (c) => (Math.abs(dot(sub(c.p, chestC), upT) + 0.02) < 0.02 ? 1 : 0));
    const pc = add(add(chestC, mul(Ft, -0.22 * S)), mul(upT, 0.03 * S));
    prims.push(new Ellipsoid(pc, [0.22 * S, 0.25 * S, 0.12 * S], pm, basis).setGroup(G.pack));
    prims.push(new Ellipsoid(add(pc, add(mul(Ft, -0.1 * S), mul(upT, -0.08 * S))), [0.15 * S, 0.1 * S, 0.06 * S], mat(pr, () => -1), basis).setGroup(G.pack));
    for (const sd of [-1, 1]) {
      const a0 = add(add(shoulderC, mul(Rt, sd * 0.15 * S)), mul(upT, 0.07 * S));
      const b0 = add(add(chestC, mul(Rt, sd * 0.17 * S)), add(mul(Ft, 0.16 * S), mul(upT, -0.12 * S)));
      prims.push(new Capsule(a0, b0, 0.035 * S, mat(pr, () => -1)).setGroup(G.body));
    }
  }

  // ---------- braços
  const arm = (side: number, sh: number, el: number, ab: number, g: number) => {
    const root = add(add(shoulderC, mul(Rt, side * shW)), mul(upT, -0.03 * S));
    const a = sh * D2R, abr = ab * D2R;
    const d1 = norm(add(add(mul(DOWN, Math.cos(a) * Math.cos(abr)), mul(Ft, Math.sin(a))), mul(Rt, side * Math.sin(abr))));
    const elbow = add(root, mul(d1, ua));
    const a2 = (sh + el) * D2R;
    const d2 = norm(add(add(mul(DOWN, Math.cos(a2) * Math.cos(abr * 0.7)), mul(Ft, Math.sin(a2))), mul(Rt, side * Math.sin(abr * 0.7))));
    const hand = add(elbow, mul(d2, fa));
    if (L.top === 'tank') {
      prims.push(new Capsule(root, elbow, 0.075 * S, mSkin).setGroup(g));
      prims.push(new Capsule(elbow, hand, 0.07 * S, mSkin).setGroup(g));
    } else if (L.top === 'tee') {
      const sl = add(root, mul(d1, ua * 0.55));
      prims.push(new Capsule(root, sl, 0.1 * S, mat(topR)).setGroup(g));
      prims.push(new Capsule(sl, elbow, 0.075 * S, mSkin).setGroup(g));
      prims.push(new Capsule(elbow, hand, 0.07 * S, mSkin).setGroup(g));
    } else {
      prims.push(new Capsule(root, elbow, 0.1 * S, mat(topR)).setGroup(g));
      prims.push(new Capsule(elbow, hand, 0.092 * S, mSleeve).setGroup(g));
    }
    prims.push(new Sphere(add(hand, mul(d2, 0.03 * S)), 0.085 * S, mSkin).setGroup(g));
  };
  arm(1, pose.shL, pose.elL, pose.abL ?? 8, G.armL);
  arm(-1, pose.shR, pose.elR, pose.abR ?? 8, G.armR);

  // ---------- cabeça
  const hb: [V3, V3, V3] = [Rt, headUp, norm(cross(Rt, headUp))];
  prims.push(new Ellipsoid(headC, [HR * 1.0, HR * 0.95, HR * 0.94], mHead, hb).setGroup(G.head));
  // queixo levemente afilado
  prims.push(new Ellipsoid(add(add(headC, mul(headUp, -0.38 * HR)), mul(headF, 0.18 * HR)), [HR * 0.62, HR * 0.5, HR * 0.6], mSkin, hb).setGroup(G.head));
  // orelhas
  for (const sd of [-1, 1]) prims.push(new Ellipsoid(add(add(headC, mul(Rt, sd * 0.95 * HR)), mul(headUp, -0.1 * HR)), [0.14 * HR, 0.22 * HR, 0.16 * HR], mSkin, hb).setGroup(G.head));

  const hairPrim = (c: V3, rad: V3, axis: V3) => {
    const ax = norm(axis);
    const side = norm(Math.abs(dot(ax, UP)) > 0.95 ? cross(ax, Rt) : cross(ax, UP));
    const up2 = norm(cross(side, ax));
    prims.push(new Ellipsoid(c, rad, mHair, [ax, up2, side]).setGroup(G.hair));
  };
  const hdir = (f: number, r: number, u: number): V3 => norm(add(add(mul(headF, f), mul(Rt, r)), mul(headUp, u)));
  // calota
  prims.push(new Ellipsoid(add(add(headC, mul(headUp, 0.36 * HR)), mul(headF, -0.22 * HR)), [HR * 1.02, HR * 0.8, HR * 0.96], mHair, hb).setGroup(G.hair));
  if (L.hair2 === 'curly') {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, uu = 0.2 + (k % 3) * 0.28;
      const d = hdir(Math.sin(a) * 0.9 - 0.25, Math.cos(a), uu);
      prims.push(new Sphere(add(headC, mul(d, HR * 0.92)), HR * (0.42 + (k % 2) * 0.08), mHair).setGroup(G.hair));
    }
    for (let k = 0; k < 5; k++) prims.push(new Sphere(add(headC, mul(hdir(-0.7, (k - 2) * 0.35, -0.45), HR * 0.95)), HR * 0.42, mHair).setGroup(G.hair));
  } else if (L.hair2 === 'bun' || L.hair2 === 'ponytail') {
    prims.push(new Ellipsoid(add(add(headC, mul(headUp, 0.5 * HR)), mul(headF, 0.1 * HR)), [HR * 0.92, HR * 0.42, HR * 0.86], mHair, hb).setGroup(G.hair));
    if (L.hair2 === 'bun') prims.push(new Sphere(add(add(headC, mul(headUp, 0.75 * HR)), mul(headF, -0.75 * HR)), 0.42 * HR, mHair).setGroup(G.hair));
    else {
      const base = add(add(headC, mul(headUp, 0.35 * HR)), mul(headF, -0.95 * HR));
      prims.push(new Capsule(base, add(add(base, mul(headUp, -1.2 * HR)), mul(headF, -0.35 * HR)), 0.26 * HR, mHair).setGroup(G.hair));
    }
  } else if (L.hair2 === 'messy' || L.hair2 === 'long') {
    const spikes: [number, number, number, number][] = [
      [0, 0, 1, 1], [0.35, 0.5, 0.8, 0.9], [0.35, -0.55, 0.78, 0.9], [-0.5, 0.35, 0.8, 1], [-0.55, -0.4, 0.75, 1],
      [-0.95, 0.25, 0.25, 0.95], [-0.95, -0.3, 0.3, 0.95], [-0.75, 0.05, -0.25, 0.85], [0.05, 1, 0.35, 0.8], [0.05, -1, 0.4, 0.8],
      [-0.4, 0.85, 0.1, 0.8], [-0.4, -0.85, 0.15, 0.8],
    ];
    for (const [f, r, u, k] of spikes) {
      const d = hdir(f, r, u);
      hairPrim(add(headC, mul(d, HR * 0.86)), [0.4 * HR * k, 0.22 * HR, 0.25 * HR], d);
    }
    // franja caindo sobre a testa
    const bangs: [number, number, number][] = [[0.78, 0.42, 0.7], [0.84, 0.0, 0.68], [0.78, -0.45, 0.7], [0.64, 0.76, 0.5], [0.64, -0.76, 0.52]];
    for (const [f, r, u] of bangs) {
      const d = hdir(f, r, u);
      const axis = norm(add(d, mul(headUp, -1.25)));
      hairPrim(add(headC, mul(d, HR * 0.86)), [0.3 * HR, 0.15 * HR, 0.21 * HR], axis);
    }
    if (L.hair2 === 'long') {
      for (const sd of [-1, 0, 1]) prims.push(new Ellipsoid(add(add(headC, mul(headF, -0.55 * HR)), add(mul(Rt, sd * 0.5 * HR), mul(headUp, -0.9 * HR))), [0.35 * HR, 0.85 * HR, 0.3 * HR], mHair, hb).setGroup(G.hair));
    }
  } else {
    prims.push(new Ellipsoid(add(add(headC, mul(headUp, 0.5 * HR)), mul(headF, 0.15 * HR)), [HR * 0.85, HR * 0.4, HR * 0.8], mHair, hb).setGroup(G.hair));
  }
  if (L.hat === 'straw') {
    const hr = ramp(L.hatColor ?? '#e2c272', { spread: 0.65 });
    const hm = mat(hr, (c) => (Math.sin((c.p[0] + c.p[2]) * 40) > 0.7 ? -1 : 0));
    const brimC = add(headC, mul(headUp, 0.55 * HR));
    prims.push(new Ellipsoid(brimC, [1.65 * HR, 0.1 * HR, 1.65 * HR], hm, hb).setGroup(G.hair));
    prims.push(new Ellipsoid(add(brimC, mul(headUp, 0.35 * HR)), [0.95 * HR, 0.55 * HR, 0.95 * HR], hm, hb).setGroup(G.hair));
    prims.push(new Ellipsoid(add(brimC, mul(headUp, 0.12 * HR)), [0.97 * HR, 0.12 * HR, 0.97 * HR], mat(ramp('#a8402f'), () => 0), hb).setGroup(G.hair));
  }
  if (L.hat === 'cap') {
    const cr = ramp(L.hatColor ?? '#d33a32', { spread: 0.7 });
    const cm = mat(cr, (c) => {
      const l = sub(c.p, headC);
      return Math.abs(dot(l, Rt)) < 0.05 * HR && dot(l, headF) > 0 ? { ramp: ramp('#f4efe6', { spread: 0.4 }), shift: 0 } : 0;
    });
    prims.push(new Ellipsoid(add(add(headC, mul(headUp, 0.3 * HR)), mul(headF, -0.05 * HR)), [HR * 1.06, HR * 0.78, HR * 1.04], cm, hb).setGroup(G.hair));
    prims.push(new Ellipsoid(add(add(headC, mul(headUp, 0.36 * HR)), mul(headF, 0.95 * HR)), [HR * 0.72, HR * 0.08, HR * 0.6], mat(cr, () => -1), [Rt, headUp, headF]).setGroup(G.hair));
  }
  return { prims, face: { headC, F: headF, R: Rt, U: headUp, HR, skin: skinR } };
}

// ---- Pintura do rosto -----------------------------------------------------------
export const CHAR_ELEVATION = 14;

function px(p: V3): [number, number] {
  return [Math.floor(ANCHOR_X + (p[0] - p[2]) * 16 * CHAR_K), Math.floor(ANCHOR_Y + ((p[0] + p[2]) * CAM.KD - p[1] * CAM.KV) * CHAR_K)];
}

function paintFace(img: Image, info: { group: Int32Array; ramps: (RGB[] | null)[] }, face: FaceInfo, L: Look) {
  const isSkin = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) return false;
    return info.ramps[y * img.w + x] === face.skin;
  };
  const put = (x: number, y: number, c: RGB, force = false) => {
    if (!force && !isSkin(x, y)) return;
    const i = (y * img.w + x) * 4;
    img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
  };
  const K = hex('#1b1118');
  const IR = hex(L.eyes);
  const IR2 = mix(IR, [140, 90, 60], 0.35);
  const W = hex('#ffffff');
  const BROW = mix(hex(L.hair), [20, 12, 16], 0.4);
  const MOUTH = hex('#9a3b3b');
  const BLUSH = mix(hex(L.skin), hex('#f06a6a'), 0.45);
  const { headC, F, R, U, HR } = face;
  const at = (f: number, r: number, u: number): V3 => add(headC, add(add(mul(F, f * HR), mul(R, r * HR)), mul(U, u * HR)));
  const TO_CAM = norm([1, 2 * CAM.KD / CAM.KV, 1]) as V3;
  const vis = (f: number, r: number, u: number) => dot(norm(add(add(mul(F, f), mul(R, r)), mul(U, u))), TO_CAM);

  const eyes: { r: number; x: number; y: number; v: number }[] = [];
  for (const side of [-1, 1]) {
    const f = 0.8, r = side * 0.42, u = -0.2;
    const v = vis(f, r, u);
    if (v < 0.12) continue;
    const [x, y] = px(at(f, r, u));
    eyes.push({ r: side, x, y, v });
  }
  for (const e of eyes) {
    const wide = e.v > 0.5;
    const x0 = e.x - (wide ? 1 : 0), y0 = e.y - 2;
    // sobrancelha (expressão determinada: canto interno mais baixo)
    const inner = e.x < (eyes.length === 2 ? (eyes[0].x + eyes[1].x) / 2 : e.x) ? 1 : -1;
    for (let k = -1; k <= (wide ? 2 : 1); k++) put(e.x + k - (wide && inner > 0 ? 1 : 0), y0 - 3 + (k === inner ? 1 : 0), BROW, true);
    if (wide) {
      // olho 4×6: cílios, íris grande com brilho duplo, pálpebra inferior
      const mir = e.x < (eyes.length === 2 ? (eyes[0].x + eyes[1].x) / 2 : e.x);
      const X = (k: number) => (mir ? x0 + k : x0 + 3 - k);
      for (let k = 0; k < 4; k++) put(X(k), y0 - 1, K);
      put(X(0), y0, K); put(X(1), y0, W); put(X(2), y0, W); put(X(3), y0, IR);
      put(X(0), y0 + 1, K); put(X(1), y0 + 1, W); put(X(2), y0 + 1, IR); put(X(3), y0 + 1, IR);
      put(X(0), y0 + 2, IR); put(X(1), y0 + 2, IR); put(X(2), y0 + 2, IR2); put(X(3), y0 + 2, IR);
      put(X(0), y0 + 3, IR); put(X(1), y0 + 3, IR2); put(X(2), y0 + 3, W); put(X(3), y0 + 3, IR2);
      put(X(1), y0 + 4, K); put(X(2), y0 + 4, K); put(X(3), y0 + 4, K);
    } else {
      put(x0, y0 - 1, K); put(x0 + 1, y0 - 1, K);
      put(x0, y0, W); put(x0 + 1, y0, IR);
      put(x0, y0 + 1, IR); put(x0 + 1, y0 + 1, IR);
      put(x0, y0 + 2, IR2); put(x0 + 1, y0 + 2, IR2);
      put(x0, y0 + 3, K); put(x0 + 1, y0 + 3, K);
    }
    if (e.v > 0.55) { const bx = e.x + (e.x < (eyes.length === 2 ? (eyes[0].x + eyes[1].x) / 2 : 0) ? -1 : 1); put(bx, y0 + 6, BLUSH); put(bx + 1, y0 + 6, BLUSH); }
  }
  const mv = vis(0.8, 0, -0.62);
  if (mv > 0.2 && !L.mustache) {
    const [x, y] = px(at(0.82, 0, -0.62));
    put(x, y, MOUTH);
    if (mv > 0.55) { put(x - 1, y, MOUTH); put(x + 1, y - 1, MOUTH); put(x - 2, y - 1, MOUTH); }
  }
  // nariz: sombra de 1px
  const nv = vis(0.95, 0, -0.28);
  if (nv > 0.3) {
    const [x, y] = px(at(0.96, 0, -0.28));
    const i = (y * img.w + x) * 4;
    if (isSkin(x, y)) { put(x, y, mix([img.data[i], img.data[i + 1], img.data[i + 2]] as RGB, [150, 80, 70], 0.3)); }
  }
}

export function renderCharacterFrame(L: Look, dir: string, pose: Pose): Image {
  const { prims, face } = buildCharacter(L, dir, pose);
  setCameraElevation(CHAR_ELEVATION);
  const { img } = render(prims, {
    width: FRAME_W, height: FRAME_H, ox: ANCHOR_X, oy: ANCHOR_Y, outline: true, innerLines: true, selfShadow: true, scale: CHAR_K,
    ambient: 0.45, outlineDark: 0.7, outlineMix: 0.7,
    extraPost: (im, info) => paintFace(im, info, face, L),
  });
  resetCamera();
  return img;
}

export const ANIMS = {
  idle: { frames: 6, pose: (i: number) => idlePose(i, 6) },
  walk: { frames: 8, pose: (i: number) => walkPose(i, 8) },
  run: { frames: 8, pose: (i: number) => runPose(i, 8) },
  jump: { frames: 6, pose: (i: number) => jumpPose(i) },
};

export function renderSheet(L: Look, anims: (keyof typeof ANIMS)[]): { img: Image; layout: Record<string, { start: number; frames: number }>; cols: number } {
  const layout: Record<string, { start: number; frames: number }> = {};
  let cols = 0;
  for (const a of anims) { layout[a] = { start: cols, frames: ANIMS[a].frames }; cols += ANIMS[a].frames; }
  const sheet: Image = { w: cols * FRAME_W, h: DIRS.length * FRAME_H, data: new Uint8ClampedArray(cols * FRAME_W * DIRS.length * FRAME_H * 4), ox: 0, oy: 0 };
  DIRS.forEach((d, row) => {
    for (const a of anims) {
      for (let f = 0; f < ANIMS[a].frames; f++) {
        const fr = renderCharacterFrame(L, d, ANIMS[a].pose(f));
        const col = layout[a].start + f;
        for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) {
          const si = (y * FRAME_W + x) * 4;
          const di = ((row * FRAME_H + y) * sheet.w + col * FRAME_W + x) * 4;
          sheet.data[di] = fr.data[si]; sheet.data[di + 1] = fr.data[si + 1]; sheet.data[di + 2] = fr.data[si + 2]; sheet.data[di + 3] = fr.data[si + 3];
        }
      }
    }
  });
  return { img: sheet, layout, cols };
}
