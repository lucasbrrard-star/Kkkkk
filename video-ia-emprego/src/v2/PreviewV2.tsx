import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {useFonts} from '../Preview';
import {outCubic, prog, smooth} from '../lib/ease';
import {TimeProvider, useT} from '../lib/time';
import {AgentFlowScene, Divider, Fingertip, T_MORPH0, TapRipple} from './AgentFlow';
import {BedroomScene} from './Bedroom';
import {Captions2} from './Captions2';
import {WorkerScene} from './Worker';
import {CityBack, CityFront, FutureTitle, pairStyle, T_CROP0, WaveFront} from './City';

export const PREVIEW2_FRAMES = 255;

const SideLabels: React.FC = () => {
  const t = useT();
  const u = outCubic(prog(t, 4.3, 4.6));
  const out = 1 - smooth(prog(t, 5.95, 6.2));
  if (u <= 0 || out <= 0) return null;
  const lab = (txt: string, col: string, x: number) => (
    <div style={{position: 'absolute', left: x, top: 300, display: 'flex', alignItems: 'center', gap: 12, opacity: u * out, transform: `translateY(${(1 - u) * 14}px)`}}>
      <div style={{width: 12, height: 12, borderRadius: 6, background: col, boxShadow: `0 0 14px ${col}`}} />
      <div style={{fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 28, letterSpacing: 6, color: col}}>{txt}</div>
    </div>
  );
  return (
    <AbsoluteFill>
      {lab('VOCÊ', '#ffbe5c', 60)}
      {lab('IA', '#7ff0ff', 600)}
    </AbsoluteFill>
  );
};

const Stage: React.FC = () => {
  const t = useT();
  const recede = smooth(prog(t, T_MORPH0, 2.8));
  return (
    <AbsoluteFill style={{background: '#02040a'}}>
      {t < 2.85 ? (
        <AbsoluteFill style={{transform: `scale(${1 - 0.08 * recede})`, filter: recede > 0.02 ? `blur(${8 * recede}px) brightness(${1 - 0.4 * recede})` : undefined}}>
          <BedroomScene />
        </AbsoluteFill>
      ) : null}
      <CityBack />
      <AbsoluteFill style={t >= T_CROP0 ? pairStyle(t) : undefined}>
        {t > 3.95 ? <WorkerScene /> : null}
        {t > 2.3 ? <AgentFlowScene /> : null}
        <Divider />
        <SideLabels />
      </AbsoluteFill>
      <CityFront />
      <WaveFront />
      <Fingertip />
      <TapRipple />
    </AbsoluteFill>
  );
};

export const PreviewV2: React.FC = () => {
  useFonts();
  const frame = useCurrentFrame();
  const t = frame / 30;
  // motion blur real (sub-quadros, obturador 180°) só nos movimentos rápidos
  const fast = [
    [1.28, 1.95],
    [2.36, 2.62],
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
            <Stage />
          </TimeProvider>
        </AbsoluteFill>
      ))}
      <TimeProvider t={t}>
        <AbsoluteFill style={{background: 'radial-gradient(ellipse 85% 70% at 50% 46%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.5) 100%)'}} />
        <FutureTitle />
        <Captions2 />
      </TimeProvider>
    </AbsoluteFill>
  );
};
