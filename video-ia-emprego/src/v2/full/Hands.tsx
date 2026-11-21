import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {clamp, inOutCubic, lerp, outCubic, outExpo, prog, seeded, smooth, spring} from '../../lib/ease';
import {TimeProvider, useT} from '../../lib/time';
import {TaskCard} from '../AgentFlow';
import {WorkerScene} from '../Worker';

// ============================================================ CENAS J/K
// "Mas talvez a pergunta mais importante não seja se a IA vai roubar seu emprego…
//  e sim como você vai trabalhar com ela."
export const J0 = 22.95;
export const K_MORPH = 28.92;
export const K_CALL = 30.0;
export const K_END = 31.75;

// mão vista de cima, punho na origem, apontando para +x
const Hand: React.FC<{x: number; y: number; rot: number; s: number; open: number; wire?: boolean; curl?: number}> = ({x, y, rot, s, open, wire, curl = 0}) => {
  const fingers = [
    {y: -27, len: 70, w: 23},
    {y: -9, len: 80, w: 23},
    {y: 9, len: 74, w: 22},
    {y: 26, len: 58, w: 19},
  ];
  const skin = '#8a5a3d';
  const stroke = wire ? '#7ff0ff' : skin;
  const fingerPaths = fingers.map((f, i) => {
    const spread = (i - 1.5) * 4 * open;
    const len = f.len * (1 - 0.35 * curl);
    const x0 = 108, y0 = f.y;
    const x1 = x0 + len * Math.cos((spread * Math.PI) / 180);
    const y1 = y0 + len * Math.sin((spread * Math.PI) / 180) + curl * 14;
    return {x0, y0, x1, y1, w: f.w};
  });
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      {!wire ? (
        <>
          <line x1={-420} y1={26} x2={0} y2={0} stroke="#2f3d52" strokeWidth={92} strokeLinecap="round" />
          <line x1={-60} y1={4} x2={0} y2={0} stroke={skin} strokeWidth={70} strokeLinecap="round" />
          <path d="M-8 -38 C40 -48 92 -44 112 -32 L114 32 C92 44 40 46 -8 36 Z" fill={skin} />
          {fingerPaths.map((f, i) => (
            <line key={i} x1={f.x0} y1={f.y0} x2={f.x1} y2={f.y1} stroke={skin} strokeWidth={f.w} strokeLinecap="round" />
          ))}
          <line x1={46} y1={34} x2={92} y2={64} stroke="#7a4d33" strokeWidth={25} strokeLinecap="round" />
          {/* luz do refletor no dorso */}
          <path d="M10 -30 C50 -38 90 -34 108 -24" stroke="#d8a27a" strokeWidth={6} fill="none" opacity={0.6} strokeLinecap="round" />
          <line x1={-400} y1={-14} x2={-20} y2={-34} stroke="#5a7098" strokeWidth={5} opacity={0.6} strokeLinecap="round" />
        </>
      ) : (
        <g fill="none" stroke={stroke} strokeLinecap="round">
          <line x1={-420} y1={26} x2={0} y2={0} strokeWidth={2} opacity={0.5} />
          <line x1={-420} y1={-18} x2={-10} y2={-30} strokeWidth={2} opacity={0.5} />
          <line x1={-420} y1={70} x2={-10} y2={32} strokeWidth={2} opacity={0.5} />
          <path d="M-8 -38 C40 -48 92 -44 112 -32 L114 32 C92 44 40 46 -8 36 Z" strokeWidth={2.5} fill="#59e1ff" fillOpacity={0.08} />
          {[-20, 0, 20].map((yy) => (
            <line key={yy} x1={0} y1={yy} x2={110} y2={yy * 0.9} strokeWidth={1.2} opacity={0.6} />
          ))}
          {[30, 60, 90].map((xx) => (
            <line key={xx} x1={xx} y1={-42} x2={xx} y2={42} strokeWidth={1.2} opacity={0.6} />
          ))}
          {fingerPaths.map((f, i) => (
            <g key={i}>
              <line x1={f.x0} y1={f.y0 - f.w / 2 + 2} x2={f.x1} y2={f.y1 - f.w / 2 + 2} strokeWidth={2.2} />
              <line x1={f.x0} y1={f.y0 + f.w / 2 - 2} x2={f.x1} y2={f.y1 + f.w / 2 - 2} strokeWidth={2.2} />
              <circle cx={f.x1} cy={f.y1} r={f.w / 2} strokeWidth={2.2} />
              <circle cx={(f.x0 + f.x1) / 2} cy={(f.y0 + f.y1) / 2} r={3} fill="#dff8ff" />
            </g>
          ))}
          <line x1={46} y1={24} x2={92} y2={64} strokeWidth={2.2} />
          <line x1={34} y1={42} x2={80} y2={78} strokeWidth={2.2} />
          <circle cx={0} cy={0} r={5} fill="#dff8ff" />
        </g>
      )}
    </g>
  );
};

