import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {clamp, inOutCubic, lerp, outCubic, outExpo, prog, seeded, smooth, spring} from '../lib/ease';
import {useT} from '../lib/time';
import {notifRect} from './notif';
import {AppIcon, NotificationCard} from './Phone';

// ------------------------------------------------------------ tempos-chave
export const T_TAP = 2.32;
export const T_MORPH0 = 2.36;
export const T_MORPH1 = 2.8;
export const TN = [2.66, 2.96, 3.26, 3.56, 3.86]; // agente chega em cada tarefa
export const RUN = 0.34; // duração da execução
export const T_FOLD0 = 3.98;
export const T_FOLD1 = 4.4;

export type Kind = 'email' | 'relatorio' | 'planilha' | 'agenda' | 'contrato';
export const TASKS: {kind: Kind; title: string; color: [string, string]}[] = [
  {kind: 'email', title: 'Responder e-mails', color: ['#7ff0ff', '#2f7bff']},
  {kind: 'relatorio', title: 'Escrever relatório', color: ['#b4a6ff', '#5a46e0']},
  {kind: 'planilha', title: 'Atualizar planilha', color: ['#8ff5c2', '#1f9e6e']},
  {kind: 'agenda', title: 'Organizar agenda', color: ['#ffd08a', '#e08a2f']},
  {kind: 'contrato', title: 'Revisar contrato', color: ['#ff9fb8', '#d0466e']},
];

// layout do fluxo (coordenadas de conteúdo)
const CARD_W = 840;
const CARD_H = 280;
const CARD_X = 170;
const cardY = (i: number) => 600 + i * 330;
const NODE_X = 108;

// posição do agente (y de conteúdo) e rolagem da câmera
export const dotY = (t: number) => {
  const pts = [470, ...TN.map((_, i) => cardY(i) + CARD_H / 2)];
  const times = [2.5, ...TN];
  if (t <= times[0]) return pts[0];
  for (let i = 0; i < times.length - 1; i++) {
    if (t < times[i + 1]) return lerp(pts[i], pts[i + 1], inOutCubic(prog(t, times[i], times[i + 1])));
  }
  return pts[pts.length - 1] + 260 * inOutCubic(prog(t, TN[4] + 0.12, T_FOLD0 + 0.1));
};
const scrollAt = (t: number) => {
  // rolagem suavizada (média curta) seguindo o agente
  let s = 0;
  const n = 7;
  for (let k = 0; k < n; k++) s += Math.max(0, dotY(t - k * 0.03) - 900);
  return s / n;
};

// ------------------------------------------------------------ micro-animações das tarefas
const morphPts = (a: number[][], b: number[][], u: number) => a.map((p, i) => [lerp(p[0], b[i][0], u), lerp(p[1], b[i][1], u)]);
const ENV = [[0, 0], [64, 0], [64, 42], [0, 42]];
const PLANE = [[0, 20], [64, 0], [26, 42], [18, 27]];

const MicroEmail: React.FC<{post: number}> = ({post}) => (
  <svg width={290} height={220} style={{overflow: 'visible'}}>
    {[0, 1, 2].map((k) => {
      const u = inOutCubic(prog(post, k * 0.07, k * 0.07 + 0.16));
      const fly = outCubic(prog(post, k * 0.07 + 0.14, k * 0.07 + 0.5));
      const p = morphPts(ENV, PLANE, u);
      const ox = 40 + k * 36 + fly * 190;
      const oy = 120 - k * 30 - fly * 90 - Math.sin(fly * Math.PI) * 20;
      const flap = `M${lerp(0, 18, u)} ${lerp(0, 27, u)} L${lerp(32, 64, u)} ${lerp(22, 0, u)} L${lerp(64, 26, u)} ${lerp(0, 42, u)}`;
      return (
        <g key={k} transform={`translate(${ox} ${oy}) rotate(${-14 * fly})`} opacity={1 - prog(fly, 0.75, 1)}>
          {fly > 0.05 ? <line x1={-60 * fly} y1={30 * fly} x2={0} y2={20} stroke="#7ff0ff" strokeOpacity={0.4} strokeWidth={3} strokeDasharray="6 8" /> : null}
          <polygon points={p.map((q) => q.join(',')).join(' ')} fill={u > 0.5 ? '#e9fbff' : '#dfe8f4'} stroke="#7ff0ff" strokeWidth={2} />
          <path d={u < 0.5 ? 'M0 0 L32 22 L64 0' : flap} fill="none" stroke="#2a4d7a" strokeWidth={2} />
        </g>
      );
    })}
  </svg>
);

