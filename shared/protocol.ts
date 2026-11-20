// Protocolo de rede (WebSocket, JSON). Cliente → Servidor (C2S) e Servidor → Cliente (S2C).
// Posições são autoritativas do cliente com validação do servidor (velocidade/limites);
// economia, terrenos e chat são autoritativos do servidor.

export const PROTOCOL_VERSION = 1;
export const TICK_HZ = 10;                // frequência de snapshots
export const ROOM_CAPACITY = 40;          // jogadores por instância da cidade
export const AOI_RADIUS = 90;             // raio de interesse (m)
export const CHAT_MAX = 140;
export const NAME_MAX = 16;

export type AvatarId = 'avatar_m' | 'avatar_f';
export type AnimState = 'idle' | 'walk' | 'run' | 'jump' | 'sit' | 'dance' | 'agree' | 'headShake' | 'wave';

export interface Appearance { avatar: AvatarId; outfit: number }   // outfit = índice da paleta de cores

export interface PlayerInfo { id: string; name: string; look: Appearance; x: number; y: number; z: number; ry: number; anim: AnimState }
export interface LotState { id: string; owner: string | null; ownerName: string | null }
export interface Profile { token: string; name: string; coins: number; gems: number; level: number; lots: string[] }

export type C2S =
  | { t: 'hello'; v: number; name: string; look: Appearance; token?: string }
  | { t: 'state'; x: number; y: number; z: number; ry: number; anim: AnimState }
  | { t: 'chat'; text: string }
  | { t: 'emote'; anim: AnimState }
  | { t: 'buyLot'; id: string }
  | { t: 'look'; look: Appearance }
  | { t: 'ping'; at: number };

export type S2C =
  | { t: 'welcome'; you: string; me: PlayerInfo; room: string; profile: Profile; players: PlayerInfo[]; lots: LotState[]; online: number }
  | { t: 'join'; p: PlayerInfo }
  | { t: 'leave'; id: string }
  | { t: 'snap'; at: number; p: [string, number, number, number, number, AnimState][] }   // id, x, y, z, ry, anim
  | { t: 'chat'; id: string; name: string; text: string; at: number }
  | { t: 'emote'; id: string; anim: AnimState }
  | { t: 'look'; id: string; look: Appearance }
  | { t: 'correct'; x: number; y: number; z: number }
  | { t: 'lot'; lot: LotState }
  | { t: 'profile'; profile: Profile }
  | { t: 'notice'; level: 'info' | 'error' | 'success'; text: string }
  | { t: 'online'; count: number; room: string }
  | { t: 'pong'; at: number };

/** Paletas de roupa: troca de matiz (peças coloridas) + tingimento (peças neutras). */
export const OUTFITS = [
  { name: 'Clássico', hue: 0, sat: 1, tint: [1, 1, 1], color: '#3d4452' },
  { name: 'Coral', hue: 0.02, sat: 1.6, tint: [1.0, 0.45, 0.4], color: '#ff6f61' },
  { name: 'Oceano', hue: 0.55, sat: 1.4, tint: [0.35, 0.6, 1.0], color: '#3d8bff' },
  { name: 'Floresta', hue: 0.33, sat: 1.3, tint: [0.45, 0.85, 0.5], color: '#3fae6a' },
  { name: 'Lavanda', hue: 0.75, sat: 1.3, tint: [0.75, 0.55, 1.0], color: '#a77bff' },
  { name: 'Areia', hue: 0.1, sat: 1.1, tint: [1.0, 0.85, 0.6], color: '#e8c48f' },
] as const;

export function sanitizeLook(l: Partial<Appearance> | undefined): Appearance {
  return { avatar: l?.avatar === 'avatar_f' ? 'avatar_f' : 'avatar_m', outfit: Math.max(0, Math.min(OUTFITS.length - 1, Number(l?.outfit) | 0)) };
}
