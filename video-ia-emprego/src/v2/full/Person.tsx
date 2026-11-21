import React from 'react';
import {clamp} from '../../lib/ease';

// Pessoa de corpo inteiro, vista de perfil (olhando para a direita). Origem nos pés; altura ≈ 400 px.
export type PersonStyle = {
  hair: 'curly' | 'bun' | 'short' | 'long';
  skin: string;
  top: string;
  pants: string;
  shoes?: string;
  hairColor?: string;
};
export type PersonPose = {
  head?: number; // inclinação da cabeça (graus, + olha para baixo)
  lh?: [number, number]; // alvo da mão de trás (relativo aos pés)
  rh?: [number, number]; // alvo da mão da frente
  step?: number; // 0..1 meio passo à frente
  prop?: 'tablet' | 'phone' | 'laptop' | null;
  smile?: number;
  rim?: string; // cor do contorno de luz
  rimAmt?: number;
  glow?: number; // luz do aparelho no rosto
};

const ik = (sx: number, sy: number, tx: number, ty: number, L1: number, L2: number, bend: number) => {
  const dx = tx - sx, dy = ty - sy;
  const d = Math.min(Math.hypot(dx, dy), L1 + L2 - 0.5);
  const base = Math.atan2(dy, dx);
  const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)) * bend;
  return {ex: sx + L1 * Math.cos(base + a), ey: sy + L1 * Math.sin(base + a), hx: sx + d * Math.cos(base), hy: sy + d * Math.sin(base)};
};

const FACE = 'M-20 -24 C-21 -40 -6 -48 6 -46 C18 -44 24 -36 24 -24 C24 -18 23 -15 24 -13 L29 -5 C30 -3 28 -2 26 -2 C26 1 27 3 25 4 C26 6 25 8 23 9 C24 13 22 16 18 17 C12 22 4 24 -2 23 L-6 30 L-18 30 C-19 22 -22 14 -22 4 C-23 -6 -21 -16 -20 -24 Z';

