import React from 'react';
import {AbsoluteFill} from 'remotion';
import {clamp, inOutCubic, lerp, outCubic, outExpo, prog, smooth, spring} from '../../lib/ease';
import {useT} from '../../lib/time';
import {cityCam, COLS, layerScale, ROWS, VIGS} from '../City';

// ============================================================ CENA E — "transformando profissões"
// As janelas do prédio se soltam e viram painéis; cada profissão ganha ferramentas de IA.
export const E0 = 8.42;
export const E_FLY1 = 9.15;
export const T_TRANS = [9.45, 9.62, 9.79, 9.96, 10.13, 10.3];
export const E_END = 10.9;

const TILES = [
  {v: 'medica', r: 0, c: 0, label: 'MEDICINA'},
  {v: 'professor', r: 0, c: 1, label: 'EDUCAÇÃO'},
  {v: 'designer', r: 0, c: 2, label: 'DESIGN'},
  {v: 'atendente', r: 1, c: 0, label: 'ATENDIMENTO'},
  {v: 'arquiteta', r: 1, c: 3, label: 'ARQUITETURA'},
  {v: 'mecanico', r: 2, c: 0, label: 'MECÂNICA'},
];
const tileRect = (i: number) => ({x: 60 + (i % 3) * 330, y: 250 + Math.floor(i / 3) * 560, w: 300, h: 520});
const cellRect = (i: number, t: number) => {
  const {D, A, P} = cityCam(t);
  const S = layerScale(D, 0);
  const T = TILES[i];
  return {x: A.x + (COLS[T.c] - P.x) * S, y: A.y + (ROWS[T.r] - P.y) * S, w: 100 * S, h: 240 * S};
};

// ferramentas de IA desenhadas sobre cada vinheta (coordenadas 200×480)
const AUG: Record<string, React.FC<{t: number}>> = {
  medica: ({t}) => (
    <g stroke="#7ff0ff" fill="none" strokeWidth={2.5}>
      <circle cx={158} cy={210} r={12} />
      <rect x={144} y={226} width={28} height={74} rx={12} />
      <line x1={140} x2={176} y1={210 + ((t * 70) % 90)} y2={210 + ((t * 70) % 90)} strokeWidth={2} opacity={0.8} />
      <ellipse cx={158} cy={308} rx={26} ry={6} opacity={0.6} />
    </g>
  ),
  professor: ({t}) => (
    <g>
      <rect x={20} y={120} width={130} height={150} fill="#0a1a2e" />
      {[0.4, 0.65, 0.5, 0.85].map((h, k) => (
        <rect key={k} x={36 + k * 26} y={250 - 100 * h * clamp((t % 3) * 2 - k * 0.2)} width={16} height={100 * h * clamp((t % 3) * 2 - k * 0.2)} fill="#59e1ff" opacity={0.85} />
      ))}
      <polyline points="34,200 64,180 92,188 124,150" fill="none" stroke="#ffd08a" strokeWidth={3} />
    </g>
  ),
  designer: ({t}) => (
    <g>
      {[0, 1, 2, 3, 4, 5].map((k) => {
        const on = clamp((t * 3 - k * 0.4) % 4);
        return <rect key={k} x={28 + (k % 3) * 50} y={138 + Math.floor(k / 3) * 46} width={42} height={38} rx={5} fill={['#ff7a59', '#7ff0ff', '#b4a6ff', '#ffd08a', '#8ff5c2', '#ff9fb8'][k]} opacity={on > 0 ? 0.9 : 0.15} />;
      })}
    </g>
  ),
  atendente: ({t}) => (
    <g>
      <circle cx={160} cy={126} r={18} fill="#59e1ff" opacity={0.25} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
        <circle key={k} cx={160 + Math.cos(t * 2 + k * 0.8) * 12} cy={126 + Math.sin(t * 2 + k * 0.8) * 12} r={2.5} fill="#bff4ff" />
      ))}
      <rect x={22} y={240} width={100} height={30} rx={13} fill="#59e1ff" opacity={0.9} />
      <text x={34} y={261} fontFamily="JetBrains Mono" fontSize={15} fill="#03121c">✦ sugestão</text>
    </g>
  ),
  arquiteta: ({t}) => (
    <g transform={`translate(112 250)`} stroke="#7ff0ff" fill="none" strokeWidth={2.2}>
      {[0, 1, 2, 3].map((k) => {
        const w = 44 - k * 6;
        const sk = Math.sin(t * 1.5) * 10;
        return <rect key={k} x={-w / 2 + sk * (k / 4)} y={-k * 24} width={w} height={22} />;
      })}
      <ellipse cx={0} cy={26} rx={46} ry={9} opacity={0.6} />
    </g>
  ),
  mecanico: ({t}) => (
    <g>
      <rect x={14} y={262} width={46} height={62} rx={6} fill="#0b1626" stroke="#7ff0ff" strokeWidth={2} />
      <path d="M22 300 q8 -16 22 -16 q8 0 10 16 z" fill="none" stroke="#7ff0ff" strokeWidth={2} />
      <line x1={20} x2={54} y1={270 + ((t * 60) % 48)} y2={270 + ((t * 60) % 48)} stroke="#bff4ff" strokeWidth={2} />
      <rect x={90} y={300} width={100} height={70} fill="#59e1ff" opacity={0.12} />
    </g>
  ),
};

