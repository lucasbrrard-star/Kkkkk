// Definição de dados da Ilha Inicial: terreno, ruas, lotes, objetos, colisões e
// pontos de interação. Mantida separada da renderização (World) e das regras
// (InteractionSystem) para facilitar a expansão para novos bairros.
// Unidade: 1 tile (64×32 px) ≈ 1 metro.

export const N = 66;

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
  sortRect?: { x0: number; y0: number; x1: number; y1: number };
  big?: boolean;
  glow?: { dx: number; dy: number; z: number; scale?: number }[];
  flat?: boolean;             // rente ao chão (desenhado sob os personagens)
  bob?: number;               // flutua (barcos)
  noFade?: boolean;
}

export type InteractKind = 'house' | 'lot' | 'busstop' | 'npc' | 'cart' | 'sign' | 'shop' | 'landmark';

export interface Interactable {
  id: string; kind: InteractKind; x: number; y: number; radius: number;
  title: string; subtitle?: string; info: Record<string, string>; markerZ: number;
  rect?: { x0: number; y0: number; x1: number; y1: number };
  npc?: number;
}

export interface Lot { id: string; name: string; x0: number; y0: number; x1: number; y1: number; size: string }

export interface NpcDef { sheet: number; name: string; path: { x: number; y: number }[]; speed: number; lines: string[] }

