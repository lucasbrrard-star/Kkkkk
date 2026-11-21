import React from 'react';
import {AbsoluteFill} from 'remotion';
import {camXY, camZ, FOCAL, project} from '../lib/cameraCore';
import {useT} from '../lib/time';

export const W = 1080;
export const H = 1920;
export const CX = W / 2;
export const CY = H / 2;
// unidades de profundidade por unidade lateral (FOV ~50° na largura)
export const ZPX = 1 / 116;

// Camada plana desenhada em pixels como se a câmera estivesse parada (cz = 0).
export const DepthLayer: React.FC<{
  z: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
  fadeNear?: number;
}> = ({z, children, style, fadeNear = 0.6}) => {
  const t = useT();
  const cz = camZ(t);
  const d = z - cz;
  if (d < 0.04) return null;
  const {x, y} = camXY(t);
  const k = FOCAL / d;
  const s = (z * k) / FOCAL;
  const op = Math.min(1, (d - 0.04) / fadeNear);
  return (
    <AbsoluteFill
      style={{
        transform: `translate(${-x * k}px, ${-y * k}px) scale(${s})`,
        transformOrigin: `${CX}px ${CY}px`,
        opacity: op,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

// Elemento posicionado no mundo (X, Y em unidades laterais; Z em profundidade).
// base = largura em px com que o conteúdo é desenhado; width = largura no mundo.
export const WorldItem: React.FC<{
  X: number;
  Y: number;
  Z: number;
  width: number;
  base: number;
  baseH: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
  t?: number;
  rotate?: number;
  near?: number;
}> = ({X, Y, Z, width, base, baseH, children, style, t: tOverride, rotate = 0, near = 0.25}) => {
  const tCtx = useT();
  const t = tOverride ?? tCtx;
  const p = project(X, Y, Z, t);
  if (p.d < 0.05) return null;
  const scale = (p.k * width) / base;
  const op = Math.min(1, (p.d - 0.05) / near);
  return (
    <div
      style={{
        position: 'absolute',
        left: CX + p.sx - base / 2,
        top: CY + p.sy - baseH / 2,
        width: base,
        height: baseH,
        transform: `scale(${scale}) rotate(${rotate}deg)`,
        transformOrigin: 'center center',
        opacity: op,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const camInfo = (t: number) => ({cz: camZ(t), ...camXY(t)});