const MicroReport: React.FC<{post: number}> = ({post}) => {
  const lines = [0.65, 0.95, 0.88, 0.92, 0.8, 0.94, 0.55];
  const fan = outExpo(prog(post, RUN - 0.04, RUN + 0.35));
  return (
    <svg width={290} height={220} style={{overflow: 'visible'}}>
      {[2, 1].map((k) => (
        <rect key={k} x={80} y={14} width={140} height={190} rx={10} fill="#cfdcf0" opacity={0.55 * fan} transform={`rotate(${k * 7 * fan} 150 200) translate(${k * 14 * fan} 0)`} />
      ))}
      <rect x={80} y={14} width={140} height={190} rx={10} fill="#eef4fb" />
      <rect x={80} y={14} width={140} height={30} rx={10} fill="#5a46e0" />
      {lines.map((w, k) => {
        const u = outCubic(prog(post, 0.02 + k * 0.04, 0.08 + k * 0.04));
        return <rect key={k} x={94} y={58 + k * 19} width={112 * w * u} height={8} rx={4} fill="#3a4a66" opacity={k === 0 ? 0.9 : 0.55} />;
      })}
    </svg>
  );
};

const MicroSheet: React.FC<{post: number}> = ({post}) => {
  const cells = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 6; c++) {
      const on = post > ((r + c) / 9) * 0.26;
      cells.push(<rect key={`${r}${c}`} x={10 + c * 45} y={20 + r * 31} width={40} height={26} rx={5} fill={on ? (c === 5 ? '#8ff5c2' : 'rgba(170,230,210,0.45)') : 'rgba(170,200,230,0.12)'} />);
    }
  const bars = [0.35, 0.55, 0.42, 0.7, 0.62, 0.9];
  const b = outExpo(prog(post, 0.26, 0.6));
  return (
    <svg width={290} height={220} style={{overflow: 'visible'}}>
      {cells}
      {bars.map((h, c) => (
        <rect key={c} x={14 + c * 45} y={212 - 70 * h * b} width={32} height={70 * h * b} rx={4} fill="#1f9e6e" opacity={0.95} />
      ))}
    </svg>
  );
};

const MicroAgenda: React.FC<{post: number}> = ({post}) => {
  const slots = [];
  for (let c = 0; c < 5; c++)
    for (let r = 0; r < 4; r++) slots.push(<rect key={`${c}${r}`} x={10 + c * 55} y={30 + r * 44} width={48} height={38} rx={7} fill="none" stroke="rgba(190,215,240,0.25)" strokeWidth={2} />);
  const ev = [
    {c: 0, r: 1, col: '#ffd08a'},
    {c: 1, r: 0, col: '#7ff0ff'},
    {c: 2, r: 2, col: '#ffd08a'},
    {c: 3, r: 1, col: '#b4a6ff'},
    {c: 4, r: 3, col: '#7ff0ff'},
  ];
  return (
    <svg width={290} height={220} style={{overflow: 'visible'}}>
      {slots}
      {ev.map((e, k) => {
        const u = spring(prog(post, k * 0.05, k * 0.05 + 0.45), 8, 13);
        return <rect key={k} x={10 + e.c * 55} y={30 + e.r * 44 - (1 - u) * 60} width={48} height={38} rx={7} fill={e.col} opacity={clamp(u * 2)} />;
      })}
    </svg>
  );
};

