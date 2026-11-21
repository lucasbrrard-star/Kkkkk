import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import overlay from './data/overlay.json';

const W = 1080;
const H = 1920;
const FPS = 30;
const sec = (s: number) => Math.round(s * FPS);
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const C = {
  white: '#F3F6FA',
  dim: '#9FB0C4',
  blue: '#5AA9FF',
  blueLight: '#9BD0FF',
  orange: '#FF8A2A',
  gray: '#A2A9B2',
  panel: 'rgba(7, 10, 15, 0.62)',
};
const COND = '"Barlow Condensed", "Inter", sans-serif';
const SANS = '"Inter", sans-serif';

type FrameData = { t: number; phi: number[]; p: Record<string, number[]> };
const DATA = overlay as unknown as { firing: number[]; frames: FrameData[] };
const fd = (f: number): FrameData => DATA.frames[Math.max(0, Math.min(DATA.frames.length - 1, f))];
const pt = (key: string, f: number): [number, number] => {
  const p = fd(f).p[key];
  return [p[0] * W, p[1] * H];
};
const lerp2 = (a: [number, number], b: [number, number], t: number): [number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

const STROKES = [
  { name: 'ADMISSÃO', color: C.blue },
  { name: 'COMPRESSÃO', color: C.blueLight },
  { name: 'EXPANSÃO', color: C.orange },
  { name: 'ESCAPE', color: C.gray },
];
const strokeOf = (phi: number) => Math.floor((((phi % 720) + 720) % 720) / 180);

// ------------------------------------------------------------------ 3D plate
const Plate: React.FC<{ dir: string }> = ({ dir }) => {
  const frame = useCurrentFrame();
  const src = staticFile(`${dir}/f${String(frame + 1).padStart(4, '0')}.png`);
  return (
    <AbsoluteFill style={{ backgroundColor: '#05070a' }}>
      <Img
        src={src}
        style={{ width: W, height: H, objectFit: 'cover', filter: 'contrast(1.06) saturate(1.06)' }}
      />
    </AbsoluteFill>
  );
};

const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        'radial-gradient(ellipse 85% 70% at 50% 48%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)',
    }}
  />
);

