import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {clamp, inOutCubic, lerp, outCubic, outExpo, prog, seeded, smooth} from '../lib/ease';
import {useT} from '../lib/time';

// ------------------------------------------------------------ câmera de recuo (dolly-out com paralaxe)
export const T_CROP0 = 5.95;
export const T_CROP1 = 6.25;
export const T_PULL0 = 6.12;
export const T_PULL1 = 7.7;
const S0 = 1080 / 214; // escala inicial: o par de janelas ocupa a largura do quadro
const D0 = 1 / S0;

export const cityCam = (t: number) => {
  const u = inOutCubic(prog(t, T_PULL0, T_PULL1));
  // interpolação em log da distância
  const D = Math.exp(lerp(Math.log(D0), Math.log(1), u)) * (1 + 0.025 * smooth(prog(t, T_PULL1, 8.6)));
  const A = {x: 540, y: lerp(905, 960, u)};
  const P = {x: 540, y: lerp(850, 960, u)};
  return {D, A, P, u};
};
const layerScale = (D: number, delta: number) => (1 + delta) / (D + delta);

// transform CSS para uma camada desenhada nas coordenadas da vista final
const layerStyle = (t: number, delta: number): React.CSSProperties => {
  const {D, A, P} = cityCam(t);
  const S = layerScale(D, delta);
  // tela = A + (p - P)·S  ->  translate + scale com origem (0,0)
  return {transform: `translate(${A.x - P.x * S}px, ${A.y - P.y * S}px) scale(${S})`, transformOrigin: '0 0'};
};

// conteúdo da tela dividida (coordenadas 1080×1920) -> janelas do prédio
export const pairStyle = (t: number): React.CSSProperties => {
  const {D, A, P} = cityCam(t);
  const S = layerScale(D, 0);
  const k = (214 / 1080) * S;
  const tx = A.x + (540 - P.x) * S - 540;
  const ty = A.y + (850 - P.y) * S - 905;
  const c = outCubic(prog(t, T_CROP0, T_CROP1));
  return {
    transform: `translate(${tx}px, ${ty}px) scale(${k})`,
    transformOrigin: '540px 905px',
    clipPath: `inset(${300 * c}px 0px ${410 * c}px 0px round ${24 * c}px)`,
  };
};

// ------------------------------------------------------------ figurinhas (profissões)
type Pose = {lh: [number, number]; rh: [number, number]};
const ik2 = (sx: number, sy: number, tx: number, ty: number, L: number, bend: number) => {
  const dx = tx - sx, dy = ty - sy;
  const d = Math.min(Math.hypot(dx, dy), 2 * L - 0.5);
  const base = Math.atan2(dy, dx);
  const a = Math.acos(clamp(d / (2 * L), -1, 1)) * bend;
  return {ex: sx + L * Math.cos(base + a), ey: sy + L * Math.sin(base + a), hx: sx + d * Math.cos(base), hy: sy + d * Math.sin(base)};
};