const MicroContract: React.FC<{post: number}> = ({post}) => {
  const hl = outCubic(prog(post, 0.0, 0.16));
  const sig = prog(post, 0.12, 0.3);
  const stamp = spring(prog(post, 0.3, 0.7), 8, 12);
  return (
    <svg width={290} height={220} style={{overflow: 'visible'}}>
      <rect x={70} y={10} width={160} height={200} rx={10} fill="#eef4fb" />
      <rect x={86} y={34} width={128 * hl} height={14} rx={3} fill="#ff9fb8" opacity={0.6} />
      <rect x={86} y={58} width={100 * hl} height={14} rx={3} fill="#ff9fb8" opacity={0.6} />
      {[0, 1, 2, 3].map((k) => (
        <rect key={k} x={88} y={38 + k * 24} width={[118, 92, 120, 70][k]} height={7} rx={3} fill="#3a4a66" opacity={0.55} />
      ))}
      <path d="M92 176 C104 150 112 190 124 168 C134 150 140 186 152 170 C160 160 170 176 198 168" fill="none" stroke="#24304a" strokeWidth={3} strokeDasharray={220} strokeDashoffset={220 * (1 - sig)} strokeLinecap="round" />
      {stamp > 0.01 ? (
        <g transform={`translate(214 168) scale(${stamp})`}>
          <circle r={26} fill="#d0466e" />
          <path d="M-11 0 L-3 8 L12 -8" stroke="#fff" strokeWidth={5} fill="none" strokeLinecap="round" />
        </g>
      ) : null}
    </svg>
  );
};

const MICRO: Record<Kind, React.FC<{post: number}>> = {
  email: MicroEmail,
  relatorio: MicroReport,
  planilha: MicroSheet,
  agenda: MicroAgenda,
  contrato: MicroContract,
};

// ------------------------------------------------------------ cartão de tarefa (840×280)
export const TaskCard: React.FC<{i: number; t: number; ta: number; active: number}> = ({i, t, ta, active}) => {
  const task = TASKS[i];
  const post = t - ta;
  const running = post >= 0 && post < RUN;
  const done = post >= RUN;
  const bar = clamp(post / RUN);
  const Micro = MICRO[task.kind];
  const spin = (t * 540) % 360;
  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        boxSizing: 'border-box',
        borderRadius: 34,
        position: 'relative',
        background: 'linear-gradient(160deg, rgba(26,44,74,0.96), rgba(9,17,32,0.97))',
        border: `2px solid rgba(127,240,255,${0.14 + 0.5 * active})`,
        boxShadow: `0 20px 50px rgba(0,0,0,0.45), 0 0 ${70 * active}px rgba(89,225,255,${0.35 * active}), inset 0 1px 0 rgba(255,255,255,0.12)`,
        fontFamily: 'Inter Tight',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 30,
          top: 32,
          width: 80,
          height: 80,
          borderRadius: 24,
          background: `linear-gradient(145deg, ${task.color[0]}, ${task.color[1]})`,
          boxShadow: `0 0 ${30 * active}px ${task.color[0]}`,
        }}
      />
      <div style={{position: 'absolute', left: 134, top: 34, fontSize: 40, fontWeight: 700, color: '#f2f8ff', letterSpacing: -0.5}}>{task.title}</div>
      <div style={{position: 'absolute', left: 134, top: 92, fontFamily: 'JetBrains Mono', fontSize: 23, letterSpacing: 1.5, color: done ? '#7ff0ff' : running ? '#bfefff' : 'rgba(170,195,225,0.55)', display: 'flex', alignItems: 'center', gap: 10}}>
        {running ? (
          <svg width={22} height={22} style={{transform: `rotate(${spin}deg)`}}>
            <circle cx={11} cy={11} r={8} fill="none" stroke="#7ff0ff" strokeWidth={3} strokeDasharray="30 30" />
          </svg>
        ) : null}
        {done ? '✓ concluído' : running ? 'executando' : 'na fila'}
      </div>
      <div style={{position: 'absolute', left: 134, top: 214, width: 340, height: 9, borderRadius: 5, background: 'rgba(170,200,235,0.12)'}}>
        <div style={{width: `${bar * 100}%`, height: '100%', borderRadius: 5, background: `linear-gradient(90deg, ${task.color[1]}, ${task.color[0]})`, boxShadow: `0 0 12px ${task.color[0]}`}} />
      </div>
      <div style={{position: 'absolute', left: 520, top: 30}}>
        <Micro post={Math.max(0, post)} />
      </div>
    </div>
  );
};