const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity: 0.07, mixBlendMode: 'overlay' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W / 2} ${H / 2}`} preserveAspectRatio="none">
        <filter id="g">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame % 17} />
        </filter>
        <rect width="100%" height="100%" filter="url(#g)" />
      </svg>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ callouts
type CalloutSpec = {
  anchor: (f: number) => [number, number];
  label: string;
  sub?: string;
  from: number;
  to: number;
  dx: number;
  dy: number;
  color?: string;
  minY?: number;
};

const Callout: React.FC<{ s: CalloutSpec }> = ({ s }) => {
  const frame = useCurrentFrame();
  const f0 = sec(s.from);
  const f1 = sec(s.to);
  if (frame < f0 || frame > f1) return null;
  const local = frame - f0;
  const color = s.color ?? C.blue;
  const [ax, ay] = s.anchor(frame);
  const labelW = Math.max(s.label.length * 21 + 30, (s.sub?.length ?? 0) * 12.4 + 30);
  const right = s.dx >= 0;
  let ex = ax + s.dx;
  let ey = ay + s.dy;
  const minY = s.minY ?? 230;
  ey = Math.max(minY + 70, Math.min(H - 330, ey));
  if (right) ex = Math.max(60, Math.min(W - 60 - labelW, ex));
  else ex = Math.max(60 + labelW, Math.min(W - 60, ex));
  const ux = right ? ex + labelW : ex - labelW;
  const draw = interpolate(local, [0, 13], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const out = interpolate(frame, [f1 - 9, f1], [1, 0], clamp);
  const txt = interpolate(local, [7, 17], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const l1 = Math.hypot(ex - ax, ey - ay);
  const l2 = labelW;
  const L = l1 + l2;
  const pulse = (local % 36) / 36;
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <svg width={W} height={H} style={{ position: 'absolute' }}>
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={ax} cy={ay} r={7 + 18 * pulse} fill="none" stroke={color} strokeWidth={2} opacity={(1 - pulse) * 0.8 * draw} />
        <circle cx={ax} cy={ay} r={6.5} fill={C.white} stroke={color} strokeWidth={3} opacity={draw} filter="url(#glow)" />
        <path
          d={`M ${ax} ${ay} L ${ex} ${ey} L ${ux} ${ey}`}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={L}
          strokeDashoffset={L * (1 - draw)}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#glow)"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: right ? ex + 6 : ex - labelW + 6,
          top: ey - 64,
          width: labelW - 12,
          textAlign: right ? 'left' : 'right',
          opacity: txt,
          transform: `translateY(${(1 - txt) * 14}px)`,
        }}
      >
        <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 44, letterSpacing: 2.5, color: C.white, textShadow: '0 2px 12px rgba(0,0,0,0.85)' }}>
          {s.label}
        </div>
      </div>
      {s.sub ? (
        <div
          style={{
            position: 'absolute',
            left: right ? ex + 6 : ex - labelW + 6,
            top: ey + 10,
            width: labelW - 12,
            textAlign: right ? 'left' : 'right',
            opacity: txt * 0.95,
            fontFamily: SANS,
            fontWeight: 500,
            fontSize: 24,
            color: C.dim,
            textShadow: '0 2px 10px rgba(0,0,0,0.9)',
          }}
        >
          {s.sub}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const mid = (a: string, b: string, t: number) => (f: number) => lerp2(pt(a, f), pt(b, f), t);
const at = (k: string) => (f: number) => pt(k, f);

const PANEL_Y = 230;
const CALLOUTS: CalloutSpec[] = [
  // Scene 2 - pistons & crank (x-ray)
  { anchor: at('crown5'), label: 'PISTÕES', sub: '8 cilindros · 2 bancadas a 90°', from: 5.6, to: 8.1, dx: -230, dy: -210 },
  { anchor: at('crank_mid'), label: 'VIRABREQUIM', sub: 'vaivém → rotação', from: 6.8, to: 9.5, dx: -170, dy: 230 },
  { anchor: at('rodmid3'), label: 'BIELAS', from: 7.4, to: 9.3, dx: 190, dy: 150 },
  // Scene 3 - intake & compression
  { anchor: at('intake_v1'), label: 'VÁLVULA DE ADMISSÃO', sub: 'aberta pelo comando', from: 10.35, to: 12.9, dx: -60, dy: -250, minY: PANEL_Y + 190 },
  { anchor: mid('plug1', 'piston1', 0.62), label: 'AR + COMBUSTÍVEL', sub: 'mistura admitida', from: 11.0, to: 13.1, dx: 200, dy: 120, minY: PANEL_Y + 190 },
  { anchor: at('exhaust_v1'), label: 'VÁLVULAS FECHADAS', sub: 'a mistura é comprimida', from: 13.3, to: 15.15, dx: 120, dy: -230, minY: PANEL_Y + 190 },
  // Scene 4 - ignition & expansion
  { anchor: at('plug1'), label: 'VELA DE IGNIÇÃO', sub: 'centelha ~15° antes do PMS', from: 15.25, to: 16.9, dx: 150, dy: -200, color: C.orange, minY: PANEL_Y + 190 },
  { anchor: mid('plug1', 'piston1', 0.55), label: 'FRENTE DE CHAMA', from: 15.75, to: 17.2, dx: -200, dy: 80, color: C.orange, minY: PANEL_Y + 190 },
  { anchor: mid('pin1', 'crankpin1', 0.5), label: 'BIELA', sub: 'transmite a força', from: 17.4, to: 19.7, dx: -200, dy: -40, color: C.orange, minY: PANEL_Y + 190 },
  { anchor: at('crank_c'), label: 'VIRABREQUIM', sub: 'força vira torque', from: 18.0, to: 19.85, dx: 190, dy: -150, color: C.orange, minY: PANEL_Y + 190 },
  // Scene 5 - exhaust
  { anchor: at('exhaust_v1'), label: 'VÁLVULA DE ESCAPE', sub: 'abre no fim da expansão', from: 20.15, to: 21.6, dx: 140, dy: -210, minY: PANEL_Y + 190 },
  { anchor: at('header1'), label: 'GASES QUEIMADOS', sub: 'saem pelo coletor', from: 21.1, to: 22.6, dx: -240, dy: 200, color: C.gray, minY: PANEL_Y + 190 },
];

// ------------------------------------------------------------------ phase dial
const arcPath = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const p = (a: number) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};

const PhasePanel: React.FC = () => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [sec(9.85), sec(10.3), sec(22.7), sec(23.2)], [0, 1, 1, 0], clamp);
  if (op <= 0) return null;
  const phi = fd(frame).phi[0];
  const st = strokeOf(phi);
  // frames since stroke change (for the name transition)
  let since = 0;
  while (since < 12 && frame - since - 1 >= 0 && strokeOf(fd(frame - since - 1).phi[0]) === st) since++;
  const sw = interpolate(since, [0, 10], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const needle = (((phi % 720) + 720) % 720) / 2;
  const cx = 88;
  const cy = 88;
  const nx = cx + 72 * Math.sin((needle * Math.PI) / 180);
  const ny = cy - 72 * Math.cos((needle * Math.PI) / 180);
  const spark = 345 / 2;
  const sx = cx + 64 * Math.sin((spark * Math.PI) / 180);
  const sy = cy - 64 * Math.cos((spark * Math.PI) / 180);
  const enter = interpolate(frame, [sec(9.85), sec(10.4)], [-30, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <div
      style={{
        position: 'absolute',
        left: 56,
        top: PANEL_Y,
        width: 640,
        height: 176,
        opacity: op,
        transform: `translateX(${enter}px)`,
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        padding: '0 26px 0 0',
        background: 'linear-gradient(90deg, rgba(6,9,14,0.78), rgba(6,9,14,0.0))',
        borderLeft: `3px solid ${STROKES[st].color}`,
      }}
    >
      <svg width={176} height={196} style={{ overflow: 'visible' }}>
        <circle cx={cx} cy={cy} r={64} fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        {STROKES.map((s, i) => (
          <path
            key={s.name}
            d={arcPath(cx, cy, 64, i * 90 + 2, (i + 1) * 90 - 2)}
            stroke={s.color}
            strokeWidth={i === st ? 10 : 5}
            opacity={i === st ? 1 : 0.28}
            fill="none"
            strokeLinecap="round"
          />
        ))}
        {[0, 90, 180, 270].map((a) => (
          <line
            key={a}
            x1={cx + 50 * Math.sin((a * Math.PI) / 180)}
            y1={cy - 50 * Math.cos((a * Math.PI) / 180)}
            x2={cx + 78 * Math.sin((a * Math.PI) / 180)}
            y2={cy - 78 * Math.cos((a * Math.PI) / 180)}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={1.5}
          />
        ))}
        <circle cx={sx} cy={sy} r={5} fill={C.orange} />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={C.white} strokeWidth={3.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={7} fill={C.white} />
        <text x={cx} y={cy + 100} textAnchor="middle" fontFamily={SANS} fontWeight={600} fontSize={15} fill={C.dim}>
          720°
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 21, letterSpacing: 3, color: C.dim }}>
          CILINDRO 1 · TEMPO {st + 1}/4
        </div>
        <div
          style={{
            fontFamily: COND,
            fontWeight: 700,
            fontSize: 72,
            lineHeight: 1.0,
            letterSpacing: 2,
            color: STROKES[st].color,
            opacity: sw,
            transform: `translateY(${(1 - sw) * 18}px)`,
            textShadow: '0 2px 16px rgba(0,0,0,0.8)',
          }}
        >
          {STROKES[st].name}
        </div>
        <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 22, color: C.white, opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>
          virabrequim {Math.round(((phi % 720) + 720) % 720)}° / 720°
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ firing order + legend
const FiringStrip: React.FC = () => {
  const frame = useCurrentFrame();
  const op = Math.max(
    interpolate(frame, [sec(5.6), sec(6.1), sec(9.4), sec(9.85)], [0, 1, 1, 0], clamp),
    interpolate(frame, [sec(22.9), sec(23.4), sec(25.0), sec(25.4)], [0, 1, 1, 0], clamp),
  );
  if (op <= 0) return null;
  const phis = fd(frame).phi;
  const firing = DATA.firing;
  const active = firing.find((c) => {
    const p = ((phis[c - 1] % 720) + 720) % 720;
    return p >= 345 && p < 435;
  });
  return (
    <div style={{ position: 'absolute', left: 0, width: W, top: 1388, opacity: op, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ display: 'flex', gap: 26 }}>
        {STROKES.map((s) => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 18, height: 18, borderRadius: 4, background: s.color, boxShadow: `0 0 12px ${s.color}` }} />
            <div style={{ fontFamily: COND, fontWeight: 600, fontSize: 28, letterSpacing: 1.5, color: C.white }}>{s.name}</div>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 21, letterSpacing: 4, color: C.dim, marginTop: 8 }}>ORDEM DE IGNIÇÃO</div>
      <div style={{ display: 'flex', gap: 12 }}>
        {firing.map((c) => {
          const on = c === active;
          return (
            <div
              key={c}
              style={{
                width: 70,
                height: 70,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: COND,
                fontWeight: 700,
                fontSize: 42,
                color: on ? '#140800' : C.white,
                background: on ? C.orange : 'rgba(8,11,16,0.7)',
                border: `2px solid ${on ? C.orange : 'rgba(255,255,255,0.18)'}`,
                boxShadow: on ? `0 0 26px ${C.orange}` : 'none',
              }}
            >
              {c}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ force path (scene 4)
const ForcePath: React.FC = () => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [sec(16.2), sec(16.6), sec(19.3), sec(19.8)], [0, 1, 1, 0], clamp);
  if (op <= 0) return null;
  const crown = pt('piston1', frame);
  const pin = pt('pin1', frame);
  const cp = pt('crankpin1', frame);
  const cc = pt('crank_c', frame);
  let dx = pin[0] - crown[0];
  let dy = pin[1] - crown[1];
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl;
  dy /= dl;
  const chev = [0, 1, 2].map((i) => {
    const ph = ((frame * 0.06 + i / 3) % 1);
    const d = -110 + ph * 90;
    const x = crown[0] + dx * d;
    const y = crown[1] + dy * d;
    const nx = -dy;
    const ny = dx;
    const s = 34;
    return { x, y, nx, ny, s, o: Math.sin(Math.PI * ph) };
  });
  const pathOp = interpolate(frame, [sec(17.2), sec(17.7)], [0, 1], clamp);
  const dash = (frame * 9) % 60;
  return (
    <AbsoluteFill style={{ opacity: op }}>
      <svg width={W} height={H}>
        {chev.map((c, i) => (
          <polyline
            key={i}
            points={`${c.x - c.nx * c.s - dx * 18},${c.y - c.ny * c.s - dy * 18} ${c.x},${c.y} ${c.x + c.nx * c.s - dx * 18},${c.y + c.ny * c.s - dy * 18}`}
            fill="none"
            stroke={C.orange}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={c.o}
          />
        ))}
        <polyline
          points={`${pin[0]},${pin[1]} ${cp[0]},${cp[1]} ${cc[0]},${cc[1]}`}
          fill="none"
          stroke={C.orange}
          strokeWidth={5}
          strokeDasharray="22 16"
          strokeDashoffset={-dash}
          opacity={pathOp * 0.95}
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: Math.min(W - 420, crown[0] + 120),
          top: Math.max(PANEL_Y + 200, crown[1] - 150),
          fontFamily: COND,
          fontWeight: 700,
          fontSize: 40,
          letterSpacing: 2,
          color: C.orange,
          textShadow: '0 2px 12px rgba(0,0,0,0.9)',
        }}
      >
        PRESSÃO DOS GASES
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ titles
const Kicker: React.FC = () => {
  const frame = useCurrentFrame();
  const a = interpolate(frame, [sec(0.4), sec(1.1)], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const b = interpolate(frame, [sec(0.7), sec(1.5)], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const line = interpolate(frame, [sec(1.0), sec(2.0)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const out = interpolate(frame, [sec(3.7), sec(4.3)], [1, 0], clamp);
  if (out <= 0) return null;
  return (
    <div style={{ position: 'absolute', top: 300, width: W, textAlign: 'center', opacity: out, transform: `translateY(${(1 - out) * -20}px)` }}>
      <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 30, letterSpacing: 10, color: C.dim, opacity: a, transform: `translateY(${(1 - a) * 16}px)` }}>
        COMO FUNCIONA UM
      </div>
      <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 132, letterSpacing: 6, color: C.white, lineHeight: 1.05, opacity: b, transform: `translateY(${(1 - b) * 26}px)`, textShadow: '0 6px 30px rgba(0,0,0,0.7)' }}>
        MOTOR V8
      </div>
      <div style={{ margin: '10px auto 0', width: 320 * line, height: 4, background: C.orange, boxShadow: `0 0 18px ${C.orange}` }} />
    </div>
  );
};

const EndTitle: React.FC = () => {
  const frame = useCurrentFrame();
  const f0 = sec(26.4);
  if (frame < f0) return null;
  const l = frame - f0;
  const wipe = interpolate(l, [0, 20], [0, 100], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const sub = interpolate(l, [14, 32], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const spacing = interpolate(l, [14, 60], [26, 12], { ...clamp, easing: Easing.out(Easing.cubic) });
  const scale = interpolate(l, [0, 90], [1.04, 1.0], clamp);
  const streak = interpolate(l, [0, 26], [-30, 130], clamp);
  return (
    <div style={{ position: 'absolute', top: 250, width: W, textAlign: 'center', transform: `scale(${scale})` }}>
      <div style={{ position: 'relative', display: 'inline-block', clipPath: `inset(0 ${100 - wipe}% 0 0)` }}>
        <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 230, letterSpacing: 14, color: C.white, lineHeight: 1, textShadow: '0 10px 40px rgba(0,0,0,0.6)' }}>V8</div>
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${streak}%`,
            width: 90,
            background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.75), rgba(255,255,255,0))',
            mixBlendMode: 'overlay',
          }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, marginTop: 6, opacity: sub }}>
        <div style={{ width: 70 * sub, height: 3, background: C.orange }} />
        <div style={{ fontFamily: COND, fontWeight: 600, fontSize: 50, letterSpacing: spacing, color: C.white }}>ENGENHARIA EM MOVIMENTO</div>
        <div style={{ width: 70 * sub, height: 3, background: C.orange }} />
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ composition
export const V8Preview: React.FC<{ framesDir?: string }> = ({ framesDir = 'frames' }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Plate dir={framesDir} />
      <Vignette />
      {CALLOUTS.map((s, i) => (
        <Callout key={i} s={s} />
      ))}
      <ForcePath />
      <PhasePanel />
      <FiringStrip />
      <Kicker />
      <EndTitle />
      <Grain />
      <Audio src={staticFile('mix.wav')} />
    </AbsoluteFill>
  );
};
