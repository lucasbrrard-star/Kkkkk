import React from 'react';
import {AbsoluteFill, Audio, Img, staticFile, useCurrentFrame, interpolate, Easing} from 'remotion';
import {COND, MONO} from './fonts';
import data from './data/anim_data.json';

const W = 1080;
const H = 1920;
const FPS = 30;
const C = {blue: '#4da3ff', cyan: '#8fd3ff', orange: '#ff7a1a', amber: '#ffb24d', gray: '#aab2bb', white: '#f3f5f7', ink: 'rgba(6,8,11,0.55)'};
type Anchors = Record<string, number[][]>;
const A = data.anchors as Anchors;
const PSI = data.psi1 as number[];
const THETA = data.theta as number[];
const PHASES = data.phases as string[][];
const SPARKS = data.sparks as [number, number][];

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const pad = (n: number) => String(n).padStart(4, '0');

/** janela de entrada/saída (0..1) em segundos */
const win = (t: number, a: number, b: number, fin = 0.35, fout = 0.3) =>
  ease(clamp((t - a) / fin)) * ease(clamp((b - t) / fout));

const anchor = (name: string, f: number) => {
  const a = A[name][Math.min(A[name].length - 1, Math.max(0, f))];
  return {x: a[0] * W, y: a[1] * H, vis: a[2] > 0};
};

const PHASE_COLOR: Record<string, string> = {'ADMISSÃO': C.blue, 'COMPRESSÃO': C.cyan, 'EXPANSÃO': C.orange, 'ESCAPE': C.gray};

