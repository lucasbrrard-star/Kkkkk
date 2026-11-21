import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {clamp, inOutCubic, inOutSine, lerp, outCubic, prog, seeded, smooth} from '../../lib/ease';
import {useT} from '../../lib/time';
import {Person, PersonStyle, PROTAGONIST} from './Person';
import {ParticleOrb} from './Tasks';

// ============================================================ CENA I
// "E quem não acompanha essa transformação pode ficar para trás."
export const I0 = 19.0;
export const I_DARK0 = 22.62;
export const I_END = 23.35;
const B = {x: 330, y: 1380};
const T = {x: 1210, y: 470};
const along = (s: number) => ({x: lerp(B.x, T.x, s), y: lerp(B.y, T.y, s)});

const RIDERS: {s0: number; style: PersonStyle; prop: 'tablet' | 'phone' | 'laptop'}[] = [
  {s0: 0.2, style: {hair: 'bun', skin: '#c48a66', top: '#5a3a5e', pants: '#1c2230', shoes: '#e8e2d8', hairColor: '#2a1a12'}, prop: 'tablet'},
  {s0: 0.4, style: {hair: 'short', skin: '#6e4329', top: '#2c5a6e', pants: '#20242e'}, prop: 'laptop'},
  {s0: 0.6, style: {hair: 'long', skin: '#e0b090', top: '#7a4a2a', pants: '#1a1e28', hairColor: '#3a2414'}, prop: 'phone'},
  {s0: 0.8, style: {hair: 'short', skin: '#a26a46', top: '#3a4a6a', pants: '#14181f'}, prop: 'tablet'},
];

// câmera: leve aproximação e depois acompanha a escada (o protagonista fica para trás)
const camI = (t: number) => {
  const track = inOutCubic(prog(t, 21.25, 22.7));
  const sc = lerp(1, 1.04, smooth(prog(t, I0, 21.25))) + 0.1 * track;
  return {dx: -110 * track, dy: 250 * track, sc, track};
};

