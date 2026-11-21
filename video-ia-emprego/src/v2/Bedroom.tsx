import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {clamp, inOutCubic, lerp, outCubic, outExpo, prog, seeded, smooth, spring} from '../lib/ease';
import {useT} from '../lib/time';
import {camAt, layerT, PHONE} from './overhead';
import {PH_H, PH_W, PhoneBody, phoneBuzz, T_BUZZ, T_NOTIF} from './Phone';

// ------------------------------------------------------------ camada zenital
const OH: React.FC<{h: number; children: React.ReactNode; blur?: number; fade?: number}> = ({h, children, blur = 0, fade = 0.12}) => {
  const t = useT();
  const L = layerT(h, t);
  if (L.d < 0.02) return null;
  const op = clamp((L.d - 0.02) / fade);
  return (
    <AbsoluteFill
      style={{
        transform: `translate(${L.bx}px, ${L.by}px) scale(${L.a})`,
        transformOrigin: '0 0',
        opacity: op,
        filter: blur > 0.3 ? `blur(${blur}px)` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

// faixas de luz da persiana (amanhecer); deslocadas conforme a altura da superfície
const Stripes: React.FC<{h: number; clip: string; id: string; strength?: number}> = ({h, clip, id, strength = 1}) => (
  <g clipPath={`url(#${clip})`} style={{mixBlendMode: 'screen'}}>
    <defs>
      <pattern id={id} width={92} height={92} patternUnits="userSpaceOnUse" patternTransform={`translate(${-h * 160} ${h * 70}) rotate(-28)`}>
        <rect x={0} y={0} width={92} height={40} fill="#cfe0ff" />
      </pattern>
      <linearGradient id={`${id}f`} x1="1" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="1" />
        <stop offset="0.75" stopColor="#fff" stopOpacity="0.15" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <mask id={`${id}m`}>
        <rect x={-200} y={-200} width={1500} height={2400} fill={`url(#${id}f)`} />
      </mask>
      <filter id={`${id}b`} x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="5" />
      </filter>
    </defs>
    <rect x={-200} y={-200} width={1500} height={2400} fill={`url(#${id})`} opacity={0.16 * strength} mask={`url(#${id}m)`} filter={`url(#${id}b)`} />
  </g>
);

// ------------------------------------------------------------ piso e cabeceira
const Floor: React.FC = () => {
  const planks = [];
  for (let i = 0; i < 14; i++) {
    planks.push(<rect key={i} x={-200 + i * 104} y={-200} width={102} height={2400} fill={i % 2 ? '#15110e' : '#181310'} />);
    planks.push(<rect key={`l${i}`} x={-200 + i * 104 + 102} y={-200} width={2} height={2400} fill="#0a0807" />);
  }
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <defs>
        <clipPath id="floorclip">
          <rect x={-200} y={-200} width={1500} height={2400} />
        </clipPath>
      </defs>
      {planks}
      {/* tapete */}
      <rect x={700} y={1180} width={600} height={900} rx={10} fill="#1d2431" />
      <rect x={720} y={1200} width={560} height={860} rx={8} fill="none" stroke="#2a3446" strokeWidth={6} />
      <rect x={-200} y={-200} width={1500} height={2400} fill="#0a1426" opacity={0.45} />
      <Stripes h={0} clip="floorclip" id="stf" strength={1.15} />
    </svg>
  );
};

const BED_PATH = 'M-70 150 L770 150 L770 2100 L-70 2100 Z';
const Bed: React.FC = () => (
  <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
    <defs>
      <clipPath id="bedclip">
        <path d={BED_PATH} />
      </clipPath>
      <linearGradient id="headb" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#242d3d" />
        <stop offset="1" stopColor="#151b26" />
      </linearGradient>
    </defs>
    {/* sombra da cama no chão */}
    <rect x={-60} y={160} width={850} height={2000} rx={30} fill="#000" opacity={0.5} filter="blur(18px)" />
    <path d={BED_PATH} fill="#1b2230" />
    {/* lençol */}
    <rect x={-50} y={190} width={800} height={1900} rx={26} fill="#c4ccd8" />
    <rect x={-50} y={190} width={800} height={1900} rx={26} fill="#0f1a2e" opacity={0.55} />
    {/* cabeceira estofada */}
    <rect x={-80} y={60} width={860} height={130} rx={22} fill="url(#headb)" />
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <circle key={i} cx={40 + i * 140} cy={125} r={5} fill="#0c1018" />
    ))}
    <rect x={-80} y={60} width={860} height={3} fill="#5c6b84" opacity={0.6} />
    <Stripes h={0.5} clip="bedclip" id="stb" />
  </svg>
);