export const Person: React.FC<{x: number; y: number; s?: number; flip?: boolean; style: PersonStyle; pose: PersonPose; t: number}> = ({x, y, s = 1, flip, style, pose, t}) => {
  const head = pose.head ?? 0;
  const step = pose.step ?? 0;
  const rim = pose.rim ?? '#7ff0ff';
  const rimAmt = pose.rimAmt ?? 0.5;
  const glow = pose.glow ?? 0;
  const hipY = -200;
  const shY = -325;
  const back = {x: -6 - 10 * step, y: hipY};
  const front = {x: 6 + 4 * step, y: hipY};
  const footB = {x: -10 - 4 * step, y: -8};
  const footF = {x: 12 + 34 * step, y: -8 - 6 * Math.sin(Math.PI * step)};
  const kneeB = {x: (back.x + footB.x) / 2 + 6, y: -104};
  const kneeF = {x: (front.x + footF.x) / 2 + 10 + 10 * step, y: -104};
  const lh = pose.lh ?? [-10, -170];
  const rh = pose.rh ?? [14, -172];
  const armB = ik(-4, shY + 8, lh[0], lh[1], 78, 74, 1);
  const armF = ik(4, shY + 8, rh[0], rh[1], 78, 74, 1);
  const leg = (h: {x: number; y: number}, k: {x: number; y: number}, f: {x: number; y: number}, c: string) => (
    <g>
      <path d={`M${h.x} ${h.y} L${k.x} ${k.y} L${f.x} ${f.y}`} stroke={c} strokeWidth={36} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x={f.x - 14} y={f.y - 6} width={46} height={18} rx={9} fill={style.shoes ?? '#d9dee6'} />
    </g>
  );
  const hairC = style.hairColor ?? '#120d0b';
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      {/* sombra no chão */}
      <ellipse cx={8} cy={4} rx={46} ry={8} fill="#000" opacity={0.45} />
      {/* braço de trás */}
      <path d={`M-4 ${shY + 8} L${armB.ex} ${armB.ey} L${armB.hx} ${armB.hy}`} stroke={style.top} strokeWidth={24} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      <circle cx={armB.hx} cy={armB.hy} r={11} fill={style.skin} opacity={0.9} />
      {leg(back, kneeB, footB, style.pants)}
      {leg(front, kneeF, footF, style.pants)}
      {/* tronco */}
      <path d={`M-32 ${shY} C-38 ${shY + 40} -36 ${hipY - 30} -28 ${hipY + 6} L28 ${hipY + 6} C34 ${hipY - 40} 38 ${shY + 50} 28 ${shY} C12 ${shY - 12} -16 ${shY - 12} -32 ${shY} Z`} fill={style.top} />
      <path d={`M22 ${shY} C30 ${shY + 50} 28 ${hipY - 40} 24 ${hipY + 6}`} stroke={rim} strokeWidth={3} fill="none" opacity={rimAmt} />
      {/* cabeça */}
      <g transform={`translate(0 ${shY - 36}) rotate(${head} -4 26)`}>
        <path d={FACE} fill={style.skin} />
        <path d="M24 -24 C24 -18 23 -15 24 -13 L29 -5 C30 -3 28 -2 26 -2 C26 1 27 3 25 4 C26 6 25 8 23 9 C24 13 22 16 18 17" stroke={rim} strokeWidth={2.5} fill="none" opacity={clamp(rimAmt + glow)} />
        {glow > 0 ? <circle cx={22} cy={0} r={22} fill="#7ff0ff" opacity={0.25 * glow} /> : null}
        {/* olho e sobrancelha */}
        <path d="M13 -18 Q18 -21 22 -17" stroke="#140c08" strokeWidth={2.2} fill="none" />
        <circle cx={18} cy={-15 + (head > 8 ? 1.5 : 0)} r={2} fill="#140c08" />
        <path d={`M12 -24 Q18 -28 23 ${-25}`} stroke="#140c08" strokeWidth={2.6} fill="none" strokeLinecap="round" />
        <path d={`M17 10 Q21 ${10 + 3 * (pose.smile ?? 0)} 24 8`} stroke="#3a1f14" strokeWidth={1.6} fill="none" />
        <ellipse cx={-6} cy={-8} rx={4} ry={7} fill="#5e3a26" opacity={0.8} />
        {/* cabelo */}
        {style.hair === 'curly' ? (
          <g fill={hairC}>
            <path d="M-22 -10 C-26 -44 0 -54 20 -42 C22 -34 16 -32 10 -34 C0 -36 -10 -30 -14 -16 Z" />
            {[[-18, -36], [-10, -45], [0, -49], [10, -47], [18, -41], [-22, -24], [-20, -12]].map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r={8} />
            ))}
          </g>
        ) : null}
        {style.hair === 'short' ? <path d="M-22 -10 C-26 -46 4 -54 22 -38 C14 -36 4 -36 -6 -32 C-12 -26 -14 -18 -16 -10 Z" fill={hairC} /> : null}
        {style.hair === 'bun' ? (
          <g fill={hairC}>
            <path d="M-22 -6 C-26 -46 4 -54 22 -36 C12 -36 0 -34 -8 -28 C-14 -20 -16 -12 -18 -4 Z" />
            <circle cx={-20} cy={-40} r={11} />
          </g>
        ) : null}
        {style.hair === 'long' ? <path d="M-24 34 C-30 -10 -26 -50 6 -50 C20 -50 26 -40 22 -34 C10 -36 -2 -32 -8 -24 C-12 -10 -12 10 -8 34 Z" fill={hairC} /> : null}
      </g>
      {/* braço da frente + aparelho */}
      <path d={`M4 ${shY + 8} L${armF.ex} ${armF.ey} L${armF.hx} ${armF.hy}`} stroke={style.top} strokeWidth={25} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${armF.ex} ${armF.ey} L${armF.hx} ${armF.hy}`} stroke={style.skin} strokeWidth={19} fill="none" strokeLinecap="round" />
      <circle cx={armF.hx} cy={armF.hy} r={11} fill={style.skin} />
      {pose.prop === 'tablet' ? (
        <g transform={`translate(${armF.hx + 4} ${armF.hy - 10}) rotate(-62)`}>
          <rect x={-30} y={-4} width={60} height={42} rx={5} fill="#0b1018" />
          <rect x={-26} y={0} width={52} height={34} rx={3} fill="#7ff0ff" opacity={0.85} />
        </g>
      ) : null}
      {pose.prop === 'phone' ? (
        <g transform={`translate(${armF.hx + 6} ${armF.hy - 6}) rotate(-70)`}>
          <rect x={-8} y={-14} width={16} height={30} rx={3} fill="#0b1018" />
          <rect x={-6} y={-12} width={12} height={26} rx={2} fill="#7ff0ff" opacity={0.9} />
        </g>
      ) : null}
      {pose.prop === 'laptop' ? <rect x={-36} y={-262} width={70} height={10} rx={3} fill="#c8ced8" transform="rotate(-8)" /> : null}
    </g>
  );
};

export const PROTAGONIST: PersonStyle = {hair: 'curly', skin: '#8a5a3d', top: '#2f3d52', pants: '#1a2130', shoes: '#d9dee6'};