export const EscalatorScene: React.FC = () => {
  const t = useT();
  const stars = useMemo(() => {
    const r = seeded(8);
    return Array.from({length: 40}, () => ({x: r() * 1300 - 100, y: r() * 900, o: 0.2 + r() * 0.5}));
  }, []);
  if (t < I0 || t > I_END) return null;
  const inn = smooth(prog(t, I0 + 0.05, I0 + 0.4));
  const dark = smooth(prog(t, I_DARK0, I_END - 0.1));
  const {dx, dy, sc, track} = camI(t);
  const ride = (s0: number) => s0 + 0.05 * (t - I0);
  const steps = [];
  const off = ((t * 70) % 64) / 64;
  for (let k = -1; k < 15; k++) {
    const s = (k + off) / 14;
    if (s < 0 || s > 1) continue;
    const p = along(s);
    steps.push(<path key={k} d={`M${p.x} ${p.y} h62 v-64`} stroke="#3a5a80" strokeWidth={3} fill="none" opacity={0.9} />);
  }
  // atuação do protagonista
  const lookDown = smooth(prog(t, 19.5, 19.9)) * (1 - smooth(prog(t, 20.4, 20.8)));
  const lookUp = smooth(prog(t, 20.45, 20.9));
  const stepF = Math.sin(Math.PI * clamp(prog(t, 20.9, 21.6))) * 0.8;
  const helperTurn = t > 21.55;
  const reach = inOutCubic(prog(t, 21.65, 22.3));
  const light = (k: number) => 1 - smooth(prog(t, I_DARK0 + k * 0.08, I_DARK0 + 0.3 + k * 0.08));
  return (
    <AbsoluteFill style={{opacity: inn}}>
      {/* céu e cidade distante (paralaxe lenta) */}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, #050b1c 0%, #0f2448 45%, #23426e 72%, #3c5a80 100%)'}} />
      <svg width={1080} height={1920} style={{position: 'absolute', transform: `translate(${dx * 0.25}px, ${dy * 0.25}px)`}}>
        {stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={1.4} fill="#dfe9ff" opacity={s.o} />
        ))}
        {Array.from({length: 22}, (_, i) => {
          const h = 120 + ((i * 97) % 260);
          return <rect key={i} x={-120 + i * 62} y={1380 - h} width={56} height={h + 400} fill={i % 2 ? '#162a48' : '#13243f'} />;
        })}
      </svg>
      <AbsoluteFill style={{transform: `translate(${dx}px, ${dy}px) scale(${sc})`, transformOrigin: '540px 960px'}}>
        <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
          <defs>
            <linearGradient id="floorI" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#111a2a" />
              <stop offset="1" stopColor="#05080e" />
            </linearGradient>
            <radialGradient id="spotP" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#ffbe5c" stopOpacity="0.35" />
              <stop offset="1" stopColor="#ffbe5c" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x={-600} y={1380} width={2400} height={900} fill="url(#floorI)" />
          <rect x={-600} y={1378} width={2400} height={3} fill="#3c5a80" opacity={0.6} />
          {/* corpo da escada rolante */}
          <path d={`M${B.x - 40} ${B.y + 6} L${T.x + 40} ${T.y - 6} L${T.x + 40} ${T.y + 140} L${B.x + 120} ${B.y + 6} Z`} fill="#0d1628" />
          <path d={`M${B.x - 40} ${B.y + 6} L${T.x + 40} ${T.y - 6}`} stroke="#59e1ff" strokeWidth={4} opacity={0.8 * light(0)} />
          {steps}
          {/* corrimão de vidro */}
          <path d={`M${B.x - 60} ${B.y - 110} L${T.x + 30} ${T.y - 120}`} stroke="#bff4ff" strokeWidth={8} strokeLinecap="round" opacity={0.85 * light(1)} />
          <path d={`M${B.x - 60} ${B.y - 110} L${T.x + 30} ${T.y - 120} L${T.x + 40} ${T.y - 6} L${B.x - 40} ${B.y + 6} Z`} fill="#59e1ff" opacity={0.06 * light(1)} />
          {/* luz no protagonista */}
          <ellipse cx={170} cy={1360} rx={170} ry={60} fill="url(#spotP)" opacity={1 - 0.6 * track} />
        </svg>
        {/* destino: o orbe no alto */}
        <div style={{opacity: light(3)}}>
          <ParticleOrb cx={1120} cy={420} R={90} t={t} assemble={1} warm={0.6} />
        </div>
        <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
          {RIDERS.map((r, i) => {
            const s = ride(r.s0);
            const p = along(clamp(s, 0, 1));
            const isHelper = i === 0 && helperTurn;
            const lean = Math.sin(t * 1.3 + i) * 1.5;
            const glow = (r.prop === 'laptop' ? 0.2 : 0.9) * light(i + 1);
            return (
              <g key={i} opacity={clamp(1.15 - s) * light(i + 1) + 0.1}>
                <Person
                  x={p.x + 30}
                  y={p.y - 2}
                  s={0.98}
                  flip={isHelper}
                  t={t}
                  style={r.style}
                  pose={
                    isHelper
                      ? {head: lerp(6, 14, reach), lh: [-8, -170], rh: [lerp(14, 150, reach), lerp(-172, -250, reach)], prop: null, smile: 1, rim: '#7ff0ff', rimAmt: 0.7}
                      : {head: r.prop === 'laptop' ? -4 + lean : 12 + lean, lh: [-8, -172], rh: r.prop === 'laptop' ? [10, -230] : [36, -250], prop: r.prop, glow, smile: 0.6, rim: '#7ff0ff', rimAmt: 0.6}
                  }
                />
              </g>
            );
          })}
          {/* protagonista: hesita no chão */}
          <Person
            x={170}
            y={1380}
            s={1.12}
            t={t}
            style={PROTAGONIST}
            pose={{head: 14 * lookDown - 16 * lookUp, lh: [-14, -150], rh: [16, -152], step: stepF, prop: null, rim: '#ffbe5c', rimAmt: 0.75 - 0.4 * track}}
          />
        </svg>
      </AbsoluteFill>
      {/* escurece para a pergunta */}
      <AbsoluteFill style={{background: '#000', opacity: 0.7 * dark}} />
    </AbsoluteFill>
  );
};

export const _e = {inOutSine, outCubic};