const Fig: React.FC<{x: number; y: number; pose: Pose; hair?: 'short' | 'bun' | 'long' | 'cap' | 'chef'; top?: string; skin?: string; seated?: boolean}> = ({
  x,
  y,
  pose,
  hair = 'short',
  top = '#1f2533',
  skin = '#7a4c33',
  seated,
}) => {
  const sh = {lx: x - 30, rx: x + 30, y: y + 18};
  const la = ik2(sh.lx, sh.y, pose.lh[0], pose.lh[1], 48, 1);
  const ra = ik2(sh.rx, sh.y, pose.rh[0], pose.rh[1], 48, -1);
  return (
    <g>
      {/* tronco */}
      <path d={`M${x - 36} ${y + 14} Q${x} ${y + 2} ${x + 36} ${y + 14} L${x + 30} ${y + (seated ? 110 : 150)} L${x - 30} ${y + (seated ? 110 : 150)} Z`} fill={top} />
      {seated ? <rect x={x - 34} y={y + 104} width={86} height={22} rx={8} fill={top} /> : <rect x={x - 26} y={y + 148} width={52} height={120} fill="#141821" />}
      {/* pescoço e cabeça */}
      <rect x={x - 7} y={y - 6} width={14} height={20} fill={skin} />
      <circle cx={x} cy={y - 26} r={23} fill={skin} />
      {hair === 'short' ? <path d={`M${x - 24} ${y - 26} Q${x - 22} ${y - 54} ${x} ${y - 52} Q${x + 24} ${y - 54} ${x + 24} ${y - 30} Q${x + 10} ${y - 42} ${x - 24} ${y - 26} Z`} fill="#140e0b" /> : null}
      {hair === 'bun' ? (
        <>
          <path d={`M${x - 25} ${y - 22} Q${x - 24} ${y - 54} ${x} ${y - 52} Q${x + 25} ${y - 54} ${x + 25} ${y - 22} Q${x + 6} ${y - 40} ${x - 25} ${y - 22} Z`} fill="#2a1a12" />
          <circle cx={x - 4} cy={y - 56} r={11} fill="#2a1a12" />
        </>
      ) : null}
      {hair === 'long' ? <path d={`M${x - 26} ${y + 6} Q${x - 30} ${y - 54} ${x} ${y - 52} Q${x + 30} ${y - 54} ${x + 26} ${y + 6} L${x + 18} ${y + 6} Q${x + 18} ${y - 36} ${x} ${y - 36} Q${x - 18} ${y - 36} ${x - 18} ${y + 6} Z`} fill="#1a110c" /> : null}
      {hair === 'cap' ? <path d={`M${x - 25} ${y - 30} Q${x} ${y - 60} ${x + 25} ${y - 30} L${x + 44} ${y - 28} L${x + 25} ${y - 24} Z`} fill="#c0563a" /> : null}
      {hair === 'chef' ? (
        <>
          <rect x={x - 20} y={y - 62} width={40} height={20} fill="#eef0f2" />
          <circle cx={x - 12} cy={y - 66} r={12} fill="#eef0f2" />
          <circle cx={x + 10} cy={y - 68} r={13} fill="#eef0f2" />
        </>
      ) : null}
      {/* braços */}
      <path d={`M${sh.lx} ${sh.y} L${la.ex} ${la.ey} L${la.hx} ${la.hy}`} stroke={top} strokeWidth={17} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${sh.rx} ${sh.y} L${ra.ex} ${ra.ey} L${ra.hx} ${ra.hy}`} stroke={top} strokeWidth={17} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={la.hx} cy={la.hy} r={8} fill={skin} />
      <circle cx={ra.hx} cy={ra.hy} r={8} fill={skin} />
    </g>
  );
};

// cada vinheta: 200×480 (exibida a 100×240 na fachada)
type VigProps = {t: number};
const Room: React.FC<{children: React.ReactNode; warm?: number}> = ({children, warm = 1}) => (
  <g>
    <rect x={0} y={0} width={200} height={480} fill={warm ? '#4a2c18' : '#1a2233'} />
    <rect x={0} y={0} width={200} height={480} fill="url(#vigg)" />
    <rect x={0} y={400} width={200} height={80} fill="#1e130b" opacity={0.85} />
    {children}
  </g>
);

const VIGS: Record<string, React.FC<VigProps>> = {
  medica: ({t}) => (
    <Room>
      <rect x={110} y={150} width={80} height={110} rx={6} fill="#0b1626" stroke="#2c4a6a" strokeWidth={3} />
      <polyline points={Array.from({length: 16}, (_, i) => `${114 + i * 4.8},${205 + (i % 5 === ((Math.floor(t * 8)) % 5) ? -26 : (i % 5 === (Math.floor(t * 8) + 1) % 5 ? 14 : 0))}`).join(' ')} fill="none" stroke="#7ff0ff" strokeWidth={3} />
      <Fig x={70} y={250} pose={{lh: [40, 360], rh: [120 + Math.sin(t * 3) * 4, 220]}} hair="bun" top="#d8dde4" skin="#c48a66" />
    </Room>
  ),
  professor: ({t}) => (
    <Room>
      <rect x={20} y={120} width={130} height={150} fill="#1f3b2c" stroke="#3a2a1a" strokeWidth={6} />
      {[0, 1, 2].map((k) => (
        <rect key={k} x={34} y={145 + k * 32} width={clamp((t * 1.4 - k * 0.5) % 2.2) * 90 + 10} height={5} fill="#e8efe8" opacity={0.85} />
      ))}
      <Fig x={150} y={250} pose={{lh: [110 + Math.sin(t * 6) * 12, 170 + Math.cos(t * 6) * 8], rh: [170, 360]}} hair="short" top="#6a4a3a" skin="#9a6a4a" />
    </Room>
  ),
  designer: ({t}) => (
    <Room>
      <rect x={20} y={130} width={160} height={100} rx={6} fill="#10131c" />
      <circle cx={70} cy={180} r={22 * (0.6 + 0.4 * Math.sin(t * 2))} fill="#ff7a59" opacity={0.85} />
      <rect x={100} y={160} width={50} height={40} rx={6} fill="#7ff0ff" opacity={0.8} />
      <Fig x={100} y={300} seated pose={{lh: [70, 370], rh: [128 + Math.sin(t * 9) * 6, 360]}} hair="long" top="#3a3550" skin="#e0b090" />
      <rect x={60} y={360} width={90} height={10} rx={4} fill="#20242e" />
    </Room>
  ),
  chef: ({t}) => {
    const toss = Math.max(0, Math.sin(t * 5)) * 18;
    return (
      <Room>
        <rect x={0} y={330} width={200} height={70} fill="#3a3a3e" />
        <g transform={`translate(132 ${318 - toss * 0.4}) rotate(${-toss * 0.6})`}>
          <ellipse cx={0} cy={0} rx={30} ry={8} fill="#2a2a2e" />
          <circle cx={-6} cy={-6 - toss} r={6} fill="#f0c060" />
        </g>
        {[0, 1].map((k) => (
          <path key={k} d={`M${120 + k * 14} 290 q8 -20 0 -40 q-8 -20 0 -40`} stroke="#fff" strokeOpacity={0.18} strokeWidth={6} fill="none" transform={`translate(0 ${-((t * 30 + k * 20) % 30)})`} />
        ))}
        <Fig x={70} y={240} pose={{lh: [40, 330], rh: [110, 318 - toss * 0.4]}} hair="chef" top="#e9ecef" skin="#7a4c33" />
      </Room>
    );
  },
  atendente: ({t}) => {
    const b1 = clamp(((t * 1.3) % 2) * 2);
    const b2 = clamp(((t * 1.3 + 1) % 2) * 2);
    return (
      <Room>
        <rect x={24} y={150 - b1 * 10} width={90} height={34} rx={14} fill="#eef3f8" opacity={b1 * 0.9} />
        <rect x={86} y={196 - b2 * 10} width={90} height={34} rx={14} fill="#7ff0ff" opacity={b2 * 0.9} />
        <Fig x={100} y={280} seated pose={{lh: [62, 380], rh: [140, 380]}} hair="short" top="#2d5a6e" skin="#5e3a26" />
        <path d="M74 252 Q100 220 126 252" stroke="#111" strokeWidth={6} fill="none" />
        <circle cx={124} cy={262} r={6} fill="#111" />
        <rect x={50} y={385} width={110} height={12} rx={4} fill="#20242e" />
      </Room>
    );
  },
  arquiteta: ({t}) => (
    <Room>
      <rect x={20} y={330} width={170} height={20} fill="#2a2420" />
      <g transform={`translate(110 270) rotate(${t * 40})`} opacity={0.9}>
        <rect x={-22} y={-22} width={44} height={44} fill="none" stroke="#7ff0ff" strokeWidth={2.5} />
        <rect x={-14} y={-14} width={28} height={28} fill="none" stroke="#7ff0ff" strokeWidth={2} transform="rotate(45)" />
      </g>
      <ellipse cx={110} cy={318} rx={40} ry={6} fill="#7ff0ff" opacity={0.35} />
      <Fig x={50} y={240} pose={{lh: [70, 330], rh: [96 + Math.sin(t * 2) * 6, 300]}} hair="bun" top="#2b3142" skin="#a26a46" />
    </Room>
  ),
  mecanico: ({t}) => (
    <Room>
      <rect x={90} y={300} width={100} height={70} rx={10} fill="#2a2e36" />
      <circle cx={140} cy={335} r={18} fill="#14161b" stroke="#585e6a" strokeWidth={4} />
      <g transform={`translate(110 300) rotate(${Math.sin(t * 7) * 25})`}>
        <rect x={-4} y={-40} width={8} height={40} fill="#b8bcc6" />
      </g>
      <Fig x={70} y={230} pose={{lh: [40, 330], rh: [110, 300 + Math.sin(t * 7) * 6]}} hair="cap" top="#2c4a7a" skin="#7a4c33" />
    </Room>
  ),
  cientista: ({t}) => (
    <Room>
      <rect x={110} y={250} width={14} height={80} fill="#c8ccd4" />
      <rect x={96} y={326} width={46} height={14} fill="#c8ccd4" />
      <rect x={120} y={140} width={70} height={60} rx={6} fill="#0b1626" />
      <g transform={`translate(155 170) rotate(${t * 50})`}>
        {[0, 1, 2].map((k) => (
          <circle key={k} cx={Math.cos((k * Math.PI * 2) / 3) * 14} cy={Math.sin((k * Math.PI * 2) / 3) * 14} r={5} fill="#7ff0ff" />
        ))}
      </g>
      <Fig x={70} y={250} pose={{lh: [40, 360], rh: [112, 262]}} hair="short" top="#dfe3e8" skin="#c48a66" />
    </Room>
  ),
  programadora: ({t}) => (
    <Room>
      {[0, 1].map((m) => (
        <g key={m}>
          <rect x={18 + m * 92} y={160} width={84} height={64} rx={5} fill="#0d1018" />
          {[0, 1, 2, 3].map((k) => (
            <rect key={k} x={26 + m * 92} y={172 + ((k * 12 + t * 30 * (m + 1)) % 48)} width={20 + ((k * 37 + m * 11) % 40)} height={5} fill={k % 2 ? '#7ff0ff' : '#c792ea'} opacity={0.8} />
          ))}
        </g>
      ))}
      <Fig x={100} y={300} seated pose={{lh: [70 + Math.sin(t * 20) * 3, 372], rh: [130 + Math.cos(t * 18) * 3, 372]}} hair="long" top="#5a2a3a" skin="#7a4c33" />
      <rect x={40} y={378} width={130} height={10} rx={4} fill="#20242e" />
    </Room>
  ),
  barista: ({t}) => (
    <Room>
      <rect x={110} y={250} width={70} height={90} rx={6} fill="#3a3d44" />
      <rect x={130} y={300} width={20} height={26} fill="#f2efe8" />
      <path d={`M140 296 q6 -14 0 -28`} stroke="#fff" strokeOpacity={0.3} strokeWidth={5} fill="none" transform={`translate(0 ${-((t * 20) % 14)})`} />
      <Fig x={60} y={240} pose={{lh: [40, 330], rh: [128, 300]}} hair="short" top="#4a3226" skin="#a26a46" />
      <rect x={30} y={290} width={60} height={70} fill="#6a4a2a" />
    </Room>
  ),
  vazio: () => (
    <Room warm={0}>
      <rect x={30} y={60} width={140} height={300} fill="#0e1420" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
        <rect key={k} x={30} y={70 + k * 36} width={140} height={10} fill="#2b3446" />
      ))}
    </Room>
  ),
  planta: () => (
    <Room>
      <ellipse cx={60} cy={330} rx={44} ry={70} fill="#1d3a26" />
      <rect x={48} y={380} width={26} height={30} fill="#5a3a26" />
      <rect x={110} y={200} width={60} height={80} fill="#2a3a52" opacity={0.6} />
    </Room>
  ),
};

// grade da fachada (4 colunas × 4 andares). O par fica no andar 1, colunas 1–2.
const COLS = [319, 433, 547, 661];
const ROWS = [470, 730, 990, 1250];
const GRID: (string | null)[][] = [
  ['medica', 'professor', 'designer', 'chef'],
  ['atendente', null, null, 'arquiteta'],
  ['mecanico', 'cientista', 'programadora', 'barista'],
  ['planta', 'vazio', 'planta', 'vazio'],
];

const waveAt = (t: number, x: number) => smooth((t - 7.72 - ((1080 - x) / 1080) * 0.55) / 0.3);

const HeroBuilding: React.FC<{below: boolean}> = ({below}) => {
  const t = useT();
  // contorno com furos nas janelas
  let holes = '';
  for (const y of ROWS) for (const x of COLS) holes += `M${x} ${y} h100 v240 h-100 Z `;
  const body = `M290 390 H790 V1520 H290 Z ${holes}`;
  if (below) {
    return (
      <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
        <defs>
          <linearGradient id="vigg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffcf8a" stopOpacity="0.35" />
            <stop offset="0.5" stopColor="#ff9a3c" stopOpacity="0.08" />
            <stop offset="1" stopColor="#000" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        {GRID.map((row, r) =>
          row.map((v, c) => {
            if (!v) return null;
            const V = VIGS[v];
            const w = waveAt(t, COLS[c] + 50);
            return (
              <g key={`${r}${c}`} transform={`translate(${COLS[c]} ${ROWS[r]}) scale(0.5)`}>
                <V t={t + r * 0.7 + c * 0.3} />
                <rect x={0} y={0} width={200} height={480} fill="#59e1ff" opacity={0.28 * w} style={{mixBlendMode: 'screen'}} />
              </g>
            );
          }),
        )}
      </svg>
    );
  }
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <defs>
        <linearGradient id="facg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#141b27" />
          <stop offset="0.75" stopColor="#1f2836" />
          <stop offset="1" stopColor="#3a3a44" />
        </linearGradient>
      </defs>
      <path d={body} fill="url(#facg)" fillRule="evenodd" />
      {/* faixas entre andares e caixilhos */}
      {ROWS.map((y, i) => (
        <rect key={i} x={290} y={y + 246} width={500} height={6} fill="#0b0f16" opacity={0.7} />
      ))}
      {ROWS.map((y) =>
        COLS.map((x) => <rect key={`${x}-${y}`} x={x} y={y} width={100} height={240} fill="none" stroke="#0a0d13" strokeWidth={4} />),
      )}
      {/* platibanda e topo */}
      <rect x={280} y={372} width={520} height={22} fill="#262f3d" />
      <rect x={600} y={330} width={70} height={42} fill="#1a212c" />
      <circle cx={634} cy={326} r={4} fill="#ff5a5a" opacity={0.5 + 0.5 * (Math.sin(t * 4) > 0 ? 1 : 0)} />
      {/* luz do nascer do sol na lateral direita */}
      <rect x={770} y={390} width={20} height={1130} fill="#ffb27a" opacity={0.35} />
    </svg>
  );
};

const MidBuildings: React.FC = () => {
  const t = useT();
  const wins = useMemo(() => {
    const r = seeded(12);
    const out: {x: number; y: number; on: boolean; c: string}[] = [];
    const bands = [
      {x0: -160, x1: 270, y0: 610},
      {x0: 810, x1: 1240, y0: 540},
    ];
    for (const b of bands)
      for (let y = b.y0 + 30; y < 1480; y += 74)
        for (let x = b.x0 + 24; x < b.x1 - 40; x += 58) out.push({x, y, on: r() > 0.45, c: r() > 0.3 ? '#ffc98a' : '#cfe6ff'});
    return out;
  }, []);
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <rect x={-160} y={610} width={430} height={1000} fill="#121a27" />
      <rect x={810} y={540} width={430} height={1100} fill="#151d2b" />
      <rect x={-160} y={610} width={430} height={4} fill="#ffb27a" opacity={0.3} />
      <rect x={810} y={540} width={430} height={4} fill="#ffb27a" opacity={0.3} />
      {wins.map((w, i) => {
        const wv = waveAt(t, w.x);
        return (
          <g key={i}>
            <rect x={w.x} y={w.y} width={36} height={50} fill={w.on ? w.c : '#0b111b'} opacity={w.on ? 0.75 : 1} />
            {wv > 0 ? <rect x={w.x} y={w.y} width={36} height={50} fill="#59e1ff" opacity={0.6 * wv} /> : null}
          </g>
        );
      })}
    </svg>
  );
};

const Skyline: React.FC = () => {
  const data = useMemo(() => {
    const r = seeded(5);
    const b: {x: number; w: number; h: number}[] = [];
    let x = -500;
    while (x < 1600) {
      const w = 60 + r() * 130;
      b.push({x, w, h: 260 + r() * 520});
      x += w + 6;
    }
    return b;
  }, []);
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      {data.map((d, i) => (
        <rect key={i} x={d.x} y={1500 - d.h} width={d.w} height={d.h + 300} fill={i % 2 ? '#213453' : '#1c2d49'} />
      ))}
    </svg>
  );
};

const Sky: React.FC = () => (
  <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
    <defs>
      <linearGradient id="csky" gradientUnits="userSpaceOnUse" x1="0" y1="-600" x2="0" y2="1600">
        <stop offset="0" stopColor="#0a1840" />
        <stop offset="0.3" stopColor="#1c3f78" />
        <stop offset="0.45" stopColor="#4f79ad" />
        <stop offset="0.55" stopColor="#c99486" />
        <stop offset="0.62" stopColor="#f5ad70" />
        <stop offset="1" stopColor="#f8c88a" />
      </linearGradient>
      <radialGradient id="sun" gradientUnits="userSpaceOnUse" cx="740" cy="820" r="620">
        <stop offset="0" stopColor="#ffe0a8" stopOpacity="0.9" />
        <stop offset="0.25" stopColor="#ffb070" stopOpacity="0.35" />
        <stop offset="1" stopColor="#ff9050" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect x={-800} y={-800} width={2680} height={3600} fill="url(#csky)" />
    <rect x={-800} y={-800} width={2680} height={3600} fill="url(#sun)" />
    {[
      [180, 420, 230, 34],
      [820, 330, 280, 30],
      [520, 560, 200, 24],
    ].map(([x, y, rx, ry], i) => (
      <g key={i} filter="blur(8px)">
        <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#7f8fb8" opacity={0.35} />
        <ellipse cx={x + 20} cy={y + 10} rx={rx * 0.8} ry={ry * 0.5} fill="#ffb98a" opacity={0.3} />
      </g>
    ))}
  </svg>
);

const Street: React.FC = () => {
  const t = useT();
  const busX = 1300 - ((t - 6.0) * 260) % 2400;
  const walkers = [
    {x0: 120, sp: 40, c: '#2b2f3a'},
    {x0: 400, sp: -35, c: '#5a3a2a'},
    {x0: 820, sp: 30, c: '#3a4a6a'},
    {x0: 980, sp: -42, c: '#2a3a2a'},
  ];
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <rect x={-400} y={1520} width={1880} height={50} fill="#3a3f4a" />
      <rect x={-400} y={1570} width={1880} height={200} fill="#14171d" />
      {Array.from({length: 14}, (_, i) => (
        <rect key={i} x={-400 + i * 150 - ((t * 120) % 150)} y={1666} width={70} height={6} fill="#e8e2c8" opacity={0.6} />
      ))}
      <rect x={-400} y={1770} width={1880} height={200} fill="#2e333d" />
      {/* ônibus */}
      <g transform={`translate(${busX} 1586)`}>
        <rect x={0} y={0} width={420} height={120} rx={16} fill="#1f6fd1" />
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <rect key={k} x={20 + k * 64} y={16} width={52} height={44} rx={6} fill="#ffe3b0" opacity={0.85} />
        ))}
        <circle cx={80} cy={120} r={22} fill="#0d0f13" />
        <circle cx={340} cy={120} r={22} fill="#0d0f13" />
      </g>
      {/* pedestres */}
      {walkers.map((w, i) => {
        const x = w.x0 + (t - 6) * w.sp;
        const ph = t * 9 + i;
        return (
          <g key={i} transform={`translate(${x} 1478)`}>
            <circle cx={0} cy={0} r={10} fill="#1a1414" />
            <rect x={-9} y={10} width={18} height={34} rx={6} fill={w.c} />
            <line x1={-3} y1={42} x2={-3 + Math.sin(ph) * 9} y2={66} stroke="#14161c" strokeWidth={7} strokeLinecap="round" />
            <line x1={3} y1={42} x2={3 - Math.sin(ph) * 9} y2={66} stroke="#14161c" strokeWidth={7} strokeLinecap="round" />
          </g>
        );
      })}
      {/* árvores e postes */}
      {[90, 990].map((x, i) => (
        <g key={i}>
          <rect x={x - 6} y={1380} width={12} height={160} fill="#2a1d14" />
          <circle cx={x} cy={1360} r={70} fill="#1f3a2a" />
          <circle cx={x - 30} cy={1390} r={50} fill="#25452f" />
        </g>
      ))}
      {[250, 830].map((x, i) => (
        <g key={i}>
          <rect x={x - 3} y={1330} width={6} height={200} fill="#1a1d24" />
          <circle cx={x} cy={1330} r={10} fill="#ffe0a0" />
          <circle cx={x} cy={1330} r={40} fill="#ffd090" opacity={0.18} />
        </g>
      ))}
    </svg>
  );
};

export const CityBack: React.FC = () => {
  const t = useT();
  if (t < T_CROP0) return null;
  const show = smooth(prog(t, T_CROP0, T_CROP0 + 0.15));
  return (
    <AbsoluteFill style={{opacity: show}}>
      <AbsoluteFill style={layerStyle(t, 20)}>
        <Sky />
      </AbsoluteFill>
      <AbsoluteFill style={layerStyle(t, 2.5)}>
        <Skyline />
      </AbsoluteFill>
      <AbsoluteFill style={layerStyle(t, 0.6)}>
        <MidBuildings />
      </AbsoluteFill>
      <AbsoluteFill style={layerStyle(t, 0)}>
        <HeroBuilding below />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const CityFront: React.FC = () => {
  const t = useT();
  if (t < T_CROP0) return null;
  const show = smooth(prog(t, T_CROP0, T_CROP0 + 0.2));
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{...layerStyle(t, 0), opacity: show}}>
        <HeroBuilding below={false} />
      </AbsoluteFill>
      <AbsoluteFill style={layerStyle(t, -0.06)}>
        <Street />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// frente de luz da onda ciano (prepara a próxima parte)
export const WaveFront: React.FC = () => {
  const t = useT();
  const u = prog(t, 7.72, 8.6);
  if (u <= 0) return null;
  const x = 1180 - u * 1500;
  return (
    <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'screen'}}>
      <div style={{position: 'absolute', top: 0, bottom: 0, left: x - 160, width: 320, background: 'linear-gradient(90deg, rgba(89,225,255,0) 0%, rgba(89,225,255,0.16) 50%, rgba(89,225,255,0) 100%)'}} />
      <div style={{position: 'absolute', top: 0, bottom: 0, left: x - 1, width: 2, background: 'rgba(191,244,255,0.45)'}} />
    </AbsoluteFill>
  );
};

// tipografia discreta
export const FutureTitle: React.FC = () => {
  const t = useT();
  const u = outExpo(prog(t, 6.95, 7.6));
  if (u <= 0) return null;
  const txt = 'O FUTURO DO TRABALHO';
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div style={{position: 'absolute', top: 236, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16}}>
        <div style={{width: 520 * u, height: 1.5, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)'}} />
        <div style={{fontFamily: 'Inter Tight', fontWeight: 600, fontSize: 40, letterSpacing: lerp(26, 12, u), color: '#f4f8ff', opacity: u, clipPath: `inset(0 ${50 * (1 - u)}% 0 ${50 * (1 - u)}%)`, textShadow: '0 2px 18px rgba(0,20,60,0.6)'}}>{txt}</div>
      </div>
    </AbsoluteFill>
  );
};
