import React, {createContext, useContext} from 'react';
import {useCurrentFrame} from 'remotion';

// Todas as cenas leem o tempo (em segundos) daqui. Isso permite renderizar
// sub-quadros (motion blur real) sem depender do frame inteiro do Remotion.
const TimeCtx = createContext<number | null>(null);

export const useT = () => {
  const frame = useCurrentFrame();
  const t = useContext(TimeCtx);
  return t ?? frame / 30;
};

export const TimeProvider: React.FC<{t: number; children: React.ReactNode}> = ({t, children}) => (
  <TimeCtx.Provider value={t}>{children}</TimeCtx.Provider>
);