export interface MapDef {
  terrain: Uint8Array;
  roadDir: Int8Array;
  centerLine: Uint8Array;
  crossing: Int8Array;
  walkable: { x0: number; y0: number; x1: number; y1: number }[]; // áreas sobre a água (píer)
  objects: WorldObject[];
  colliders: Collider[];
  interactables: Interactable[];
  lots: Lot[];
  busRoute: { x: number; y: number }[];
  busStop: { x: number; y: number; name: string };
  spawn: { x: number; y: number };
  npcs: NpcDef[];
  regions: { name: string; x0: number; y0: number; x1: number; y1: number }[];
}

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
  const cx = 30, cy = 31, rx = 24.5, ry = 26;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    const ang = Math.atan2(dy, dx);
    const wob = 0.03 * Math.sin(ang * 5 + 1.3) + 0.02 * Math.sin(ang * 9 + 0.4);
    const d = Math.pow(Math.pow(Math.abs(dx), 3.4) + Math.pow(Math.abs(dy), 3.4), 1 / 3.4) + wob;
    if (d > 1) terrain[idx(x, y)] = T.Water;
    else if (d > 0.91 || x >= 45) terrain[idx(x, y)] = T.Sand;
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
  set(11, 11, 42, 47, T.Side);
  set(16, 16, 37, 42, T.Grass);
  set(42, 11, 44, 47, T.Board);                 // calçadão em ondas
  road(12, 12, 41, 14, 1);                      // Rua das Palmeiras
  road(12, 44, 41, 46, 1);                      // Rua do Sol
  road(12, 12, 14, 46, 2);                      // Rua Oeste
  road(39, 12, 41, 46, 2);                      // Av. Beira-Mar
  for (const [x0, y0] of [[12, 12], [39, 12], [12, 44], [39, 44]]) for (let y = y0; y < y0 + 3; y++) for (let x = x0; x < x0 + 3; x++) { centerLine[idx(x, y)] = 0; roadDir[idx(x, y)] = 0; }
  const zebra = (xs: number[], ys: number[], dir: 1 | 2) => { for (const y of ys) for (const x of xs) { crossing[idx(x, y)] = dir; centerLine[idx(x, y)] = 0; } };
  zebra([39, 40, 41], [27, 28], 1);
  zebra([30, 31], [44, 45, 46], 2);
  zebra([30, 31], [12, 13, 14], 2);
  zebra([12, 13, 14], [22, 23], 1);

  // praça e caminhos
  set(24, 16, 37, 28, T.Pave);
  set(16, 16, 23, 22, T.Pave);                  // largo do café
  set(18, 41, 20, 42, T.Side);                  // acesso casa 1
  set(27, 39, 30, 42, T.Side);                  // garagem casa 2
  set(31, 38, 37, 42, T.Pave);                  // deck da piscina
  set(34, 48, 44, 49, T.Side);                  // trilha até a casa de praia
  // lotes vazios
  const lots: { id: string; name: string; x0: number; y0: number; x1: number; y1: number; size: string }[] = [
    { id: 'lot1', name: 'Terreno 01', x0: 16, y0: 24, x1: 22, y1: 31, size: '20 × 20 m' },
    { id: 'lot2', name: 'Terreno 02', x0: 23, y0: 5, x1: 30, y1: 9, size: '20 × 15 m' },
    { id: 'lot3', name: 'Terreno 03', x0: 18, y0: 49, x1: 25, y1: 54, size: '20 × 18 m' },
  ];
  for (const l of lots) set(l.x0, l.y0, l.x1, l.y1, T.Lot);

  const objects: WorldObject[] = [];
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  let oid = 0;
  const obj = (o: Omit<WorldObject, 'id'>) => { objects.push({ id: `o${oid++}`, shadow: true, ...o }); };
  const circle = (x: number, y: number, r: number, h: number) => colliders.push({ kind: 'circle', x, y, r, h });
  const rect = (x0: number, y0: number, x1: number, y1: number, h: number) => colliders.push({ kind: 'rect', x0, y0, x1, y1, h });
  const big = (frame: string, x: number, y: number, w: number, d: number, extra: Partial<WorldObject> = {}) =>
    obj({ frame, x, y, big: true, sortRect: { x0: x, y0: y, x1: x + w, y1: y + d }, ...extra });

  // ---------------- casas
  {
    const ox = 17, oy = 33; // Casa 1 — popular (6.4 × 5, varanda até +1.85 em y)
    big('casa1', ox, oy, 6.4, 5.0, { glow: [{ dx: 2.42, dy: 5.0, z: 2.1, scale: 0.5 }] });
    rect(ox, oy, ox + 6.4, oy + 5.0, 5);
    rect(ox + 0.6, oy + 6.3, ox + 0.8, oy + 6.5, 3); rect(ox + 3.0, oy + 6.3, ox + 3.2, oy + 6.5, 3); // colunas
    interactables.push({ id: 'casa1', kind: 'house', x: ox + 1.7, y: oy + 7.2, radius: 1.8, markerZ: 3.4,
      title: 'Casa 1 · Residência Popular', subtitle: 'Rua do Sol, 12',
      info: { Tipo: 'Térrea · telhado cerâmico', Quartos: '2 quartos · 1 banheiro', Terreno: '8 × 10 m', Situação: 'Ocupada (morador demo)', Valor: '₵ 8.000' } });
    obj({ frame: 'fence_x', x: ox + 3.6, y: oy + 8.6 }); rect(ox + 3.6, oy + 8.5, ox + 3.6 + 2.8, oy + 8.7, 0.85);
    obj({ frame: 'boug0', x: ox + 5.6, y: oy + 6.2 }); circle(ox + 5.6, oy + 6.2, 0.7, 1.2);
    obj({ frame: 'bed_z', x: ox - 0.6, y: oy + 1.0 }); rect(ox - 0.95, oy + 1.0, ox - 0.25, oy + 4.0, 0.4);
    obj({ frame: 'pot0', x: ox + 0.4, y: oy + 6.8 }); circle(ox + 0.4, oy + 6.8, 0.3, 0.7);
    obj({ frame: 'mailbox', x: ox + 0.4, y: oy + 8.6 }); circle(ox + 0.4, oy + 8.6, 0.2, 1.4);
  }
  {
    const ox = 27, oy = 30.5; // Casa 2 — moderna (8 × 6.5)
    big('casa2', ox, oy, 8, 6.5, { glow: [{ dx: 4.0, dy: 7.0, z: 2.9, scale: 0.8 }] });
    rect(ox, oy, ox + 8, oy + 6.5, 8);
    interactables.push({ id: 'casa2', kind: 'house', x: ox + 5.2, y: oy + 7.3, radius: 1.8, markerZ: 3.6,
      title: 'Casa 2 · Residência Moderna', subtitle: 'Rua do Sol, 28',
      info: { Tipo: 'Sobrado contemporâneo', Quartos: '3 suítes · varanda', Terreno: '10 × 12 m', Situação: 'Ocupada (morador demo)', Valor: '₵ 12.000' } });
    obj({ frame: 'pool_0', x: 31.6, y: 38.6, anim: { frames: 3, fps: 3 }, flat: true, shadow: false });
    rect(31.6, 38.6, 36.2, 41.8, 0.3);
    obj({ frame: 'umb1', x: 36.6, y: 38.9 }); circle(36.6, 38.9, 0.12, 2.5);
    obj({ frame: 'lounger0', x: 36.4, y: 40.4 }); rect(35.9, 39.9, 37.6, 40.8, 0.5);
    obj({ frame: 'boug2', x: 26.2, y: 31.2 }); circle(26.2, 31.2, 0.7, 1.2);
    obj({ frame: 'pot1', x: 31.2, y: 37.6 }); circle(31.2, 37.6, 0.3, 0.7);
  }
  {
    const ox = 33, oy = 49.5; // Casa 3 — praia (5.8 × 6 + varanda 2.6 em +x)
    big('casa3', ox, oy, 8.4, 6.0, { glow: [{ dx: 7.8, dy: 1.3, z: 2.8, scale: 0.4 }, { dx: 7.8, dy: 4.7, z: 2.8, scale: 0.4 }] });
    rect(ox, oy, ox + 5.8, oy + 6, 5);
    rect(ox + 5.8, oy + 0.15, ox + 8.15, oy + 2.3, 3); rect(ox + 5.8, oy + 3.7, ox + 8.15, oy + 5.85, 3);
    rect(ox + 5.8, oy + 2.3, ox + 7.2, oy + 3.7, 3);
    interactables.push({ id: 'casa3', kind: 'house', x: ox + 9.2, y: oy + 3.0, radius: 1.8, markerZ: 3.4,
      title: 'Casa 3 · Casa de Praia', subtitle: 'Travessa da Orla, 3',
      info: { Tipo: 'Costeira · varanda de madeira', Quartos: '2 quartos · rede na varanda', Terreno: '9 × 11 m', Situação: 'Ocupada (morador demo)', Valor: '₵ 20.000' } });
    obj({ frame: 'palm1_0', x: ox - 1.0, y: oy + 6.8, anim: { frames: 4, fps: 2.5, pingpong: true } }); circle(ox - 1.0, oy + 6.8, 0.3, 7);
    obj({ frame: 'boug1', x: ox + 1.5, y: oy + 6.9 }); circle(ox + 1.5, oy + 6.9, 0.6, 1.2);
  }
  // ---------------- café
  {
    const ox = 17, oy = 16.6;
    big('cafe', ox, oy, 5.6, 4.4, { glow: [{ dx: 2.8, dy: 5.4, z: 2.2, scale: 1.1 }] });
    rect(ox, oy, ox + 5.6, oy + 4.4, 5);
    interactables.push({ id: 'cafe', kind: 'shop', x: ox + 3.9, y: oy + 5.2, radius: 1.8, markerZ: 4.6,
      title: 'Café da Praça', subtitle: 'Largo do Café',
      info: { Horário: '7h – 22h', Especialidade: 'Café coado e pão de queijo', Situação: 'Aberto (decorativo nesta versão)' } });
    for (const [x, y] of [[19.0, 22.6], [21.8, 23.2]]) { obj({ frame: 'cafetable', x, y }); circle(x, y, 0.75, 0.8); }
    obj({ frame: 'umb0', x: 23.4, y: 21.3 }); circle(23.4, 21.3, 0.12, 2.5);
  }

  // ---------------- lotes vazios
  for (const l of lots) {
    const x0 = l.x0, y0 = l.y0, x1 = l.x1 + 1, y1 = l.y1 + 1;
    for (const [sx, sy] of [[x0 + 0.2, y0 + 0.2], [x1 - 0.2, y0 + 0.2], [x0 + 0.2, y1 - 0.2], [x1 - 0.2, y1 - 0.2]]) { obj({ frame: 'stake', x: sx, y: sy }); circle(sx, sy, 0.12, 0.6); }
    const signX = (x0 + x1) / 2, signY = y1 - 0.6;
    obj({ frame: 'lotsign', x: signX, y: signY }); rect(signX - 0.75, signY - 0.12, signX + 0.75, signY + 0.12, 1.9);
    interactables.push({ id: l.id, kind: 'lot', x: signX, y: signY, radius: 1.2, markerZ: 2.6, rect: { x0, y0, x1, y1 },
      title: l.name, subtitle: 'Terreno livre · ' + l.size,
      info: { Situação: 'Disponível', Área: l.size, Zoneamento: 'Residencial', Preço: 'Em breve', Observação: 'Em breve será possível comprar este terreno e construir sua casa.' } });
  }

  // ---------------- praça do ipê
  obj({ frame: 'fountain_0', x: 30.5, y: 22, anim: { frames: 3, fps: 6 } }); circle(30.5, 22, 2.1, 1.4);
  const tree = (f: string, x: number, y: number) => { obj({ frame: f, x, y }); circle(x, y, 0.35, 7); };
  tree('ipe0', 25.4, 17.4); tree('ipe1', 36.0, 17.6); tree('jac0', 25.2, 27.0); tree('ipe0', 36.2, 27.2);
  const benchX = (x: number, y: number) => { obj({ frame: 'bench_x', x, y }); rect(x - 0.95, y - 0.4, x + 0.95, y + 0.4, 0.7); };
  const benchZ = (x: number, y: number) => { obj({ frame: 'bench_z', x, y }); rect(x - 0.4, y - 0.95, x + 0.4, y + 0.95, 0.7); };
  benchX(30.5, 17.4); benchX(30.5, 26.8); benchZ(26.0, 22); benchZ(35.2, 22);
  obj({ frame: 'trash', x: 28.0, y: 17.3 }); circle(28.0, 17.3, 0.35, 1.2);
  obj({ frame: 'trash', x: 33.4, y: 26.8 }); circle(33.4, 26.8, 0.35, 1.2);
  for (const [f, x, y] of [['flw_rosa', 27.5, 19.5], ['flw_lilas', 33.6, 19.4], ['flw_amarela', 27.4, 24.6], ['flw_rosa', 33.6, 24.7]] as const) { obj({ frame: f, x, y }); circle(x, y, 0.4, 0.8); }

  // ---------------- jardim central
  obj({ frame: 'hedge_x', x: 24.6, y: 29.6 }); rect(24.2, 29.2, 28.3, 30.0, 0.9);
  obj({ frame: 'hedge_x', x: 32.6, y: 29.6 }); rect(32.2, 29.2, 36.3, 30.0, 0.9);
  obj({ frame: 'bed_x', x: 28.8, y: 29.6 }); rect(28.8, 29.25, 31.8, 29.95, 0.4);
  obj({ frame: 'boug0', x: 24.0, y: 34.5 }); circle(24.0, 34.5, 0.7, 1.2);
  tree('ama0', 25.0, 39.8);

  // ---------------- postes de iluminação (com halo)
  const lampAt = (x: number, y: number) => { obj({ frame: 'lamp', x, y, glow: [{ dx: 0, dy: 0, z: 3.7, scale: 1 }] }); circle(x, y, 0.15, 6); };
  for (const y of [18, 26, 34, 41]) { lampAt(15.5, y); lampAt(38.5, y); }
  for (const x of [20, 28, 35]) { lampAt(x, 15.5); lampAt(x, 43.5); }
  for (const y of [14, 22, 32, 40]) lampAt(42.4, y);
  // placas
  obj({ frame: 'streetsign', x: 15.6, y: 15.6 }); circle(15.6, 15.6, 0.12, 4);
  obj({ frame: 'streetsign', x: 38.4, y: 43.4 }); circle(38.4, 43.4, 0.12, 4);
  interactables.push({ id: 'placa', kind: 'sign', x: 38.4, y: 43.4, radius: 1.3, markerZ: 3.6, title: 'Placa de rua',
    info: { Cruzamento: 'Av. Beira-Mar × Rua do Sol', Bairro: 'Beira-Mar', CEP: '00000-000 (fictício)' } });

  // ---------------- orla: ponto de ônibus, palmeiras, quiosque
  obj({ frame: 'busstop', x: 42.7, y: 29.0, big: true, sortRect: { x0: 42.3, y0: 27.2, x1: 43.6, y1: 30.8 } });
  rect(43.2, 27.3, 43.6, 30.7, 4);
  const stop = { x: 40.5, y: 29.0, name: 'Parada Orla Central' };
  interactables.push({ id: 'ponto', kind: 'busstop', x: 42.4, y: 29.0, radius: 1.9, markerZ: 3.6,
    title: 'Parada Orla Central', subtitle: 'Av. Beira-Mar',
    info: { Linha: '01 · Circular Ilha', Sentido: 'Rua das Palmeiras → Rua Oeste → Rua do Sol', Tarifa: '₵ 5 (demonstração)' } });
  obj({ frame: 'trash', x: 44.3, y: 32.2 }); circle(44.3, 32.2, 0.35, 1.2);
  const palm = (x: number, y: number, v: number) => { obj({ frame: `palm${v}_0`, x, y, anim: { frames: 4, fps: 2 + hash(x | 0, y | 0) * 1.2, pingpong: true } }); circle(x, y, 0.3, 7); };
  for (const y of [13, 18, 24, 35, 41, 46]) palm(44.6, y + 0.4, (y >> 1) % 3);
  benchZ(44.2, 21); benchZ(44.2, 38);
  obj({ frame: 'cart', x: 46.2, y: 33.2 }); rect(45.4, 32.6, 47.0, 33.8, 1.6);
  interactables.push({ id: 'coco', kind: 'cart', x: 46.2, y: 34.6, radius: 1.4, markerZ: 3.2, title: 'Carrinho de Água de Coco',
    info: { Produto: 'Água de coco gelada', Preço: '₵ 6 (decorativo nesta versão)' } });

  // ---------------- praia
  const umb = (x: number, y: number, v: number) => { obj({ frame: `umb${v}`, x, y }); circle(x, y, 0.12, 2.5); };
  const lounger = (x: number, y: number, v: number) => { obj({ frame: `lounger${v}`, x, y }); rect(x - 0.5, y - 0.45, x + 0.9, y + 0.45, 0.5); };
  umb(48, 16, 0); lounger(48.6, 17.5, 0);
  umb(50.5, 22, 2); lounger(51.2, 23.5, 1);
  umb(48.5, 27.5, 1); lounger(49.2, 29, 2);
  umb(50, 44, 0); lounger(50.6, 45.6, 1);
  obj({ frame: 'towel0', x: 51.5, y: 31.6, flat: true, shadow: false }); obj({ frame: 'towel1', x: 48.2, y: 38.4, flat: true, shadow: false });
  const rockAt = (x: number, y: number, v: number, r: number, h: number) => { obj({ frame: `rock${v}`, x, y }); circle(x, y, r, h); };
  rockAt(51.5, 11.5, 2, 1.3, 1.6); rockAt(50.2, 10.2, 0, 0.8, 0.8); rockAt(52.4, 51.5, 2, 1.3, 1.6); rockAt(50.8, 53.0, 1, 0.6, 0.5);
  rockAt(9, 46, 0, 0.8, 0.8); rockAt(8, 16, 1, 0.6, 0.5);

  // ---------------- píer com roda-gigante (no mar)
  obj({ frame: 'pier', x: 50.5, y: 38.6, flat: true });
  const walkable = [{ x0: 50.5, y0: 38.6, x1: 62.5, y1: 41.2 }];
  rect(50.5, 38.45, 62.5, 38.62, 1.4); rect(50.5, 41.18, 62.5, 41.35, 1.4); // guarda-corpos
  obj({ frame: 'ferris_0', x: 59.5, y: 39.9, anim: { frames: 8, fps: 4 }, big: true, sortRect: { x0: 56.3, y0: 38.1, x1: 62.7, y1: 41.7 } });
  rect(56.6, 38.7, 62.4, 41.1, 9);
  interactables.push({ id: 'roda', kind: 'landmark', x: 55.6, y: 39.9, radius: 2.0, markerZ: 2.6, title: 'Roda-Gigante da Orla',
    info: { Altura: '14 m', Cabines: '16', Situação: 'Passeios em breve' } });
  // farol, barcos e ilhas ao fundo
  obj({ frame: 'lighthouse', x: 60.5, y: 9.5, noFade: true });
  obj({ frame: 'rock2', x: 59.6, y: 10.6 }); obj({ frame: 'rock0', x: 61.6, y: 8.8 });
  obj({ frame: 'boat_a', x: 58, y: 26, bob: 1, shadow: false, noFade: true });
  obj({ frame: 'boat_b', x: 6, y: 58, bob: 2, shadow: false, noFade: true });
  obj({ frame: 'island_a', x: 4, y: 3, shadow: false, noFade: true });
  obj({ frame: 'island_b', x: 2, y: 30, shadow: false, noFade: true });

  // ---------------- vegetação periférica
  const rnd = (() => { let s = 11; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const isFree = (x: number, y: number, r: number) => {
    for (const c of colliders) {
      if (c.kind === 'circle' && Math.hypot(c.x - x, c.y - y) < c.r + r + 1.0) return false;
      if (c.kind === 'rect' && x > c.x0 - r - 1.0 && x < c.x1 + r + 1.0 && y > c.y0 - r - 1.0 && y < c.y1 + r + 1.0) return false;
    }
    for (const l of lots) if (x > l.x0 - 1 && x < l.x1 + 2 && y > l.y0 - 1 && y < l.y1 + 2) return false;
    return true;
  };
  const tIs = (x: number, y: number, t: T) => terrain[idx(Math.floor(x), Math.floor(y))] === t;
  for (let i = 0; i < 320; i++) {
    const x = 4 + rnd() * 52, y = 4 + rnd() * 54;
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 1 || ty < 1 || tx >= N - 1 || ty >= N - 1) continue;
    const t = terrain[idx(tx, ty)];
    const inLoop = x > 10 && x < 45 && y > 10 && y < 48;
    if (inLoop) continue;
    if (y > 47 && y < 57 && x > 31 && x < 45) continue;
    if (t === T.Grass && tIs(x + 1, y, T.Grass) && tIs(x, y + 1, T.Grass) && tIs(x - 1, y, T.Grass) && tIs(x, y - 1, T.Grass) && isFree(x, y, 0.6)) {
      const k = rnd();
      if (k < 0.18) tree(rnd() < 0.5 ? 'ipe0' : 'ipe1', x, y);
      else if (k < 0.27) tree(rnd() < 0.5 ? 'jac0' : 'ama0', x, y);
      else if (k < 0.55) palm(x, y, Math.floor(rnd() * 3));
      else if (k < 0.75) { obj({ frame: `boug${Math.floor(rnd() * 3)}`, x, y }); circle(x, y, 0.7, 1.2); }
      else { const f = ['flw_rosa', 'flw_lilas', 'flw_amarela'][Math.floor(rnd() * 3)]; obj({ frame: f, x, y }); circle(x, y, 0.4, 0.8); }
    } else if (t === T.Sand && x < 45 && isFree(x, y, 0.5) && rnd() < 0.35) {
      palm(x, y, Math.floor(rnd() * 3));
    }
  }

  // ---------------- rota do ônibus (faixa externa, mão direita)
  const busRoute = [{ x: 41.25, y: 45.5 }, { x: 41.25, y: 12.75 }, { x: 12.75, y: 12.75 }, { x: 12.75, y: 45.5 }];

  // ---------------- NPCs
  const npcs: NpcDef[] = [
    { sheet: 0, name: 'Seu Bené · Pescador', speed: 0.9, path: [{ x: 49, y: 31 }, { x: 52, y: 33 }, { x: 51.5, y: 36 }, { x: 48.5, y: 34.5 }],
      lines: ['Bom dia! O mar tá calminho hoje, ótimo pra pescar.', 'Dizem que logo vão vender aqueles terrenos perto da praça…', 'Já subiu na roda-gigante do píer? A vista do pôr do sol é linda!', 'Já provou a água de coco do carrinho? É a melhor da ilha.'] },
    { sheet: 1, name: 'Lia', speed: 1.4, path: [{ x: 43.5, y: 14 }, { x: 43.5, y: 44 }],
      lines: ['Corro todo fim de tarde pelo calçadão!', 'Você é novo no bairro? Seja bem-vindo!'] },
    { sheet: 2, name: 'Rafa', speed: 1.2, path: [{ x: 15.5, y: 16 }, { x: 15.5, y: 42.5 }, { x: 38.5, y: 42.5 }, { x: 38.5, y: 16 }],
      lines: ['E aí! Tô esperando abrir a venda dos terrenos pra construir minha casa.', 'O ônibus circular passa ali na orla. Pontualíssimo!'] },
    { sheet: 3, name: 'Duda', speed: 1.1, path: [{ x: 27.5, y: 18.8 }, { x: 33.8, y: 18.8 }, { x: 33.8, y: 25.4 }, { x: 27.5, y: 25.4 }],
      lines: ['Adoro esse ipê rosa da praça. Fica lindo nessa época!', 'O café ali faz um pão de queijo incrível.'] },
    { sheet: 4, name: 'Dona Cida · Moradora', speed: 0.7, path: [{ x: 17.5, y: 23.5 }, { x: 23.5, y: 23.5 }],
      lines: ['Moro aqui há 30 anos, meu filho. Esse bairro só melhora!', 'Cuidado ao atravessar a rua, viu? Use a faixa.'] },
  ];
  npcs.forEach((n, i) => interactables.push({ id: `npc${i}`, kind: 'npc', x: 0, y: 0, radius: 1.6, markerZ: 3.6, title: n.name, info: {}, npc: i }));

  const regions = [
    { name: 'Píer da Roda-Gigante', x0: 50, y0: 37, x1: 66, y1: 43 },
    { name: 'Praia da Ilha', x0: 45, y0: 0, x1: 66, y1: 66 },
    { name: 'Calçadão da Orla', x0: 42, y0: 11, x1: 45, y1: 48 },
    { name: 'Praça do Ipê', x0: 24, y0: 16, x1: 38, y1: 29 },
    { name: 'Largo do Café', x0: 16, y0: 16, x1: 24, y1: 24 },
    { name: 'Bairro Beira-Mar', x0: 11, y0: 11, x1: 42, y1: 48 },
    { name: 'Ilha Inicial', x0: 0, y0: 0, x1: 66, y1: 66 },
  ];

  return {
    terrain, roadDir, centerLine, crossing, walkable, objects, colliders, interactables, lots, busRoute, busStop: stop,
    spawn: { x: 43.2, y: 24.6 }, npcs, regions,
  };
}
