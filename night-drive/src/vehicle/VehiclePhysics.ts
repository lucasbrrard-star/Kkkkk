import { CONFIG } from '../config';
import { approach, clamp, lerp } from '../core/math';

export interface DriveInput {
  throttle: number; // 0..1
  brake: number; // 0..1 (brake, or reverse when stopped)
  steer: number; // -1..1, + = right
  handbrake: boolean;
}

export type GroundFn = (x: number, z: number) => number;

/**
 * Arcade vehicle model (fixed time step):
 *  - velocity lives in world space; heading rotates under it, tyre grip bleeds the lateral
 *    component (lower grip with handbrake / power oversteer => drifts),
 *  - yaw rate follows the steering geometry, capped by tyre friction (speed-sensitive radius),
 *  - automatic 6-speed gearbox with torque curve, brakes, aero drag, rolling resistance,
 *  - reverse, handbrake, curb heights with per-wheel suspension offsets and body pitch/roll.
 */
export class VehiclePhysics {
  x = 0; z = 0; y = 0;
  heading = 0; // rad, forward = (sin h, cos h)
  vx = 0; vz = 0;
  yawRate = 0;
  steer = 0; // front wheel angle (rad, + = right)
  rpm = CONFIG.physics.idleRpm;
  gear = 1; // -1 = R, 0 = N, 1..6
  wheelSpin = 0; // driven wheel angular velocity (rad/s)
  slip = 0; // body slip angle (rad)
  brakeLight = 0;
  reversing = false;
  pitch = 0; roll = 0;
  private pitchV = 0; private rollV = 0;
  readonly suspension = [0, 0, 0, 0];
  accelLong = 0; accelLat = 0;
  curbHit = 0; // > 0 when a wheel just climbed a curb (for camera shake / sfx)
  private shiftTimer = 0;
  private prevWheelH = [0, 0, 0, 0];