// ------------------------------------------------------------------ rótulo com linha-guia
const Label: React.FC<{name: string; text: string; from: number; to: number; dx: number; dy: number; color?: string; size?: number}> = ({
  name, text, from, to, dx, dy, color = C.white, size = 44,
}) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  if (t < from - 0.05 || t > to + 0.05) return null;
  const k = win(t, from, to);
  if (k <= 0.001) return null;
  const p = anchor(name, f);
  if (!p.vis) return null;
  const dir = dx >= 0 ? 1 : -1;
  const tw = text.length * size * 0.47 + 16;
  let ex = p.x + dx;
  const ey = clamp(p.y + dy, 140, H - 330);
  // mantém o texto dentro da área segura horizontal
  if (dir > 0) ex = Math.min(ex, W - 44 - tw);
  else ex = Math.max(ex, 44 + tw);
  ex = clamp(ex, 44, W - 44);
  const fx = ex + dir * tw;
  const draw = ease(clamp((t - from) / 0.45));
  const l1 = Math.hypot(ex - p.x, ey - p.y);
  const l2 = Math.abs(fx - ex);
  const total = l1 + l2;
  const shown = total * draw;
  const ring = ((t - from) % 1.4) / 1.4;
  return (
    <div style={{position: 'absolute', inset: 0, opacity: k}}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        <circle cx={p.x} cy={p.y} r={7 + 18 * ring} fill="none" stroke={color} strokeOpacity={0.55 * (1 - ring)} strokeWidth={2} />
        <circle cx={p.x} cy={p.y} r={6.5} fill={color} />
        <circle cx={p.x} cy={p.y} r={11} fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.9} />
        <polyline
          points={`${p.x},${p.y} ${ex},${ey} ${fx},${ey}`}
          fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={`${shown} ${total + 10}`}
          style={{filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.8))'}}
        />
      </svg>
      <div
        style={{
          position: 'absolute', top: ey - size * 1.25, left: dir > 0 ? ex : fx, width: tw, textAlign: dir > 0 ? 'left' : 'right',
          fontFamily: COND, fontWeight: 600, fontSize: size, letterSpacing: '0.04em', color,
          textShadow: '0 2px 10px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)',
          transform: `translateY(${(1 - ease(clamp((t - from - 0.15) / 0.35))) * 14}px)`,
          opacity: ease(clamp((t - from - 0.15) / 0.3)), whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ indicador das quatro fases
const PhaseBar: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const k = win(t, 9.95, 22.55, 0.45, 0.45);
  if (k <= 0) return null;
  const psi = PSI[f];
  const cyc = (psi - 360 + 720) % 720; // 0 = início da admissão
  const phases = [
    {n: 1, name: 'ADMISSÃO', c: C.blue},
    {n: 2, name: 'COMPRESSÃO', c: C.cyan},
    {n: 3, name: 'EXPANSÃO', c: C.orange},
    {n: 4, name: 'ESCAPE', c: C.gray},
  ];
  const active = Math.min(3, Math.floor(cyc / 180));
  const pw = 228;
  const gap = 14;
  const x0 = (W - (pw * 4 + gap * 3)) / 2;
  const y0 = 1418;
  const spark = SPARKS.find(([ts, c]) => c === 1 && Math.abs(ts - 15.1) < 0.5);
  const sparkK = spark ? Math.exp(-Math.max(0, t - spark[0]) / 0.25) * (t >= spark[0] ? 1 : 0) : 0;
  return (
    <div style={{position: 'absolute', inset: 0, opacity: k, transform: `translateY(${(1 - k) * 30}px)`}}>
      {phases.map((p, i) => {
        const on = i === active;
        const prog = on ? clamp((cyc - i * 180) / 180) : i < active ? 1 : 0;
        return (
          <div key={p.n} style={{position: 'absolute', left: x0 + i * (pw + gap), top: y0, width: pw, height: 74}}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 10, border: `2px solid ${on ? p.c : 'rgba(220,228,236,0.35)'}`,
              background: on ? `${p.c}33` : 'rgba(8,10,14,0.45)', boxShadow: on ? `0 0 24px ${p.c}55` : 'none',
            }} />
            <div style={{position: 'absolute', left: 14, top: 9, fontFamily: MONO, fontSize: 20, color: on ? p.c : C.gray, opacity: 0.95}}>{p.n}</div>
            <div style={{
              position: 'absolute', left: 0, right: 0, top: 14, textAlign: 'center', fontFamily: COND, fontWeight: 700,
              fontSize: 36, letterSpacing: '0.05em', color: on ? C.white : 'rgba(225,230,236,0.6)',
            }}>{p.name}</div>
            <div style={{position: 'absolute', left: 10, right: 10, bottom: 6, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.12)'}}>
              <div style={{width: `${prog * 100}%`, height: '100%', borderRadius: 2, background: p.c}} />
            </div>
          </div>
        );
      })}
      {/* régua do ciclo: 720° = 2 voltas do virabrequim */}
      <div style={{position: 'absolute', left: x0, top: y0 + 96, width: pw * 4 + gap * 3, height: 2, background: 'rgba(255,255,255,0.25)'}} />
      <div style={{
        position: 'absolute', left: x0 + (cyc / 720) * (pw * 4 + gap * 3) - 7, top: y0 + 90, width: 14, height: 14, borderRadius: 7,
        background: phases[active].c, boxShadow: `0 0 12px ${phases[active].c}`,
      }} />
      <div style={{
        position: 'absolute', left: x0, top: y0 + 112, width: pw * 4 + gap * 3, display: 'flex', justifyContent: 'space-between',
        fontFamily: MONO, fontSize: 22, color: 'rgba(230,235,240,0.75)',
      }}>
        <span>CICLO {String(Math.round(cyc)).padStart(3, '0')}° / 720°</span>
        <span>2 VOLTAS DO VIRABREQUIM</span>
      </div>
      {sparkK > 0.02 && (
        <div style={{
          position: 'absolute', left: x0 + 1 * (pw + gap), top: y0 - 54, width: pw * 2 + gap, textAlign: 'center',
          fontFamily: COND, fontWeight: 700, fontSize: 38, color: C.amber, opacity: sparkK, letterSpacing: '0.12em',
          textShadow: `0 0 18px ${C.orange}`,
        }}>IGNIÇÃO</div>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ ordem de ignição sincronizada com as centelhas
const FiringOrder: React.FC<{from: number; to: number}> = ({from, to}) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const k = win(t, from, to, 0.4, 0.4);
  if (k <= 0) return null;
  const order = [1, 5, 4, 8, 6, 3, 7, 2];
  const bw = 78;
  const gap = 12;
  const x0 = (W - (bw * 8 + gap * 7)) / 2;
  const y0 = 1452;
  const lit = (c: number) => {
    let v = 0;
    for (const [ts, cc] of SPARKS) {
      if (cc !== c) continue;
      const d = t - ts;
      if (d >= -0.01 && d < 0.6) v = Math.max(v, Math.exp(-Math.max(0, d) / 0.16));
    }
    return v;
  };
  return (
    <div style={{position: 'absolute', inset: 0, opacity: k, transform: `translateY(${(1 - k) * 24}px)`}}>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: y0 - 62, textAlign: 'center', fontFamily: COND, fontWeight: 600,
        fontSize: 32, letterSpacing: '0.16em', color: 'rgba(235,240,245,0.85)', textShadow: '0 2px 8px rgba(0,0,0,0.8)',
      }}>V8 90° · VIRABREQUIM CROSS-PLANE · ORDEM DE IGNIÇÃO</div>
      {order.map((c, i) => {
        const v = lit(c);
        return (
          <div key={c} style={{
            position: 'absolute', left: x0 + i * (bw + gap), top: y0, width: bw, height: 78, borderRadius: 10,
            border: `2px solid ${v > 0.05 ? C.orange : 'rgba(220,228,236,0.35)'}`,
            background: `rgba(255,122,26,${0.55 * v})`, boxShadow: v > 0.05 ? `0 0 ${26 * v}px ${C.orange}` : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 36,
            color: v > 0.3 ? '#fff' : 'rgba(230,235,240,0.8)',
          }}>{c}</div>
        );
      })}
    </div>
  );
};

// ------------------------------------------------------------------ etiquetas de fase sobre cada cilindro
const CylinderTags: React.FC<{from: number; to: number}> = ({from, to}) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const k = win(t, from, to, 0.4, 0.35);
  if (k <= 0) return null;
  const short: Record<string, string> = {'ADMISSÃO': 'ADM', 'COMPRESSÃO': 'COMP', 'EXPANSÃO': 'EXP', 'ESCAPE': 'ESC'};
  return (
    <div style={{position: 'absolute', inset: 0, opacity: k}}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((c) => {
        const p = anchor(`cyl${c}`, f);
        if (!p.vis || p.x < 50 || p.x > W - 50 || p.y < 150 || p.y > H - 340) return null;
        const ph = PHASES[f][c - 1];
        const col = PHASE_COLOR[ph];
        return (
          <div key={c} style={{
            position: 'absolute', left: p.x - 58, top: p.y - 24, width: 116, height: 46, borderRadius: 23,
            border: `2px solid ${col}`, background: 'rgba(8,10,14,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontFamily: COND, fontWeight: 700, fontSize: 27, color: '#fff', boxShadow: `0 0 14px ${col}66`,
          }}>
            <span style={{fontFamily: MONO, fontSize: 22, color: col}}>{c}</span>
            <span>{short[ph]}</span>
          </div>
        );
      })}
    </div>
  );
};