const Badge: React.FC<{t: number}> = ({t}) => (
  <div style={{width: 360, height: 230, borderRadius: 22, background: 'linear-gradient(160deg,#f3f6fa,#cfd8e4)', boxShadow: '0 30px 60px rgba(0,0,0,0.6)', position: 'relative', overflow: 'hidden', fontFamily: 'Inter Tight'}}>
    <div style={{position: 'absolute', left: 0, top: 0, right: 0, height: 56, background: '#1d2b44'}} />
    <div style={{position: 'absolute', left: 150, top: 14, width: 60, height: 14, borderRadius: 7, background: '#0b1220'}} />
    <div style={{position: 'absolute', left: 28, top: 80, width: 104, height: 120, borderRadius: 14, background: '#2a3a52', overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 30, top: 22, width: 44, height: 50, borderRadius: 22, background: '#8a5a3d'}} />
      <div style={{position: 'absolute', left: 24, top: 10, width: 56, height: 30, borderRadius: 20, background: '#120d0b'}} />
      <div style={{position: 'absolute', left: 14, top: 78, width: 76, height: 60, borderRadius: 30, background: '#2f3d52', border: '3px solid #3d5070'}} />
    </div>
    <div style={{position: 'absolute', left: 152, top: 92, fontSize: 30, fontWeight: 800, color: '#162036'}}>CRACHÁ</div>
    <div style={{position: 'absolute', left: 152, top: 132, fontFamily: 'JetBrains Mono', fontSize: 18, letterSpacing: 2, color: '#4a5a74'}}>COLABORADOR</div>
    <div style={{position: 'absolute', left: 152, top: 170, width: 170, height: 10, borderRadius: 5, background: '#9aa8bc'}} />
  </div>
);

// peças de quebra-cabeça (humano + IA) que se encaixam
const PUZZLE_L = 'M0 0 H120 V60 C140 50 160 60 160 80 C160 100 140 110 120 100 V160 H0 Z';
const PUZZLE_R = 'M120 0 H240 V160 H120 V100 C140 110 160 100 160 80 C160 60 140 50 120 60 Z';