// ------------------------------------------------------------ travesseiro, edredom
const Pillow: React.FC = () => (
  <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
    <defs>
      <radialGradient id="pilg" cx="0.55" cy="0.45" r="0.7">
        <stop offset="0" stopColor="#dfe6f0" />
        <stop offset="0.7" stopColor="#aab5c6" />
        <stop offset="1" stopColor="#7c879a" />
      </radialGradient>
      <clipPath id="pilclip">
        <rect x={70} y={215} width={600} height={360} rx={70} />
      </clipPath>
    </defs>
    <rect x={78} y={232} width={600} height={360} rx={70} fill="#000" opacity={0.35} filter="blur(10px)" />
    <rect x={70} y={215} width={600} height={360} rx={70} fill="url(#pilg)" />
    <rect x={70} y={215} width={600} height={360} rx={70} fill="#13213a" opacity={0.45} />
    <path d="M120 250 Q370 232 620 250" fill="none" stroke="#fff" strokeOpacity={0.25} strokeWidth={4} />
    <Stripes h={0.6} clip="pilclip" id="stp" strength={1.2} />
  </svg>
);

const Duvet: React.FC = () => {
  const t = useT();
  const br = Math.sin(t * 1.9) * 3;
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <defs>
        <linearGradient id="duvg" x1="0" y1="0" x2="1" y2="0.2">
          <stop offset="0" stopColor="#1c2a42" />
          <stop offset="0.6" stopColor="#24354f" />
          <stop offset="1" stopColor="#1a263b" />
        </linearGradient>
        <clipPath id="duvclip">
          <path d={`M-60 ${640 + br} C120 ${612 + br} 420 ${600 + br} 760 ${632 + br} L760 2100 L-60 2100 Z`} />
        </clipPath>
        <filter id="foldb" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>
      <path d={`M-60 ${640 + br} C120 ${612 + br} 420 ${600 + br} 760 ${632 + br} L760 2100 L-60 2100 Z`} fill="url(#duvg)" />
      {/* volume do corpo sob o edredom */}
      <g clipPath="url(#duvclip)">
        <ellipse cx={380} cy={980 + br} rx={240} ry={420} fill="#2d4262" opacity={0.55} filter="url(#foldb)" />
        <ellipse cx={330} cy={1640} rx={160} ry={380} fill="#2a3d5c" opacity={0.45} filter="url(#foldb)" />
        <path d="M60 900 C160 1000 140 1200 220 1400" stroke="#0d1524" strokeWidth={26} fill="none" opacity={0.7} filter="url(#foldb)" />
        <path d="M640 760 C600 980 660 1250 600 1600" stroke="#0d1524" strokeWidth={30} fill="none" opacity={0.6} filter="url(#foldb)" />
        <path d="M460 1300 C430 1500 470 1700 440 1950" stroke="#0d1524" strokeWidth={22} fill="none" opacity={0.6} filter="url(#foldb)" />
        <Stripes h={0.58} clip="duvclip" id="std" strength={1.3} />
      </g>
      {/* dobra superior (avesso mais claro) */}
      <path d={`M-60 ${640 + br} C120 ${612 + br} 420 ${600 + br} 760 ${632 + br} L760 ${690 + br} C420 ${660 + br} 120 ${672 + br} -60 ${700 + br} Z`} fill="#8e9bb0" opacity={0.85} />
      <path d={`M-60 ${640 + br} C120 ${612 + br} 420 ${600 + br} 760 ${632 + br} L760 ${690 + br} C420 ${660 + br} 120 ${672 + br} -60 ${700 + br} Z`} fill="#0f1b30" opacity={0.45} />
    </svg>
  );
};

// ------------------------------------------------------------ personagem (vista de cima)
const SKIN = '#8a5a3d';
const SKIN_D = '#5e3a26';
const SHIRT = '#2f3d52';
const HAIR = '#120d0b';

