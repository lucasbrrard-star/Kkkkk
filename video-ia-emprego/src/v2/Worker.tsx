import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {clamp, inOutCubic, lerp, outCubic, prog, seeded, smooth, spring} from '../lib/ease';
import {useT} from '../lib/time';

// Metade esquerda da tela dividida: o mesmo jovem, de perfil, trabalhando no notebook.
const SKIN = '#8a5a3d';
const SKIN_L = '#a8714f';
const SHIRT = '#2f3d52';
const HAIR = '#120d0b';

const HEAD = 'M-60 -40 C-62 -95 -10 -118 34 -112 C74 -106 96 -78 98 -44 C99 -30 96 -22 100 -14 C103 -8 101 -2 104 4 L124 38 C127 44 120 48 112 48 C108 50 108 54 110 57 C114 60 114 64 110 66 C106 68 106 70 110 73 C112 77 108 82 102 84 C104 92 106 100 100 106 C90 116 70 118 50 114 C36 128 30 140 28 168 L-34 168 C-36 132 -42 110 -54 90 C-66 60 -66 10 -60 -40 Z';
const HAIR_P = 'M84 -74 C70 -104 30 -122 -6 -114 C-52 -104 -74 -64 -70 -16 C-68 20 -62 52 -54 74 C-48 60 -44 40 -40 22 C-30 6 -18 -6 -10 -22 C10 -40 40 -52 62 -56 C72 -60 80 -64 84 -74 Z';

const ik = (S: {x: number; y: number}, T: {x: number; y: number}, L1: number, L2: number, P: {x: number; y: number}) => {
  const dx = T.x - S.x, dy = T.y - S.y;
  const d = Math.min(Math.hypot(dx, dy), L1 + L2 - 0.5);
  const base = Math.atan2(dy, dx);
  const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const c1 = {x: S.x + L1 * Math.cos(base + a), y: S.y + L1 * Math.sin(base + a)};
  const c2 = {x: S.x + L1 * Math.cos(base - a), y: S.y + L1 * Math.sin(base - a)};
  const E = Math.hypot(c1.x - P.x, c1.y - P.y) < Math.hypot(c2.x - P.x, c2.y - P.y) ? c1 : c2;
  return {E, T: {x: S.x + d * Math.cos(base), y: S.y + d * Math.sin(base)}};
};

// estado de atuação: digitando -> pausa -> mão na nuca, olha para o lado da IA
export const actState = (t: number) => {
  const stop = inOutCubic(prog(t, 5.1, 5.45));
  const look = inOutCubic(prog(t, 5.3, 5.7));
  const worry = spring(prog(t, 5.45, 6.0), 5, 7);
  const blink = Math.exp(-Math.pow((t - 4.75) / 0.04, 2)) + Math.exp(-Math.pow((t - 5.85) / 0.05, 2));
  return {stop, look, worry, blink: clamp(blink)};
};

