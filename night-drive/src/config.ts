/** Central tuning values. Physics in SI units (m, s, kg). */
export const CONFIG = {
  physics: {
    hz: 120,
    mass: 1530,
    wheelBase: 2.61,
    cgToFront: 1.36,
    wheelRadius: 0.34,
    maxSteer: 0.6, // rad at standstill
    minSteerHighSpeed: 0.11, // rad at top speed
    steerSpeed: 3.2, // rad/s steering wheel slew
    steerReturn: 5.0,
    engineForce: 12500, // N at the wheels in 1st gear
    brakeForce: 16500,
    handbrakeForce: 7000,
    reverseMaxSpeed: 12, // m/s
    drag: 0.42, // aero drag coefficient (F = c v^2)
    rolling: 12.0, // rolling resistance (F = c v)
    engineBrake: 2600,
    gripFront: 1.25, // tyre friction coefficients (x g)
    gripRear: 1.2,
    handbrakeGrip: 0.42,
    lateralStiffness: 9.0, // how fast lateral slip is killed (1/s)
    yawResponse: 7.5,
    gears: [3.4, 2.36, 1.75, 1.36, 1.1, 0.9],
    finalDrive: 3.7,
    idleRpm: 900,
    redline: 7600,
    shiftUpRpm: 7100,
    shiftDownRpm: 3300,
  },
  camera: {
    near: { dist: 5.0, height: 1.5, lookHeight: 0.95, fov: 56 },
    far: { dist: 8.6, height: 2.6, lookHeight: 1.1, fov: 55 },
    hood: { dist: -0.2, height: 1.25, lookHeight: 1.15, fov: 70 },
  },
};

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityPreset {
  pixelRatio: number; // max device pixel ratio used
  reflection: number; // planar reflection resolution scale (0 = off)
  bloom: boolean;
  msaa: number;
  rain: number; // rain streak count
  pointLights: number; // dynamic lights pooled around the camera
  envUpdate: number; // frames between dynamic env-map captures (0 = static)
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  low: { pixelRatio: 0.85, reflection: 0, bloom: true, msaa: 0, rain: 2500, pointLights: 4, envUpdate: 0 },
  medium: { pixelRatio: 1.25, reflection: 0.35, bloom: true, msaa: 0, rain: 5000, pointLights: 6, envUpdate: 0 },
  high: { pixelRatio: 1.75, reflection: 0.5, bloom: true, msaa: 4, rain: 8000, pointLights: 8, envUpdate: 6 },
  ultra: { pixelRatio: 2, reflection: 0.75, bloom: true, msaa: 4, rain: 12000, pointLights: 10, envUpdate: 3 },
};