const Tile: React.FC<{i: number; t: number; f: number}> = ({i, t, f}) => {
  const T = TILES[i];
  const V = VIGS[T.v];
  const A = AUG[T.v];
  const tt = T_TRANS[i];
  const scan = prog(t, tt, tt + 0.38);
  const vbY = lerp(0, 87, f);
  const vbH = lerp(480, 346.7, f);
  const done = t > tt + 0.38;
  const tint = 1 - smooth(prog(t, E0, E0 + 0.45));
  return (
    <svg width="100%" height="100%" viewBox={`0 ${vbY} 200 ${vbH}`} preserveAspectRatio="xMidYMid slice" style={{display: 'block'}}>
      <defs>
        <linearGradient id="vigg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffcf8a" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#ff9a3c" stopOpacity="0.08" />
          <stop offset="1" stopColor="#000" stopOpacity="0.2" />
        </linearGradient>
        <clipPath id={`augclip${i}`}>
          <rect x={0} y={0} width={200} height={480 * scan} />
        </clipPath>
      </defs>
      <V t={t + i * 0.5} />
      <rect x={0} y={0} width={200} height={480} fill="#59e1ff" opacity={0.28 * tint} style={{mixBlendMode: 'screen'}} />
      {scan > 0 ? (
        <g clipPath={done ? undefined : `url(#augclip${i})`}>
          <rect x={0} y={0} width={200} height={480} fill="#2f9bff" opacity={0.08} />
          <A t={t} />
        </g>
      ) : null}
      {scan > 0 && scan < 1 ? <rect x={0} y={480 * scan - 2} width={200} height={4} fill="#dff8ff" opacity={0.9} /> : null}
    </svg>
  );
};