// ------------------------------------------------------------------ alternativo -> rotativo (sincronizado com pistão 1 e virabrequim)
const MotionGlyph: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const k = win(t, 7.4, 9.35, 0.4, 0.35);
  if (k <= 0) return null;
  const th = THETA[f];
  const a = (th * Math.PI) / 180; // cilindro 1: ângulo entre moente e eixo = theta
  const r = 0.04635;
  const s = r * Math.sin(a);
  const piston = r * Math.cos(a) + Math.sqrt(0.1507 * 0.1507 - s * s); // 0.104..0.197
  const yoff = (0.1507 + r - piston) / (2 * r);
  const y0 = 205;
  return (
    <div style={{position: 'absolute', inset: 0, opacity: k}}>
      <div style={{position: 'absolute', left: 170, top: y0, width: 740, height: 150, borderRadius: 18, background: 'rgba(8,10,14,0.5)', border: '1px solid rgba(255,255,255,0.18)'}} />
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        <g transform={`translate(270, ${y0 + 30 + yoff * 70})`}>
          <rect x={-34} y={0} width={68} height={22} rx={5} fill={C.white} />
          <line x1={0} y1={22} x2={0} y2={60 - yoff * 50} stroke={C.white} strokeWidth={6} />
        </g>
        <text x={540} y={y0 + 88} textAnchor="middle" fontFamily={COND} fontWeight={700} fontSize={44} fill={C.amber}>→</text>
        <g transform={`translate(810, ${y0 + 75}) rotate(${th})`}>
          <circle r={42} fill="none" stroke={C.white} strokeWidth={5} strokeDasharray="200 64" />
          <circle cx={0} cy={-30} r={9} fill={C.orange} />
        </g>
      </svg>
      <div style={{position: 'absolute', left: 330, top: y0 + 22, width: 180, fontFamily: COND, fontWeight: 600, fontSize: 30, color: C.white, lineHeight: 1.05}}>MOVIMENTO<br />ALTERNATIVO</div>
      <div style={{position: 'absolute', left: 590, top: y0 + 52, width: 150, fontFamily: COND, fontWeight: 600, fontSize: 30, color: C.white}}>ROTAÇÃO</div>
    </div>
  );
};

