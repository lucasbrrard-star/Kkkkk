import {clamp, outCubic, prog, smooth} from './ease';

// Intensidade da luz emitida pelo monitor (ilumina rosto, mesa, poeira).
export const screenLight = (t: number) => {
  const on = outCubic(prog(t, 0.0, 0.5));
  const flare = Math.exp(-Math.pow((t - 2.62) / 0.22, 2)) * 0.9; // IA "acorda"
  const sustain = 0.25 * smooth(prog(t, 2.5, 2.9));
  const dive = 0.6 * smooth(prog(t, 3.7, 4.2));
  return clamp(on * (1 + flare + sustain + dive), 0, 2.4);
};
