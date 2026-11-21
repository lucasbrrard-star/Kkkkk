import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {DepthLayer} from '../components/Depth';
import {clamp, hash, outCubic, prog, seeded, smooth, spring} from '../lib/ease';
import {screenLight} from '../lib/light';
import {useT} from '../lib/time';

// ---------------------------------------------------------------- céu e cidade (fundo pela janela)
const Sky: React.FC = () => {
  const stars = useMemo(() => {
    const r = seeded(3);
    return Array.from({length: 70}, () => ({x: -300 + r() * 1700, y: -300 + r() * 900, rad: 0.6 + r() * 1.3, o: 0.15 + r() * 0.5}));
  }, []);
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <defs>
        <linearGradient id="skyg" gradientUnits="userSpaceOnUse" x1="0" y1="-500" x2="0" y2="2400">
          <stop offset="0" stopColor="#02040b" />
          <stop offset="0.26" stopColor="#061127" />
          <stop offset="0.4" stopColor="#0f2650" />
          <stop offset="0.47" stopColor="#1d3d6e" />
          <stop offset="0.51" stopColor="#3d5c88" />
          <stop offset="0.522" stopColor="#8a7c8c" />
          <stop offset="0.528" stopColor="#d99872" />
          <stop offset="0.536" stopColor="#1a1d2a" />
          <stop offset="1" stopColor="#04060b" />
        </linearGradient>
        <radialGradient id="dawn" gradientUnits="userSpaceOnUse" cx="780" cy="1010" r="900">
          <stop offset="0" stopColor="#ffab6b" stopOpacity="0.45" />
          <stop offset="0.3" stopColor="#c27a7a" stopOpacity="0.16" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x={-600} y={-500} width={2280} height={2900} fill="url(#skyg)" />
      <rect x={-600} y={-500} width={2280} height={2900} fill="url(#dawn)" />
      {stars.map((st, i) => (
        <circle key={i} cx={st.x} cy={st.y} r={st.rad} fill="#dfe9ff" opacity={st.o} />
      ))}
    </svg>
  );
};

const City: React.FC = () => {
  const data = useMemo(() => {
    const r = seeded(7);
    const b: {x: number; w: number; h: number; c: string}[] = [];
    let x = -420;
    while (x < 1500) {
      const w = 30 + r() * 90;
      const center = 1 - Math.min(1, Math.abs(x - 540) / 900);
      const h = 120 + r() * 240 + center * r() * 330;
      b.push({x, w, h, c: r() > 0.5 ? '#08111f' : '#0a1526'});
      x += w + r() * 8;
    }
    const win: {x: number; y: number; c: string; o: number}[] = [];
    for (const bb of b) {
      const cols = Math.floor(bb.w / 9);
      const rows = Math.floor(bb.h / 13);
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          if (r() > 0.3) continue;
          win.push({
            x: bb.x + 4 + i * 9,
            y: 1012 - bb.h + 6 + j * 13,
            c: r() > 0.45 ? '#ffd2a0' : '#bfe4ff',
            o: 0.25 + r() * 0.6,
          });
        }
    }
    const bokeh = Array.from({length: 46}, (_, i) => ({
      x: -300 + r() * 1700,
      y: 990 + r() * 80,
      rad: 7 + r() * 22,
      c: r() > 0.4 ? '#ffc58a' : '#9fd8ff',
      o: 0.18 + r() * 0.4,
      ph: r() * 6.28,
    }));
    const red = b.filter((_, i) => i % 7 === 3).map((bb) => ({x: bb.x + bb.w / 2, y: 1012 - bb.h - 4}));
    return {b, win, bokeh, red};
  }, []);
  const t = useT();
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <defs>
        <filter id="cityblur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <filter id="bokehblur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <radialGradient id="bk">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.7" stopColor="#fff" stopOpacity="0.7" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g filter="url(#cityblur)">
        {data.b.map((bb, i) => (
          <rect key={i} x={bb.x} y={1012 - bb.h} width={bb.w} height={bb.h + 400} fill={bb.c} />
        ))}
        {data.win.map((w, i) => (
          <rect key={i} x={w.x} y={w.y} width={4} height={6} fill={w.c} opacity={w.o * 0.8} />
        ))}
        {data.red.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.4} fill="#ff4d4d" opacity={0.35 + 0.45 * (Math.sin(t * 3 + i) > 0.6 ? 1 : 0)} />
        ))}
      </g>
      <g filter="url(#bokehblur)" style={{mixBlendMode: 'screen'}}>
        {data.bokeh.map((k, i) => (
          <circle key={i} cx={k.x} cy={k.y} r={k.rad} fill={k.c} opacity={k.o * (0.85 + 0.15 * Math.sin(t * 1.5 + k.ph))} />
        ))}
      </g>
    </svg>
  );
};