export const faceState = (t: number) => {
  const open = outCubic(prog(t, 0.42, 0.62)) * (1 - 0.95 * Math.exp(-Math.pow((t - 0.95) / 0.05, 2)));
  const turn = inOutCubic(prog(t, 0.55, 0.95));
  const surprise = spring(prog(t, 1.22, 1.75), 6, 9);
  const look = inOutCubic(prog(t, 0.6, 0.85));
  return {open, turn, surprise, look};
};

const Eye: React.FC<{x: number; open: number; surprise: number; look: number; side: 1 | -1; lit: number}> = ({x, open, surprise, look, side, lit}) => {
  const w = 17;
  const hTop = 10 * open * (1 + 0.35 * surprise);
  const hBot = 7 * open;
  const px = x + look * 5.5;
  const id = `eyeclip${side}`;
  const almond = `M${x - w} 0 Q${x} ${-hTop * 1.6} ${x + w} 0 Q${x} ${hBot * 1.5} ${x - w} 0 Z`;
  return (
    <g>
      <defs>
        <clipPath id={id}>
          <path d={almond} />
        </clipPath>
      </defs>
      {open > 0.05 ? (
        <>
          <path d={almond} fill="#e9e4dc" />
          <g clipPath={`url(#${id})`}>
            <circle cx={px} cy={-1} r={7.5} fill="#3a2416" />
            <circle cx={px} cy={-1} r={3.8} fill="#070403" />
            <circle cx={px + 2.5} cy={-3.5} r={1.8} fill={lit > 0.3 ? '#bff6ff' : '#fff'} />
            <rect x={x - w} y={-14} width={w * 2} height={6} fill="#000" opacity={0.25} />
          </g>
        </>
      ) : null}
      {/* linha dos cílios */}
      <path d={open > 0.05 ? `M${x - w} 0 Q${x} ${-hTop * 1.6} ${x + w} 0` : `M${x - w} 0 Q${x} 6 ${x + w} 0`} fill="none" stroke="#140c08" strokeWidth={3.2} strokeLinecap="round" />
    </g>
  );
};

