// Instância da cidade inicial: até ROOM_CAPACITY jogadores, snapshots a TICK_HZ com
// área de interesse (só envia quem está perto), chat, emotes e compra de terrenos.
import type { WebSocket } from 'ws';
import { AOI_RADIUS, AnimState, Appearance, PlayerInfo, ROOM_CAPACITY, S2C, TICK_HZ } from '../../shared/protocol';
import { CITY, spawnPoint } from '../../shared/city';
import { Bucket, cleanChat } from './moderation';
import { Store } from './store';

const ANIMS: AnimState[] = ['idle', 'walk', 'run', 'jump', 'sit', 'dance', 'agree', 'headShake', 'wave'];

export interface Client {
  id: string; ws: WebSocket; name: string; look: Appearance; token: string;
  x: number; y: number; z: number; ry: number; anim: AnimState;
  lastAt: number; chat: Bucket; strikes: number;
}

export class Room {
  players = new Map<string, Client>();
  private tick: NodeJS.Timeout;
  constructor(public id: string, private store: Store, private onEmpty: (r: Room) => void) {
    this.tick = setInterval(() => this.broadcastSnapshots(), 1000 / TICK_HZ);
  }
  get full() { return this.players.size >= ROOM_CAPACITY; }

  send(c: Client, m: S2C) { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(m)); }
  broadcast(m: S2C, except?: string) { const s = JSON.stringify(m); for (const c of this.players.values()) if (c.id !== except && c.ws.readyState === 1) c.ws.send(s); }
  info(c: Client): PlayerInfo { return { id: c.id, name: c.name, look: c.look, x: c.x, y: c.y, z: c.z, ry: c.ry, anim: c.anim }; }

  join(c: Client) {
    const sp = spawnPoint();
    Object.assign(c, { x: sp.x, y: 0, z: sp.z, ry: sp.rot, anim: 'idle' as AnimState, lastAt: Date.now() });
    this.players.set(c.id, c);
    const profile = this.store.profile(c.token, c.name);
    c.token = profile.token;
    this.send(c, { t: 'welcome', you: c.id, me: this.info(c), room: this.id, profile, players: [...this.players.values()].filter((p) => p.id !== c.id).map((p) => this.info(p)), lots: this.store.lots(), online: this.players.size });
    this.broadcast({ t: 'join', p: this.info(c) }, c.id);
    this.broadcast({ t: 'online', count: this.players.size, room: this.id });
  }

  leave(c: Client) {
    this.players.delete(c.id);
    this.broadcast({ t: 'leave', id: c.id });
    this.broadcast({ t: 'online', count: this.players.size, room: this.id });
    if (!this.players.size) this.onEmpty(this);
  }

  /** Posição informada pelo cliente: valida limites e velocidade (anti-teleporte simples). */
  state(c: Client, m: { x: number; y: number; z: number; ry: number; anim: AnimState }) {
    const now = Date.now();
    const dt = Math.max(0.05, (now - c.lastAt) / 1000);
    const nums = [m.x, m.y, m.z, m.ry].every((v) => Number.isFinite(v));
    if (!nums) return;
    const x = Math.max(-CITY.half - 10, Math.min(CITY.shoreX + 2, m.x));
    const z = Math.max(-CITY.half - 10, Math.min(CITY.half + 10, m.z));
    const dist = Math.hypot(x - c.x, z - c.z);
    if (dist / dt > 14) { // rápido demais: corrige o cliente
      c.strikes++;
      c.lastAt = now;
      this.send(c, { t: 'correct', x: c.x, y: c.y, z: c.z });
      return;
    }
    c.x = x; c.y = Math.max(0, Math.min(3, m.y)); c.z = z; c.ry = m.ry; c.lastAt = now;
    c.anim = ANIMS.includes(m.anim) ? m.anim : 'idle';
  }

  chat(c: Client, text: unknown) {
    if (!c.chat.take()) { this.send(c, { t: 'notice', level: 'error', text: 'Calma! Aguarde um instante para enviar outra mensagem.' }); return; }
    const t = cleanChat(text);
    if (!t) return;
    this.broadcast({ t: 'chat', id: c.id, name: c.name, text: t, at: Date.now() });
  }

  emote(c: Client, anim: AnimState) {
    if (!ANIMS.includes(anim)) return;
    c.anim = anim;
    this.broadcast({ t: 'emote', id: c.id, anim }, c.id);
  }

  look(c: Client, look: Appearance) {
    c.look = look;
    this.broadcast({ t: 'look', id: c.id, look }, c.id);
  }

  buyLot(c: Client, id: string) {
    const r = this.store.buyLot(c.token, String(id));
    if (!r.ok) { this.send(c, { t: 'notice', level: 'error', text: r.reason }); return; }
    this.send(c, { t: 'profile', profile: r.profile });
    this.send(c, { t: 'notice', level: 'success', text: `Parabéns! O terreno ${id} agora é seu.` });
    this.broadcast({ t: 'lot', lot: r.lot });
  }

  /** Snapshots com área de interesse: cada jogador recebe só quem está a até AOI_RADIUS. */
  private broadcastSnapshots() {
    if (!this.players.size) return;
    const all = [...this.players.values()];
    const at = Date.now();
    for (const c of all) {
      const near = all.filter((o) => o.id !== c.id && Math.hypot(o.x - c.x, o.z - c.z) <= AOI_RADIUS);
      if (!near.length) continue;
      this.send(c, { t: 'snap', at, p: near.map((o) => [o.id, +o.x.toFixed(2), +o.y.toFixed(2), +o.z.toFixed(2), +o.ry.toFixed(3), o.anim]) });
    }
  }

  dispose() { clearInterval(this.tick); }
}
