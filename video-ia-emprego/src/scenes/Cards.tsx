import React from 'react';
import {clamp, outCubic, prog, spring} from '../lib/ease';

export type CardKind = 'email' | 'planilha' | 'relatorio' | 'codigo' | 'agenda' | 'atendimento' | 'apresentacao' | 'contrato';

const TITLES: Record<CardKind, string> = {
  email: 'E-mails',
  planilha: 'Planilha de custos',
  relatorio: 'Relatório trimestral',
  codigo: 'Código · deploy',
  agenda: 'Agenda da semana',
  atendimento: 'Atendimento',
  apresentacao: 'Apresentação',
  contrato: 'Contrato revisado',
};

const Line: React.FC<{w: number; o?: number; c?: string; h?: number}> = ({w, o = 0.28, c = '#9fc9e8', h = 10}) => (
  <div style={{width: `${w}%`, height: h, borderRadius: 5, background: c, opacity: o, marginBottom: 12}} />
);

const Body: React.FC<{kind: CardKind; fill: number; t: number}> = ({kind, fill, t}) => {
  if (kind === 'email' || kind === 'atendimento') {
    return (
      <div>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, opacity: fill > i / 3 ? 1 : 0.35}}>
            <div style={{width: 30, height: 30, borderRadius: 15, background: i === 1 ? '#59e1ff' : '#2b4a6c'}} />
            <div style={{flex: 1}}>
              <Line w={70 - i * 12} o={0.45} h={9} />
              <Line w={92} o={0.2} h={8} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'planilha') {
    const cells = [];
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 5; c++) {
        const on = fill * 20 > r * 5 + c;
        cells.push(
          <div key={`${r}${c}`} style={{height: 26, borderRadius: 4, background: on ? (c === 4 ? 'rgba(89,225,255,0.55)' : 'rgba(160,200,235,0.22)') : 'rgba(160,200,235,0.07)'}} />,
        );
      }
    return <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 7}}>{cells}</div>;
  }
  if (kind === 'codigo') {
    const cols = ['#59e1ff', '#c792ea', '#9fc9e8', '#ffcb6b', '#9fc9e8'];
    return (
      <div>
        {[62, 44, 80, 36, 70].map((w, i) => (
          <div key={i} style={{display: 'flex', gap: 10, opacity: fill > i / 5 ? 1 : 0.25}}>
            <div style={{width: 22, height: 9, marginTop: 1, borderRadius: 3, background: '#2b4a6c'}} />
            <Line w={w} o={0.6} c={cols[i]} h={9} />
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'agenda') {
    const cells = [];
    for (let i = 0; i < 21; i++) {
      const ev = [2, 5, 9, 12, 16, 18].includes(i);
      cells.push(<div key={i} style={{height: 22, borderRadius: 4, background: ev && fill > i / 21 ? 'rgba(89,225,255,0.6)' : 'rgba(160,200,235,0.1)'}} />);
    }
    return <div style={{display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 7}}>{cells}</div>;
  }
  if (kind === 'apresentacao') {
    return (
      <div style={{display: 'flex', alignItems: 'flex-end', gap: 12, height: 110, padding: '0 6px'}}>
        {[0.35, 0.55, 0.45, 0.75, 0.95].map((h, i) => (
          <div key={i} style={{flex: 1, height: `${h * 100 * clamp(fill * 1.4 - i * 0.08)}%`, borderRadius: 6, background: i === 4 ? '#59e1ff' : 'rgba(120,180,230,0.35)'}} />
        ))}
      </div>
    );
  }
  // relatorio / contrato
  return (
    <div>
      <Line w={50} o={0.55} h={12} />
      <Line w={95} />
      <Line w={88} />
      <Line w={92} />
      <Line w={60} />
      {kind === 'contrato' ? <div style={{width: '40%', height: 2, background: '#59e1ff', opacity: fill, marginTop: 8}} /> : null}
    </div>
  );
};

export const Card: React.FC<{kind: CardKind; t: number; start: number; done: number; glow?: number}> = ({kind, t, start, done, glow = 1}) => {
  const fill = outCubic(prog(t, start, done));
  const pop = spring(prog(t, done, done + 0.5), 8, 12);
  const isDone = t >= done;
  return (
    <div
      style={{
        width: 520,
        height: 340,
        boxSizing: 'border-box',
        borderRadius: 24,
        padding: '24px 26px',
        background: 'linear-gradient(160deg, rgba(22,44,76,0.94), rgba(7,14,28,0.95))',
        border: `1.5px solid rgba(120,220,255,${0.22 + 0.25 * (isDone ? 1 : 0)})`,
        boxShadow: `0 0 ${50 * glow}px rgba(60,180,255,${0.18 * glow}), inset 0 1px 0 rgba(255,255,255,0.14)`,
        fontFamily: 'Inter Tight',
        color: '#eaf6ff',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22}}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <div key={c} style={{width: 11, height: 11, borderRadius: 6, background: c, opacity: 0.55}} />
        ))}
        <div style={{marginLeft: 12, fontSize: 26, fontWeight: 700, letterSpacing: -0.3}}>{TITLES[kind]}</div>
      </div>
      <Body kind={kind} fill={fill} t={t} />
      <div style={{position: 'absolute', left: 26, right: 26, bottom: 24, height: 7, borderRadius: 4, background: 'rgba(160,200,235,0.12)'}}>
        <div style={{width: `${fill * 100}%`, height: '100%', borderRadius: 4, background: 'linear-gradient(90deg,#2f7bff,#59e1ff)', boxShadow: '0 0 12px #59e1ff'}} />
      </div>
      {isDone ? (
        <div
          style={{
            position: 'absolute',
            top: 20,
            right: 22,
            padding: '7px 14px 7px 12px',
            borderRadius: 30,
            background: '#59e1ff',
            color: '#03121c',
            fontFamily: 'JetBrains Mono',
            fontWeight: 800,
            fontSize: 17,
            letterSpacing: 0.5,
            transform: `scale(${0.4 + 0.6 * pop})`,
            transformOrigin: 'right center',
            boxShadow: '0 0 24px rgba(89,225,255,0.7)',
          }}
        >
          ✓ CONCLUÍDO
        </div>
      ) : null}
    </div>
  );
};
