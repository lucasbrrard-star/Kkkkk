import React from 'react';
import {AbsoluteFill} from 'remotion';
import {CAPTION_PAGES, WORDS} from '../lib/words';
import {clamp, hash, inOutCubic, outCubic, outExpo, prog, smooth} from '../lib/ease';
import {useT} from '../lib/time';

// ---------------------------------------------------------------- legendas palavra a palavra
export const Captions: React.FC = () => {
  const t = useT();
  const pages = CAPTION_PAGES.map((p, i) => {
    const first = WORDS[p.idx[0]];
    const last = WORDS[p.idx[p.idx.length - 1]];
    const next = CAPTION_PAGES[i + 1];
    const end = next ? Math.min(WORDS[next.idx[0]].s - 0.03, last.e + 0.3) : last.e + 0.3;
    return {...p, start: first.s - 0.06, end};
  });
  const page = pages.find((p) => t >= p.start && t < p.end);
  if (!page) return null;
  const fadeOut = 1 - prog(t, page.end - 0.07, page.end);
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          left: 70,
          right: 70,
          top: 1418,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          columnGap: 20,
          rowGap: 0,
          opacity: fadeOut,
        }}
      >
        {page.idx.map((wi) => {
          const w = WORDS[wi];
          const u = w.s < 0.05 ? 1 : outCubic(prog(t, w.s - 0.04, w.s + 0.16));
          const active = t >= w.s - 0.02 && t < w.e + 0.05;
          const spoken = t >= w.s;
          const accent = page.accent?.includes(wi);
          const warm = page.warm?.includes(wi);
          const color = spoken && warm ? '#ffbe5c' : spoken && accent ? '#6fe6ff' : '#ffffff';
          const pop = active ? 1 + 0.06 * (1 - outCubic(prog(t, w.s, w.s + 0.2))) : 1;
          return (
            <span
              key={wi}
              style={{
                fontFamily: 'Inter Tight',
                fontWeight: 800,
                fontSize: 76,
                lineHeight: 1.12,
                letterSpacing: -1,
                color,
                opacity: u,
                transform: `translateY(${(1 - u) * 22}px) scale(${pop})`,
                filter: `blur(${(1 - u) * 6}px)`,
                display: 'inline-block',
                textShadow: `0 3px 18px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)${active && (accent || warm) ? `, 0 0 26px ${warm ? 'rgba(255,170,60,0.55)' : 'rgba(89,225,255,0.6)'}` : ''}`,
              }}
            >
              {w.w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- "PARECE FICÇÃO CIENTÍFICA"
const Holo: React.FC<{text: string; t: number; t0: number; size: number; stretch: number}> = ({text, t, t0, size, stretch}) => {
  const chars = text.split('');
  const scan = prog(t, t0, t0 + 0.32);
  return (
    <div style={{position: 'relative', display: 'flex', justifyContent: 'center'}}>
      {chars.map((ch, i) => {
        const ti = t0 + i * 0.028;
        const on = t >= ti;
        const k = Math.floor(t * 30);
        const flick = t < ti + 0.14 ? (hash(k * 7.3 + i * 13.1) > 0.45 ? 1 : 0.15) : 1;
        const u = outExpo(prog(t, ti, ti + 0.35));
        return (
          <span
            key={i}
            style={{
              fontFamily: 'Archivo Variable',
              fontWeight: 900,
              fontStretch: `${stretch}%`,
              fontSize: size,
              lineHeight: 0.95,
              letterSpacing: -2,
              color: '#f4fbff',
              opacity: on ? flick : 0,
              display: 'inline-block',
              transform: `translateY(${(1 - u) * 18}px) scaleY(${0.7 + 0.3 * u})`,
              textShadow: '0 0 34px rgba(89,225,255,0.55), 0 0 2px rgba(255,255,255,0.8)',
              whiteSpace: 'pre',
            }}
          >
            {ch}
          </span>
        );
      })}
      {scan > 0 && scan < 1 ? (
        <div style={{position: 'absolute', top: '-10%', bottom: '-10%', left: `${scan * 100}%`, width: 6, background: '#bff4ff', boxShadow: '0 0 30px 8px rgba(89,225,255,0.8)', opacity: 1 - scan}} />
      ) : null}
    </div>
  );
};

export const SciFiTitle: React.FC = () => {
  const t = useT();
  if (t < 6.36) return null;
  const label = 'PARECE';
  const typedN = Math.floor((t - 6.4) / 0.035);
  const drift = 1 + 0.035 * smooth(prog(t, 6.8, 8.5));
  const lineW = outExpo(prog(t, 6.4, 6.9));
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${drift})`}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 22, marginBottom: 26}}>
          <div style={{width: 120 * lineW, height: 2, background: 'linear-gradient(90deg, transparent, #59e1ff)'}} />
          <div style={{fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 38, letterSpacing: 16, color: '#9fe9ff', minWidth: 250, textAlign: 'center', textShadow: '0 0 18px rgba(89,225,255,0.6)'}}>
            {label.slice(0, clamp(typedN, 0, label.length))}
          </div>
          <div style={{width: 120 * lineW, height: 2, background: 'linear-gradient(90deg, #59e1ff, transparent)'}} />
        </div>
        <Holo text="FICÇÃO" t={t} t0={6.8} size={190} stretch={125} />
        <div style={{height: 8}} />
        <Holo text="CIENTÍFICA" t={t} t0={7.22} size={132} stretch={112} />
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- abertura: "acordar" (pálpebras)
export const eyeOpen = (t: number) => {
  if (t < 0.12) return 0.3 + 0.32 * outCubic(t / 0.12);
  if (t < 0.22) return 0.62 - 0.36 * inOutCubic((t - 0.12) / 0.1);
  return 0.26 + 0.74 * outCubic((t - 0.22) / 0.36);
};
export const Eyelids: React.FC = () => {
  const t = useT();
  if (t > 0.6) return null;
  const o = eyeOpen(t);
  const ry = 40 + o * 1500;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <svg width={1080} height={1920}>
        <defs>
          <filter id="lid" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={50 - 30 * o} />
          </filter>
        </defs>
        <path
          filter="url(#lid)"
          fillRule="evenodd"
          fill="#000"
          d={`M-300 -300 H1380 V2220 H-300 Z M${540 - 980} 880 A980 ${ry} 0 1 0 ${540 + 980} 880 A980 ${ry} 0 1 0 ${540 - 980} 880 Z`}
        />
      </svg>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- acabamento: vinheta, flashes, glitch final
export const Finish: React.FC = () => {
  const t = useT();
  const flashGlass = Math.exp(-Math.pow((t - 4.25) / 0.04, 2)) * 0.2;
  const flashPortal = Math.exp(-Math.pow((t - 6.36) / 0.045, 2)) * 0.32;
  const flashOrb = Math.exp(-Math.pow((t - 2.6) / 0.08, 2)) * 0.12;
  const endBlack = smooth(prog(t, 8.4, 8.5));
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 85% 70% at 50% 46%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.6) 100%)'}} />
      <AbsoluteFill style={{background: 'radial-gradient(circle at 50% 42%, #e9fbff 0%, rgba(120,220,255,0.6) 22%, rgba(0,0,0,0) 62%)', opacity: Math.min(1, (flashGlass + flashPortal + flashOrb) * 2.2), mixBlendMode: 'screen'}} />
      <AbsoluteFill style={{background: '#000', opacity: endBlack}} />
    </AbsoluteFill>
  );
};
