import * as THREE from 'three';
import { CONFIG } from '../config';
import { clamp, damp, lerp, wrapAngle } from '../core/math';

export type CameraMode = 'near' | 'far' | 'hood';
export const CAMERA_MODES: CameraMode[] = ['near', 'far', 'hood'];

export interface ChaseTarget {
  x: number; y: number; z: number;
  heading: number;
  vx: number; vz: number;
  speed: number; // m/s
  forwardSpeed: number;
  yawRate: number;
}

/**
 * Cinematic chase camera:
 *  - critically damped follow of a yaw that lags the car's heading (you see the car rotate in turns)
 *  - looks slightly into the slide direction, leans with yaw rate, adaptive FOV with speed
 *  - pulls in when a building is between the car and the camera (no clipping through walls)
 *  - impact / curb shake with decaying noise
 */
export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'near';
  private yaw = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private dist = CONFIG.camera.near.dist;
  private height = CONFIG.camera.near.height;
  private fov = CONFIG.camera.near.fov;
  private lean = 0;
  private shake = 0;
  private t = 0;
  private initialized = false;
  occlusion: ((ax: number, az: number, bx: number, bz: number, y: number) => number) | null = null;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.3, 2200);
  }

  setMode(m: CameraMode) { this.mode = m; }
  next() { this.mode = CAMERA_MODES[(CAMERA_MODES.indexOf(this.mode) + 1) % CAMERA_MODES.length]; return this.mode; }
  addShake(amount: number) { this.shake = Math.min(1.2, this.shake + amount); }
  snap() { this.initialized = false; }

  update(dt: number, tg: ChaseTarget) {
    this.t += dt;
    const cfg = CONFIG.camera[this.mode];
    const speedK = clamp(tg.speed / 60, 0, 1);
    // follow yaw: heading blended with the travel direction when sliding / reversing
    let desiredYaw = tg.heading;
    if (tg.speed > 3 && tg.forwardSpeed > 0) {
      const travel = Math.atan2(tg.vx, tg.vz);
      desiredYaw = tg.heading + wrapAngle(travel - tg.heading) * 0.35;
    }
    if (!this.initialized) {
      this.yaw = desiredYaw;
      this.dist = cfg.dist; this.height = cfg.height; this.fov = cfg.fov;
    }
    const yawLag = this.mode === 'hood' ? 30 : 4.2;
    this.yaw += wrapAngle(desiredYaw - this.yaw) * damp(yawLag, dt);

    const targetDist = this.mode === 'hood' ? cfg.dist : cfg.dist + speedK * 1.0;
    const targetHeight = cfg.height + (this.mode === 'hood' ? 0 : speedK * 0.25);
    this.dist = lerp(this.dist, targetDist, damp(3, dt));
    this.height = lerp(this.height, targetHeight, damp(3, dt));
    this.fov = lerp(this.fov, cfg.fov + speedK * 13, damp(2.5, dt));
    this.lean = lerp(this.lean, clamp(-tg.yawRate * 0.05 * clamp(tg.speed / 15, 0, 1), -0.06, 0.06), damp(4, dt));

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let dist = this.dist;
    if (this.occlusion && this.mode !== 'hood') {
      const bx = tg.x - fx * dist, bz = tg.z - fz * dist;
      const t = this.occlusion(tg.x, tg.z, bx, bz, tg.y + this.height);
      if (t < 1) dist = Math.max(2.2, dist * t - 0.3);
    }
    const desired = new THREE.Vector3(tg.x - fx * dist, tg.y + this.height, tg.z - fz * dist);
    const lookAhead = this.mode === 'hood' ? 20 : 4 + speedK * 6;
    const lookT = new THREE.Vector3(tg.x + Math.sin(tg.heading) * lookAhead * 0.5 + fx * lookAhead * 0.5, tg.y + cfg.lookHeight, tg.z + Math.cos(tg.heading) * lookAhead * 0.5 + fz * lookAhead * 0.5);
    if (this.mode === 'hood') {
      desired.set(tg.x + Math.sin(tg.heading) * 0.35, tg.y + cfg.height, tg.z + Math.cos(tg.heading) * 0.35);
      lookT.set(tg.x + Math.sin(tg.heading) * 30, tg.y + cfg.lookHeight - 0.3, tg.z + Math.cos(tg.heading) * 30);
    }
    if (!this.initialized) { this.pos.copy(desired); this.look.copy(lookT); this.initialized = true; }
    const posK = this.mode === 'hood' ? 1 : damp(9, dt);
    this.pos.lerp(desired, posK);
    this.look.lerp(lookT, this.mode === 'hood' ? 1 : damp(12, dt));
    // never go below the street
    this.pos.y = Math.max(this.pos.y, tg.y + 0.6);

    // shake (impacts + subtle high-speed vibration)
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const vib = speedK * speedK * 0.012 + this.shake * 0.22;
    const n1 = Math.sin(this.t * 37.1) * Math.sin(this.t * 23.3), n2 = Math.sin(this.t * 41.7 + 1.3) * Math.cos(this.t * 19.9);
    this.camera.position.set(this.pos.x + n1 * vib, this.pos.y + n2 * vib, this.pos.z);
    this.camera.lookAt(this.look);
    this.camera.rotateZ(this.lean);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
  }

  /** Orbiting camera for the title screen / attract mode. */
  orbit(dt: number, center: THREE.Vector3, radius = 7.5, height = 1.6) {
    this.t += dt;
    const a = this.t * 0.12 + 2.4;
    this.camera.position.set(center.x + Math.sin(a) * radius, center.y + height, center.z + Math.cos(a) * radius);
    this.camera.lookAt(center.x, center.y + 0.7, center.z);
    if (this.camera.fov !== 42) { this.camera.fov = 42; this.camera.updateProjectionMatrix(); }
    this.initialized = false;
  }
}
