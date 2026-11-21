import React from 'react';
import {Composition} from 'remotion';
import '@fontsource/inter-tight/500.css';
import '@fontsource/inter-tight/700.css';
import '@fontsource/inter-tight/800.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/jetbrains-mono/800.css';
import '@fontsource-variable/archivo/standard.css';
import {Preview, PREVIEW_FRAMES} from './Preview';
import {PreviewV2, PREVIEW2_FRAMES} from './v2/PreviewV2';
import {FullV2, FULL_FRAMES} from './v2/full/FullV2';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Preview" component={Preview} durationInFrames={PREVIEW_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="PreviewV2" component={PreviewV2} durationInFrames={PREVIEW2_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="FullV2" component={FullV2} durationInFrames={FULL_FRAMES} fps={30} width={1080} height={1920} />
  </>
);