const Head: React.FC<{t: number}> = ({t}) => {
  const {look, worry, blink} = actState(t);
  const typing = 1 - look;
  const nod = Math.sin(t * 5.5) * 1.2 * typing;
  const tilt = -7 * look + nod + 5 * typing;
  const curls = useMemo(() => {
    const r = seeded(4);
    const pts: {x: number; y: number; r: number}[] = [];
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * (1.0 + i / 15) + 0.15;
      pts.push({x: -4 + Math.cos(a) * (74 + r() * 8), y: -30 + Math.sin(a) * (84 + r() * 8), r: 12 + r() * 7});
    }
    return pts;
  }, []);
  const eyeOpen = 1 - blink;
  const irisY = lerp(-8, -12, look);
  const irisX = lerp(89, 91, look);
  const browIn = -6 * worry; // ponta interna (frente) sobe
  return (
    <g transform={`rotate(${tilt} 0 120)`}>
      <defs>
        <linearGradient id="wface" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3a2416" />
          <stop offset="0.55" stopColor={SKIN} />
          <stop offset="1" stopColor={SKIN_L} />
        </linearGradient>
        <clipPath id="wheadclip">
          <path d={HEAD} />
        </clipPath>
      </defs>
      <path d={HEAD} fill="url(#wface)" />
      {/* luz fria da tela/IA batendo no perfil */}
      <g clipPath="url(#wheadclip)">
        <path d={HEAD} fill="none" stroke="#9fefff" strokeWidth={7} opacity={0.55} transform="translate(-4 0)" filter="blur(2px)" />
        <rect x={-80} y={-130} width={220} height={60} fill="#ffb648" opacity={0.12} filter="blur(12px)" />
      </g>
      {/* orelha */}
      <ellipse cx={-6} cy={6} rx={15} ry={25} fill="#6e4329" />
      <path d="M-8 -8 C2 -6 4 12 -6 22" stroke="#4a2c1a" strokeWidth={3} fill="none" />
      {/* cabelo */}
      <path d={HAIR_P} fill={HAIR} />
      {curls.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={c.r} fill={HAIR} />
      ))}
      <path d="M-40 -100 C0 -124 50 -116 78 -90" stroke="#ffb648" strokeOpacity={0.35} strokeWidth={4} fill="none" filter="blur(1.5px)" />
      {/* sobrancelha */}
      <path d={`M64 -32 Q80 -40 ${98} ${-32 + browIn}`} stroke="#140c08" strokeWidth={8} strokeLinecap="round" fill="none" />
      {/* olho */}
      <g>
        <path d={`M72 -14 Q84 ${-14 - 9 * eyeOpen} 96 -12 Q86 ${-12 + 6 * eyeOpen} 74 -8 Z`} fill={eyeOpen > 0.1 ? '#efe7dd' : SKIN} />
        {eyeOpen > 0.2 ? <ellipse cx={irisX} cy={irisY} rx={4} ry={5.4 * eyeOpen} fill="#1a0f09" /> : null}
        {eyeOpen > 0.2 ? <circle cx={irisX + 1.3} cy={irisY - 1.6} r={1.2} fill="#cff7ff" /> : null}
        <path d={`M71 -14 Q84 ${-14 - 9 * eyeOpen} 97 -12`} stroke="#140c08" strokeWidth={3.4} fill="none" strokeLinecap="round" />
      </g>
      {/* boca */}
      <path d={`M100 ${69 + 2.5 * worry} L110 68`} stroke="#3a1f14" strokeWidth={2.6} strokeLinecap="round" />
      {/* pescoço */}
      <path d="M-34 150 L28 150 L34 190 L-40 190 Z" fill="#6e4329" />
    </g>
  );
};

