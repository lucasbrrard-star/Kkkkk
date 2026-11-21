import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {clamp, inOutCubic, lerp, outCubic, outExpo, prog, seeded, smooth, spring} from '../../lib/ease';
import {useT} from '../../lib/time';

// ============================================================ CENAS G/H
// "Algumas tarefas estão sendo automatizadas. Outras profissões estão surgindo."
export const G0 = 13.5;
export const G_END = 19.45;
const ORB = {x: 540, y: 560, R: 128};

// orbe de partículas em espaço de tela (reutilizável)
export const ParticleOrb: React.FC<{cx: number; cy: number; R: number; t: number; assemble?: number; pulse?: number; warm?: number}> = ({cx, cy, R, t, assemble = 1, pulse = 0, warm = 0}) => {
  const pts = useMemo(() => {
    const N = 360;
    const g = Math.PI * (3 - Math.sqrt(5));
    const r = seeded(17);
    return Array.from({length: N}, (_, i) => {
      const y = 1 - (i / (N - 1)) * 2;
      const rr = Math.sqrt(1 - y * y);
      return {x: Math.cos(g * i) * rr, y, z: Math.sin(g * i) * rr, sx: (r() - 0.5) * 1400, sy: 700 + r() * 900, h: r()};
    });
  }, []);
  const yaw = t * 0.7;
  const cy_ = Math.cos(yaw), sy_ = Math.sin(yaw);
  const RR = R * (1 + 0.12 * pulse + 0.03 * Math.sin(t * 2.3));
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <defs>
        <radialGradient id="porb">
          <stop offset="0" stopColor="#e9fbff" stopOpacity="0.9" />
          <stop offset="0.3" stopColor="#59e1ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={RR * 2.1} fill="url(#porb)" opacity={(0.55 + 0.4 * pulse) * assemble} style={{mixBlendMode: 'screen'}} />
      <ellipse cx={cx} cy={cy} rx={RR * 1.45} ry={RR * 0.32} fill="none" stroke="#7ff0ff" strokeWidth={2} opacity={0.5 * assemble} transform={`rotate(${-14 + t * 12} ${cx} ${cy})`} />
      <ellipse cx={cx} cy={cy} rx={RR * 1.3} ry={RR * 0.22} fill="none" stroke="#ffd08a" strokeWidth={1.5} opacity={(0.25 + 0.5 * warm) * assemble} transform={`rotate(${24 - t * 9} ${cx} ${cy})`} />
      {pts.map((p, i) => {
        const x1 = p.x * cy_ + p.z * sy_;
        const z1 = -p.x * sy_ + p.z * cy_;
        const y2 = p.y * Math.cos(0.4) - z1 * Math.sin(0.4);
        const z2 = p.y * Math.sin(0.4) + z1 * Math.cos(0.4);
        const n = 1 + 0.07 * Math.sin(p.y * 7 + t * 3 + p.h * 5);
        const a = outCubic(clamp(assemble * 1.3 - p.h * 0.3));
        const x = lerp(cx + p.sx, cx + x1 * RR * n, a);
        const y = lerp(p.sy, cy + y2 * RR * n, a);
        const front = 0.5 - z2 * 0.5;
        return <circle key={i} cx={x} cy={y} r={1.4 + 2 * front} fill={p.h > 0.9 || (warm > 0.5 && p.h > 0.6) ? '#ffd08a' : '#c8f6ff'} opacity={0.25 + 0.75 * front} />;
      })}
    </svg>
  );
};

type Chip = {label: string; kind: 'rep' | 'hum' | 'new'};
const REP: Chip[] = [
  {label: 'Digitar dados', kind: 'rep'},
  {label: 'Triar e-mails', kind: 'rep'},
  {label: 'Conferir notas fiscais', kind: 'rep'},
];
const HUM: Chip[] = [
  {label: 'Negociar com clientes', kind: 'hum'},
  {label: 'Liderar equipes', kind: 'hum'},
  {label: 'Cuidar de pessoas', kind: 'hum'},
];
const NEW: Chip[] = [
  {label: 'Auditor(a) de IA', kind: 'new'},
  {label: 'Engenheiro(a) de prompts', kind: 'new'},
  {label: 'Curador(a) de dados', kind: 'new'},
];
export const slot = (col: number, row: number) => ({x: col === 0 ? 60 : 555, y: 880 + row * 150, w: 465, h: 120});

const T_SCAN0 = 14.55;
const T_SCAN1 = 15.45;
const T_ABS = [15.66, 15.84, 16.02];
const T_NEW = [17.36, 17.62, 17.88];