// ------------------------------------------------------------ dedo que toca a notificação
export const Fingertip: React.FC = () => {
  const t = useT();
  if (t < 2.12 || t > 2.62) return null;
  const r = notifRect(Math.min(t, T_MORPH0));
  const tip = {x: r.cx + r.w * 0.22, y: r.cy + r.h * 0.18};
  const inn = inOutCubic(prog(t, 2.12, T_TAP));
  const out = inOutCubic(prog(t, T_TAP + 0.04, 2.6));
  const press = Math.exp(-Math.pow((t - T_TAP) / 0.035, 2));
  const from = {x: tip.x + 420, y: tip.y + 900};
  const x = lerp(lerp(from.x, tip.x, inn), from.x, out);
  const y = lerp(lerp(from.y, tip.y, inn), from.y, out);
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <defs>
        <linearGradient id="fing" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5e3a26" />
          <stop offset="0.45" stopColor="#9a6747" />
          <stop offset="1" stopColor="#6b4129" />
        </linearGradient>
      </defs>
      <g transform={`translate(${x} ${y}) rotate(-25) scale(${1 - 0.04 * press})`} filter="blur(1.5px)">
        <rect x={-62} y={-10} width={124} height={760} rx={62} fill="url(#fing)" />
        <rect x={-40} y={10} width={80} height={92} rx={38} fill="#c99a82" opacity={0.55} />
        <rect x={-62} y={-10} width={124} height={760} rx={62} fill="#000" opacity={0.12} />
      </g>
    </svg>
  );
};

export const TapRipple: React.FC = () => {
  const t = useT();
  const u = prog(t, T_TAP, T_TAP + 0.28);
  if (u <= 0 || u >= 1) return null;
  const r = notifRect(T_MORPH0);
  const tip = {x: r.cx + r.w * 0.22, y: r.cy + r.h * 0.18 - 30};
  return (
    <svg width={1080} height={1920} style={{position: 'absolute'}}>
      <circle cx={tip.x} cy={tip.y} r={20 + 90 * outCubic(u)} fill="#dff8ff" opacity={0.22 * (1 - u)} />
      <circle cx={tip.x} cy={tip.y} r={20 + 70 * outCubic(u)} fill="none" stroke="#bff4ff" strokeWidth={3} opacity={1 - u} />
    </svg>
  );
};

export const dividerX = (t: number) => (t < T_FOLD0 ? NODE_X : lerp(NODE_X, 540, outExpo(prog(t, T_FOLD0, T_FOLD0 + 0.32))));

// ------------------------------------------------------------ cena B (expansão + fluxo) e dobra para a tela dividida
const compactRect = (i: number) => ({x: 578, y: 452 + i * 176, w: 464, h: 155});

const Backdrop: React.FC<{scroll: number}> = ({scroll}) => {
  const t = useT();
  const parts = useMemo(() => {
    const r = seeded(31);
    return Array.from({length: 46}, () => ({x: r() * 1080, y: r() * 3600, z: 0.2 + r() * 0.9, s: 2 + r() * 10}));
  }, []);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 90% 60% at 50% 30%, #0e2246 0%, #071228 50%, #030814 100%)'}} />
      <AbsoluteFill style={{backgroundImage: 'radial-gradient(rgba(120,200,255,0.16) 1.2px, transparent 1.6px)', backgroundSize: '36px 36px', backgroundPosition: `0px ${-scroll * 0.5}px`, opacity: 0.6}} />
      <svg width={1080} height={1920} style={{position: 'absolute'}}>
        {parts.map((p, i) => {
          const y = ((p.y - scroll * p.z - t * 20 * p.z) % 3600 + 3600) % 3600 - 800;
          return <circle key={i} cx={p.x + Math.sin(t + i) * 10} cy={y} r={p.s * p.z} fill="#7ff0ff" opacity={0.05 + 0.12 * p.z} filter={p.s > 8 ? 'blur(4px)' : undefined} />;
        })}
      </svg>
    </AbsoluteFill>
  );
};

