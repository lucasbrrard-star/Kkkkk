import React from 'react';
import {AbsoluteFill} from 'remotion';
import {clamp, inOutCubic, lerp, outCubic, outExpo, prog, smooth, spring} from '../../lib/ease';
import {useT} from '../../lib/time';
import {CityVariant, CityVariantCtx, HeroBuilding, layerScale, MidBuildings, Sky, Skyline, Street} from '../City';

// ============================================================ CENA L — dois futuros possíveis + pergunta final
export const L0 = 31.25;

const ls = (D: number, delta: number): React.CSSProperties => {
  const S = layerScale(D, delta);
  return {transform: `translate(${540 - 540 * S}px, ${960 - 960 * S}px) scale(${S})`, transformOrigin: '0 0'};
};

const CityView: React.FC<{variant: CityVariant; D: number}> = ({variant, D}) => (
  <CityVariantCtx.Provider value={variant}>
    <AbsoluteFill>
      <AbsoluteFill style={ls(D, 20)}>
        <Sky />
      </AbsoluteFill>
      <AbsoluteFill style={ls(D, 2.5)}>
        <Skyline />
      </AbsoluteFill>
      <AbsoluteFill style={ls(D, 0.6)}>
        <MidBuildings />
      </AbsoluteFill>
      <AbsoluteFill style={ls(D, 0)}>
        <HeroBuilding below />
      </AbsoluteFill>
      <AbsoluteFill style={ls(D, 0)}>
        <HeroBuilding below={false} />
      </AbsoluteFill>
      <AbsoluteFill style={ls(D, -0.06)}>
        <Street />
      </AbsoluteFill>
      {variant === 'cold' ? <AbsoluteFill style={{background: 'rgba(20,40,70,0.25)', mixBlendMode: 'multiply'}} /> : null}
      {variant === 'warm' ? <AbsoluteFill style={{background: 'radial-gradient(circle at 30% 40%, rgba(255,180,100,0.16), rgba(0,0,0,0) 60%)'}} /> : null}
    </AbsoluteFill>
  </CityVariantCtx.Provider>
);

// posição da divisória: o lado quente cresce em "criar mais oportunidades", o frio em "acabar com mais empregos"
const splitX = (t: number) => {
  const warm = inOutCubic(prog(t, 33.75, 34.9)) * (1 - inOutCubic(prog(t, 35.45, 36.3)));
  const cold = inOutCubic(prog(t, 35.45, 36.3)) * (1 - inOutCubic(prog(t, 37.35, 38.1)));
  return 540 + 230 * warm - 230 * cold;
};

export const FuturesScene: React.FC = () => {
  const t = useT();
  if (t < L0) return null;
  const D = lerp(1.04, 0.9, smooth(prog(t, L0, 40)));
  const wipe = inOutCubic(prog(t, L0, L0 + 0.55));
  const sx = splitX(t);
  const tilt = 150;
  const xTop = sx + tilt;
  const xBot = sx - tilt;
  // revelação diagonal vindo da direita
  const wx = lerp(1500, -500, wipe);
  const reveal = `polygon(${wx + 300}px 0px, 1080px 0px, 1080px 1920px, ${wx - 300}px 1920px)`;
  const labA = outCubic(prog(t, 34.32, 34.7));
  const labB = outCubic(prog(t, 36.48, 36.86));
  const div = smooth(prog(t, L0 + 0.4, L0 + 0.8));
  const cta = spring(prog(t, 37.72, 38.4), 7, 10);
  const pulse = 0.6 + 0.4 * Math.sin(t * 4);
  return (
    <AbsoluteFill style={{clipPath: wipe < 1 ? reveal : undefined}}>
      <AbsoluteFill style={{clipPath: `polygon(0px 0px, ${xTop}px 0px, ${xBot}px 1920px, 0px 1920px)`}}>
        <CityView variant="warm" D={D} />
      </AbsoluteFill>
      <AbsoluteFill style={{clipPath: `polygon(${xTop}px 0px, 1080px 0px, 1080px 1920px, ${xBot}px 1920px)`}}>
        <CityView variant="cold" D={D} />
      </AbsoluteFill>
      {/* divisória luminosa (gradiente âmbar -> ciano) */}
      <svg width={1080} height={1920} style={{position: 'absolute', opacity: div}}>
        <defs>
          <linearGradient id="divg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffbe5c" />
            <stop offset="1" stopColor="#59e1ff" />
          </linearGradient>
        </defs>
        <line x1={xTop} y1={0} x2={xBot} y2={1920} stroke="url(#divg)" strokeWidth={24} opacity={0.18 * pulse} />
        <line x1={xTop} y1={0} x2={xBot} y2={1920} stroke="#ffffff" strokeWidth={3} />
      </svg>
      {/* rótulos discretos */}
      <div style={{position: 'absolute', left: 60, top: 250, opacity: labA, transform: `translateY(${(1 - labA) * 12}px)`, fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 26, letterSpacing: 4, color: '#ffbe5c', textShadow: '0 2px 12px rgba(0,0,0,0.6)'}}>
        + OPORTUNIDADES
      </div>
      <div style={{position: 'absolute', right: 60, top: 250, opacity: labB, transform: `translateY(${(1 - labB) * 12}px)`, fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 26, letterSpacing: 4, color: '#7ff0ff', textShadow: '0 2px 12px rgba(0,0,0,0.6)', textAlign: 'right'}}>
        − EMPREGOS
      </div>
      {/* chamada final para comentar */}
      {cta > 0.01 ? (
        <div style={{position: 'absolute', left: 0, right: 0, top: 1400, display: 'flex', justifyContent: 'center'}}>
          <div style={{transform: `scale(${0.85 + 0.15 * cta})`, opacity: clamp(cta * 1.5), padding: '22px 40px 24px', borderRadius: 34, background: 'rgba(4,8,16,0.72)', border: '1.5px solid rgba(255,255,255,0.25)', backdropFilter: 'blur(8px)', textAlign: 'center'}}>
            <div style={{fontFamily: 'Inter Tight', fontWeight: 800, fontSize: 52, color: '#ffffff', letterSpacing: -0.8}}>
              E você, o que <span style={{background: 'linear-gradient(90deg,#ffbe5c,#59e1ff)', WebkitBackgroundClip: 'text', color: 'transparent'}}>acha</span>?
            </div>
            <div style={{marginTop: 8, fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 24, letterSpacing: 4, color: 'rgba(220,235,255,0.8)'}}>
              COMENTE ↓
            </div>
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const _fu = {outExpo};
