import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, useCurrentFrame} from 'remotion';
import {CX, CY} from './components/Depth';
import {Captions, eyeOpen, Eyelids, Finish, SciFiTitle} from './components/Overlays';
import {camRoll, camV, camZ, project, T_PORTAL} from './lib/cameraCore';
import {clamp, outCubic, prog, smooth} from './lib/ease';
import {TimeProvider, useT} from './lib/time';
import {RoomBack, RoomFront} from './scenes/Room';
import {BetterThanYou, DeepCards, Message, Orb, portalRect, PortalFrame, ScreenCards, ScreenHUD, UIBackground} from './scenes/UISpace';
import {renderWorld} from './scenes/world3d';

export const PREVIEW_FRAMES = 255;

// recorte da tela do monitor enquanto a câmera não atravessou o vidro
const useScreenClip = () => {
  const t = useT();
  if (camZ(t) >= 9.96) return undefined;
  const a = project(-410, -431, 10, t);
  const b = project(410, 31, 10, t);
  const top = CY + a.sy, left = CX + a.sx, bottom = CY + b.sy, right = CX + b.sx;
  return `inset(${top}px ${1080 - right}px ${1920 - bottom}px ${left}px round ${4 * a.k}px)`;
};

const ScreenBack: React.FC = () => {
  const clip = useScreenClip();
  return (
    <AbsoluteFill style={{clipPath: clip}}>
      <UIBackground />
    </AbsoluteFill>
  );
};

const ScreenFront: React.FC = () => {
  const clip = useScreenClip();
  const t = useT();
  return (
    <AbsoluteFill style={{clipPath: clip}}>
      <PortalFrame />
      <DeepCards zMin={21.5} zMax={99} />
      <BetterThanYou />
      <DeepCards zMin={11} zMax={21.5} />
      <Orb />
      <ScreenCards />
      <Message />
      <ScreenHUD />
      {/* reflexo no vidro */}
      {camZ(t) < 9.9 ? (
        <AbsoluteFill style={{background: 'linear-gradient(115deg, rgba(255,255,255,0) 40%, rgba(200,240,255,0.06) 47%, rgba(255,255,255,0) 56%)'}} />
      ) : null}
    </AbsoluteFill>
  );
};

// cópia 2D do quadro 3D (renderizado uma vez por frame), recortada pelo portal
const WorldView: React.FC<{src: HTMLCanvasElement | null}> = ({src}) => {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (!ref.current || !src) return;
    const g = ref.current.getContext('2d')!;
    g.drawImage(src, 0, 0);
  });
  let clip: string | undefined;
  if (t < T_PORTAL - 0.01) {
    const r = portalRect(t);
    if (r.d < 0.1) clip = undefined;
    else clip = `inset(${r.y0}px ${1080 - r.x1}px ${1920 - r.y1}px ${r.x0}px)`;
  }
  return <canvas ref={ref} width={1080} height={1920} style={{position: 'absolute', left: 0, top: 0, width: 1080, height: 1920, clipPath: clip}} />;
};

const Stage: React.FC<{world: HTMLCanvasElement | null}> = ({world}) => {
  const t = useT();
  const roll = camRoll(t) * (1 - smooth(prog(t, 6.0, 6.35)));
  const full3D = t >= T_PORTAL;
  return (
    <AbsoluteFill style={{background: '#02040a', transform: `rotate(${roll}deg) scale(${full3D ? 1 : 1.035})`}}>
      {!full3D && t < 4.45 ? <RoomBack /> : null}
      {!full3D ? <ScreenBack /> : null}
      {t >= 5.88 ? <WorldView src={world} /> : null}
      {!full3D ? <ScreenFront /> : null}
      {!full3D && t < 4.45 ? <RoomFront /> : null}
    </AbsoluteFill>
  );
};

const useFonts = () => {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    Promise.all([
      document.fonts.load('800 70px "Inter Tight"'),
      document.fonts.load('500 70px "Inter Tight"'),
      document.fonts.load('700 30px "JetBrains Mono"'),
      document.fonts.load('400 30px "JetBrains Mono"'),
      document.fonts.load('expanded 900 100px "Archivo Variable"'),
    ]).then(() => continueRender(handle));
  }, [handle]);
};

export const Preview: React.FC = () => {
  useFonts();
  const frame = useCurrentFrame();
  const t = frame / 30;
  const v = camV(t);
  const n = v > 4 && t < T_PORTAL + 0.02 ? 6 : 1;
  const times = n === 1 ? [t] : Array.from({length: n}, (_, i) => t + (i / (n - 1) - 0.5) * (0.5 / 30));
  const world = t >= 5.88 ? renderWorld(t) : null;
  const ca = clamp((v - 3) / 30) * 7 + (t > 8.36 ? 10 : 0);
  const blurOpen = 10 * (1 - outCubic(prog(t, 0.0, 0.7)));
  const expo = 1 + 0.4 * (1 - eyeOpen(Math.min(t, 0.58)));
  const filters = [ca > 0.3 ? 'url(#ca)' : '', blurOpen > 0.2 ? `blur(${blurOpen}px)` : '', expo > 1.01 ? `brightness(${expo})` : ''].filter(Boolean).join(' ');
  return (
    <AbsoluteFill style={{background: '#000'}}>
      <svg width={0} height={0} style={{position: 'absolute'}}>
        <filter id="ca" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
          <feOffset in="r" dx={-ca} dy={0} result="r2" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
          <feOffset in="b" dx={ca} dy={0} result="b2" />
          <feBlend in="r2" in2="g" mode="screen" result="rg" />
          <feBlend in="rg" in2="b2" mode="screen" />
        </filter>
      </svg>
      <AbsoluteFill style={{filter: filters || undefined}}>
        {times.map((ts, i) => (
          <AbsoluteFill key={i} style={{opacity: 1 / (i + 1)}}>
            <TimeProvider t={ts}>
              <Stage world={world} />
            </TimeProvider>
          </AbsoluteFill>
        ))}
      </AbsoluteFill>
      <TimeProvider t={t}>
        <SciFiTitle />
        <Eyelids />
        <Finish />
        <Captions />
      </TimeProvider>
    </AbsoluteFill>
  );
};