const Head: React.FC = () => {
  const t = useT();
  const {open, turn, surprise, look} = faceState(t);
  const lit = outCubic(prog(t, T_BUZZ, T_BUZZ + 0.3));
  const fx = turn * 11; // deslocamento dos traços (virada de cabeça)
  const brow = -8 * surprise;
  const mouthO = surprise;
  const hairCurls = useMemo(() => {
    const r = seeded(9);
    return Array.from({length: 26}, (_, i) => {
      const a = Math.PI * (1.05 + (i / 25) * 0.9);
      const rr = 74 + r() * 14;
      return {x: Math.cos(a) * rr, y: Math.sin(a) * rr * 1.05 - 10, r: 17 + r() * 9};
    });
  }, []);
  return (
    <g transform={`translate(372 418) rotate(${14 * turn} 0 120)`}>
      {/* sombra no travesseiro */}
      <ellipse cx={-10} cy={18} rx={104} ry={122} fill="#05080f" opacity={0.45} filter="blur(12px)" />
      {/* cabelo atrás (espalhado no travesseiro) */}
      {hairCurls.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={c.r} fill={HAIR} />
      ))}
      <ellipse cx={0} cy={-22} rx={86} ry={82} fill={HAIR} />
      {/* orelhas */}
      <ellipse cx={-80 + fx * 0.4} cy={10} rx={12 * (1 - 0.2 * turn)} ry={22} fill={SKIN_D} />
      <ellipse cx={80 + fx * 0.4} cy={10} rx={12 * (1 - 0.7 * turn)} ry={22} fill={SKIN_D} />
      {/* pescoço */}
      <rect x={-34} y={80} width={68} height={70} fill={SKIN_D} />
      {/* rosto */}
      <path d="M-76 -12 C-76 -74 76 -74 76 -12 C76 52 40 102 0 106 C-40 102 -76 52 -76 -12 Z" fill={SKIN} />
      <path d="M-76 -12 C-76 -74 76 -74 76 -12 C76 52 40 102 0 106 C-40 102 -76 52 -76 -12 Z" fill="url(#faceshade)" />
      <defs>
        <linearGradient id="faceshade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1a0e08" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#1a0e08" stopOpacity="0.05" />
          <stop offset="1" stopColor="#7fdcff" stopOpacity={0.12 + 0.18 * lit * turn} />
        </linearGradient>
      </defs>
      {/* linha do cabelo sobre a testa */}
      <path d="M-80 -18 C-70 -62 -30 -78 0 -76 C34 -78 72 -62 80 -18 C60 -44 30 -52 0 -50 C-30 -52 -62 -44 -80 -18 Z" fill={HAIR} />
      {[-62, -42, -20, 2, 24, 46, 64].map((x, i) => (
        <circle key={i} cx={x} cy={-50 + Math.abs(x) * 0.28} r={11} fill={HAIR} />
      ))}
      {/* sobrancelhas */}
      <g transform={`translate(${fx} ${brow})`}>
        <path d={`M-52 -26 Q-34 ${-36 - 4 * surprise} -15 -27`} stroke="#160e0a" strokeWidth={8} strokeLinecap="round" fill="none" />
        <path d={`M15 -27 Q34 ${-36 - 4 * surprise} 52 -26`} stroke="#160e0a" strokeWidth={8} strokeLinecap="round" fill="none" />
      </g>
      {/* olhos */}
      <g transform={`translate(${fx} -2)`}>
        <Eye x={-32} open={open} surprise={surprise} look={look} side={-1} lit={lit} />
        <Eye x={32} open={open} surprise={surprise} look={look} side={1} lit={lit} />
      </g>
      {/* nariz */}
      <g transform={`translate(${fx * 1.25} 0)`}>
        <path d="M-6 6 C-10 22 -16 30 -12 36 C-6 40 6 40 12 36 C16 30 10 22 6 6" fill={SKIN_D} opacity={0.55} />
        <ellipse cx={-7} cy={36} rx={4.2} ry={2.6} fill="#2e1a10" />
        <ellipse cx={7} cy={36} rx={4.2} ry={2.6} fill="#2e1a10" />
        <ellipse cx={2} cy={22} rx={4} ry={7} fill="#c08860" opacity={0.35} />
      </g>
      {/* boca */}
      <g transform={`translate(${fx} 0)`}>
        <path d={`M-19 60 Q0 ${55 - 2 * mouthO} 19 60`} stroke="#3e2216" strokeWidth={3.4} fill="none" strokeLinecap="round" />
        {mouthO > 0.05 ? <ellipse cx={0} cy={62} rx={8 * mouthO} ry={5.5 * mouthO} fill="#1e0d08" /> : null}
        <path d="M-12 68 Q0 73 12 68" stroke="#a06a4a" strokeWidth={2} fill="none" opacity={0.5} />
      </g>
    </g>
  );
};

const Torso: React.FC = () => (
  <g>
    {/* ombros/camiseta entre travesseiro e edredom */}
    <path d="M200 690 C210 600 280 560 372 556 C464 560 534 600 548 690 Z" fill={SHIRT} />
    <path d="M330 556 Q372 590 414 556" fill="none" stroke="#1c2635" strokeWidth={10} />
    <path d="M200 690 C210 600 280 560 372 556 C464 560 534 600 548 690" fill="none" stroke="#9fc7ff" strokeOpacity={0.12} strokeWidth={3} />
  </g>
);

// braço esquerdo dele (lado direito do quadro) com IK de dois ossos
const ik = (S: {x: number; y: number}, T: {x: number; y: number}, L1: number, L2: number, P: {x: number; y: number}) => {
  const dx = T.x - S.x, dy = T.y - S.y;
  const d = Math.min(Math.hypot(dx, dy), L1 + L2 - 0.5);
  const base = Math.atan2(dy, dx);
  const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const c1 = {x: S.x + L1 * Math.cos(base + a), y: S.y + L1 * Math.sin(base + a)};
  const c2 = {x: S.x + L1 * Math.cos(base - a), y: S.y + L1 * Math.sin(base - a)};
  const E = Math.hypot(c1.x - P.x, c1.y - P.y) < Math.hypot(c2.x - P.x, c2.y - P.y) ? c1 : c2;
  const Tt = {x: S.x + d * Math.cos(base), y: S.y + d * Math.sin(base)};
  return {E, T: Tt};
};

