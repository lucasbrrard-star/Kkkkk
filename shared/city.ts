// Layout da cidade inicial ("Cidade Viva — Centro"), compartilhado por cliente e servidor.
// Unidades em metros. Eixos: x → leste, z → sul, y ↑. Origem no centro da Praça das Boas-Vindas.
// O servidor usa os mesmos dados para validar terrenos, limites e pontos de nascimento.

export const CITY = {
  name: 'Cidade Viva',
  district: 'Centro de Boas-Vindas',
  half: 105,            // limite jogável (|x|, |z|)
  shoreX: 112,          // início do mar (a leste)
  roadWidth: 11,
  sidewalk: 3.5,
};

export interface Road { x0: number; z0: number; x1: number; z1: number; w: number; name: string }
export interface Lot { id: string; num: number; x: number; z: number; w: number; d: number; price: number; street: string }
export interface Placement { model: string; x: number; z: number; rot: number; scale?: number }
export interface Building extends Placement { name?: string; kind: 'backdrop' | 'service'; label?: string; interact?: string }

const G = [-80, -30, 30, 80]; // eixos das ruas (x e z)

export const ROADS: Road[] = [
  { x0: -30, z0: -105, x1: -30, z1: 105, w: 11, name: 'Rua das Palmeiras' },
  { x0: 30, z0: -105, x1: 30, z1: 105, w: 11, name: 'Rua dos Ipês' },
  { x0: 80, z0: -105, x1: 80, z1: 105, w: 12, name: 'Avenida Beira-Mar' },
  { x0: -80, z0: -105, x1: -80, z1: 105, w: 11, name: 'Rua do Farol' },
  { x0: -105, z0: -30, x1: 105, z1: -30, w: 11, name: 'Rua da Aurora' },
  { x0: -105, z0: 30, x1: 105, z1: 30, w: 11, name: 'Rua do Sol' },
  { x0: -105, z0: -80, x1: 105, z1: -80, w: 11, name: 'Rua das Flores' },
  { x0: -105, z0: 80, x1: 105, z1: 80, w: 11, name: 'Rua do Comércio' },
];
void G;

/** Praça central (área pavimentada) */
export const PLAZA = { half: 24.5 };

/** Terrenos vazios à venda (destino dos novos jogadores). */
export const LOTS: Lot[] = (() => {
  const L: Lot[] = [];
  let n = 1;
  const add = (x: number, z: number, w: number, d: number, street: string, price: number) => L.push({ id: `T${String(n).padStart(2, '0')}`, num: n++, x, z, w, d, price, street });
  // quadra norte (x −21..21, z −71..−39)
  add(-12, -55, 18, 30, 'Rua da Aurora', 12000);
  add(12, -55, 18, 30, 'Rua da Aurora', 12000);
  // quadra oeste (x −71..−39, z −21..21)
  add(-55, -11.5, 30, 19, 'Rua das Palmeiras', 11000);
  add(-55, 11.5, 30, 19, 'Rua das Palmeiras', 11000);
  // esquinas (dois por quadra)
  for (const [cx, cz, st] of [[-55, -55, 'Rua da Aurora'], [55, -55, 'Rua dos Ipês'], [-55, 55, 'Rua do Sol']] as const) {
    add(cx - 8, cz, 15, 30, st, 9500);
    add(cx + 8, cz, 15, 30, st, 9500);
  }
  // faixa norte externa
  for (const [x, w] of [[-55, 30], [-12, 18], [12, 18], [55, 30]] as const) add(x, -96, w, 12, 'Rua das Flores', 8000);
  return L;
})();

/** Edifícios: serviços da cidade e prédios de fundo (skyline). rot em graus. */
export const BUILDINGS: Building[] = [
  // serviços (quadra leste e sul)
  { model: 'store', x: 46, z: -10, rot: -90, kind: 'service', label: 'Corretora Cidade Viva', interact: 'corretora' },
  { model: 'modern', x: 55, z: 10, rot: -90, kind: 'service', label: 'Café & Lounge', interact: 'cafe' },
  { model: 'colonial_a', x: -10, z: 55, rot: 180, kind: 'service', label: 'Prefeitura', interact: 'prefeitura' },
  { model: 'colonial_b', x: 12, z: 55, rot: 180, kind: 'service', label: 'Loja de Roupas', interact: 'loja' },
  { model: 'shoprow', x: 55, z: 55, rot: 180, kind: 'service', label: 'Galeria Comercial', interact: 'galeria' },
  // skyline (faixas externas)
  { model: 'tower_b', x: -95, z: -95, rot: 45, kind: 'backdrop' },
  { model: 'tower_c', x: -95, z: -45, rot: 90, kind: 'backdrop' },
  { model: 'apartment', x: -94, z: 0, rot: 90, kind: 'backdrop' },
  { model: 'tower_a', x: -95, z: 50, rot: 90, kind: 'backdrop' },
  { model: 'tower_c', x: -90, z: 96, rot: 0, kind: 'backdrop' },
  { model: 'apartment', x: -45, z: 95, rot: 0, kind: 'backdrop' },
  { model: 'colonial_b', x: -12, z: 95, rot: 0, kind: 'backdrop' },
  { model: 'colonial_a', x: 12, z: 95, rot: 0, kind: 'backdrop' },
  { model: 'tower_a', x: 50, z: 96, rot: 0, kind: 'backdrop' },
];

/** Pontos de nascimento ao redor do chafariz. */
export function spawnPoint(seed = Math.random()): { x: number; z: number; rot: number } {
  const a = seed * Math.PI * 2;
  const r = 13 + (seed * 7919 % 1) * 4;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r, rot: Math.atan2(-Math.cos(a), -Math.sin(a)) };
}

/** Faixas de células (entre ruas) usadas para calçadas e quadras. */
export const CELLS_X: [number, number][] = [[-105, -85.5], [-74.5, -35.5], [-24.5, 24.5], [35.5, 74]];
export const CELLS_Z: [number, number][] = [[-105, -85.5], [-74.5, -35.5], [-24.5, 24.5], [35.5, 74.5], [85.5, 105]];
export const BOARDWALK = { x0: 86, x1: 92 };
export const BEACH = { x0: 92, x1: 120 };

export const CURB = 0.15;

/** Altura do chão (calçadas elevadas pelo meio-fio, ruas no nível 0, areia em declive). */
export function groundHeight(x: number, z: number): number {
  if (x >= BOARDWALK.x0 && x <= BOARDWALK.x1) return CURB;
  if (x > BOARDWALK.x1) return Math.max(-0.4, 0.12 - Math.max(0, x - CITY.shoreX + 6) * 0.07);
  const inX = CELLS_X.some(([a, b]) => x >= a && x <= b), inZ = CELLS_Z.some(([a, b]) => z >= a && z <= b);
  return inX && inZ ? CURB : 0;
}

export function lotAt(x: number, z: number): Lot | undefined {
  return LOTS.find((l) => Math.abs(x - l.x) <= l.w / 2 && Math.abs(z - l.z) <= l.d / 2);
}
