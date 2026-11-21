import React from 'react';
import {Composition} from 'remotion';
import {V8} from './V8';

export const RemotionRoot: React.FC = () => (
  <Composition id="V8Preview" component={V8} durationInFrames={900} fps={30} width={1080} height={1920} />
);
