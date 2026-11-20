// Definição de dados da Ilha Inicial: terreno, ruas, lotes, objetos, colisões e
// pontos de interação. Mantida separada da renderização (World) e das regras
// (InteractionSystem) para facilitar a expansão para novos bairros.

export const OBJ_SCALE = 1.4; // 1 unidade do modelo 3D = 1.4 tiles (ver art/objects.ts)
export const N = 60;

export enum T { Water = 0, Sand, Grass, Lot, Road, Side, Board, Pave }

export interface RectCol { kind: 'rect'; x0: number; y0: number; x1: number; y1: number; h: number }
export interface CircleCol { kind: 'circle'; x: number; y: number; r: number; h: number }
export type Collider = RectCol | CircleCol;

export interface WorldObject {
  id: string;
  frame: string;              // frame base no atlas
  x: number; y: number;       // origem no mundo (tiles)
  anim?: { frames: number; fps: number; pingpong?: boolean };
  shadow?: boolean;
  /** retângulo de ordenação (para objetos grandes) */
  sortRect?: { x0: number; y0: number; x1: number; y1: number };
  big?: boolean;
  glow?: { dx: number; dy: number; z: number };
  tag?: string;
  flat?: boolean;             // rente ao chão (desenhado sob os personagens)
}

export type InteractKind = 'house' | 'lot' | 'busstop' | 'npc' | 'cart' | 'sign';

export interface Interactable {
  id: string; kind: InteractKind; x: number; y: number; radius: number;
  title: string; subtitle?: string; info: Record<string, string>; markerZ: number; text?: string;
  /** área retangular (ex.: terrenos): interação disponível dentro dela ou a `radius` da borda */
  rect?: { x0: number; y0: number; x1: number; y1: number };
}

export interface MapDef {
  terrain: Uint8Array;
  roadDir: Int8Array;        // 0 nenhum, 1 rua ao longo de x, 2 ao longo de y
  centerLine: Uint8Array;    // 1 linha central
  crossing: Int8Array;       // 0, 1 faixa p/ pedestres andando em x, 2 em y
  objects: WorldObject[];
  colliders: Collider[];
  interactables: Interactable[];
  busRoute: { x: number; y: number }[];
  busStop: { x: number; y: number; name: string };
  spawn: { x: number; y: number };
  npcPath: { x: number; y: number }[];
  regions: { name: string; x0: number; y0: number; x1: number; y1: number }[];
}

const S = OBJ_SCALE;
const idx = (x: number, y: number) => y * N + x;

