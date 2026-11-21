import React from 'react';
import {clamp, outCubic, outExpo, prog, spring} from '../lib/ease';

// Celular (sem marca) desenhado em 680×1400 px; é reduzido na cena e ampliado pela câmera,
// então continua nítido em close.
export const PH_W = 680;
export const PH_H = 1400;
export const NOTIF = {x: 40, y: 452, w: 600, h: 300, r: 54}; // retângulo do cartão no layout do celular

export const T_BUZZ = 0.05;
export const T_NOTIF = 1.0;

export const AppIcon: React.FC<{size: number; glow?: number}> = ({size, glow = 0}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.28,
      background: 'linear-gradient(145deg, #7ff0ff 0%, #2f9bff 55%, #2448d8 100%)',
      boxShadow: `0 0 ${30 * glow}px rgba(89,225,255,${0.8 * glow}), inset 0 2px 0 rgba(255,255,255,0.45)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}
  >
    <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 40 40">
      {/* glifo: três nós conectados (agente) */}
      <g stroke="#ffffff" strokeWidth={3.2} strokeLinecap="round" fill="none">
        <path d="M11 28 L20 12 L29 28" />
        <path d="M11 28 L29 28" opacity={0.6} />
      </g>
      <circle cx={20} cy={12} r={4.6} fill="#fff" />
      <circle cx={11} cy={28} r={4.6} fill="#fff" />
      <circle cx={29} cy={28} r={4.6} fill="#fff" />
    </svg>
  </div>
);

export const NotificationCard: React.FC<{t: number; glow?: number}> = ({t, glow = 0}) => {
  const shimmer = prog(t, T_NOTIF + 0.45, T_NOTIF + 1.25);
  return (
    <div
      style={{
        width: NOTIF.w,
        height: NOTIF.h,
        boxSizing: 'border-box',
        borderRadius: NOTIF.r,
        padding: '34px 36px',
        background: 'linear-gradient(160deg, rgba(58,78,112,0.78), rgba(22,32,54,0.86))',
        border: '1.5px solid rgba(190,225,255,0.28)',
        boxShadow: `0 24px 60px rgba(0,0,0,0.45), 0 0 ${60 * glow}px rgba(89,225,255,${0.35 * glow})`,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'Inter Tight',
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
        <AppIcon size={64} glow={glow} />
        <div style={{flex: 1, fontFamily: 'JetBrains Mono', fontSize: 23, letterSpacing: 2, color: 'rgba(210,232,255,0.8)', fontWeight: 700}}>ASSISTENTE IA</div>
        <div style={{fontSize: 24, color: 'rgba(210,232,255,0.6)'}}>agora</div>
      </div>
      <div style={{marginTop: 26, fontSize: 41, lineHeight: 1.12, fontWeight: 800, color: '#fff', letterSpacing: -0.4}}>
        SUAS TAREFAS FORAM AUTOMATIZADAS.
      </div>
      <div style={{marginTop: 12, fontSize: 28, color: 'rgba(205,225,245,0.78)', fontWeight: 500}}>Concluídas enquanto você dormia.</div>
      {shimmer > 0 && shimmer < 1 ? (
        <div
          style={{
            position: 'absolute',
            top: -40,
            bottom: -40,
            left: `${-40 + shimmer * 140}%`,
            width: '30%',
            background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.16), transparent)',
            transform: 'skewX(-18deg)',
          }}
        />
      ) : null}
    </div>
  );
};

// tela de bloqueio + notificação; wake: brilho da tela; t: tempo global
export const PhoneBody: React.FC<{t: number; hideNotif?: boolean}> = ({t, hideNotif}) => {
  const wake = outCubic(prog(t, T_BUZZ, T_BUZZ + 0.25));
  const n = prog(t, T_NOTIF, T_NOTIF + 0.6);
  const ny = (1 - spring(n, 6.5, 10)) * -190;
  const nOp = outCubic(prog(t, T_NOTIF, T_NOTIF + 0.22));
  const nBlur = (1 - outExpo(n)) * 10;
  const glow = Math.exp(-Math.pow((t - (T_NOTIF + 0.25)) / 0.35, 2));
  return (
    <div
      style={{
        width: PH_W,
        height: PH_H,
        borderRadius: 120,
        background: 'linear-gradient(150deg, #2a2f38, #0b0d12 40%, #15181f)',
        padding: 18,
        boxSizing: 'border-box',
        boxShadow: '0 40px 90px rgba(0,0,0,0.6), inset 0 0 0 3px rgba(255,255,255,0.08)',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 104,
          overflow: 'hidden',
          position: 'relative',
          background: '#02040a',
        }}
      >
        <div style={{position: 'absolute', inset: 0, opacity: wake}}>
          {/* papel de parede: aurora suave */}
          <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #071226 0%, #0b1d3d 55%, #061022 100%)'}} />
          <div style={{position: 'absolute', left: -120, top: 700, width: 900, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(47,155,255,0.55), transparent 65%)', filter: 'blur(30px)'}} />
          <div style={{position: 'absolute', left: 260, top: 980, width: 600, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(89,225,255,0.4), transparent 65%)', filter: 'blur(30px)'}} />
          {/* ilha / notch */}
          <div style={{position: 'absolute', left: 250, top: 26, width: 144, height: 42, borderRadius: 21, background: '#000'}} />
          <div style={{position: 'absolute', top: 150, width: '100%', textAlign: 'center', fontFamily: 'Inter Tight', color: 'rgba(225,238,255,0.85)', fontSize: 34, fontWeight: 600}}>segunda-feira</div>
          <div style={{position: 'absolute', top: 186, width: '100%', textAlign: 'center', fontFamily: 'Inter Tight', color: '#eef6ff', fontSize: 190, fontWeight: 300, letterSpacing: -6}}>07:00</div>
          {!hideNotif && t >= T_NOTIF ? (
            <div style={{position: 'absolute', left: NOTIF.x - 18, top: NOTIF.y - 18, transform: `translateY(${ny}px)`, opacity: nOp, filter: nBlur > 0.3 ? `blur(${nBlur}px)` : undefined}}>
              <NotificationCard t={t} glow={glow} />
            </div>
          ) : null}
          <div style={{position: 'absolute', bottom: 34, left: 230, width: 220, height: 9, borderRadius: 5, background: 'rgba(255,255,255,0.7)'}} />
        </div>
        {/* reflexo do vidro */}
        <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(125deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0) 35%)'}} />
      </div>
    </div>
  );
};

export const phoneBuzz = (t: number) => {
  const b1 = t > T_BUZZ && t < T_BUZZ + 0.42 ? Math.sin(t * 190) * (1 - (t - T_BUZZ) / 0.42) : 0;
  const b2 = t > T_NOTIF && t < T_NOTIF + 0.3 ? Math.sin(t * 190) * (1 - (t - T_NOTIF) / 0.3) : 0;
  return clamp(b1 + b2, -1, 1);
};