const Icon: React.FC<{kind: Chip['kind']; c: string}> = ({kind, c}) => (
  <svg width={44} height={44} viewBox="0 0 44 44">
    <circle cx={22} cy={22} r={21} fill={c} opacity={0.16} />
    {kind === 'rep' ? (
      <g stroke={c} strokeWidth={3} fill="none" strokeLinecap="round">
        <path d="M13 18 A10 10 0 0 1 31 16" />
        <path d="M31 26 A10 10 0 0 1 13 28" />
        <path d="M31 10 L31 16 L25 16" />
        <path d="M13 34 L13 28 L19 28" />
      </g>
    ) : kind === 'hum' ? (
      <g fill={c}>
        <circle cx={22} cy={15} r={6} />
        <path d="M10 34 Q22 18 34 34 Z" />
      </g>
    ) : (
      <g stroke={c} strokeWidth={3} fill="none" strokeLinecap="round">
        <path d="M22 10 L22 34 M10 22 L34 22" />
      </g>
    )}
  </svg>
);

const ChipView: React.FC<{c: Chip; cls: number; glow?: number}> = ({c, cls, glow = 0}) => {
  const col = c.kind === 'rep' ? '#7ff0ff' : c.kind === 'hum' ? '#ffbe5c' : '#ffffff';
  const border = c.kind === 'new' ? 'linear-gradient(90deg,#ffbe5c,#59e1ff)' : undefined;
  return (
    <div
      style={{
        width: 465,
        height: 120,
        boxSizing: 'border-box',
        borderRadius: 30,
        padding: 2,
        background: border ?? `rgba(${c.kind === 'rep' ? '127,240,255' : '255,190,92'},${0.15 + 0.5 * cls})`,
        boxShadow: `0 0 ${40 * glow}px ${c.kind === 'rep' ? 'rgba(89,225,255,0.5)' : c.kind === 'hum' ? 'rgba(255,170,60,0.45)' : 'rgba(255,255,255,0.35)'}`,
      }}
    >
      <div style={{width: '100%', height: '100%', borderRadius: 28, background: 'linear-gradient(160deg, rgba(24,38,64,0.97), rgba(9,16,30,0.97))', display: 'flex', alignItems: 'center', gap: 18, padding: '0 24px', boxSizing: 'border-box'}}>
        <div style={{opacity: 0.35 + 0.65 * cls}}>
          <Icon kind={c.kind} c={cls > 0.5 || c.kind === 'new' ? col : '#cfdcf0'} />
        </div>
        <div style={{flex: 1, fontFamily: 'Inter Tight', fontWeight: 700, fontSize: 32, color: '#f2f8ff', letterSpacing: -0.4, lineHeight: 1.05}}>{c.label}</div>
        {c.kind === 'new' ? <div style={{fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 16, letterSpacing: 2, color: '#04101c', background: '#ffd9a8', borderRadius: 14, padding: '5px 10px'}}>NOVA</div> : null}
      </div>
    </div>
  );
};

const bez = (a: {x: number; y: number}, c: {x: number; y: number}, b: {x: number; y: number}, u: number) => ({
  x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * b.x,
  y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * b.y,
});

// posições dos degraus da escada rolante (cena seguinte) para a transição
export const stepPos = (k: number) => ({x: 300 + k * 140, y: 1290 - k * 145});