export const ProfessionTiles: React.FC<{flatten?: number}> = ({flatten = 0}) => {
  const t = useT();
  if (t < E0 || t > 11.6) return null;
  const bg = smooth(prog(t, E0 + 0.1, E0 + 0.6));
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{opacity: bg * (1 - flatten), background: 'radial-gradient(ellipse 90% 70% at 50% 45%, #0c1d3a 0%, #060d1c 60%, #03060d 100%)'}} />
      <AbsoluteFill style={{opacity: bg * 0.5 * (1 - flatten), backgroundImage: 'radial-gradient(rgba(120,200,255,0.18) 1.2px, transparent 1.6px)', backgroundSize: '40px 40px'}} />
      {TILES.map((T, i) => {
        const c0 = cellRect(i, E0);
        const r1 = tileRect(i);
        const f = outExpo(prog(t, E0 + 0.05 + i * 0.05, E_FLY1 + i * 0.05));
        const lift = spring(prog(t, E0 + i * 0.05, E0 + 0.6 + i * 0.05), 6, 9);
        const x = lerp(c0.x, r1.x, f);
        const y = lerp(c0.y, r1.y, f) - 20 * lift * (1 - f);
        const w = lerp(c0.w, r1.w, f);
        const h = lerp(c0.h, r1.h, f);
        const tt = T_TRANS[i];
        const ring = clamp(prog(t, tt, tt + 0.38));
        const done = t > tt + 0.3;
        const badge = spring(prog(t, tt + 0.3, tt + 0.8), 8, 12);
        const lab = outCubic(prog(t, E_FLY1 - 0.1 + i * 0.05, E_FLY1 + 0.3 + i * 0.05));
        return (
          <div key={i} style={{position: 'absolute', left: x, top: y, width: w, height: h + 50}}>
            <div
              style={{
                width: w,
                height: h,
                borderRadius: 18 * f + 2,
                overflow: 'hidden',
                boxShadow: `0 ${24 * f}px ${60 * f}px rgba(0,0,0,0.55), 0 0 ${40 * ring}px rgba(89,225,255,${0.45 * ring})`,
                border: `2px solid ${done ? 'rgba(127,240,255,0.75)' : `rgba(255,190,110,${0.5 * f})`}`,
                position: 'relative',
              }}
            >
              <Tile i={i} t={t} f={f} />
              {badge > 0.01 ? (
                <div style={{position: 'absolute', right: 14, top: 14, padding: '6px 12px', borderRadius: 20, background: 'linear-gradient(90deg,#ffbe5c,#59e1ff)', fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 18, color: '#04101c', transform: `scale(${badge})`, transformOrigin: 'right top'}}>+ IA</div>
              ) : null}
            </div>
            <div style={{marginTop: 14, textAlign: 'center', fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 20, letterSpacing: 4, color: done ? '#bff4ff' : '#ffd9a8', opacity: lab * (1 - flatten)}}>{T.label}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ============================================================ CENA F — "mudando a maneira como empresas trabalham"
export const F0 = 10.82;
export const F_NET = 11.4;
export const F_END = 13.95;

const DESKS = (() => {
  const out: {x: number; y: number; c: string; lead?: boolean}[] = [];
  const clusters = [
    {x: 230, y: 640, lead: {x: 230, y: 470}},
    {x: 770, y: 640, lead: {x: 770, y: 470}},
    {x: 500, y: 840, lead: {x: 500, y: 690}},
  ];
  const cols = ['#ffbe5c', '#7a9cc6', '#c47a5a', '#8fb8a0'];
  clusters.forEach((cl, k) => {
    out.push({x: cl.lead.x, y: cl.lead.y, c: '#ffbe5c', lead: true});
    for (let i = 0; i < 3; i++) out.push({x: cl.x - 130 + i * 130, y: cl.y, c: cols[(i + k) % 4]});
  });
  return out;
})();
const BOSS = {x: 500, y: 200};
const AI_NODES = [
  {x: 360, y: 560},
  {x: 640, y: 560},
  {x: 500, y: 380},
];

const Desk: React.FC<{x: number; y: number; c: string; t: number; i: number; net: number}> = ({x, y, c, t, i, net}) => {
  const look = net * Math.sin(t * 1.2 + i) * 18;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-58} y={-34} width={116} height={52} rx={8} fill="#22324a" stroke="#3a5272" strokeWidth={2} />
      <ellipse cx={0} cy={-20} rx={50} ry={22} fill={net > 0.5 ? '#59e1ff' : '#ffd9a8'} opacity={0.12} />
      <rect x={-26} y={-30} width={52} height={7} rx={2} fill={net > 0.5 ? '#bff4ff' : '#dfe8f4'} opacity={0.9} />
      <g transform={`rotate(${look})`}>
        <ellipse cx={0} cy={36} rx={30} ry={16} fill={c} opacity={0.85} />
        <circle cx={0} cy={30} r={14} fill="#1a120e" />
      </g>
    </g>
  );
};

const OfficePlane: React.FC<{t: number}> = ({t}) => {
  const tree = clamp(prog(t, F0 + 0.2, F0 + 0.55)) * (1 - clamp(prog(t, F_NET, F_NET + 0.35)));
  const net = outCubic(prog(t, F_NET + 0.1, F_NET + 0.9));
  const treeLines: string[] = [];
  const leads = DESKS.filter((d) => d.lead);
  leads.forEach((l) => treeLines.push(`M${BOSS.x} ${BOSS.y + 30} V${(BOSS.y + l.y) / 2} H${l.x} V${l.y - 34}`));
  DESKS.filter((d) => !d.lead).forEach((d) => {
    const l = leads.reduce((a, b) => (Math.hypot(a.x - d.x, a.y - d.y) < Math.hypot(b.x - d.x, b.y - d.y) ? a : b));
    treeLines.push(`M${l.x} ${l.y + 40} V${(l.y + d.y) / 2 + 10} H${d.x} V${d.y - 34}`);
  });
  const edges: [number, number, number, number][] = [];
  [...DESKS, BOSS].forEach((d) => {
    const n = AI_NODES.reduce((a, b) => (Math.hypot(a.x - d.x, a.y - d.y) < Math.hypot(b.x - d.x, b.y - d.y) ? a : b));
    edges.push([d.x, d.y, n.x, n.y]);
  });
  edges.push([AI_NODES[0].x, AI_NODES[0].y, AI_NODES[1].x, AI_NODES[1].y], [AI_NODES[0].x, AI_NODES[0].y, AI_NODES[2].x, AI_NODES[2].y], [AI_NODES[1].x, AI_NODES[1].y, AI_NODES[2].x, AI_NODES[2].y]);
  edges.push([DESKS[1].x, DESKS[1].y, DESKS[5].x, DESKS[5].y], [DESKS[7].x, DESKS[7].y, DESKS[11].x, DESKS[11].y], [DESKS[3].x, DESKS[3].y, DESKS[9].x, DESKS[9].y]);
  return (
    <svg width={1000} height={1000} style={{position: 'absolute', left: 0, top: 0}}>
      <rect x={0} y={0} width={1000} height={1000} rx={30} fill="#0c182e" />
      <ellipse cx={500} cy={560} rx={460} ry={420} fill="#2f7bff" opacity={0.08} />
      {Array.from({length: 11}, (_, k) => (
        <g key={k}>
          <line x1={k * 100} y1={0} x2={k * 100} y2={1000} stroke="#16243c" strokeWidth={2} />
          <line x1={0} y1={k * 100} x2={1000} y2={k * 100} stroke="#16243c" strokeWidth={2} />
        </g>
      ))}
      <rect x={0} y={0} width={1000} height={1000} rx={30} fill="none" stroke="#2a4a72" strokeWidth={4} />
      {/* organograma (hierarquia) */}
      {treeLines.map((d, k) => (
        <path key={k} d={d} fill="none" stroke="#ffd9a8" strokeWidth={4} strokeDasharray={900} strokeDashoffset={900 * (1 - tree)} opacity={0.85} />
      ))}
      {/* rede com IA */}
      {edges.map(([x1, y1, x2, y2], k) => {
        const len = Math.hypot(x2 - x1, y2 - y1);
        const mx = (x1 + x2) / 2 + (y2 - y1) * 0.12;
        const my = (y1 + y2) / 2 - (x2 - x1) * 0.12;
        const u = ((t * 0.9 + k * 0.37) % 1 + 1) % 1;
        const px = (1 - u) * (1 - u) * x1 + 2 * (1 - u) * u * mx + u * u * x2;
        const py = (1 - u) * (1 - u) * y1 + 2 * (1 - u) * u * my + u * u * y2;
        const e = clamp(net * 1.4 - (k % 7) * 0.05);
        return (
          <g key={k} opacity={e}>
            <path d={`M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`} fill="none" stroke="#59e1ff" strokeWidth={3} strokeDasharray={len * 1.2} strokeDashoffset={len * 1.2 * (1 - e)} opacity={0.65} />
            {e > 0.9 ? <circle cx={px} cy={py} r={7} fill="#dff8ff" /> : null}
          </g>
        );
      })}
      <Desk x={BOSS.x} y={BOSS.y} c="#ffbe5c" t={t} i={99} net={net} />
      {DESKS.map((d, i) => (
        <Desk key={i} x={d.x} y={d.y} c={d.c} t={t} i={i} net={net} />
      ))}
      {AI_NODES.map((n, k) => (
        <g key={k} transform={`translate(${n.x} ${n.y}) scale(${outExpo(prog(t, F_NET + k * 0.08, F_NET + 0.5 + k * 0.08))})`}>
          <circle r={54} fill="#59e1ff" opacity={0.18} />
          <rect x={-24} y={-24} width={48} height={48} rx={8} fill="#0b1830" stroke="#7ff0ff" strokeWidth={4} transform={`rotate(${45 + t * 30})`} />
          <circle r={9} fill="#dff8ff" />
        </g>
      ))}
    </svg>
  );
};

export const IsoOffice: React.FC = () => {
  const t = useT();
  if (t < F0 || t > F_END + 0.1) return null;
  const inn = inOutCubic(prog(t, F0, F0 + 0.55));
  const out = inOutCubic(prog(t, 13.45, F_END));
  const rx = lerp(0, 56, inn) + 18 * out;
  const rz = lerp(0, -40, inn) + 9 * smooth(prog(t, F0 + 0.55, 13.6));
  const sc = lerp(1.9, 1.45, inn) + 0.12 * smooth(prog(t, F0 + 0.55, 13.6));
  const toggle = smooth(prog(t, F_NET, F_NET + 0.3));
  const pillIn = outCubic(prog(t, F0 + 0.3, F0 + 0.6)) * (1 - out);
  return (
    <AbsoluteFill style={{opacity: smooth(prog(t, F0 + 0.15, F0 + 0.5)) * (1 - out)}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 90% 70% at 50% 50%, #0c1d3a 0%, #050b18 70%)'}} />
      <AbsoluteFill style={{perspective: 2200}}>
        <div
          style={{
            position: 'absolute',
            left: 40,
            top: 380 + 140 * out,
            width: 1000,
            height: 1000,
            transform: `rotateX(${rx}deg) rotateZ(${rz}deg) scale(${sc})`,
            transformStyle: 'preserve-3d',
          }}
        >
          <OfficePlane t={t} />
          {AI_NODES.map((n, k) => (
            <div
              key={k}
              style={{
                position: 'absolute',
                left: n.x - 4,
                top: n.y - 320,
                width: 8,
                height: 320,
                transformOrigin: '50% 100%',
                transform: `rotateZ(${-rz}deg) rotateX(-90deg)`,
                background: 'linear-gradient(0deg, rgba(127,240,255,0.7), rgba(127,240,255,0))',
                opacity: outCubic(prog(t, F_NET + 0.2 + k * 0.08, F_NET + 0.7)) * (1 - out),
              }}
            />
          ))}
        </div>
      </AbsoluteFill>
      {/* rótulo discreto: hierarquia -> rede + IA */}
      <div style={{position: 'absolute', top: 300, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: pillIn}}>
        <div style={{position: 'relative', height: 52, padding: '0 26px', borderRadius: 30, border: `1.5px solid ${toggle > 0.5 ? 'rgba(127,240,255,0.7)' : 'rgba(255,217,168,0.7)'}`, background: 'rgba(6,14,28,0.7)', display: 'flex', alignItems: 'center', fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 24, letterSpacing: 4}}>
          <span style={{color: '#ffd9a8', opacity: 1 - toggle, position: toggle > 0.5 ? 'absolute' : 'relative'}}>HIERARQUIA</span>
          <span style={{color: '#7ff0ff', opacity: toggle, position: toggle > 0.5 ? 'relative' : 'absolute'}}>REDE + IA</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const professionsTilesFlatten = (t: number) => inOutCubic(prog(t, F0, F0 + 0.55));