// ---------------------------------------------------------------- caixilho da janela panorâmica
const WindowFrame: React.FC = () => {
  const t = useT();
  const L = screenLight(t);
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <defs>
        <linearGradient id="glare" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.35" stopColor="#9fe9ff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#9fe9ff" stopOpacity={0.05 + 0.03 * L} />
          <stop offset="0.65" stopColor="#9fe9ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x={-500} y={-400} width={2080} height={2700} fill="url(#glare)" />
      {/* montantes */}
      <rect x={96} y={-400} width={30} height={2700} fill="#05070b" />
      <rect x={124} y={-400} width={2} height={2700} fill="#2a3a52" opacity={0.6} />
      <rect x={960} y={-400} width={30} height={2700} fill="#05070b" />
      <rect x={960} y={-400} width={2} height={2700} fill="#3a5878" opacity={0.5 + 0.2 * L} />
      {/* teto escuro */}
      <rect x={-500} y={-400} width={2080} height={470} fill="#020306" />
      <rect x={-500} y={66} width={2080} height={4} fill="#121a28" />
    </svg>
  );
};

// ---------------------------------------------------------------- monitor (moldura + base)
export const SCREEN = {x: 130, y: 529, w: 820, h: 462};
const MonitorBody: React.FC = () => {
  const t = useT();
  const L = screenLight(t);
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <defs>
        <radialGradient id="mglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#56d9ff" stopOpacity={0.4} />
          <stop offset="0.45" stopColor="#2a7fd0" stopOpacity={0.12} />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="neck" x1="0" x2="1">
          <stop offset="0" stopColor="#07090d" />
          <stop offset="0.5" stopColor="#1a2230" />
          <stop offset="1" stopColor="#07090d" />
        </linearGradient>
      </defs>
      <ellipse cx={540} cy={760} rx={760} ry={560} fill="url(#mglow)" opacity={0.55 * L} style={{mixBlendMode: 'screen'}} />
      <rect x={512} y={990} width={56} height={60} fill="url(#neck)" />
      <ellipse cx={540} cy={1052} rx={130} ry={13} fill="#0b0f16" />
      <ellipse cx={540} cy={1049} rx={124} ry={8} fill="none" stroke="#3c6d8f" strokeOpacity={0.25 * L} />
      <rect x={120} y={519} width={840} height={482} rx={12} fill="#07090e" />
      <rect x={120.5} y={519.5} width={839} height={481} rx={12} fill="none" stroke="#2b3a52" strokeWidth={1.2} />
      <rect x={124} y={520} width={832} height={1.5} fill="#7fa8c8" opacity={0.35} />
    </svg>
  );
};

// ---------------------------------------------------------------- mesa, teclado, caneca
const Desk: React.FC = () => {
  const t = useT();
  const L = screenLight(t);
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <defs>
        <linearGradient id="deskg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#111722" />
          <stop offset="0.25" stopColor="#0a0e15" />
          <stop offset="1" stopColor="#040507" />
        </linearGradient>
        <radialGradient id="pool" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#7fe6ff" stopOpacity={0.34} />
          <stop offset="0.5" stopColor="#3a9be0" stopOpacity={0.1} />
          <stop offset="1" stopColor="#000" stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect x={-400} y={1045} width={1880} height={1300} fill="url(#deskg)" />
      <ellipse cx={540} cy={1100} rx={470} ry={80} fill="url(#pool)" opacity={L} style={{mixBlendMode: 'screen'}} />
      <rect x={-400} y={1044} width={1880} height={1.6} fill="#8fd6ff" opacity={0.18 + 0.12 * L} />
    </svg>
  );
};

const Keyboard: React.FC = () => {
  const t = useT();
  const L = screenLight(t);
  const keys = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 15; c++) {
      keys.push(<rect key={`${r}-${c}`} x={372 + c * 28 + r * 3} y={1132 + r * 15} width={23} height={11} rx={2} fill="#0d121b" stroke="#6fcff5" strokeOpacity={0.1 + 0.08 * L} strokeWidth={0.8} />);
    }
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <rect x={360} y={1124} width={448} height={76} rx={8} fill="#080b11" />
      <rect x={361} y={1124} width={446} height={1.5} fill="#8fe0ff" opacity={0.25 + 0.15 * L} />
      {keys}
      <ellipse cx={890} cy={1166} rx={24} ry={36} fill="#080b11" />
      <path d="M868 1150 Q890 1126 912 1150" fill="none" stroke="#8fe0ff" strokeOpacity={0.25 * L} strokeWidth={1.5} />
    </svg>
  );
};

