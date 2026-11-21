import React from 'react';
import { Composition } from 'remotion';
import { V8Preview } from './V8Preview';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="V8Preview"
    component={V8Preview}
    durationInFrames={900}
    fps={30}
    width={1080}
    height={1920}
  />
);