export const WorkerScene: React.FC = () => {
  const t = useT();
  const {stop, look, worry} = actState(t);
  // respiração e recuo do corpo
  const lean = -3.5 * look;
  const H = {x: 178, y: 735};
  const S = {x: 170, y: 990};
  // alvo da mão: teclado (digitando) -> nuca
  const kb = {x: 372 + Math.sin(t * 23) * 5 * (1 - stop), y: 1118 + Math.abs(Math.sin(t * 17)) * -7 * (1 - stop)};
  const neck = {x: 268, y: 852 + Math.sin(t * 3) * 3 * smooth(prog(t, 5.45, 5.6))};
  const g = inOutCubic(prog(t, 5.12, 5.5));
  const target = {x: lerp(kb.x, neck.x, g), y: lerp(kb.y, neck.y, g) - Math.sin(Math.PI * g) * 40};
  const pole = {x: lerp(150, 330, g), y: lerp(1180, 1150, g)};
  const {E, T} = ik(S, target, 175, 180, pole);
  const handAng = (Math.atan2(T.y - E.y, T.x - E.x) * 180) / Math.PI;
  // linhas do documento digitado devagar
  const typed = Math.floor((t - 4.1) * 7);
  const docLines = [0.9, 0.75, 0.95, 0.6];
  const lamp = 0.85 + 0.15 * Math.sin(t * 1.3);
  return (
    <AbsoluteFill>
      {/* parede e fundo desfocado */}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, #1b130e 0%, #120d0a 55%, #0b0807 100%)'}} />
      <svg width={1080} height={1920} style={{position: 'absolute'}}>
        <defs>
          <filter id="wbg" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <radialGradient id="cone" cx="0.5" cy="0" r="1">
            <stop offset="0" stopColor="#ffc46e" stopOpacity="0.55" />
            <stop offset="0.6" stopColor="#ff9a3c" stopOpacity="0.12" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="deskg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4a3322" />
            <stop offset="0.06" stopColor="#2b1d13" />
            <stop offset="1" stopColor="#0d0907" />
          </linearGradient>
        </defs>
        <g filter="url(#wbg)" opacity={0.85}>
          <rect x={40} y={330} width={170} height={220} rx={6} fill="#2a1f18" stroke="#3a2c22" strokeWidth={8} />
          <rect x={62} y={352} width={126} height={176} fill="#3b4f66" opacity={0.5} />
          <rect x={-20} y={620} width={300} height={14} fill="#2a1d14" />
          <rect x={10} y={560} width={26} height={60} fill="#5a3f2c" />
          <rect x={44} y={575} width={20} height={45} fill="#7a3c2c" />
          <rect x={70} y={566} width={24} height={54} fill="#3a556e" />
          <ellipse cx={230} cy={570} rx={40} ry={52} fill="#1f3326" />
          {[0, 1, 2, 3, 4].map((i) => (
            <circle key={i} cx={260 + i * 48} cy={420 + (i % 2) * 70} r={16 + i * 3} fill="#ffb05a" opacity={0.18} />
          ))}
        </g>
        {/* luminária articulada + cone de luz quente */}
        <path d={`M455 1160 L425 800 L505 650`} stroke="#0a0706" strokeWidth={12} fill="none" strokeLinecap="round" />
        <path d="M470 612 L540 650 L512 700 L452 668 Z" fill="#0d0a08" />
        <path d="M452 668 L512 700" stroke="#ffd08a" strokeWidth={5} />
        <polygon points="455,684 520,705 600,1180 140,1180" fill="url(#cone)" opacity={0.6 * lamp} style={{mixBlendMode: 'screen'}} />
        {/* mesa */}
        <rect x={-40} y={1160} width={620} height={800} fill="url(#deskg)" />
        <ellipse cx={330} cy={1166} rx={220} ry={10} fill="#ffc46e" opacity={0.25 * lamp} />
        {/* caneca */}
        <path d="M44 1080 L44 1150 Q44 1160 56 1160 L100 1160 Q112 1160 112 1150 L112 1080 Z" fill="#20160f" />
        <path d="M112 1096 q22 2 20 24 q-2 18 -20 16" fill="none" stroke="#20160f" strokeWidth={8} />
        <ellipse cx={78} cy={1080} rx={34} ry={6} fill="#3a2a1d" />
      </svg>
      {/* tela do notebook em perspectiva, voltada para ele */}
      <div style={{position: 'absolute', left: 250, top: 860, width: 330, height: 230, perspective: 700}}>
        <div
          style={{
            width: 330,
            height: 230,
            transform: 'rotateY(-42deg)',
            transformOrigin: '100% 100%',
            background: '#0b0f16',
            borderRadius: 12,
            padding: 10,
            boxSizing: 'border-box',
            boxShadow: '0 0 40px rgba(140,200,255,0.25)',
          }}
        >
          <div style={{width: '100%', height: '100%', borderRadius: 6, background: '#eef3f8', padding: '12px 14px', boxSizing: 'border-box', overflow: 'hidden', fontFamily: 'Inter Tight'}}>
            <div style={{fontSize: 15, fontWeight: 700, color: '#26324a', marginBottom: 10}}>Relatório trimestral</div>
            {docLines.map((w, i) => {
              const full = typed > (i + 1) * 6;
              const part = clamp((typed - i * 6) / 6);
              return <div key={i} style={{height: 7, width: `${w * 100 * (full ? 1 : part)}%`, background: '#7b8aa3', borderRadius: 4, marginBottom: 9, opacity: 0.8}} />;
            })}
            <div style={{display: 'inline-block', width: 2, height: 14, background: '#2f7bff', opacity: Math.floor(t * 3) % 2 ? 1 : 0}} />
            <div style={{display: 'flex', alignItems: 'flex-end', gap: 8, height: 50, marginTop: 6}}>
              {[0.6, 0.35].map((h, i) => (
                <div key={i} style={{width: 26, height: `${h * 100}%`, background: '#ffb648', borderRadius: 3}} />
              ))}
              <div style={{width: 26, height: '20%', border: '2px dashed #b9c4d6', borderRadius: 3}} />
            </div>
          </div>
        </div>
      </div>
      {/* base do notebook */}
      <svg width={1080} height={1920} style={{position: 'absolute'}}>
        <path d="M250 1150 L560 1150 L575 1162 L236 1162 Z" fill="#1a1e26" />
        <path d="M250 1150 L560 1150" stroke="#8fa3bd" strokeOpacity={0.4} strokeWidth={2} />
      </svg>
      {/* personagem */}
      <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
        <defs>
          <linearGradient id="wshirt" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#151c27" />
            <stop offset="0.7" stopColor={SHIRT} />
            <stop offset="1" stopColor="#3d5070" />
          </linearGradient>
        </defs>
        <g transform={`rotate(${lean} 160 1300)`}>
          {/* tronco */}
          <path d="M88 940 C120 905 210 905 248 950 C268 1010 268 1080 262 1170 L60 1170 C56 1080 62 990 88 940 Z" fill="url(#wshirt)" />
          <path d="M248 950 C268 1010 268 1080 262 1170" stroke="#9fefff" strokeOpacity={0.35} strokeWidth={4} fill="none" />
          <g transform={`translate(${H.x} ${H.y})`}>
            <Head t={t} />
          </g>
          {/* braço */}
          <line x1={S.x} y1={S.y} x2={E.x} y2={E.y} stroke="url(#wshirt)" strokeWidth={64} strokeLinecap="round" />
          <line x1={E.x} y1={E.y} x2={T.x} y2={T.y} stroke={SKIN} strokeWidth={46} strokeLinecap="round" />
          <line x1={E.x} y1={E.y} x2={T.x} y2={T.y} stroke="#9fefff" strokeOpacity={0.18} strokeWidth={46} strokeLinecap="round" transform="translate(0 -4)" />
          <line x1={S.x} y1={S.y} x2={lerp(S.x, E.x, 0.55)} y2={lerp(S.y, E.y, 0.55)} stroke={SHIRT} strokeWidth={70} strokeLinecap="round" />
          <g transform={`translate(${T.x} ${T.y}) rotate(${handAng})`}>
            <ellipse cx={16} cy={0} rx={28} ry={21} fill={SKIN} />
            {[-1, 0, 1].map((f) => (
              <line key={f} x1={34} y1={f * 9} x2={52 + Math.sin(t * 20 + f * 2) * 4 * (1 - stop)} y2={f * 10 + 6} stroke={SKIN} strokeWidth={11} strokeLinecap="round" />
            ))}
          </g>
        </g>
      </svg>
      {/* sombra quente + vinheta lateral */}
      <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 40%)'}} />
      <AbsoluteFill style={{opacity: 0.12 * worry, background: 'radial-gradient(circle at 25% 40%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.7) 100%)'}} />
    </AbsoluteFill>
  );
};

export const _w = {outCubic};