export const AgentFlowScene: React.FC = () => {
  const t = useT();
  if (t < T_MORPH0) return null;
  const m = outExpo(prog(t, T_MORPH0, T_MORPH1));
  const r0 = notifRect(T_MORPH0);
  // retângulo do painel: do cartão para a tela inteira
  const px = lerp(r0.cx - r0.w / 2, 0, m);
  const py = lerp(r0.cy - r0.h / 2, 0, m);
  const pw = lerp(r0.w, 1080, m);
  const ph = lerp(r0.h, 1920, m);
  const pr = lerp(r0.r, 0, m);
  const scroll = scrollAt(t);
  const fold = prog(t, T_FOLD0, T_FOLD1);
  const content = smooth(prog(t, 2.4, 2.62));
  const tilt = 9 * (1 - smooth(prog(t, 3.75, T_FOLD0)));
  const dy = dotY(t);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: px,
          top: py,
          width: pw,
          height: ph,
          borderRadius: pr,
          overflow: 'hidden',
          boxShadow: m < 1 ? '0 30px 80px rgba(0,0,0,0.6)' : undefined,
          border: m < 0.98 ? `${2 * (1 - m)}px solid rgba(190,225,255,0.3)` : undefined,
          clipPath: t >= T_FOLD0 ? `inset(0 0 0 ${dividerX(t)}px)` : undefined,
        }}
      >
        <div style={{position: 'absolute', left: -px, top: -py, width: 1080, height: 1920}}>
          <Backdrop scroll={scroll} />
        </div>
        {/* conteúdo do cartão original sumindo durante a expansão */}
        {m < 0.6 ? (
          <div style={{position: 'absolute', left: 0, top: 0, width: 600, height: 300, transform: `scale(${pw / 600}, ${pw / 600})`, transformOrigin: '0 0', opacity: 1 - prog(t, T_MORPH0, T_MORPH0 + 0.14)}}>
            <NotificationCard t={t} />
          </div>
        ) : null}
      </div>
      {/* cabeçalho + fluxo */}
      <AbsoluteFill style={{opacity: content, perspective: 1800}}>
        <AbsoluteFill style={{transform: `rotateX(${tilt}deg)`, transformOrigin: '540px 900px'}}>
          <div style={{position: 'absolute', left: 0, top: -scroll, width: 1080, height: 3000}}>
            {/* cabeçalho */}
            <div style={{position: 'absolute', left: 70, top: 190, display: 'flex', alignItems: 'center', gap: 20, opacity: 1 - fold}}>
              <AppIcon size={74} glow={0.6} />
              <div>
                <div style={{fontFamily: 'JetBrains Mono', fontSize: 24, letterSpacing: 3, color: '#9fe9ff', fontWeight: 700}}>ASSISTENTE IA</div>
                <div style={{fontFamily: 'Inter Tight', fontSize: 50, fontWeight: 700, color: '#f2f8ff', letterSpacing: -0.8, marginTop: 2}}>Suas tarefas de hoje</div>
              </div>
            </div>
            <div style={{position: 'absolute', left: 70, top: 318, display: 'flex', gap: 12, alignItems: 'center', fontFamily: 'JetBrains Mono', fontSize: 22, color: '#7ff0ff', letterSpacing: 2, opacity: 1 - fold}}>
              <div style={{padding: '8px 16px', borderRadius: 30, border: '1.5px solid rgba(127,240,255,0.5)', background: 'rgba(89,225,255,0.1)'}}>
                ● EXECUTANDO{'.'.repeat(1 + (Math.floor(t * 6) % 3))}
              </div>
              <div style={{color: 'rgba(170,200,230,0.6)'}}>agente autônomo</div>
            </div>
            {/* linha do tempo (vira a divisória na dobra) */}
            {fold <= 0 ? (
              <svg width={1080} height={3000} style={{position: 'absolute', left: 0, top: 0}}>
                <line x1={NODE_X} y1={440} x2={NODE_X} y2={cardY(4) + 400} stroke="rgba(127,240,255,0.18)" strokeWidth={3} strokeDasharray="4 10" />
                <line x1={NODE_X} y1={440} x2={NODE_X} y2={dy} stroke="#7ff0ff" strokeWidth={4} />
                {TN.map((tn, i) => {
                  const cy = cardY(i) + CARD_H / 2;
                  const hit = prog(t, tn, tn + 0.45);
                  const reached = t >= tn;
                  return (
                    <g key={i}>
                      {hit > 0 && hit < 1 ? <circle cx={NODE_X} cy={cy} r={14 + 60 * outCubic(hit)} fill="none" stroke="#bff4ff" strokeWidth={3} opacity={1 - hit} /> : null}
                      <circle cx={NODE_X} cy={cy} r={12} fill={reached ? '#7ff0ff' : '#0b1830'} stroke="#7ff0ff" strokeWidth={3} />
                    </g>
                  );
                })}
                {/* agente: ponto luminoso com rastro */}
                {[0.12, 0.08, 0.05, 0.025, 0].map((lag, k) => (
                  <circle key={k} cx={NODE_X} cy={dotY(t - lag)} r={k === 4 ? 13 : 9 - k} fill={k === 4 ? '#ffffff' : '#7ff0ff'} opacity={k === 4 ? 1 : 0.15 + k * 0.12} />
                ))}
                <circle cx={NODE_X} cy={dy} r={38} fill="#7ff0ff" opacity={0.25} filter="blur(10px)" />
              </svg>
            ) : null}
          </div>
          {/* cartões (posição de fluxo -> pilha compacta na metade direita) */}
          {TASKS.map((_, i) => {
            const ta = TN[i];
            const active = Math.exp(-Math.pow((t - (ta + 0.12)) / 0.22, 2));
            const sx0 = CARD_X;
            const sy0 = cardY(i) - scrollAt(T_FOLD0);
            const f = outExpo(prog(t, T_FOLD0 + i * 0.03, T_FOLD1 + i * 0.03));
            const c = compactRect(i);
            const x = lerp(fold > 0 ? sx0 : CARD_X, c.x, f);
            const y = fold > 0 ? lerp(sy0, c.y, f) : cardY(i) - scroll;
            const sc = lerp(1, c.w / CARD_W, f);
            const enter = outCubic(prog(t, 2.42 + i * 0.05, 2.7 + i * 0.05));
            // na tela dividida a IA continua processando tarefas novas em ciclos rápidos
            const cyc = t > T_FOLD1 ? T_FOLD1 + 0.05 + i * 0.11 + Math.floor((t - (T_FOLD1 + 0.05 + i * 0.11)) / 0.62) * 0.62 : ta;
            const taEff = t > T_FOLD1 + 0.05 + i * 0.11 ? cyc : ta;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: x,
                  top: y + (1 - enter) * 60,
                  transform: `scale(${sc})`,
                  transformOrigin: '0 0',
                  opacity: enter,
                }}
              >
                <TaskCard i={i} t={t} ta={taEff} active={fold > 0 ? 0.25 * Math.exp(-Math.pow((t - (taEff + 0.1)) / 0.2, 2)) : active} />
              </div>
            );
          })}
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// linha do tempo -> divisória vertical (desenhada por cima das duas metades)
export const Divider: React.FC = () => {
  const t = useT();
  const fold = outExpo(prog(t, T_FOLD0, T_FOLD0 + 0.32));
  if (t < T_FOLD0) return null;
  const x = dividerX(t);
  const merge = prog(t, 5.95, 6.4);
  if (merge >= 1) return null;
  const glow = 0.6 + 0.4 * Math.sin(t * 6);
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible', opacity: 1 - merge}}>
      <rect x={x - 14} y={0} width={28} height={1920} fill="#59e1ff" opacity={0.14 * glow} filter="blur(10px)" />
      <rect x={x - 1.5} y={0} width={3} height={1920} fill="#bff4ff" />
    </svg>
  );
};
