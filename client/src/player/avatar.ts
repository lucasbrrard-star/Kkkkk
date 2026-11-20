// Avatar 3D: modelo realista com esqueleto Mixamo, animações de captura de
// movimento (parado, andar, correr, dança, gestos) com transições suaves,
// sobreposições procedurais (sentar, acenar, pulo), cor de roupa via shader e sombra de contato.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AnimState, Appearance } from '../../../shared/protocol';
import { OUTFITS } from '../../../shared/protocol';
import { Assets } from '../core/assets';

const CLIP_OF: Record<AnimState, string> = { idle: 'idle', walk: 'walk', run: 'run', jump: 'run', sit: 'idle2', dance: 'dance', agree: 'agree', headShake: 'headShake', wave: 'idle2' };
const ONE_SHOT = new Set<AnimState>(['agree', 'headShake']);

/** Recolore as roupas no shader: peças coloridas trocam de matiz, peças neutras são
 *  tingidas; tons de pele/cabelo (matiz laranja, saturação média) são preservados. */
function outfitShader(mat: THREE.MeshStandardMaterial, o: { hue: number; sat: number; tint: readonly number[] }, protectSkin: boolean) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHue = { value: o.hue };
    sh.uniforms.uSat = { value: o.sat };
    sh.uniforms.uTint = { value: new THREE.Vector3(o.tint[0], o.tint[1], o.tint[2]) };
    sh.uniforms.uSkin = { value: protectSkin ? 1 : 0 };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uHue; uniform float uSat; uniform vec3 uTint; uniform float uSkin;
        vec3 rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1.0e-10; return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x); }
        vec3 hsv2rgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 hsv = rgb2hsv(diffuseColor.rgb);
          float skin = uSkin * smoothstep(0.0, 0.025, hsv.x) * (1.0 - smoothstep(0.1, 0.15, hsv.x)) * smoothstep(0.15, 0.3, hsv.y) * (1.0 - smoothstep(0.8, 0.95, hsv.y));
          vec3 shifted = hsv2rgb(vec3(fract(hsv.x + uHue), clamp(hsv.y * uSat, 0.0, 1.0), hsv.z));
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          vec3 tinted = clamp(lum * uTint * 1.5 + lum * 0.15, 0.0, 1.0);
          vec3 col = mix(tinted, shifted, smoothstep(0.12, 0.35, hsv.y));
          diffuseColor.rgb = mix(diffuseColor.rgb, col, 1.0 - skin);
        }`);
  };
  mat.customProgramCacheKey = () => `outfit-${protectSkin}`;
  mat.needsUpdate = true;
}

let blobTex: THREE.Texture | null = null;
function blobShadow(): THREE.Mesh {
  if (!blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

export class Avatar {
  root = new THREE.Group();
  model!: THREE.Object3D;
  mixer!: THREE.AnimationMixer;
  actions = new Map<string, THREE.AnimationAction>();
  state: AnimState = 'idle';
  private current: THREE.AnimationAction | null = null;
  private bones: Record<string, THREE.Bone | undefined> = {};
  private shadow = blobShadow();
  private t = 0;
  airborne = 0;           // 0..1 (pulo)
  hipsHeight = 0.95;

  static async create(assets: Assets, look: Appearance): Promise<Avatar> {
    const a = new Avatar();
    const gltf = await assets.model(look.avatar);
    a.model = SkeletonUtils.clone(gltf.scene);
    a.model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
    });
    a.applyOutfit(look.outfit, look.avatar);
    a.root.add(a.model, a.shadow);
    a.shadow.position.y = 0.02;
    a.mixer = new THREE.AnimationMixer(a.model);
    for (const clip of gltf.animations) {
      const act = a.mixer.clipAction(clip);
      if (ONE_SHOT.has(clip.name as AnimState)) { act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = false; }
      a.actions.set(clip.name, act);
    }
    a.model.traverse((o) => { if ((o as THREE.Bone).isBone) { const n = o.name.replace(/^mixamorig\d*:?/, ''); a.bones[n] = o as THREE.Bone; } });
    a.model.updateMatrixWorld(true);
    a.hipsHeight = a.bones.Hips?.getWorldPosition(new THREE.Vector3()).y ?? 0.95;
    a.play('idle', 0);
    a.mixer.addEventListener('finished', () => { if (ONE_SHOT.has(a.state)) a.setState('idle'); });
    return a;
  }

  private originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();

  /** Aplica a paleta de roupa (0 = original). Pode ser chamada de novo para trocar. */
  applyOutfit(outfit: number, avatar: string) {
    const o = OUTFITS[outfit] ?? OUTFITS[0];
    this.model.traverse((ob) => {
      const m = ob as THREE.Mesh;
      if (!m.isMesh) return;
      if (!this.originals.has(m)) this.originals.set(m, m.material);
      const orig = this.originals.get(m)!;
      const list = Array.isArray(orig) ? orig : [orig];
      const out = list.map((mat) => {
        const clothing = avatar === 'avatar_f' ? /Body/i.test(mat.name) : /look|shoes/i.test(mat.name);
        if (!clothing || outfit === 0) return mat;
        const c = (mat as THREE.MeshStandardMaterial).clone();
        outfitShader(c, o, avatar === 'avatar_f');
        return c;
      });
      m.material = Array.isArray(orig) ? out : out[0];
    });
  }

  private play(clip: string, fade = 0.25) {
    const next = this.actions.get(clip) ?? this.actions.get('idle')!;
    if (next === this.current) return;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = next;
  }

  setState(s: AnimState) {
    if (s === this.state && !ONE_SHOT.has(s)) return;
    this.state = s;
    this.play(CLIP_OF[s]);
  }

  /** speed em m/s: ajusta a cadência para os pés não "patinarem". */
  setSpeed(speed: number) {
    const a = this.current;
    if (!a) return;
    if (this.state === 'walk') a.timeScale = THREE.MathUtils.clamp(speed / 1.45, 0.6, 1.5);
    else if (this.state === 'run') a.timeScale = THREE.MathUtils.clamp(speed / 4.6, 0.75, 1.3);
    else if (this.state === 'jump') a.timeScale = 0.35;
    else a.timeScale = 1;
  }

  update(dt: number) {
    this.t += dt;
    this.mixer.update(dt);
    // sobreposições procedurais (depois das animações)
    if (this.state === 'sit') this.poseSit();
    if (this.state === 'wave') this.poseWave();
    if (this.airborne > 0.01) this.poseJump(this.airborne);
    const sh = 1 - Math.min(0.6, this.root.position.y > 0.2 ? 0.4 : 0);
    this.shadow.scale.setScalar(sh);
  }

  // ------------------------------------------------------------ poses procedurais (espaço de mundo)
  private aim(bone: THREE.Bone | undefined, child: THREE.Bone | undefined, dirWorld: THREE.Vector3, weight = 1) {
    if (!bone || !child || !bone.parent) return;
    bone.updateWorldMatrix(true, true);
    const a = bone.getWorldPosition(new THREE.Vector3()), b = child.getWorldPosition(new THREE.Vector3());
    const cur = b.sub(a).normalize();
    const delta = new THREE.Quaternion().setFromUnitVectors(cur, dirWorld.clone().normalize());
    if (weight < 1) delta.slerp(new THREE.Quaternion(), 1 - weight);
    const wq = bone.getWorldQuaternion(new THREE.Quaternion());
    const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(pq.invert().multiply(delta.multiply(wq)));
  }

  private axes() {
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize().negate();
    return { fwd, right, down: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 1, 0) };
  }

  private poseSit() {
    const B = this.bones, { fwd, down } = this.axes();
    for (const s of ['Left', 'Right']) {
      this.aim(B[`${s}UpLeg`], B[`${s}Leg`], fwd.clone().multiplyScalar(1).add(down.clone().multiplyScalar(0.12)));
      this.aim(B[`${s}Leg`], B[`${s}Foot`], down.clone().add(fwd.clone().multiplyScalar(0.12)));
      this.aim(B[`${s}Arm`], B[`${s}ForeArm`], down.clone().add(fwd.clone().multiplyScalar(0.35)), 0.8);
      this.aim(B[`${s}ForeArm`], B[`${s}Hand`], fwd.clone().add(down.clone().multiplyScalar(0.4)), 0.8);
    }
  }

  private poseWave() {
    const B = this.bones, { up, right, fwd } = this.axes();
    const swing = Math.sin(this.t * 7) * 0.35;
    this.aim(B.RightArm, B.RightForeArm, right.clone().multiplyScalar(0.55).add(up.clone().multiplyScalar(0.75)).add(fwd.clone().multiplyScalar(0.15)));
    this.aim(B.RightForeArm, B.RightHand, up.clone().add(right.clone().multiplyScalar(swing)).add(fwd.clone().multiplyScalar(0.1)));
  }

  private poseJump(k: number) {
    const B = this.bones, { fwd, down } = this.axes();
    for (const s of ['Left', 'Right']) {
      this.aim(B[`${s}UpLeg`], B[`${s}Leg`], down.clone().add(fwd.clone().multiplyScalar(0.55)), k * 0.8);
      this.aim(B[`${s}Leg`], B[`${s}Foot`], down.clone().add(fwd.clone().multiplyScalar(-0.45)), k * 0.8);
    }
  }

  dispose() {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
  }
}