const Mug: React.FC = () => {
  const t = useT();
  const L = screenLight(t);
  const steam = [0, 1, 2].map((i) => {
    const ph = i * 2.1;
    const x0 = 908 + i * 10 - 10;
    const pts = Array.from({length: 7}, (_, j) => {
      const y = 1012 - j * 34;
      const x = x0 + Math.sin(t * 1.4 + j * 0.9 + ph) * (6 + j * 3.2) + j * 2;
      return `${x},${y}`;
    });
    return <polyline key={i} points={pts.join(' ')} fill="none" stroke="#dbeeff" strokeWidth={9 + i * 3} strokeLinecap="round" opacity={0.06 + 0.03 * Math.sin(t * 2 + ph)} />;
  });
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <defs>
        <filter id="steamblur" x="-100%" y="-50%" width="300%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <linearGradient id="mugg" x1="0" x2="1">
          <stop offset="0" stopColor="#3a5670" />
          <stop offset="0.12" stopColor="#111823" />
          <stop offset="1" stopColor="#07090d" />
        </linearGradient>
      </defs>
      <g filter="url(#steamblur)">{steam}</g>
      <path d="M948 1040 q34 4 30 34 q-4 28 -32 26" fill="none" stroke="#0c1119" strokeWidth={9} />
      <path d="M868 1022 L868 1098 Q868 1112 884 1112 L934 1112 Q950 1112 950 1098 L950 1022 Z" fill="url(#mugg)" />
      <ellipse cx={909} cy={1022} rx={41} ry={7} fill="#0c1118" stroke="#6fbfe6" strokeOpacity={0.25 * L} />
      <ellipse cx={909} cy={1023} rx={35} ry={4.5} fill="#1a0f0a" />
    </svg>
  );
};

// ---------------------------------------------------------------- personagem (silhueta de costas)
// cabeça vista de trás (centro x=0, topo y=0): crânio, orelhas, nuca, pescoço, trapézio e ombros
const HEAD_PATH =
  'M0 0 C80 -2 134 52 136 136 C137 176 132 204 125 222 C141 223 151 244 147 270 C143 292 133 300 121 301 C117 326 103 343 86 353 C84 380 86 400 94 418 C142 440 236 462 340 494 C430 522 494 566 530 646 C552 698 566 770 574 900 L-574 900 C-566 770 -552 698 -530 646 C-494 566 -430 522 -340 494 C-236 462 -142 440 -94 418 C-86 400 -84 380 -86 353 C-103 343 -117 326 -121 301 C-133 300 -143 292 -147 270 C-151 244 -141 223 -125 222 C-132 204 -137 176 -136 136 C-134 52 -80 -2 0 0 Z';
const HAIR_PATH =
  'M0 -4 C84 -6 140 50 141 138 C141 168 137 190 131 206 C118 212 100 214 86 214 C40 210 -40 210 -86 214 C-100 214 -118 212 -131 206 C-137 190 -141 168 -141 138 C-140 50 -84 -6 0 -4 Z';

const Character: React.FC = () => {
  const t = useT();
  const L = screenLight(t);
  // reação: leve recuo/inclinação quando "descobre"
  const react = spring(prog(t, 1.8, 2.8), 5, 8);
  const tilt = -3 * react + 0.7 * Math.sin(t * 0.8);
  const lean = -12 * react;
  const breathe = Math.sin(t * 1.6) * 2.5;
  const rim = 0.5 + 0.5 * clamp(L / 1.6);
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <defs>
        <radialGradient id="silg" gradientUnits="userSpaceOnUse" cx="60" cy="60" r="700">
          <stop offset="0" stopColor="#0c131f" />
          <stop offset="0.35" stopColor="#05080e" />
          <stop offset="1" stopColor="#010204" />
        </radialGradient>
        <filter id="hair" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.12" numOctaves="2" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="6" />
        </filter>
        <filter id="rimblur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <filter id="wrap" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <linearGradient id="rimmask" gradientUnits="userSpaceOnUse" x1="0" y1="-10" x2="0" y2="700">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.38" stopColor="#fff" stopOpacity="0.8" />
          <stop offset="0.62" stopColor="#fff" stopOpacity="0.72" />
          <stop offset="0.8" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="rimm" maskUnits="userSpaceOnUse" x="-800" y="-200" width="1600" height="1300">
          <rect x={-800} y={-200} width={1600} height={1300} fill="url(#rimmask)" />
        </mask>
        <clipPath id="silclip">
          <path d={HEAD_PATH} />
        </clipPath>
      </defs>
      <g transform={`translate(215 ${955 + breathe})`}>
        <g transform={`rotate(${tilt} 0 420) translate(0 ${lean * 0.3})`}>
          {/* halo de luz vazando sobre o topo da cabeça */}
          <g mask="url(#rimm)">
            <path d={HEAD_PATH} fill="#5fd8ff" opacity={0.2 * rim} filter="url(#wrap)" />
          </g>
          <g filter="url(#hair)">
            <path d={HEAD_PATH} fill="url(#silg)" />
            <path d={HAIR_PATH} fill="#020306" />
          </g>
          <g clipPath="url(#silclip)" mask="url(#rimm)">
            <path d={HEAD_PATH} fill="none" stroke="#c9f3ff" strokeWidth={8} opacity={0.7 * rim} filter="url(#rimblur)" />
            <path d={HEAD_PATH} fill="none" stroke="#ffffff" strokeWidth={2.2} opacity={0.55 * rim} />
            <path d={HAIR_PATH} fill="none" stroke="#e3f8ff" strokeWidth={2} opacity={0.35 * rim} filter="url(#rimblur)" />
          </g>
        </g>
      </g>
    </svg>
  );
};

