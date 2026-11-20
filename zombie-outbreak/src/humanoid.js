// Procedural humanoid rig (no external assets): jointed groups + capsule meshes.
// Front of the character is local +Z. Feet rest on y = 0.
import * as THREE from 'three';

const G = {
  limbU: new THREE.CapsuleGeometry(0.068, 0.2, 4, 10),
  limbL: new THREE.CapsuleGeometry(0.058, 0.2, 4, 10),
  thigh: new THREE.CapsuleGeometry(0.092, 0.27, 4, 10),
  shin: new THREE.CapsuleGeometry(0.075, 0.28, 4, 10),
  torso: new THREE.CapsuleGeometry(0.2, 0.28, 6, 14),
  pelvis: new THREE.CapsuleGeometry(0.15, 0.16, 4, 10),
  head: new THREE.SphereGeometry(0.125, 18, 14),
  neck: new THREE.CylinderGeometry(0.055, 0.065, 0.12, 10),
  hand: new THREE.SphereGeometry(0.055, 10, 8),
  foot: new THREE.BoxGeometry(0.12, 0.08, 0.27),
  eye: new THREE.SphereGeometry(0.018, 8, 6),
  nose: new THREE.ConeGeometry(0.025, 0.06, 6),
  hair: new THREE.SphereGeometry(0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
  pack: new THREE.BoxGeometry(0.34, 0.42, 0.18),
  collar: new THREE.TorusGeometry(0.12, 0.04, 6, 14),
};
G.pack.translate(0, 0, 0);

export const UPPER = 0.3, LOWER = 0.3;

function mesh(geo, mat, part) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (part) m.userData.part = part;
  return m;
}

function makeArm(side, mats) {
  const shoulder = new THREE.Group();
  const up = mesh(G.limbU, mats.sleeve, 'arm');
  up.position.y = -UPPER / 2;
  shoulder.add(up);
  const elbow = new THREE.Group();
  elbow.position.y = -UPPER;
  shoulder.add(elbow);
  const lo = mesh(G.limbL, mats.forearm, 'arm');
  lo.position.y = -LOWER / 2;
  elbow.add(lo);
  const hand = mesh(G.hand, mats.skin, 'arm');
  hand.position.y = -LOWER - 0.02;
  elbow.add(hand);
  return { shoulder, elbow };
}

function makeLeg(mats) {
  const hip = new THREE.Group();
  const th = mesh(G.thigh, mats.pants, 'leg');
  th.position.y = -0.21;
  hip.add(th);
  const knee = new THREE.Group();
  knee.position.y = -0.43;
  hip.add(knee);
  const sh = mesh(G.shin, mats.pants, 'leg');
  sh.position.y = -0.2;
  knee.add(sh);
  const foot = mesh(G.foot, mats.shoes, 'leg');
  foot.position.set(0, -0.4, 0.05);
  knee.add(foot);
  return { hip, knee };
}

export function createHumanoid(m) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // used for whole-body tilt (death fall)
  root.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.92;
  body.add(hips);
  const pelvis = mesh(G.pelvis, m.pants, 'body');
  pelvis.rotation.z = Math.PI / 2;
  pelvis.scale.set(1, 1, 0.75);
  hips.add(pelvis);

  const spine = new THREE.Group();
  spine.position.y = 0.06;
  hips.add(spine);
  const torso = mesh(G.torso, m.shirt, 'body');
  torso.position.y = 0.27;
  torso.scale.set(1.12, 1, 0.68);
  spine.add(torso);
  const collar = mesh(G.collar, m.shirt, 'body');
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.52;
  spine.add(collar);

  const neck = new THREE.Group();
  neck.position.y = 0.55;
  spine.add(neck);
  const neckM = mesh(G.neck, m.skin, 'head');
  neckM.position.y = 0.04;
  neck.add(neckM);
  const head = new THREE.Group();
  head.position.y = 0.17;
  neck.add(head);
  const headM = mesh(G.head, m.skin, 'head');
  headM.scale.set(0.88, 1.05, 0.98);
  head.add(headM);
  if (m.hair) {
    const hair = mesh(G.hair, m.hair, 'head');
    hair.position.set(0, 0.015, -0.01);
    hair.rotation.x = -0.25;
    hair.scale.set(0.9, 1, 1);
    head.add(hair);
  }
  const eyeL = mesh(G.eye, m.eye, 'head');
  eyeL.position.set(0.042, 0.02, 0.11);
  const eyeR = eyeL.clone();
  eyeR.position.x = -0.042;
  head.add(eyeL, eyeR);
  const nose = mesh(G.nose, m.skin, 'head');
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.01, 0.125);
  head.add(nose);

  const lArm = makeArm(1, m);
  lArm.shoulder.position.set(0.25, 0.47, 0);
  const rArm = makeArm(-1, m);
  rArm.shoulder.position.set(-0.25, 0.47, 0);
  spine.add(lArm.shoulder, rArm.shoulder);

  const lLeg = makeLeg(m);
  lLeg.hip.position.set(0.11, -0.04, 0);
  const rLeg = makeLeg(m);
  rLeg.hip.position.set(-0.11, -0.04, 0);
  hips.add(lLeg.hip, rLeg.hip);

  if (m.pack) {
    const pack = mesh(G.pack, m.pack, 'body');
    pack.position.set(0, 0.3, -0.2);
    spine.add(pack);
  }

  return {
    root, body, hips, spine, neck, head,
    lShoulder: lArm.shoulder, lElbow: lArm.elbow,
    rShoulder: rArm.shoulder, rElbow: rArm.elbow,
    lHip: lLeg.hip, lKnee: lLeg.knee, rHip: rLeg.hip, rKnee: rLeg.knee,
  };
}

// --- analytic two-bone IK in the parent (spine) space -------------------
const _S = new THREE.Vector3(), _D = new THREE.Vector3(), _E = new THREE.Vector3(), _N = new THREE.Vector3();
const _DOWN = new THREE.Vector3(0, -1, 0), _q = new THREE.Quaternion(), _F = new THREE.Vector3();
export function solveArmIK(shoulder, elbow, target, pole) {
  _S.copy(shoulder.position);
  _D.subVectors(target, _S);
  let d = _D.length();
  const a = UPPER, b = LOWER + 0.03;
  d = Math.min(Math.max(d, 0.05), a + b - 0.001);
  _D.normalize();
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _N.copy(pole).addScaledVector(_D, -pole.dot(_D)).normalize();
  _E.copy(_S).addScaledVector(_D, a * cosA).addScaledVector(_N, a * sinA);
  _F.subVectors(_E, _S).normalize();
  shoulder.quaternion.setFromUnitVectors(_DOWN, _F);
  // forearm direction in shoulder-local space
  const T = _S.copy(shoulder.position).addScaledVector(_D, d);
  _F.subVectors(T, _E).normalize();
  _q.copy(shoulder.quaternion).invert();
  _F.applyQuaternion(_q);
  elbow.quaternion.setFromUnitVectors(_DOWN, _F);
}

export function legCycle(h, phase, amp, kneeAmp) {
  const s = Math.sin(phase);
  h.lHip.rotation.set(-s * amp, 0, 0);
  h.rHip.rotation.set(s * amp, 0, 0);
  h.lKnee.rotation.set(Math.max(0, Math.sin(phase + 1.6)) * kneeAmp + 0.05, 0, 0);
  h.rKnee.rotation.set(Math.max(0, Math.sin(phase + 1.6 + Math.PI)) * kneeAmp + 0.05, 0, 0);
}