function hash(x: number, y: number, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function buildMap(): MapDef {
  const terrain = new Uint8Array(N * N);
  const roadDir = new Int8Array(N * N);
  const centerLine = new Uint8Array(N * N);
  const crossing = new Int8Array(N * N);
  const set = (x0: number, y0: number, x1: number, y1: number, t: T) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < N && y < N) terrain[idx(x, y)] = t;
  };

  // ---------------- ilha (superelipse com litoral irregular)
  const cx = 29.5, cy = 30, rx = 23.5, ry = 24.5;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    const ang = Math.atan2(dy, dx);
    const wob = 0.035 * Math.sin(ang * 5 + 1.3) + 0.025 * Math.sin(ang * 9 + 0.4);
    const d = Math.pow(Math.pow(Math.abs(dx), 3.2) + Math.pow(Math.abs(dy), 3.2), 1 / 3.2) + wob;
    if (d > 1) terrain[idx(x, y)] = T.Water;
    else if (d > 0.9 || x >= 41) terrain[idx(x, y)] = T.Sand;
    else terrain[idx(x, y)] = T.Grass;
  }

  // ---------------- ruas (3 tiles) em anel
  const road = (x0: number, y0: number, x1: number, y1: number, dir: 1 | 2) => {
    set(x0, y0, x1, y1, T.Road);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      roadDir[idx(x, y)] = dir;
      if (dir === 1 && y === y0 + 1) centerLine[idx(x, y)] = 1;
      if (dir === 2 && x === x0 + 1) centerLine[idx(x, y)] = 1;
    }
  };
  // calçadas primeiro, ruas por cima
  set(11, 11, 38, 43, T.Side);
  set(16, 16, 33, 38, T.Grass);                 // miolo da quadra
  set(38, 11, 40, 43, T.Board);                 // calçadão em ondas
  road(12, 12, 37, 14, 1);                      // Rua das Palmeiras
  road(12, 40, 37, 42, 1);                      // Rua do Sol
  road(12, 12, 14, 42, 2);                      // Rua Oeste
  road(35, 12, 37, 42, 2);                      // Av. Beira-Mar
  // cruzamentos: sem linha central
  for (const [x0, y0] of [[12, 12], [35, 12], [12, 40], [35, 40]]) for (let y = y0; y < y0 + 3; y++) for (let x = x0; x < x0 + 3; x++) { centerLine[idx(x, y)] = 0; roadDir[idx(x, y)] = 0; }
  // faixas de pedestres
  for (let x = 35; x <= 37; x++) for (const y of [24, 25]) { crossing[idx(x, y)] = 1; centerLine[idx(x, y)] = 0; }
  for (let y = 40; y <= 42; y++) for (const x of [22, 23]) { crossing[idx(x, y)] = 2; centerLine[idx(x, y)] = 0; }
  for (let y = 12; y <= 14; y++) for (const x of [27, 28]) { crossing[idx(x, y)] = 2; centerLine[idx(x, y)] = 0; }

  // praça
  set(24, 16, 33, 25, T.Pave);
  // caminhos de acesso às casas
  set(18, 37, 19, 38, T.Side);
  set(26, 37, 29, 38, T.Side); // entrada de garagem
  set(29, 37, 30, 38, T.Side);
  // lotes vazios
  set(16, 16, 22, 23, T.Lot);   // Terreno 01
  set(20, 5, 26, 9, T.Lot);     // Terreno 02
  set(16, 45, 22, 50, T.Lot);   // Terreno 03
  // caminho até a casa de praia
  set(31, 47, 40, 48, T.Side);

  const objects: WorldObject[] = [];
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  let oid = 0;
  const obj = (o: Omit<WorldObject, 'id'>) => { objects.push({ id: `o${oid++}`, shadow: true, ...o }); };
  const circle = (x: number, y: number, r: number, h: number) => colliders.push({ kind: 'circle', x, y, r, h });
  const rect = (x0: number, y0: number, x1: number, y1: number, h: number) => colliders.push({ kind: 'rect', x0, y0, x1, y1, h });

  // ---------------- casas
  // Casa 1 — popular (modelo 4×3, porta em +y)
  {
    const ox = 17, oy = 31.2;
    obj({ frame: 'house_popular', x: ox, y: oy, big: true, sortRect: { x0: ox, y0: oy, x1: ox + 4 * S, y1: oy + 3 * S } });
    rect(ox, oy, ox + 4 * S, oy + 3 * S, 5);
    interactables.push({
      id: 'casa1', kind: 'house', x: ox + 1.15 * S, y: oy + 3 * S + 0.7, radius: 1.6, markerZ: 2.9,
      title: 'Casa 1 · Residência Popular', subtitle: 'Rua do Sol, 12',
      info: { Tipo: 'Térrea · telhado cerâmico', Quartos: '2 quartos · 1 banheiro', Terreno: '8 × 10 m', Situação: 'Ocupada (morador demo)', Valor: '₵ 8.000' },
    });
    // jardim: cerca, flores, caixa de correio
    obj({ frame: 'fence_x', x: ox + 2.6, y: oy + 3 * S + 1.7, sortRect: { x0: ox + 2.6, y0: oy + 6, x1: ox + 2.6 + 2 * S, y1: oy + 6.1 } , big: true});
    rect(ox + 2.6, oy + 3 * S + 1.6, ox + 2.6 + 2 * S, oy + 3 * S + 1.8, 0.85);
    obj({ frame: 'bush1', x: ox + 3.4, y: oy + 3 * S + 0.8 }); circle(ox + 3.4, oy + 3 * S + 0.8, 0.45, 0.8);
    obj({ frame: 'bush2', x: ox + 5.0, y: oy + 3 * S + 0.8 }); circle(ox + 5.0, oy + 3 * S + 0.8, 0.45, 0.8);
    obj({ frame: 'pot0', x: ox + 0.5, y: oy + 3 * S + 0.5 }); circle(ox + 0.5, oy + 3 * S + 0.5, 0.25, 0.6);
    obj({ frame: 'mailbox', x: ox + 0.4, y: oy + 3 * S + 1.7 }); circle(ox + 0.4, oy + 3 * S + 1.7, 0.18, 1.4);
  }
  // Casa 2 — moderna (modelo 5×4)
  {
    const ox = 25.6, oy = 30.8;
    obj({ frame: 'house_modern', x: ox, y: oy, big: true, sortRect: { x0: ox, y0: oy, x1: ox + 5 * S, y1: oy + 4.45 * S } });
    rect(ox, oy, ox + 5 * S, oy + 4.1 * S, 8);
    rect(ox + 3.7 * S, oy + 4 * S, ox + 5 * S, oy + 4.45 * S, 0.6);
    interactables.push({
      id: 'casa2', kind: 'house', x: ox + 3.2 * S, y: oy + 4 * S + 0.8, radius: 1.6, markerZ: 3.2,
      title: 'Casa 2 · Residência Moderna', subtitle: 'Rua do Sol, 28',
      info: { Tipo: 'Sobrado contemporâneo', Quartos: '3 suítes · varanda', Terreno: '10 × 12 m', Situação: 'Ocupada (morador demo)', Valor: '₵ 12.000' },
    });
    obj({ frame: 'pot1', x: ox - 0.5, y: oy + 4 * S + 0.6 }); circle(ox - 0.5, oy + 4 * S + 0.6, 0.25, 0.6);
  }
  // Casa 3 — casa de praia (modelo 3.6×4 + varanda até 5.3)
  {
    const ox = 25.2, oy = 44.2;
    obj({ frame: 'house_beach', x: ox, y: oy, big: true, sortRect: { x0: ox, y0: oy, x1: ox + 5.0 * S, y1: oy + 4 * S } });
    rect(ox, oy, ox + 3.6 * S, oy + 4 * S, 5);
    rect(ox + 3.6 * S, oy + 0.1 * S, ox + 5.0 * S, oy + 1.5 * S, 3);       // varanda (parte norte)
    rect(ox + 3.6 * S, oy + 2.5 * S, ox + 5.0 * S, oy + 3.9 * S, 3);       // varanda (parte sul)
    rect(ox + 3.6 * S, oy + 1.5 * S, ox + 4.6 * S, oy + 2.5 * S, 3);
    interactables.push({
      id: 'casa3', kind: 'house', x: ox + 5.3 * S + 0.5, y: oy + 2 * S, radius: 1.7, markerZ: 2.9,
      title: 'Casa 3 · Casa de Praia', subtitle: 'Travessa da Orla, 3',
      info: { Tipo: 'Costeira · varanda de madeira', Quartos: '2 quartos · rede na varanda', Terreno: '9 × 11 m', Situação: 'Ocupada (morador demo)', Valor: '₵ 20.000' },
    });
    obj({ frame: 'palm1_0', x: ox - 1.2, y: oy + 6.4, anim: { frames: 4, fps: 3, pingpong: true } }); circle(ox - 1.2, oy + 6.4, 0.25, 6);
    obj({ frame: 'bush0', x: ox + 2, y: oy + 6.3 }); circle(ox + 2, oy + 6.3, 0.45, 0.8);
  }

  // ---------------- lotes vazios
  const lot = (id: string, n: string, x0: number, y0: number, x1: number, y1: number, size: string, signX: number, signY: number, street: string) => {
    for (const [sx, sy] of [[x0, y0], [x1 + 1, y0], [x0, y1 + 1], [x1 + 1, y1 + 1]]) { obj({ frame: 'stake', x: sx, y: sy, shadow: true }); circle(sx, sy, 0.1, 0.6); }
    obj({ frame: 'lotsign', x: signX, y: signY }); rect(signX - 0.75, signY - 0.12, signX + 0.75, signY + 0.12, 1.9);
    interactables.push({
      id, kind: 'lot', x: signX, y: signY, radius: 1.2, markerZ: 2.2, rect: { x0, y0, x1: x1 + 1, y1: y1 + 1 },
      title: `Terreno ${n}`, subtitle: street,
      info: { Situação: 'Disponível', Área: size, Zoneamento: 'Residencial', Preço: 'Em breve', Observação: 'Em breve será possível comprar este terreno e construir sua casa.' },
    });
  };
  lot('lot1', '01', 16, 16, 22, 23, '20 × 20 m', 19.5, 23.3, 'Rua das Palmeiras × Rua Oeste');
  lot('lot2', '02', 20, 5, 26, 9, '20 × 15 m', 23.5, 9.3, 'Alto da Ilha · vista para o mar');
  lot('lot3', '03', 16, 45, 22, 50, '20 × 18 m', 19.5, 45.4, 'Rua do Sol, lado sul');

  // ---------------- praça
  obj({ frame: 'fountain_0', x: 28.8, y: 20.6, anim: { frames: 3, fps: 6 } }); circle(28.8, 20.6, 1.45, 1.2);
  const ipe = (x: number, y: number, v: number) => { obj({ frame: `ipe${v}_0`, x, y, anim: { frames: 2, fps: 1.6 } }); circle(x, y, 0.3, 6); };
  ipe(25.2, 17.2, 0); ipe(32.6, 17.4, 1); ipe(25.0, 24.4, 1); ipe(32.8, 24.6, 0);
  const benchX = (x: number, y: number) => { obj({ frame: 'bench_x', x, y }); rect(x, y - 0.32, x + 1.7, y + 0.32, 0.65); };
  const benchZ = (x: number, y: number) => { obj({ frame: 'bench_z', x, y }); rect(x - 0.32, y, x + 0.32, y + 1.7, 0.65); };
  benchX(27.9, 17.0); benchX(27.9, 24.4); benchZ(25.3, 19.8); benchZ(32.4, 19.8);
  obj({ frame: 'trash', x: 26.4, y: 17.0 }); circle(26.4, 17.0, 0.3, 1.2);
  obj({ frame: 'trash', x: 31.5, y: 24.4 }); circle(31.5, 24.4, 0.3, 1.2);

  // ---------------- jardim central e árvores do bairro
  const tree = (x: number, y: number, v: number) => { obj({ frame: `tree${v}_0`, x, y, anim: { frames: 2, fps: 1.3 } }); circle(x, y, 0.3, 6); };
  tree(17.5, 27.0, 0); tree(22.5, 26.5, 1); tree(31.8, 27.8, 0);
  obj({ frame: 'hedge_x', x: 18.5, y: 25.2 }); rect(18.2, 24.85, 18.5 + 2 * S + 0.3, 25.55, 0.85);
  obj({ frame: 'bush1', x: 25.4, y: 27.4 }); circle(25.4, 27.4, 0.45, 0.8);
  obj({ frame: 'bush2', x: 29.4, y: 27.0 }); circle(29.4, 27.0, 0.45, 0.8);

  // ---------------- postes de iluminação (calçadas)
  const lamp = (x: number, y: number) => { obj({ frame: 'lamp', x, y, glow: { dx: 0.44 * S, dy: 0.44 * S, z: 2.8 * S } }); circle(x, y, 0.15, 6); };
  for (const y of [17, 25, 33]) { lamp(15.4, y); lamp(34.6, y); }
  for (const x of [20, 30]) { lamp(x, 15.4); lamp(x, 39.6); }
  for (const y of [15, 21, 33, 39]) lamp(38.4, y);
  // placas de rua
  obj({ frame: 'streetsign', x: 15.5, y: 15.5 }); circle(15.5, 15.5, 0.1, 4);
  obj({ frame: 'streetsign', x: 34.5, y: 39.5 }); circle(34.5, 39.5, 0.1, 4);
  interactables.push({
    id: 'placa', kind: 'sign', x: 34.5, y: 39.5, radius: 1.2, markerZ: 3.2, title: 'Placa de rua',
    info: { Cruzamento: 'Av. Beira-Mar × Rua do Sol', Bairro: 'Beira-Mar', CEP: '00000-000 (fictício)' },
  });

  // ---------------- orla: ponto de ônibus, palmeiras, quiosque
  obj({ frame: 'busstop', x: 38.3, y: 25.6, big: true, sortRect: { x0: 38.1, y0: 25.5, x1: 39.4, y1: 29.4 } });
  rect(38.95, 25.7, 39.35, 29.2, 4);       // painel traseiro
  circle(38.15, 29.4 + 0.3, 0.12, 4);      // poste da placa
  const stop = { x: 37.25, y: 27.6, name: 'Parada Orla Central' };
  interactables.push({
    id: 'ponto', kind: 'busstop', x: 38.0, y: 27.4, radius: 1.8, markerZ: 3.5,
    title: 'Parada Orla Central', subtitle: 'Av. Beira-Mar',
    info: { Linha: '01 · Circular Ilha', Sentido: 'Rua das Palmeiras → Rua Oeste → Rua do Sol', Tarifa: '₵ 5 (demonstração)' },
  });
  obj({ frame: 'trash', x: 39.7, y: 30.2 }); circle(39.7, 30.2, 0.3, 1.2);
  const palm = (x: number, y: number, v: number) => { obj({ frame: `palm${v}_0`, x, y, anim: { frames: 4, fps: 2.5 + hash(x | 0, y | 0) * 1.2, pingpong: true } }); circle(x, y, 0.22, 6); };
  for (const y of [13, 18, 23, 33, 37, 42]) palm(40.5, y + 0.3, (y >> 1) % 3);
  benchZ(40.3, 19.6); benchZ(40.3, 34.4);
  obj({ frame: 'cart', x: 41.8, y: 31.5 }); rect(41.1, 31.0, 42.5, 32.0, 1.6);
  interactables.push({
    id: 'coco', kind: 'cart', x: 41.8, y: 32.6, radius: 1.3, markerZ: 2.8, title: 'Carrinho de Água de Coco',
    info: { Produto: 'Água de coco gelada', Preço: '₵ 6 (decorativo nesta versão)' },
  });

  // ---------------- praia
  const umb = (x: number, y: number, v: number) => { obj({ frame: `umbrella${v}_0`, x, y, anim: { frames: 2, fps: 1.5 } }); circle(x, y, 0.1, 3); };
  umb(44, 16, 0); umb(46.5, 21, 1); umb(44.5, 27, 2); umb(46, 36.5, 0); umb(43.8, 40.5, 1);
  const chair = (x: number, y: number, v: number) => { obj({ frame: `chair${v}`, x, y }); rect(x, y, x + 1.75, y + 0.8, 0.45); };
  chair(44.6, 16.6, 0); chair(47.0, 21.6, 1); chair(45.1, 27.6, 0); chair(46.6, 37.1, 1);
  obj({ frame: 'towel0', x: 47.6, y: 28.4, shadow: false, flat: true }); obj({ frame: 'towel1', x: 44.8, y: 34.0, shadow: false, flat: true });
  const rockAt = (x: number, y: number, v: number, r: number, h: number) => { obj({ frame: `rock${v}`, x, y }); circle(x, y, r, h); };
  rockAt(48.5, 10.5, 2, 0.95, 1.2); rockAt(47.2, 9.8, 0, 0.6, 0.6); rockAt(49.2, 47.5, 2, 0.95, 1.2); rockAt(48.0, 48.8, 1, 0.45, 0.4);
  rockAt(10, 44, 0, 0.6, 0.6); rockAt(8.5, 15, 1, 0.45, 0.4);

  // ---------------- vegetação periférica
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const isFree = (x: number, y: number, r: number) => {
    for (const c of colliders) {
      if (c.kind === 'circle' && Math.hypot(c.x - x, c.y - y) < c.r + r + 0.8) return false;
      if (c.kind === 'rect' && x > c.x0 - r - 0.8 && x < c.x1 + r + 0.8 && y > c.y0 - r - 0.8 && y < c.y1 + r + 0.8) return false;
    }
    return true;
  };
  const tIs = (x: number, y: number, t: T) => terrain[idx(Math.floor(x), Math.floor(y))] === t;
  for (let i = 0; i < 260; i++) {
    const x = 5 + rnd() * 50, y = 5 + rnd() * 50;
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 1 || ty < 1 || tx >= N - 1 || ty >= N - 1) continue;
    const t = terrain[idx(tx, ty)];
    // evita miolo da quadra/áreas jogáveis principais
    const inLoop = x > 10 && x < 41 && y > 10 && y < 44;
    if (inLoop) continue;
    if (y > 43 && y < 51 && x > 15 && x < 37) continue;
    if (x > 19 && x < 27 && y > 4 && y < 10.5) continue;
    if (t === T.Grass && tIs(x + 1, y, T.Grass) && tIs(x, y + 1, T.Grass) && tIs(x - 1, y, T.Grass) && tIs(x, y - 1, T.Grass) && isFree(x, y, 0.5)) {
      const k = rnd();
      if (k < 0.35) tree(x, y, rnd() < 0.5 ? 0 : 1);
      else if (k < 0.5) ipe(x, y, rnd() < 0.5 ? 0 : 1);
      else if (k < 0.7) palm(x, y, Math.floor(rnd() * 3));
      else { obj({ frame: `bush${Math.floor(rnd() * 3)}`, x, y }); circle(x, y, 0.45, 0.8); }
    } else if (t === T.Sand && x < 41 && isFree(x, y, 0.4) && rnd() < 0.3) {
      palm(x, y, Math.floor(rnd() * 3));
    }
  }

  // ---------------- rota do ônibus (faixa externa, mão direita)
  const busRoute = [
    { x: 37.25, y: 42.0 }, { x: 37.25, y: 13.0 }, { x: 12.75, y: 13.0 }, { x: 12.75, y: 42.0 },
  ];

  const npcPath = [{ x: 44.0, y: 23.5 }, { x: 46.5, y: 25.0 }, { x: 45.5, y: 30.5 }, { x: 43.5, y: 29.0 }];
  interactables.push({ id: 'npc', kind: 'npc', x: 0, y: 0, radius: 1.5, markerZ: 2.9, title: 'Seu Bené · Pescador', info: {} });

  const regions = [
    { name: 'Praia da Ilha', x0: 41, y0: 0, x1: 60, y1: 60 },
    { name: 'Calçadão da Orla', x0: 38, y0: 11, x1: 41, y1: 44 },
    { name: 'Praça do Ipê', x0: 24, y0: 16, x1: 34, y1: 26 },
    { name: 'Bairro Beira-Mar', x0: 11, y0: 11, x1: 38, y1: 44 },
    { name: 'Ilha Inicial', x0: 0, y0: 0, x1: 60, y1: 60 },
  ];

  return {
    terrain, roadDir, centerLine, crossing, objects, colliders, interactables, busRoute, busStop: stop,
    spawn: { x: 39.3, y: 20.6 }, npcPath, regions,
  };
}
