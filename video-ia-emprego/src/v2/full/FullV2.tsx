import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {useFonts} from '../../Preview';
import {inOutCubic, lerp, prog, smooth} from '../../lib/ease';
import {TimeProvider, useT} from '../../lib/time';
import {WORDS_FULL} from '../../lib/wordsFull';
import {Captions2} from '../Captions2';
import {FutureTitle} from '../City';
import {StageV2} from '../PreviewV2';
import {E0, F0, IsoOffice, ProfessionTiles, professionsTilesFlatten} from './Professions';
import {TasksScene} from './Tasks';
import {EscalatorScene} from './Escalator';
import {HandsScene} from './Hands';
import {FuturesScene} from './Futures';

export const FULL_FRAMES = 1200;

export const PAGES_FULL: {idx: number[]; accent?: number[]; warm?: number[]}[] = [
  {idx: [0, 1, 2]},
  {idx: [3, 4, 5, 6], accent: [4]},
  {idx: [7, 8], accent: [7, 8]},
  {idx: [9, 10, 11], warm: [11]},
  {idx: [12, 13, 14], warm: [14]},
  {idx: [15, 16, 17]},
  {idx: [18, 19, 20, 21, 22], accent: [20]},
  {idx: [23, 24], accent: [23]},
  {idx: [25, 26, 27, 28]},
  {idx: [29, 30, 31]},
  {idx: [32, 33, 34, 35]},
  {idx: [36], accent: [36]},
  {idx: [37, 38, 39, 40], warm: [38, 40]},
  {idx: [41, 42, 43, 44]},
  {idx: [45, 46]},
  {idx: [47, 48, 49, 50], warm: [49, 50]},
  {idx: [51, 52, 53, 54]},
  {idx: [55, 56]},
  {idx: [57, 58, 59, 60, 61, 62]},
  {idx: [63, 64, 65]},
  {idx: [66, 67, 68, 69], warm: [69]},
  {idx: [70, 71, 72, 73], accent: [73]},
  {idx: [74, 75, 76, 77]},
  {idx: [78, 79, 80], accent: [78, 79]},
  {idx: [81, 82, 83], warm: [83]},
  {idx: [84, 85, 86, 87, 88], accent: [88]},
];

const TilesWrap: React.FC = () => {
  const t = useT();
  const f = professionsTilesFlatten(t);
  const rx = lerp(0, 56, f);
  const rz = lerp(0, -40, f);
  const sc = lerp(1, 0.6, f);
  return (
    <AbsoluteFill style={{perspective: 2200, opacity: 1 - smooth(prog(t, F0 + 0.25, F0 + 0.55))}}>
      <AbsoluteFill style={{transform: `rotateX(${rx}deg) rotateZ(${rz}deg) scale(${sc})`, transformOrigin: '540px 900px'}}>
        <ProfessionTiles flatten={f} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const FullStage: React.FC = () => {
  const t = useT();
  return (
    <AbsoluteFill style={{background: '#02040a'}}>
      {t < 9.3 ? <StageV2 /> : null}
      {t < 9.0 ? (
        <AbsoluteFill style={{opacity: 1 - smooth(prog(t, E0, E0 + 0.25))}}>
          <FutureTitle />
        </AbsoluteFill>
      ) : null}
      {t >= E0 && t < 11.5 ? <TilesWrap /> : null}
      <IsoOffice />
      <EscalatorScene />
      <TasksScene />
      <HandsScene />
      <FuturesScene />
    </AbsoluteFill>
  );
};

export const FullV2: React.FC = () => {
  useFonts();
  const frame = useCurrentFrame();
  const t = frame / 30;
  const fast = [
    [1.28, 1.95],
    [3.98, 4.4],
    [5.95, 6.5],
  ].some(([a, b]) => t >= a && t <= b);
  const n = fast ? 4 : 1;
  const times = n === 1 ? [t] : Array.from({length: n}, (_, i) => t + (i / (n - 1) - 0.5) * (0.5 / 30));
  return (
    <AbsoluteFill style={{background: '#000'}}>
      {times.map((ts, i) => (
        <AbsoluteFill key={i} style={{opacity: 1 / (i + 1)}}>
          <TimeProvider t={ts}>
            <FullStage />
          </TimeProvider>
        </AbsoluteFill>
      ))}
      <TimeProvider t={t}>
        <AbsoluteFill style={{background: 'radial-gradient(ellipse 85% 70% at 50% 46%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.5) 100%)'}} />
        <Captions2 words={WORDS_FULL} pagesIn={PAGES_FULL} />
      </TimeProvider>
    </AbsoluteFill>
  );
};

export const _f = {inOutCubic};