export const handTarget = (t: number) => {
  const rest = {x: 600, y: 885};
  const reach = {x: 790, y: 610};
  const back = {x: 640, y: 980};
  const u = inOutCubic(prog(t, 0.82, 1.48));
  const v = inOutCubic(prog(t, 1.5, 1.95));
  const lift = Math.sin(Math.PI * u) * 30;
  return {x: lerp(lerp(rest.x, reach.x, u), back.x, v), y: lerp(lerp(rest.y, reach.y, u), back.y, v) - lift * 0.4, spread: u * (1 - v), point: 0};
};

const Arm: React.FC = () => {
  const t = useT();
  const S = {x: 520, y: 640};
  if (t > 1.98) return null;
  const tg = handTarget(t);
  const {E, T} = ik(S, tg, 150, 150, {x: 720, y: 830});
  const ang = Math.atan2(T.y - E.y, T.x - E.x);
  const deg = (ang * 180) / Math.PI;
  const fingers = [-1.5, -0.5, 0.5, 1.5];
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <defs>
        <linearGradient id="armg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9a6646" />
          <stop offset="1" stopColor="#6b4129" />
        </linearGradient>
      </defs>
      <g filter="blur(6px)" opacity={0.5}>
        <path d={`M${S.x + 8} ${S.y + 14} L${E.x + 8} ${E.y + 14} L${T.x + 8} ${T.y + 14}`} stroke="#000" strokeWidth={50} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <line x1={S.x} y1={S.y} x2={E.x} y2={E.y} stroke="url(#armg)" strokeWidth={58} strokeLinecap="round" />
      <line x1={E.x} y1={E.y} x2={T.x} y2={T.y} stroke="url(#armg)" strokeWidth={48} strokeLinecap="round" />
      {/* manga */}
      <line x1={S.x} y1={S.y} x2={S.x + (E.x - S.x) * 0.5} y2={S.y + (E.y - S.y) * 0.5} stroke={SHIRT} strokeWidth={70} strokeLinecap="round" />
      {/* mão */}
      <g transform={`translate(${T.x} ${T.y}) rotate(${deg})`}>
        <ellipse cx={20} cy={0} rx={34} ry={27} fill="#8a5a3d" />
        {fingers.map((f, i) => {
          const pointing = tg.point > 0.3 && i === 0;
          const len = pointing ? 52 : 34 - Math.abs(f) * 4 - (tg.point > 0.3 ? 12 : 0);
          const spread = f * (6 + 5 * tg.spread);
          return <line key={i} x1={44} y1={f * 11} x2={44 + len} y2={f * 11 + spread} stroke="#8a5a3d" strokeWidth={13} strokeLinecap="round" />;
        })}
        <line x1={18} y1={-22} x2={40} y2={-42} stroke="#7a4d33" strokeWidth={14} strokeLinecap="round" />
        <ellipse cx={14} cy={4} rx={26} ry={18} fill="#000" opacity={0.08} />
      </g>
    </svg>
  );
};

// ------------------------------------------------------------ criado-mudo, abajur, copo, celular
const Nightstand: React.FC = () => {
  const t = useT();
  const lit = outCubic(prog(t, T_BUZZ, T_BUZZ + 0.25));
  const pulse = 1 + 0.25 * Math.exp(-Math.pow((t - T_NOTIF - 0.2) / 0.3, 2));
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <defs>
        <linearGradient id="woodg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a2c21" />
          <stop offset="1" stopColor="#22190f" />
        </linearGradient>
        <clipPath id="nsclip">
          <rect x={745} y={290} width={420} height={440} rx={14} />
        </clipPath>
        <radialGradient id="phlight">
          <stop offset="0" stopColor="#8fe9ff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#3aa8ff" stopOpacity="0.14" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x={752} y={305} width={420} height={440} rx={14} fill="#000" opacity={0.55} filter="blur(14px)" />
      <rect x={745} y={290} width={420} height={440} rx={14} fill="url(#woodg)" />
      <g clipPath="url(#nsclip)" opacity={0.25}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <path key={i} d={`M745 ${310 + i * 55} C860 ${300 + i * 55} 980 ${325 + i * 55} 1165 ${308 + i * 55}`} stroke="#1a120b" strokeWidth={3} fill="none" />
        ))}
      </g>
      <rect x={745} y={290} width={420} height={440} rx={14} fill="#0a1426" opacity={0.35} />
      <rect x={745} y={290} width={420} height={3} fill="#c9a985" opacity={0.25} />
      <Stripes h={0.58} clip="nsclip" id="stn" strength={1.2} />
      <ellipse cx={PHONE.x} cy={PHONE.y} rx={230} ry={260} fill="url(#phlight)" opacity={lit * pulse} style={{mixBlendMode: 'screen'}} />
    </svg>
  );
};

