import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {useFonts} from '../Preview';
import {TimeProvider} from '../lib/time';
import {BedroomScene} from './Bedroom';
import {Captions2} from './Captions2';

export const PREVIEW2_FRAMES = 255;

export const PreviewV2: React.FC = () => {
  useFonts();
  const frame = useCurrentFrame();
  const t = frame / 30;
  return (
    <AbsoluteFill style={{background: '#000'}}>
      <TimeProvider t={t}>
        {t < 2.8 ? <BedroomScene /> : null}
        <AbsoluteFill style={{background: 'radial-gradient(ellipse 85% 70% at 50% 46%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.55) 100%)'}} />
        <Captions2 />
      </TimeProvider>
    </AbsoluteFill>
  );
};