// ---------------------------------------------------------------- primeiro plano desfocado
const Foreground: React.FC = () => {
  const t = useT();
  const L = screenLight(t);
  const sway = Math.sin(t * 0.7) * 3;
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <defs>
        <filter id="fgblur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>
      <g filter="url(#fgblur)" transform={`rotate(${sway} 1100 -60)`}>
        <ellipse cx={1010} cy={120} rx={70} ry={210} transform="rotate(-35 1010 120)" fill="#030507" />
        <ellipse cx={1120} cy={300} rx={60} ry={190} transform="rotate(-60 1120 300)" fill="#030507" />
        <ellipse cx={930} cy={-40} rx={55} ry={170} transform="rotate(-15 930 -40)" fill="#04070a" />
        <ellipse cx={985} cy={150} rx={18} ry={180} transform="rotate(-35 1010 120)" fill="#4fbfe6" opacity={0.12 * L} />
      </g>
    </svg>
  );
};

// ---------------------------------------------------------------- partículas de poeira na luz do monitor
const Dust: React.FC<{zMin: number; zMax: number; seed: number; count: number}> = ({zMin, zMax, seed, count}) => {
  const t = useT();
  const L = screenLight(t);
  const parts = useMemo(() => {
    const r = seeded(seed);
    return Array.from({length: count}, () => ({
      x: r() * 1200 - 60,
      y: 380 + r() * 900,
      rad: 1 + r() * 2.2,
      ph: r() * 6.28,
      sp: 0.2 + r() * 0.5,
      z: zMin + r() * (zMax - zMin),
    }));
  }, [seed, count, zMin, zMax]);
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      {parts.map((p, i) => {
        const x = p.x + Math.sin(t * p.sp + p.ph) * 14;
        const y = p.y - t * 9 * p.sp + Math.cos(t * p.sp * 1.3 + p.ph) * 8;
        const dx = (x - 540) / 520;
        const dy = (y - 760) / 520;
        const lit = Math.exp(-(dx * dx + dy * dy) * 1.4);
        const tw = 0.6 + 0.4 * Math.sin(t * 2.3 + p.ph * 3);
        return <circle key={i} cx={x} cy={y} r={p.rad} fill="#cdf4ff" opacity={clamp(lit * tw * 0.75 * L)} />;
      })}
    </svg>
  );
};

// ---------------------------------------------------------------- montagem das camadas do quarto
export const RoomBack: React.FC = () => (
  <>
    <DepthLayer z={70}>
      <Sky />
    </DepthLayer>
    <DepthLayer z={42}>
      <City />
    </DepthLayer>
    <DepthLayer z={14}>
      <WindowFrame />
    </DepthLayer>
    <DepthLayer z={10}>
      <MonitorBody />
    </DepthLayer>
  </>
);

export const RoomFront: React.FC = () => {
  const t = useT();
  return (
    <>
      <DepthLayer z={9.4}>
        <Desk />
      </DepthLayer>
      <DepthLayer z={9.1}>
        <Keyboard />
      </DepthLayer>
      <DepthLayer z={8.7}>
        <Mug />
      </DepthLayer>
      <DepthLayer z={8.0}>
        <Dust zMin={0} zMax={0} seed={11} count={60} />
      </DepthLayer>
      <DepthLayer z={6} fadeNear={0.4}>
        <Character />
      </DepthLayer>
      <DepthLayer z={4.6} style={{filter: 'blur(3px)'}}>
        <Dust zMin={0} zMax={0} seed={5} count={14} />
      </DepthLayer>
      <DepthLayer z={3.2} fadeNear={0.5}>
        <Foreground />
      </DepthLayer>
    </>
  );
};

export const roomVisible = (t: number) => t < 4.4;
export {screenLight};
export const _unused = {hash, outCubic, smooth};
