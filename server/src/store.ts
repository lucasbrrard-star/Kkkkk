// Persistência simples em JSON (perfis de convidado e posse de terrenos).
// Interface pensada para trocar por banco (Postgres/Supabase) sem mudar as salas.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { LOTS } from '../../shared/city';
import type { LotState, Profile } from '../../shared/protocol';

interface Data { profiles: Record<string, Profile>; lots: Record<string, { owner: string; ownerName: string; at: number }> }

export class Store {
  private data: Data = { profiles: {}, lots: {} };
  private timer: NodeJS.Timeout | null = null;
  constructor(private file = path.resolve(process.env.DATA_FILE ?? 'server/data/store.json')) {
    try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* primeiro uso */ }
    this.data.profiles ??= {}; this.data.lots ??= {};
  }

  private save() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    }, 500);
  }

  /** Obtém (ou cria) o perfil de convidado associado ao token. */
  profile(token: string | undefined, name: string): Profile {
    let p = token ? this.data.profiles[token] : undefined;
    if (!p) {
      const t = crypto.randomBytes(18).toString('base64url');
      p = { token: t, name, coins: 30000, gems: 500, level: 1, lots: [] };
      this.data.profiles[t] = p;
    }
    p.name = name;
    this.save();
    return p;
  }

  lots(): LotState[] {
    return LOTS.map((l) => ({ id: l.id, owner: this.data.lots[l.id]?.owner ?? null, ownerName: this.data.lots[l.id]?.ownerName ?? null }));
  }

  /** Compra atômica (single-thread): valida existência, disponibilidade e saldo. */
  buyLot(token: string, lotId: string): { ok: true; lot: LotState; profile: Profile } | { ok: false; reason: string } {
    const p = this.data.profiles[token];
    const lot = LOTS.find((l) => l.id === lotId);
    if (!p || !lot) return { ok: false, reason: 'Terreno inválido.' };
    if (this.data.lots[lotId]) return { ok: false, reason: 'Este terreno já tem dono.' };
    if (p.lots.length >= 2) return { ok: false, reason: 'Limite de 2 terrenos por jogador nesta versão.' };
    if (p.coins < lot.price) return { ok: false, reason: 'Moedas insuficientes.' };
    p.coins -= lot.price;
    p.lots.push(lotId);
    this.data.lots[lotId] = { owner: p.token.slice(0, 8), ownerName: p.name, at: Date.now() };
    this.save();
    return { ok: true, lot: { id: lotId, owner: p.token.slice(0, 8), ownerName: p.name }, profile: p };
  }
}
