import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {CX, CY, WorldItem, ZPX} from '../components/Depth';
import {camZ, project, T_GLASS} from '../lib/cameraCore';
import {clamp, hash, inCubic, outCubic, outExpo, prog, seeded, smooth, spring} from '../lib/ease';
import {useT} from '../lib/time';
import {Card, CardKind} from './Cards';

const MY = -200; // centro da tela do monitor no mundo
const fog = (d: number, near = 1, far = 26) => clamp(1 - (d - near) / (far - near));

// ---------------------------------------------------------------- fundo do espaço digital
export const UIBackground: React.FC = () => {
  const t = useT();
  const cz = camZ(t);
  const tunnelVis = smooth((cz - 5.5) / 5);
  const parts = useMemo(() => {
    const r = seeded(21);
    return Array.from({length: 230}, () => ({
      X: -900 + r() * 1900,
      Y: MY - 1500 + r() * 2600,
      Z: 10.4 + r() * 32,
      c: r() > 0.85 ? '#ffd08a' : r() > 0.4 ? '#8fe9ff' : '#ffffff',
      s: 1 + r() * 2.4,
    }));
  }, []);
  const rects = [];
  for (let i = 0; i < 20; i++) {
    const Z = 10.6 + i * 1.55;
    const a = project(-820, MY - 1450, Z, t);
    const b = project(880, MY + 1050, Z, t);
    if (a.d < 0.08) continue;
    const op = fog(a.d, 0.4, 24) * tunnelVis * 0.5;
    if (op < 0.01) continue;
    rects.push(
      <rect key={i} x={CX + a.sx} y={CY + a.sy} width={b.sx - a.sx} height={b.sy - a.sy} fill="none" stroke="#59e1ff" strokeOpacity={op} strokeWidth={1.4} />,
    );
  }
  // linhas longitudinais (piso e teto do túnel)
  const lines = [];
  if (tunnelVis > 0.01) {
    const zNear = Math.max(cz + 0.08, 10.6);
    const zFar = 10.6 + 19 * 1.55;
    for (let i = 0; i <= 8; i++) {
      const X = -820 + (i * 1700) / 8;
      for (const Y of [MY - 1450, MY + 1050]) {
        const a = project(X, Y, zNear, t);
        const b = project(X, Y, zFar, t);
        lines.push(<line key={`${i}-${Y}`} x1={CX + a.sx} y1={CY + a.sy} x2={CX + b.sx} y2={CY + b.sy} stroke="url(#tl)" strokeWidth={1.3} opacity={tunnelVis * 0.55} />);
      }
    }
    for (let i = 1; i < 6; i++) {
      const Y = MY - 1450 + (i * 2500) / 6;
      for (const X of [-820, 880]) {
        const a = project(X, Y, zNear, t);
        const b = project(X, Y, zFar, t);
        lines.push(<line key={`v${i}-${X}`} x1={CX + a.sx} y1={CY + a.sy} x2={CX + b.sx} y2={CY + b.sy} stroke="url(#tl)" strokeWidth={1.3} opacity={tunnelVis * 0.45} />);
      }
    }
  }
  const dt = 0.05;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 70% 45% at 50% 42%, #0d2244 0%, #061026 45%, #02050c 100%)'}} />
      <AbsoluteFill
        style={{
          opacity: 0.35 * (1 - tunnelVis * 0.5),
          backgroundImage: 'radial-gradient(rgba(120,200,255,0.35) 1px, transparent 1.4px)',
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(ellipse 60% 40% at 50% 40%, #000 0%, transparent 80%)',
        }}
      />
      <svg width={1080} height={1920} style={{position: 'absolute'}}>
        <defs>
          <linearGradient id="tl" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#59e1ff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#59e1ff" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        {rects}
        {lines}
        {parts.map((p, i) => {
          const a = project(p.X, p.Y, p.Z, t);
          if (a.d < 0.12) return null;
          const b = project(p.X, p.Y, p.Z, t - dt);
          const op = fog(a.d, 0.3, 30) * (0.35 + 0.65 * tunnelVis);
          const w = Math.min(7, p.s * a.k * 0.9);
          const bx = b.d > 0.12 ? b.sx : a.sx;
          const by = b.d > 0.12 ? b.sy : a.sy;
          return (
            <line key={i} x1={CX + bx} y1={CY + by} x2={CX + a.sx + 0.01} y2={CY + a.sy} stroke={p.c} strokeWidth={w} strokeLinecap="round" opacity={op * 0.8} />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- HUD da tela (barra superior/inferior)
export const ScreenHUD: React.FC = () => {
  const t = useT();
  const n = Math.floor(14 * outCubic(prog(t, 0.3, 2.5)));
  const hide = 1 - smooth(prog(t, 3.2, 3.8));
  const mono: React.CSSProperties = {fontFamily: 'JetBrains Mono', fontSize: 30, letterSpacing: 2, color: '#8fdcff', whiteSpace: 'nowrap'};
  const blink = Math.floor(t * 2.5) % 2 === 0;
  return (
    <>
      <WorldItem X={0} Y={MY - 208} Z={10.02} width={780} base={1560} baseH={60} style={{opacity: hide}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 60, borderBottom: '1.5px solid rgba(89,225,255,0.18)'}}>
          <div style={mono}>
            <span style={{color: '#59e1ff', opacity: blink ? 1 : 0.4}}>●</span> AGENTE IA · ATIVO
          </div>
          <div style={{...mono, color: '#cfe9ff'}}>AMANHÃ · 07:00</div>
        </div>
      </WorldItem>
      <WorldItem X={0} Y={MY + 208} Z={10.02} width={780} base={1560} baseH={60} style={{opacity: hide}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 60}}>
          <div style={mono}>TAREFAS CONCLUÍDAS</div>
          <div style={{...mono, color: '#ffffff', fontWeight: 700}}>{String(n).padStart(2, '0')}/14</div>
        </div>
      </WorldItem>
    </>
  );
};

// ---------------------------------------------------------------- orbe de partículas (presença da IA)
export const ORB = {X: 0, Y: MY - 40, Z: 11};
export const Orb: React.FC = () => {
  const t = useT();
  const pts = useMemo(() => {
    const N = 420;
    const g = Math.PI * (3 - Math.sqrt(5));
    return Array.from({length: N}, (_, i) => {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = g * i;
      return {x: Math.cos(th) * r, y, z: Math.sin(th) * r, h: hash(i)};
    });
  }, []);
  const wake = spring(prog(t, 2.54, 3.3), 6, 9);
  const R = 58 + 70 * wake + 6 * Math.sin(t * 2.2);
  const yaw = t * 0.8 + wake * 1.2;
  const pitch = 0.45;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const c = project(ORB.X, ORB.Y, ORB.Z, t);
  const shock = prog(t, 2.56, 3.4);
  const dots = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const n = 1 + 0.09 * Math.sin(p.y * 6 + t * 3 + p.h * 2) * (0.4 + wake);
    let x = p.x * n, y = p.y * n, z = p.z * n;
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const y2 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    const X = ORB.X + x1 * R;
    const Y = ORB.Y + y2 * R;
    const Z = ORB.Z + z2 * R * ZPX;
    const a = project(X, Y, Z, t);
    if (a.d < 0.06) continue;
    const front = 0.5 - z2 * 0.5;
    const rad = Math.min(14, (1.5 + 1.6 * front) * a.k * 0.9);
    dots.push(<circle key={i} cx={CX + a.sx} cy={CY + a.sy} r={rad} fill={p.h > 0.93 ? '#ffd08a' : '#bff4ff'} opacity={0.25 + 0.75 * front} />);
  }
  const ringR = R * c.k * 1.25;
  const fadeNear = clamp((c.d - 1.2) / 3.5);
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <defs>
        <radialGradient id="orbcore">
          <stop offset="0" stopColor="#e9fbff" stopOpacity="0.95" />
          <stop offset="0.25" stopColor="#59e1ff" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#2f7bff" stopOpacity="0.15" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <filter id="orbglow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <circle cx={CX + c.sx} cy={CY + c.sy} r={R * c.k * 1.6} fill="url(#orbcore)" opacity={(0.55 + 0.45 * wake) * fadeNear} style={{mixBlendMode: 'screen'}} />
      {shock > 0 && shock < 1 ? (
        <circle cx={CX + c.sx} cy={CY + c.sy} r={ringR * (1 + 2.6 * outCubic(shock))} fill="none" stroke="#9fefff" strokeWidth={3 * (1 - shock) * c.k} opacity={(1 - shock) * 0.9} />
      ) : null}
      <ellipse cx={CX + c.sx} cy={CY + c.sy} rx={ringR * 1.05} ry={ringR * 0.28} fill="none" stroke="#59e1ff" strokeWidth={1.4} opacity={0.5 * fadeNear} transform={`rotate(${-18 + t * 14} ${CX + c.sx} ${CY + c.sy})`} />
      <ellipse cx={CX + c.sx} cy={CY + c.sy} rx={ringR * 0.92} ry={ringR * 0.18} fill="none" stroke="#ffd08a" strokeWidth={1} opacity={0.35 * fadeNear} transform={`rotate(${32 - t * 10} ${CX + c.sx} ${CY + c.sy})`} />
      <g filter="url(#orbglow)" opacity={0.9}>{dots}</g>
      <g>{dots}</g>
    </svg>
  );
};

// ---------------------------------------------------------------- mensagem digitada pela IA
const typed = (s: string, t: number, t0: number, cps: number) => s.slice(0, Math.max(0, Math.floor((t - t0) * cps)));
export const Message: React.FC = () => {
  const t = useT();
  const a = 'Bom dia.';
  const b = 'Já fiz o seu trabalho.';
  const ta = typed(a, t, 0.55, 28);
  const tb = typed(b, t, 1.12, 26);
  const typingB = t > 1.12 && tb.length < b.length;
  const caret = Math.floor(t * 4) % 2 === 0 || typingB;
  const out = smooth(prog(t, 3.1, 3.6));
  const shift = 40 * outCubic(prog(t, 2.54, 3.0));
  return (
    <WorldItem X={0} Y={MY + 100 + shift} Z={10.08} width={600} base={1200} baseH={240} style={{opacity: 1 - out}}>
      <div style={{textAlign: 'center', fontFamily: 'Inter Tight', color: '#fff'}}>
        <div style={{fontSize: 62, fontWeight: 500, color: '#9fb9d6', height: 80}}>{ta}</div>
        <div style={{fontSize: 84, fontWeight: 800, letterSpacing: -1.5, height: 110, textShadow: '0 0 30px rgba(89,225,255,0.45)'}}>
          {tb}
          <span style={{color: '#59e1ff', opacity: caret && t > 0.5 ? 1 : 0}}>▍</span>
        </div>
      </div>
    </WorldItem>
  );
};

// ---------------------------------------------------------------- cards dentro da tela e no espaço
type CardDef = {kind: CardKind; X: number; Y: number; Z: number; w: number; start: number; done: number; rot?: number};
const SCREEN_CARDS: CardDef[] = [
  {kind: 'email', X: -298, Y: MY - 92, Z: 10.22, w: 196, start: 0.25, done: 1.7},
  {kind: 'planilha', X: -298, Y: MY + 72, Z: 10.38, w: 196, start: 0.35, done: 1.92},
  {kind: 'relatorio', X: 298, Y: MY - 92, Z: 10.3, w: 196, start: 0.3, done: 2.14},
  {kind: 'agenda', X: 298, Y: MY + 72, Z: 10.46, w: 196, start: 0.4, done: 2.36},
];
const KINDS: CardKind[] = ['email', 'planilha', 'relatorio', 'codigo', 'agenda', 'atendimento', 'apresentacao', 'contrato'];
const PATH_CARDS: CardDef[] = [
  {kind: 'codigo', X: -210, Y: MY - 250, Z: 11.7, w: 240, start: 3.6, done: 4.3, rot: -4},
  {kind: 'atendimento', X: 230, Y: MY + 60, Z: 12.4, w: 240, start: 3.6, done: 4.35, rot: 3},
  {kind: 'apresentacao', X: -190, Y: MY + 210, Z: 13.2, w: 250, start: 3.7, done: 4.4, rot: 2},
  {kind: 'contrato', X: 250, Y: MY - 300, Z: 14.0, w: 240, start: 3.7, done: 4.45, rot: -3},
  {kind: 'email', X: -260, Y: MY - 60, Z: 14.9, w: 240, start: 3.8, done: 4.5, rot: 4},
  {kind: 'planilha', X: 200, Y: MY + 240, Z: 15.7, w: 240, start: 3.8, done: 4.55, rot: -2},
  {kind: 'relatorio', X: -150, Y: MY - 330, Z: 16.4, w: 230, start: 3.9, done: 4.6, rot: 3},
];
// "parede" de tarefas sendo concluídas em cascata durante "seu trabalho"
const WALL_CARDS: CardDef[] = (() => {
  const r = seeded(77);
  const out: CardDef[] = [];
  const order = [5, 2, 9, 0, 7, 11, 3, 8, 1, 10, 4, 6];
  let i = 0;
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 3; col++) {
      out.push({
        kind: KINDS[(row * 3 + col + 3) % KINDS.length],
        X: 40 + (col - 1) * 305 + (r() - 0.5) * 40,
        Y: MY - 25 + (row - 1.5) * 225 + (r() - 0.5) * 30,
        Z: 23.6 + (r() - 0.5) * 1.6,
        w: 255,
        start: 4.1 + r() * 0.2,
        done: 4.6 + order[i] * 0.04,
        rot: (r() - 0.5) * 6,
      });
      i++;
    }
  return out;
})();
const SPACE_CARDS: CardDef[] = [...PATH_CARDS, ...WALL_CARDS];


export const DeepCards: React.FC<{zMin: number; zMax: number}> = ({zMin, zMax}) => {
  const t = useT();
  const cz = camZ(t);
  const deepVis = smooth((cz - 3.2) / 5);
  const dim = 1 - 0.7 * smooth(prog(t, 5.05, 5.35));
  return (
    <>
      {SPACE_CARDS.filter((c) => c.Z >= zMin && c.Z < zMax)
        .sort((a, b) => b.Z - a.Z)
        .map((c, i) => {
          const d = c.Z - cz;
          return (
            <WorldItem key={`s${i}`} X={c.X} Y={c.Y} Z={c.Z} width={c.w} base={520} baseH={340} rotate={c.rot} style={{opacity: deepVis * fog(d, 2, 22) * (c.Z > 21.5 ? dim : 1), filter: c.Z > 21.5 && dim < 0.95 ? `blur(${(1 - dim) * 6}px)` : undefined}}>
              <Card kind={c.kind} t={t} start={c.start} done={c.done} />
            </WorldItem>
          );
        })}
    </>
  );
};

export const ScreenCards: React.FC = () => {
  const t = useT();
  return (
    <>
      {SCREEN_CARDS.map((c, i) => {
        const slide = outCubic(prog(t, 2.54, 3.1));
        const X = c.X + Math.sign(c.X) * 70 * slide;
        return (
          <WorldItem key={i} X={X} Y={c.Y} Z={c.Z} width={c.w} base={520} baseH={340}>
            <Card kind={c.kind} t={t} start={c.start} done={c.done} glow={0.6} />
          </WorldItem>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------- "MELHOR QUE VOCÊ."
export const BETTER = {X: 40, Y: MY - 40, Z: 21};
const Letters: React.FC<{text: string; t: number; t0: number; stagger: number; style: React.CSSProperties}> = ({text, t, t0, stagger, style}) => (
  <div style={{display: 'flex', justifyContent: 'center', overflow: 'hidden', paddingBottom: 8}}>
    {text.split('').map((ch, i) => {
      const u = outExpo(prog(t, t0 + i * stagger, t0 + i * stagger + 0.45));
      return (
        <span key={i} style={{...style, display: 'inline-block', transform: `translateY(${(1 - u) * 105}%)`, whiteSpace: 'pre'}}>
          {ch}
        </span>
      );
    })}
  </div>
);

export const BetterThanYou: React.FC = () => {
  const t = useT();
  if (t < 5.05 || t > 6.3) return null;
  const outFade = 1 - smooth(prog(t, 6.02, 6.13));
  const slam = outExpo(prog(t, 5.63, 5.85));
  const g = t > 5.63 && t < 5.76;
  const gl = g ? (hash(Math.floor(t * 30)) - 0.5) * 26 : 0;
  const ia = outExpo(prog(t, 5.3, 5.62));
  const voce = outCubic(prog(t, 5.3, 6.05)) * 0.36;
  const hud = smooth(prog(t, 5.22, 5.45));
  const big: React.CSSProperties = {fontFamily: 'Archivo Variable', fontWeight: 900, fontStretch: '125%', color: '#fff', lineHeight: 0.92};
  return (
    <WorldItem X={BETTER.X} Y={BETTER.Y} Z={BETTER.Z} width={330} base={1000} baseH={720} style={{opacity: outFade}}>
      <div style={{width: 1000, height: 720, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
        <Letters text="MELHOR" t={t} t0={5.1} stagger={0.03} style={{...big, fontSize: 188, letterSpacing: -4, textShadow: '0 0 40px rgba(89,225,255,0.35)'}} />
        <div style={{display: 'flex', alignItems: 'baseline', gap: 28, marginTop: 6}}>
          <Letters text="QUE" t={t} t0={5.5} stagger={0.03} style={{...big, fontSize: 118, color: '#cfe9ff'}} />
          <div style={{position: 'relative', opacity: t > 5.62 ? 1 : 0, transform: `scale(${1.7 - 0.7 * slam})`, transformOrigin: 'center'}}>
            {g ? (
              <>
                <span style={{...big, fontSize: 118, color: '#ff2e5a', position: 'absolute', left: gl, top: 0, mixBlendMode: 'screen'}}>VOCÊ.</span>
                <span style={{...big, fontSize: 118, color: '#2ee6ff', position: 'absolute', left: -gl, top: 0, mixBlendMode: 'screen'}}>VOCÊ.</span>
              </>
            ) : null}
            <span style={{...big, fontSize: 118, color: '#ffb648', position: 'relative', textShadow: '0 0 36px rgba(255,170,60,0.55)'}}>VOCÊ.</span>
          </div>
        </div>
        <div style={{width: 760, marginTop: 52, opacity: hud, fontFamily: 'JetBrains Mono', color: '#8fdcff', fontSize: 24, letterSpacing: 3}}>
          <div style={{marginBottom: 14, opacity: 0.8}}>DESEMPENHO · MESMA TAREFA</div>
          {[
            {l: 'IA', v: ia, c: '#59e1ff'},
            {l: 'VOCÊ', v: voce, c: '#ffb648'},
          ].map((b) => (
            <div key={b.l} style={{display: 'flex', alignItems: 'center', gap: 18, marginBottom: 12}}>
              <div style={{width: 96, color: b.c, fontWeight: 700}}>{b.l}</div>
              <div style={{flex: 1, height: 14, borderRadius: 7, background: 'rgba(160,200,235,0.12)'}}>
                <div style={{width: `${b.v * 100}%`, height: '100%', borderRadius: 7, background: b.c, boxShadow: `0 0 18px ${b.c}`}} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </WorldItem>
  );
};

// ---------------------------------------------------------------- portal para o mundo 3D
export const PORTAL = {X: 20, Y: MY - 20, Z: 30, w: 380, h: 660};
export const portalOpen = (t: number) => outExpo(prog(t, 5.9, 6.22));
export const portalRect = (t: number) => {
  const a = project(PORTAL.X - PORTAL.w / 2, PORTAL.Y - PORTAL.h / 2, PORTAL.Z, t);
  const b = project(PORTAL.X + PORTAL.w / 2, PORTAL.Y + PORTAL.h / 2, PORTAL.Z, t);
  const o = portalOpen(t);
  const cyy = (a.sy + b.sy) / 2;
  const hh = ((b.sy - a.sy) / 2) * Math.max(0.004, o);
  return {x0: CX + a.sx, x1: CX + b.sx, y0: CY + cyy - hh, y1: CY + cyy + hh, d: a.d, o};
};

export const PortalFrame: React.FC = () => {
  const t = useT();
  if (t < 5.85) return null;
  const r = portalRect(t);
  if (r.d < 0.1) return null;
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  const flash = 1 - prog(t, 5.95, 6.2);
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
      <defs>
        <filter id="pglow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>
      <rect x={r.x0} y={r.y0} width={w} height={h} fill="none" stroke="#9fefff" strokeWidth={10} filter="url(#pglow)" opacity={0.9} />
      <rect x={r.x0} y={r.y0} width={w} height={h} fill="none" stroke="#e9fbff" strokeWidth={2.5} />
      <rect x={r.x0} y={r.y0} width={w} height={h} fill="#dff8ff" opacity={0.6 * flash * flash} />
    </svg>
  );
};

export const uiSpaceVisible = (t: number) => t < 6.4;
export const _u = {inCubic, T_GLASS};