  get speed() { return Math.hypot(this.vx, this.vz); }
  get forwardSpeed() { return this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading); }
  get kmh() { return Math.abs(this.forwardSpeed) * 3.6; }

  reset(x: number, z: number, heading: number, ground: GroundFn) {
    this.x = x; this.z = z; this.heading = heading;
    this.vx = this.vz = this.yawRate = this.steer = this.wheelSpin = this.slip = 0;
    this.gear = 1; this.rpm = CONFIG.physics.idleRpm;
    this.pitch = this.roll = this.pitchV = this.rollV = 0;
    this.y = ground(x, z);
    this.prevWheelH = [this.y, this.y, this.y, this.y];
    this.suspension.fill(0);
  }

  step(dt: number, inp: DriveInput, ground: GroundFn) {
    const P = CONFIG.physics;
    const g = 9.81;
    const sinH = Math.sin(this.heading), cosH = Math.cos(this.heading);
    // right = forward x up
    const rx = -cosH, rz = sinH;
    let vF = this.vx * sinH + this.vz * cosH;
    let vR = this.vx * rx + this.vz * rz;
    const absF = Math.abs(vF);

    // ---------------- steering (speed sensitive, smoothed)
    const maxSteer = lerp(P.maxSteer, P.minSteerHighSpeed, clamp(absF / 50, 0, 1));
    const target = inp.steer * maxSteer;
    const rate = Math.abs(inp.steer) > 0.01 ? P.steerSpeed : P.steerReturn;
    this.steer = approach(this.steer, target, rate * dt * (0.4 + maxSteer));

    // ---------------- longitudinal
    let drive = 0, brakeF = 0;
    const wantsReverse = inp.brake > 0.05 && vF < 0.8 && inp.throttle < 0.05;
    if (wantsReverse) this.reversing = true;
    else if (inp.throttle > 0.05 || vF > 1.5) this.reversing = false;
    if (this.reversing) {
      this.gear = -1;
      if (inp.brake > 0.05 && vF > -P.reverseMaxSpeed) drive = -P.engineForce * 0.55 * inp.brake;
      if (inp.throttle > 0.05) brakeF += P.brakeForce * inp.throttle;
    } else {
      if (this.gear < 1) this.gear = 1;
      if (inp.throttle > 0.05) {
        if (vF < -0.5) brakeF += P.brakeForce * inp.throttle;
        else drive = this.engineForce(absF) * inp.throttle;
      }
      if (inp.brake > 0.05) brakeF += P.brakeForce * inp.brake;
    }
    if (inp.handbrake) brakeF += P.handbrakeForce;
    this.brakeLight = clamp((inp.brake > 0.05 && !this.reversing ? 1 : 0) + (inp.handbrake ? 0.6 : 0) + (this.reversing && inp.throttle > 0.05 ? 1 : 0), 0, 1);

    let F = drive;
    F -= P.drag * vF * absF;
    F -= P.rolling * vF;
    if (inp.throttle < 0.05 && !this.reversing) F -= Math.sign(vF) * P.engineBrake * clamp(absF / 5, 0, 1);
    const prevF = vF;
    vF += (F / P.mass) * dt;
    // brakes never reverse the direction of travel
    const dvBrake = (brakeF / P.mass) * dt;
    if (Math.abs(vF) <= dvBrake) vF = 0;
    else vF -= Math.sign(vF) * dvBrake;
    this.accelLong = (vF - prevF) / dt;

    // ---------------- lateral grip / drift
    const slipAngle = Math.atan2(vR, Math.max(absF, 0.5));
    this.slip = slipAngle;
    let grip = 1;
    if (inp.handbrake) grip = P.handbrakeGrip;
    else if (Math.abs(slipAngle) > 0.18 && inp.throttle > 0.6 && absF > 8) grip = 0.55; // power oversteer holds the slide
    const kLat = P.lateralStiffness * grip;
    const newVR = vR * Math.exp(-kLat * dt);
    // friction limited lateral change
    const maxDv = P.gripRear * g * dt * grip * 1.35;
    const dv = clamp(newVR - vR, -maxDv, maxDv);
    vR += dv;
    this.accelLat = dv / dt;

    // ---------------- yaw
    const L = P.wheelBase;
    let yawTarget = -(vF * Math.tan(this.steer)) / L;
    const maxYaw = (P.gripFront * g) / Math.max(absF, 2);
    if (inp.handbrake && absF > 4) yawTarget = clamp(yawTarget * 1.7, -maxYaw * 2.2, maxYaw * 2.2);
    else if (grip < 1) yawTarget = clamp(yawTarget * 1.25, -maxYaw * 1.6, maxYaw * 1.6);
    else yawTarget = clamp(yawTarget, -maxYaw, maxYaw);
    const yawResp = P.yawResponse * (inp.handbrake ? 0.65 : 1) * clamp(absF / 3, 0.25, 1);
    this.yawRate += (yawTarget - this.yawRate) * (1 - Math.exp(-yawResp * dt));
    this.heading += this.yawRate * dt;

    // ---------------- integrate
    this.vx = sinH * vF + rx * vR;
    this.vz = cosH * vF + rz * vR;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // ---------------- gearbox / rpm
    this.updateGearbox(absF, inp, dt);

    // ---------------- ground following, suspension, body motion
    this.updateSuspension(dt, ground);
  }

  private engineForce(absF: number) {
    const P = CONFIG.physics;
    const ratio = P.gears[Math.max(0, this.gear - 1)];
    const rpm = this.rpmFor(absF, this.gear);
    const x = clamp((rpm - P.idleRpm) / (P.redline - P.idleRpm), 0, 1);
    const curve = 0.72 + 0.42 * Math.sin(Math.PI * clamp(x * 0.95 + 0.1, 0, 1)) - (rpm > P.redline - 150 ? 0.6 : 0);
    const launch = absF < 3 ? 0.85 : 1;
    return P.engineForce * (ratio / P.gears[0]) * curve * launch * (this.shiftTimer > 0 ? 0.35 : 1);
  }

  private rpmFor(absF: number, gear: number) {
    const P = CONFIG.physics;
    const ratio = P.gears[Math.max(0, Math.abs(gear) - 1)] ?? P.gears[0];
    return (absF / P.wheelRadius) * ratio * P.finalDrive * (60 / (2 * Math.PI));
  }

  private updateGearbox(absF: number, inp: DriveInput, dt: number) {
    const P = CONFIG.physics;
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    if (this.gear > 0) {
      const rpm = this.rpmFor(absF, this.gear);
      if (rpm > P.shiftUpRpm && this.gear < P.gears.length) { this.gear++; this.shiftTimer = 0.18; }
      else if (this.gear > 1 && this.rpmFor(absF, this.gear - 1) < P.shiftUpRpm * 0.82 && rpm < P.shiftDownRpm) this.gear--;
    }
    const wheelRpm = this.rpmFor(absF, this.gear === -1 ? 1 : this.gear);
    const freeRev = P.idleRpm + (P.redline - P.idleRpm) * 0.85 * Math.max(inp.throttle, this.reversing ? inp.brake : 0);
    const clutch = absF < 4 ? 1 - absF / 4 : 0; // launch: engine free-revs
    const target = clamp(Math.max(P.idleRpm, lerp(wheelRpm, Math.max(wheelRpm, freeRev), clutch)), P.idleRpm, P.redline);
    this.rpm += (target - this.rpm) * (1 - Math.exp(-12 * dt));
    // driven (rear) wheels: spin up a bit on hard launches / burnouts
    const groundOmega = this.forwardSpeed / P.wheelRadius;
    const spinBoost = inp.throttle > 0.9 && absF < 9 && !this.reversing ? (9 - absF) * 2.2 : 0;
    this.wheelSpin = groundOmega + spinBoost;
  }

  private updateSuspension(dt: number, ground: GroundFn) {
    const sinH = Math.sin(this.heading), cosH = Math.cos(this.heading);
    const rx = -cosH, rz = sinH;
    // wheel contact points FL, FR, RL, RR (left = -right)
    const pts: [number, number][] = [[1.19, -0.82], [1.19, 0.82], [-1.42, -0.84], [-1.42, 0.84]];
    const hs = pts.map(([f, r]) => ground(this.x + sinH * f + rx * r, this.z + cosH * f + rz * r));
    const avg = (hs[0] + hs[1] + hs[2] + hs[3]) / 4;
    this.curbHit = 0;
    for (let i = 0; i < 4; i++) {
      if (hs[i] - this.prevWheelH[i] > 0.08) this.curbHit = Math.max(this.curbHit, hs[i] - this.prevWheelH[i]);
      this.prevWheelH[i] = hs[i];
    }
    if (this.curbHit > 0) { this.vx *= 0.985; this.vz *= 0.985; }
    this.y += (avg - this.y) * (1 - Math.exp(-18 * dt));
    for (let i = 0; i < 4; i++) this.suspension[i] = clamp(hs[i] - this.y, -0.12, 0.12);
    // body pitch / roll: spring-damper driven by accelerations + terrain
    const terrainPitch = Math.atan2((hs[2] + hs[3]) / 2 - (hs[0] + hs[1]) / 2, 2.61);
    const terrainRoll = Math.atan2((hs[0] + hs[2]) / 2 - (hs[1] + hs[3]) / 2, 1.65);
    const targetPitch = clamp(-this.accelLong * 0.0045, -0.05, 0.05) + terrainPitch;
    const targetRoll = clamp(-this.accelLat * 0.0042, -0.055, 0.055) + terrainRoll; // body leans out of the turn
    const k = 120, c = 16;
    this.pitchV += ((targetPitch - this.pitch) * k - this.pitchV * c) * dt;
    this.rollV += ((targetRoll - this.roll) * k - this.rollV * c) * dt;
    this.pitch += this.pitchV * dt;
    this.roll += this.rollV * dt;
  }
}