const PhoneOnStand: React.FC = () => {
  const t = useT();
  const bz = phoneBuzz(t);
  const s = PHONE.w / PH_W;
  return (
    <div
      style={{
        position: 'absolute',
        left: PHONE.x - PH_W / 2,
        top: PHONE.y - PH_H / 2,
        width: PH_W,
        height: PH_H,
        transform: `translate(${bz * 3}px, ${bz * 1.5}px) rotate(${PHONE.rot + bz * 0.8}deg) scale(${s})`,
        transformOrigin: 'center center',
      }}
    >
      <PhoneBody t={t} />
    </div>
  );
};

const Lamp: React.FC = () => (
  <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
    <defs>
      <radialGradient id="lampg" cx="0.4" cy="0.4" r="0.7">
        <stop offset="0" stopColor="#8a8579" />
        <stop offset="1" stopColor="#3f3b35" />
      </radialGradient>
    </defs>
    <circle cx={1000} cy={392} r={86} fill="#000" opacity={0.45} filter="blur(14px)" />
    <circle cx={990} cy={378} r={80} fill="url(#lampg)" />
    <circle cx={990} cy={378} r={80} fill="#0a1426" opacity={0.4} />
    <circle cx={990} cy={378} r={26} fill="#1c1a17" />
    <circle cx={990} cy={378} r={80} fill="none" stroke="#d8e6ff" strokeOpacity={0.15} strokeWidth={3} />
  </svg>
);

const Glass: React.FC = () => (
  <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
    <circle cx={806} cy={378} r={30} fill="#9fc4e8" opacity={0.12} />
    <circle cx={806} cy={378} r={30} fill="none" stroke="#d8ecff" strokeOpacity={0.5} strokeWidth={2.5} />
    <circle cx={806} cy={378} r={22} fill="none" stroke="#d8ecff" strokeOpacity={0.18} strokeWidth={2} />
    <path d="M788 366 A22 22 0 0 1 806 356" stroke="#fff" strokeOpacity={0.6} strokeWidth={3} fill="none" />
  </svg>
);

// ------------------------------------------------------------ cena
export const BedroomScene: React.FC = () => {
  const t = useT();
  const {roll, H} = camAt(t);
  // profundidade de campo: ao chegar no celular, o que está mais perto/longe desfoca
  const dof = (h: number) => {
    const d = H - h;
    const dp = H - PHONE.h;
    return clamp(Math.abs(d - dp) / Math.max(dp, 0.05) * 3.2, 0, 16) * smooth(prog(t, 1.3, 1.9));
  };
  return (
    <AbsoluteFill style={{background: '#06080d', transform: `rotate(${roll}deg) scale(1.06)`, transformOrigin: '540px 960px'}}>
      <OH h={0} blur={dof(0)}>
        <Floor />
      </OH>
      <OH h={0.45} blur={dof(0.45)}>
        <Bed />
      </OH>
      <OH h={0.6} blur={dof(0.6)}>
        <Pillow />
      </OH>
      <OH h={0.66} blur={dof(0.66)}>
        <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
          <Torso />
          <Head />
        </svg>
      </OH>
      <OH h={0.58} blur={dof(0.58)}>
        <Duvet />
      </OH>
      <OH h={0.58}>
        <Nightstand />
      </OH>
      <OH h={PHONE.h}>
        <PhoneOnStand />
      </OH>
      <OH h={0.7} blur={dof(0.7)}>
        <Glass />
      </OH>
      <OH h={0.7} blur={dof(0.7) * 0.8}>
        <Arm />
      </OH>
      <OH h={0.95} blur={dof(0.95)} fade={0.3}>
        <Lamp />
      </OH>
      {/* tom de amanhecer + vinheta */}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 80% 60% at 60% 35%, rgba(60,110,200,0.10), rgba(0,0,0,0) 60%)', mixBlendMode: 'screen'}} />
    </AbsoluteFill>
  );
};

export const _b = {outExpo};