export const TasksScene: React.FC = () => {
  const t = useT();
  if (t < G0 || t > G_END) return null;
  const inn = smooth(prog(t, G0, G0 + 0.4));
  const assemble = outCubic(prog(t, G0, G0 + 0.6));
  const morphOut = inOutCubic(prog(t, 18.95, 19.4));
  const pulse = T_ABS.reduce((a, ta) => a + Math.exp(-Math.pow((t - ta - 0.35) / 0.08, 2)), 0) + T_NEW.reduce((a, ta) => a + 0.6 * Math.exp(-Math.pow((t - ta + 0.1) / 0.1, 2)), 0);
  const scanY = lerp(840, 1330, inOutCubic(prog(t, T_SCAN0, T_SCAN1)));
  const scanOn = t > T_SCAN0 && t < T_SCAN1 + 0.1;
  const legend = outCubic(prog(t, T_SCAN0, T_SCAN0 + 0.3)) * (1 - morphOut);
  const orbX = lerp(ORB.x, 1120, morphOut);
  const orbY = lerp(ORB.y, 420, morphOut);
  return (
    <AbsoluteFill style={{opacity: inn}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 80% 55% at 50% 30%, #0f2648 0%, #071224 55%, #03070f 100%)', opacity: 1 - morphOut}} />
      <ParticleOrb cx={orbX} cy={orbY} R={ORB.R * lerp(1, 0.7, morphOut)} t={t} assemble={assemble} pulse={clamp(pulse)} warm={smooth(prog(t, 17.0, 17.6))} />
      {/* legenda do infográfico */}
      <div style={{position: 'absolute', top: 252, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 40, fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 22, letterSpacing: 3, opacity: legend}}>
        <span style={{color: '#7ff0ff'}}>● REPETITIVA</span>
        <span style={{color: '#ffbe5c'}}>● HUMANA</span>
        {t > T_NEW[0] ? <span style={{color: '#ffffff', opacity: outCubic(prog(t, T_NEW[0], T_NEW[0] + 0.3))}}>● NOVA</span> : null}
      </div>
      {/* feixe de varredura saindo do orbe */}
      {scanOn ? (
        <svg width={1080} height={1920} style={{position: 'absolute'}}>
          <defs>
            <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#59e1ff" stopOpacity="0.02" />
              <stop offset="1" stopColor="#59e1ff" stopOpacity="0.22" />
            </linearGradient>
          </defs>
          <polygon points={`${ORB.x - 60},${ORB.y + 90} ${ORB.x + 60},${ORB.y + 90} 1060,${scanY} 20,${scanY}`} fill="url(#beam)" />
          <rect x={20} y={scanY - 2} width={1040} height={4} fill="#bff4ff" opacity={0.9} />
        </svg>
      ) : null}
      {/* fluxos de energia do orbe para as novas profissões */}
      <svg width={1080} height={1920} style={{position: 'absolute'}}>
        {T_NEW.map((tn, k) => {
          const u = prog(t, tn - 0.32, tn);
          if (u <= 0 || u >= 1.3) return null;
          const s = slot(0, k);
          const a = {x: ORB.x, y: ORB.y + 60};
          const b = {x: s.x + s.w / 2, y: s.y + s.h / 2};
          const c = {x: 250, y: 700};
          const pts = Array.from({length: 14}, (_, j) => bez(a, c, b, clamp(u - j * 0.025)));
          return <polyline key={k} points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#ffe3b8" strokeWidth={5} strokeLinecap="round" opacity={1 - prog(t, tn, tn + 0.2)} />;
        })}
      </svg>
      {/* chips */}
      {[0, 1, 2].map((row) => {
        // coluna esquerda: repetitivas (absorvidas) e depois as novas
        const s = slot(0, row);
        const cls = smooth(prog(scanY, s.y + 10, s.y + 60));
        const enter = outCubic(prog(t, 13.85 + row * 0.08, 14.25 + row * 0.08));
        const ta = T_ABS[row];
        const u = inOutCubic(prog(t, ta, ta + 0.38));
        const p = bez({x: s.x + s.w / 2, y: s.y + s.h / 2}, {x: 160, y: 520}, {x: ORB.x, y: ORB.y}, u);
        const sc = lerp(1, 0.05, u);
        const tn = T_NEW[row];
        const nn = spring(prog(t, tn, tn + 0.55), 7, 10);
        const reveal = outExpo(prog(t, tn + 0.05, tn + 0.45));
        const st = stepPos(row);
        const mx = lerp(s.x, st.x - 232, morphOut);
        const my = lerp(s.y, st.y - 60, morphOut);
        return (
          <React.Fragment key={`l${row}`}>
            {u < 1 ? (
              <div style={{position: 'absolute', left: p.x - s.w / 2, top: p.y - s.h / 2 + (1 - enter) * 40, opacity: enter * (1 - prog(u, 0.85, 1)), transform: `scale(${sc})`}}>
                <ChipView c={REP[row]} cls={cls} glow={u > 0 ? 1 : 0} />
              </div>
            ) : null}
            {t > tn ? (
              <div style={{position: 'absolute', left: mx, top: my, transform: `scale(${(0.6 + 0.4 * nn) * lerp(1, 0.25, morphOut)})`, transformOrigin: 'center', opacity: clamp(nn * 2) * (1 - prog(t, 19.25, 19.42)), clipPath: `inset(0 ${100 - reveal * 100}% 0 0 round 30px)`}}>
                <ChipView c={NEW[row]} cls={1} glow={0.6 * (1 - reveal) + 0.2} />
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
      {[0, 1, 2].map((row) => {
        const s = slot(1, row);
        const cls = smooth(prog(scanY, s.y + 10, s.y + 60));
        const enter = outCubic(prog(t, 13.95 + row * 0.08, 14.35 + row * 0.08));
        const glow = smooth(prog(t, 15.7, 16.2)) * (0.5 + 0.3 * Math.sin(t * 3 + row));
        const st = stepPos(row + 3);
        const mx = lerp(s.x, st.x - 232, morphOut);
        const my = lerp(s.y, st.y - 60, morphOut);
        return (
          <div key={`r${row}`} style={{position: 'absolute', left: mx, top: my + (1 - enter) * 40, opacity: enter * (1 - prog(t, 19.25, 19.42)), transform: `scale(${lerp(1, 0.25, morphOut)})`}}>
            <ChipView c={HUM[row]} cls={cls} glow={glow} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