// ------------------------------------------------------------------ setas de pressão sobre o pistão
const PressureArrows: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const k = win(t, 16.15, 18.9, 0.3, 0.4);
  if (k <= 0) return null;
  const p = anchor('piston1', f);
  const ch = anchor('chamber1', f);
  const top = ch.y + 20;
  const bottom = p.y - 30;
  const span = Math.max(40, bottom - top);
  return (
    <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: k * 0.95}}>
      {[-110, 0, 110].map((dx, i) =>
        [0, 1, 2].map((j) => {
          const ph = ((t * 1.6 + j / 3 + i * 0.13) % 1);
          const y = top + ph * span;
          const o = Math.sin(Math.PI * ph);
          return (
            <polyline key={`${i}-${j}`} points={`${p.x + dx - 22},${y - 14} ${p.x + dx},${y + 6} ${p.x + dx + 22},${y - 14}`}
              fill="none" stroke={C.amber} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={o}
              style={{filter: `drop-shadow(0 0 6px ${C.orange})`}} />
          );
        }),
      )}
    </svg>
  );
};

// ------------------------------------------------------------------ títulos
const Kicker: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const k = win(t, 0.5, 4.3, 0.6, 0.5);
  if (k <= 0) return null;
  const sp = interpolate(t, [0.5, 2.5], [0.42, 0.24], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});
  return (
    <div style={{position: 'absolute', left: 76, top: 220, opacity: k}}>
      <div style={{fontFamily: COND, fontWeight: 600, fontSize: 30, letterSpacing: `${sp}em`, color: C.amber}}>COMO FUNCIONA</div>
      <div style={{width: 120 * k, height: 3, background: C.orange, margin: '12px 0 14px'}} />
      <div style={{fontFamily: COND, fontWeight: 700, fontSize: 78, letterSpacing: '0.06em', color: C.white, lineHeight: 1, textShadow: '0 4px 24px rgba(0,0,0,0.7)'}}>
        MOTOR V8
      </div>
      <div style={{fontFamily: COND, fontWeight: 500, fontSize: 34, letterSpacing: '0.18em', color: 'rgba(235,240,245,0.85)', marginTop: 8}}>CICLO DE QUATRO TEMPOS</div>
    </div>
  );
};