export const HandsScene: React.FC = () => {
  const t = useT();
  const dust = useMemo(() => {
    const r = seeded(44);
    return Array.from({length: 40}, () => ({x: 340 + r() * 400, y: 300 + r() * 1000, s: 1 + r() * 2.5, ph: r() * 6}));
  }, []);
  if (t < J0 || t > K_END) return null;
  const inn = smooth(prog(t, J0, J0 + 0.45));
  const push = 1.45 + 0.14 * inOutCubic(prog(t, 23.2, 28.4));
  // mão da IA (direita) e mão humana (esquerda)
  const ai = inOutCubic(prog(t, 25.9, 27.6));
  const hu = inOutCubic(prog(t, 27.45, 28.4));
  const morph = outExpo(prog(t, K_MORPH, K_MORPH + 0.55));
  const join = inOutCubic(prog(t, 29.25, 29.75));
  const flash = Math.exp(-Math.pow((t - 29.8) / 0.08, 2));
  const toCall = inOutCubic(prog(t, K_CALL - 0.15, K_CALL + 0.35));
  const hold = 1 - toCall;
  const badgeY = lerp(1230, 900, morph);
  const badgeS = lerp(1, 1.55, morph);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{opacity: inn * hold, transform: `translateY(-170px) scale(${push})`, transformOrigin: '540px 1120px'}}>
        <AbsoluteFill style={{background: '#030406'}} />
        {/* bokeh de fundo */}
        <svg width={1080} height={1920} style={{position: 'absolute'}}>
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <circle key={k} cx={120 + k * 170} cy={520 + (k % 2) * 140} r={40 + k * 6} fill={k % 2 ? '#59e1ff' : '#ffb648'} opacity={0.06} filter="blur(14px)" />
          ))}
        </svg>
        {/* mesa em perspectiva iluminada pelo refletor */}
        <svg width={1080} height={1920} style={{position: 'absolute'}}>
          <defs>
            <radialGradient id="pool" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#ffe2b8" stopOpacity="0.55" />
              <stop offset="0.6" stopColor="#ffb648" stopOpacity="0.12" />
              <stop offset="1" stopColor="#000" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="cone2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff2da" stopOpacity="0.16" />
              <stop offset="1" stopColor="#fff2da" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="deskJ" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1a120c" />
              <stop offset="1" stopColor="#2c1e14" />
            </linearGradient>
          </defs>
          <path d="M140 1000 L940 1000 L1300 1920 L-220 1920 Z" fill="url(#deskJ)" />
          {[0, 1, 2, 3, 4, 5, 6].map((k) => (
            <path key={k} d={`M${200 + k * 110} 1000 L${-150 + k * 230} 1920`} stroke="#120c08" strokeWidth={2} opacity={0.6} />
          ))}
          <ellipse cx={540} cy={1240} rx={430} ry={190} fill="url(#pool)" />
          <polygon points="470,0 610,0 980,1240 100,1240" fill="url(#cone2)" />
          {dust.map((d, i) => (
            <circle key={i} cx={d.x + Math.sin(t * 0.6 + d.ph) * 14} cy={d.y - ((t * 14) % 200)} r={d.s} fill="#fff2da" opacity={0.25 + 0.2 * Math.sin(t * 2 + d.ph)} />
          ))}
        </svg>
        {/* crachá -> painel compartilhado */}
        <div style={{position: 'absolute', left: 540 - 180, top: badgeY - 115, width: 360, height: 230, perspective: 900}}>
          <div style={{transform: `rotateX(${lerp(48, 0, morph)}deg) scale(${badgeS})`, transformOrigin: 'center', position: 'relative'}}>
            <div style={{opacity: 1 - prog(morph, 0, 0.35)}}>
              <Badge t={t} />
            </div>
            {morph > 0.05 ? (
              <div style={{position: 'absolute', inset: 0, borderRadius: 22, background: 'linear-gradient(160deg, rgba(20,34,60,0.95), rgba(8,14,28,0.95))', border: '2px solid rgba(255,255,255,0.35)', boxShadow: `0 0 ${60 + 120 * flash}px rgba(${lerp(89, 255, join)},${lerp(225, 230, join)},255,0.5)`, opacity: prog(morph, 0.2, 0.6), overflow: 'hidden'}}>
                <svg width={360} height={230} viewBox="0 0 360 230">
                  <g transform={`translate(${60 - 70 * (1 - join)} 35)`}>
                    <path d={PUZZLE_L} fill="#ffb648" opacity={0.95} />
                  </g>
                  <g transform={`translate(${60 + 70 * (1 - join)} 35)`}>
                    <path d={PUZZLE_R} fill="#59e1ff" opacity={0.95} />
                  </g>
                  {join > 0.95 ? <path d={`M60 35 h240 v160 h-240 Z`} fill="#fff" opacity={0.25 * flash} /> : null}
                </svg>
              </div>
            ) : null}
          </div>
        </div>
        {/* mãos */}
        <svg width={1080} height={1920} style={{position: 'absolute', overflow: 'visible'}}>
          <g filter={undefined} opacity={clamp(ai * 3)}>
            <g filter="url(#aiGlow)">
              <Hand x={lerp(1500, 760 + 30 * morph, ai)} y={lerp(1450, 1180 - 260 * morph, ai)} rot={180 + lerp(-25, -8, ai)} s={1.05} open={1 - 0.5 * join} wire curl={0.2 * join} />
            </g>
          </g>
          <defs>
            <filter id="aiGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g opacity={clamp(hu * 3)}>
            <Hand x={lerp(-420, 320 - 30 * morph, hu)} y={lerp(1520, 1220 - 280 * morph, hu)} rot={lerp(-20, -6, hu)} s={1.05} open={1 - 0.5 * join} curl={0.2 * join} />
          </g>
        </svg>
      </AbsoluteFill>
      {/* retorno do protagonista, agora trabalhando junto com a IA */}
      {t > K_CALL - 0.2 ? (
        <AbsoluteFill style={{opacity: toCall, transform: `scale(${lerp(1.08, 1.0, toCall) + 0.03 * smooth(prog(t, K_CALL, K_END))})`, transformOrigin: '380px 900px'}}>
          <WorkerScene together />
          <AbsoluteFill style={{background: 'radial-gradient(circle at 75% 45%, rgba(89,225,255,0.14), rgba(0,0,0,0) 55%)'}} />
          {[0, 1, 2, 3].map((i) => {
            const bob = Math.sin(t * 1.4 + i * 1.3) * 10;
            const e = outCubic(prog(t, K_CALL + 0.1 + i * 0.08, K_CALL + 0.5 + i * 0.08));
            return (
              <div key={i} style={{position: 'absolute', left: 620 + (i % 2) * 40, top: 470 + i * 190 + bob, transform: `scale(${0.5 * e})`, transformOrigin: '0 0', opacity: e}}>
                <TimeProvider t={t}>
                  <TaskCard i={i} t={t} ta={K_CALL + 0.3 + i * 0.25} active={0.4} />
                </TimeProvider>
              </div>
            );
          })}
          <svg width={1080} height={1920} style={{position: 'absolute'}}>
            {[0, 1, 2, 3].map((i) => (
              <path key={i} d={`M560 980 C590 ${900 + i * 40} 600 ${540 + i * 190} 620 ${540 + i * 190}`} stroke="#7ff0ff" strokeWidth={2} fill="none" strokeDasharray="6 10" strokeDashoffset={-t * 60} opacity={0.5 * outCubic(prog(t, K_CALL + 0.3, K_CALL + 0.7))} />
            ))}
          </svg>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

export const _h = {spring, lerp};
