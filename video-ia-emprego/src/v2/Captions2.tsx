import React from 'react';
import {AbsoluteFill} from 'remotion';
import {WORDS} from '../lib/words';
import {outCubic, prog} from '../lib/ease';
import {useT} from '../lib/time';

// Legendas separadas dos gráficos: faixa fixa, placa escura sutil, destaque pontual.
export const PAGES_V2: {idx: number[]; accent?: number[]; warm?: number[]}[] = [
  {idx: [0, 1, 2]},
  {idx: [3, 4, 5, 6], accent: [4]},
  {idx: [7, 8], accent: [7, 8]},
  {idx: [9, 10, 11], warm: [11]},
  {idx: [12, 13, 14], warm: [14]},
  {idx: [15, 16, 17]},
];

export const Captions2: React.FC<{top?: number}> = ({top = 1430}) => {
  const t = useT();
  const pages = PAGES_V2.map((p, i) => {
    const first = WORDS[p.idx[0]];
    const last = WORDS[p.idx[p.idx.length - 1]];
    const next = PAGES_V2[i + 1];
    const end = next ? Math.min(WORDS[next.idx[0]].s - 0.03, last.e + 0.35) : last.e + 0.4;
    return {...p, start: first.s - 0.06, end};
  });
  const page = pages.find((p) => t >= p.start && t < p.end);
  if (!page) return null;
  const fadeOut = 1 - prog(t, page.end - 0.07, page.end);
  const plateIn = outCubic(prog(t, page.start, page.start + 0.12));
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div style={{position: 'absolute', left: 0, right: 0, top, display: 'flex', justifyContent: 'center', opacity: fadeOut}}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            columnGap: 16,
            maxWidth: 900,
            padding: '10px 26px 14px',
            borderRadius: 22,
            background: `rgba(4,8,16,${0.42 * plateIn})`,
            backdropFilter: 'blur(6px)',
          }}
        >
          {page.idx.map((wi) => {
            const w = WORDS[wi];
            const u = w.s < 0.05 ? 1 : outCubic(prog(t, w.s - 0.04, w.s + 0.14));
            const op = 0.38 + 0.62 * u;
            const spoken = t >= w.s;
            const accent = page.accent?.includes(wi);
            const warm = page.warm?.includes(wi);
            const color = spoken && warm ? '#ffbe5c' : spoken && accent ? '#6fe6ff' : '#ffffff';
            return (
              <span
                key={wi}
                style={{
                  fontFamily: 'Inter Tight',
                  fontWeight: 800,
                  fontSize: 64,
                  lineHeight: 1.15,
                  letterSpacing: -0.8,
                  color,
                  opacity: op,
                  transform: `scale(${1 + 0.04 * Math.sin(Math.PI * u)})`,
                  display: 'inline-block',
                  textShadow: '0 2px 14px rgba(0,0,0,0.7)',
                }}
              >
                {w.w}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