const EndTitle: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const k = ease(clamp((t - 27.35) / 0.9));
  if (k <= 0) return null;
  const sp = interpolate(t, [27.35, 29.6], [0.55, 0.32], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});
  return (
    <div style={{position: 'absolute', left: 0, right: 0, top: 255, textAlign: 'center', opacity: k}}>
      <div style={{fontFamily: COND, fontWeight: 700, fontSize: 132, letterSpacing: '0.08em', color: C.white, lineHeight: 1, textShadow: '0 6px 30px rgba(0,0,0,0.75)'}}>
        V8
      </div>
      <div style={{width: 200 * k, height: 3, background: C.orange, margin: '18px auto 20px', boxShadow: `0 0 14px ${C.orange}`}} />
      <div style={{fontFamily: COND, fontWeight: 600, fontSize: 46, letterSpacing: `${sp}em`, color: 'rgba(240,243,246,0.95)', paddingLeft: `${sp}em`}}>
        ENGENHARIA EM MOVIMENTO
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ composição
export const V8: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  return (
    <AbsoluteFill style={{backgroundColor: '#050608'}}>
      <Img src={staticFile(`frames/u_${pad(f + 1)}.jpg`)} style={{width: W, height: H, position: 'absolute', inset: 0}} />
      {/* vinheta */}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 85% 70% at 50% 48%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)'}} />
      <Kicker />
      {/* visão geral: oito pistões */}
      <Label name="piston1" text="PISTÕES" from={5.75} to={7.45} dx={170} dy={-150} />
      <Label name="rod1" text="BIELAS" from={6.15} to={7.75} dx={190} dy={70} />
      <Label name="crank" text="VIRABREQUIM" from={6.55} to={8.85} dx={170} dy={-120} color={C.amber} />
      <MotionGlyph />
      <FiringOrder from={5.9} to={9.4} />
      {/* close: admissão e compressão */}
      <Label name="valveI1" text="VÁLVULA DE ADMISSÃO" from={10.1} to={12.7} dx={60} dy={-190} color={C.cyan} />
      <Label name="chamber1" text="AR + COMBUSTÍVEL" from={10.7} to={12.8} dx={-190} dy={110} color={C.blue} />
      <Label name="valveE1" text="VÁLVULAS FECHADAS" from={13.45} to={14.95} dx={-90} dy={-200} />
      <Label name="chamber1" text="MISTURA COMPRIMIDA" from={13.5} to={14.95} dx={190} dy={90} color={C.cyan} />
      {/* ignição e expansão */}
      <Label name="plug1" text="VELA DE IGNIÇÃO" from={14.95} to={16.7} dx={150} dy={-60} color={C.amber} />
      <Label name="chamber1" text="FRENTE DE CHAMA" from={15.45} to={16.9} dx={-200} dy={90} color={C.orange} />
      <PressureArrows />
      <Label name="piston1" text="PRESSÃO DOS GASES" from={16.5} to={18.7} dx={200} dy={-40} color={C.orange} />
      <Label name="rod1" text="BIELA → VIRABREQUIM" from={17.3} to={19.4} dx={-190} dy={90} />
      {/* escape */}
      <Label name="valveE1" text="VÁLVULA DE ESCAPE" from={19.45} to={21.9} dx={-120} dy={-190} color={C.gray} />
      <Label name="chamber1" text="GASES QUEIMADOS" from={20.1} to={22.2} dx={200} dy={100} color={C.amber} />
      <PhaseBar />
      {/* visão geral: cilindros em fases diferentes */}
      <CylinderTags from={22.9} to={25.3} />
      <FiringOrder from={23.0} to={25.3} />
      <EndTitle />
      <Audio src={staticFile('audio/mix.wav')} />
      {/* leve fade no último 0,3 s */}
      <AbsoluteFill style={{backgroundColor: '#000', opacity: interpolate(t, [29.7, 30], [0, 0.35], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}} />
    </AbsoluteFill>
  );
};
