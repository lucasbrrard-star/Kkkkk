// Servidor simulado no navegador (modo offline / prévia): mesma API do servidor real,
// com moradores-bot que passeiam pela praça, conversam, dançam e acenam.
// Perfil e terrenos ficam salvos no localStorage.
import { LOTS, groundHeight, spawnPoint } from '../../../shared/city';
import { AnimState, Appearance, C2S, LotState, OUTFITS, PlayerInfo, Profile, S2C, TICK_HZ } from '../../../shared/protocol';

const KEY = 'cidadeviva.offline.v1';
const BOT_NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabi', 'Hugo', 'Isa', 'João'];
const GREET = ['Oi! Bem-vindo(a) à Cidade Viva 😊', 'Alguém sabe onde fica a Corretora?', 'Já viu os terrenos na Rua da Aurora?', 'Que pôr do sol lindo hoje 🌅', 'Vou na praia depois, bora?', 'Comprei meu terreno ontem!', 'Olá, pessoal!', 'Essa praça é demais'];
const REPLIES = ['Oi! Tudo bem? 👋', 'Seja bem-vindo(a)!', 'Opa, beleza?', 'Olá! Precisando de ajuda, fala com a Guia Lia perto do pórtico.', 'Eae! 😄'];

interface Bot { id: string; name: string; look: Appearance; x: number; z: number; ry: number; anim: AnimState; tx: number; tz: number; wait: number; speed: number; busy: number }
interface Saved { profile: Profile; lots: Record<string, { owner: string; ownerName: string }> }

// rotas de passeio (pontos nas calçadas e praça, sem atravessar prédios)
const WAYPOINTS: [number, number][] = [];
for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; WAYPOINTS.push([Math.cos(a) * 15, Math.sin(a) * 15]); }
WAYPOINTS.push([0, 22], [0, -22], [22, 0], [-22, 0], [27, 20], [27, -20], [-27, 20], [-27, -20], [33, 0], [-33, 0], [0, 33], [0, -33], [38, -27], [38, -14], [38, 14], [38, 27], [-38, -27], [-38, -14], [-38, 14], [-38, 27]);

/** Trecho permitido: perto e sem cruzar o chafariz/bancos. */
function okSegment(ax: number, az: number, bx: number, bz: number) {
  if (Math.hypot(bx - ax, bz - az) > 16) return false;
  const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, -(ax * vx + az * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(ax + vx * t, az + vz * t) > 10.5;
}

export class OfflineServer {
  private me: PlayerInfo | null = null;
  private bots: Bot[] = [];
  private data: Saved;
  private timer = 0;
  private last = performance.now();
  private chatTimer = 6;

  constructor(private out: (m: S2C) => void) {
    let saved: Saved | null = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { /* */ }
    this.data = saved ?? { profile: { token: 'offline', name: 'Visitante', coins: 30000, gems: 500, level: 1, lots: [] }, lots: { T07: { owner: 'bot-ana', ownerName: 'Ana' }, T12: { owner: 'bot-hugo', ownerName: 'Hugo' } } };
  }

  private save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* */ } }
  private emit(m: S2C) { setTimeout(() => this.out(m), 30 + Math.random() * 40); }
  private lots(): LotState[] { return LOTS.map((l) => ({ id: l.id, owner: this.data.lots[l.id]?.owner ?? null, ownerName: this.data.lots[l.id]?.ownerName ?? null })); }

  receive(m: C2S) {
    switch (m.t) {
      case 'hello': {
        const sp = spawnPoint();
        this.data.profile.name = m.name;
        this.me = { id: 'eu', name: m.name, look: m.look, x: sp.x, y: 0, z: sp.z, ry: sp.rot, anim: 'idle' };
        this.spawnBots();
        this.save();
        this.emit({ t: 'welcome', you: 'eu', me: this.me, room: 'cidade-inicial-1 (offline)', profile: this.data.profile, players: this.bots.map((b) => this.info(b)), lots: this.lots(), online: this.bots.length + 1 });
        this.timer = window.setInterval(() => this.tick(), 1000 / TICK_HZ);
        setTimeout(() => this.botSay(this.bots[0], `Oi, ${m.name}! Bem-vindo(a) à Cidade Viva 👋`), 4000);
        break;
      }
      case 'state': if (this.me) Object.assign(this.me, { x: m.x, y: m.y, z: m.z, ry: m.ry, anim: m.anim }); break;
      case 'chat': {
        const text = String(m.text).slice(0, 140).trim();
        if (!text) return;
        this.emit({ t: 'chat', id: 'eu', name: this.me?.name ?? 'Você', text, at: Date.now() });
        if (/\b(oi|ol[aá]|eae|e a[ií]|bom dia|boa tarde|boa noite|hello|hi)\b/i.test(text)) {
          const b = this.nearestBot();
          if (b) setTimeout(() => { this.botSay(b, REPLIES[Math.floor(Math.random() * REPLIES.length)]); this.botEmote(b, 'wave'); }, 1200 + Math.random() * 1500);
        }
        break;
      }
      case 'emote': if (this.me) this.me.anim = m.anim; break;
      case 'look': if (this.me) this.me.look = m.look; break;
      case 'buyLot': {
        const p = this.data.profile, lot = LOTS.find((l) => l.id === m.id);
        let reason = '';
        if (!lot) reason = 'Terreno inválido.';
        else if (this.data.lots[lot.id]) reason = 'Este terreno já tem dono.';
        else if (p.lots.length >= 2) reason = 'Limite de 2 terrenos por jogador nesta versão.';
        else if (p.coins < lot.price) reason = 'Moedas insuficientes.';
        if (reason || !lot) { this.emit({ t: 'notice', level: 'error', text: reason }); return; }
        p.coins -= lot.price; p.lots.push(lot.id);
        this.data.lots[lot.id] = { owner: 'eu', ownerName: p.name };
        this.save();
        this.emit({ t: 'profile', profile: p });
        this.emit({ t: 'notice', level: 'success', text: `Parabéns! O terreno ${lot.id} agora é seu.` });
        this.emit({ t: 'lot', lot: { id: lot.id, owner: 'eu', ownerName: p.name } });
        break;
      }
      case 'ping': this.emit({ t: 'pong', at: m.at }); break;
    }
  }

  private info(b: Bot): PlayerInfo { return { id: b.id, name: b.name, look: b.look, x: b.x, y: groundHeight(b.x, b.z), z: b.z, ry: b.ry, anim: b.anim }; }

  private spawnBots() {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const [x, z] = WAYPOINTS[(i * 3) % 12];
      this.bots.push({ id: `bot${i}`, name: BOT_NAMES[i], look: { avatar: i % 2 ? 'avatar_m' : 'avatar_f', outfit: (i * 2 + 1) % OUTFITS.length }, x: x + Math.random(), z: z + Math.random(), ry: Math.random() * 6.28, anim: 'idle', tx: x, tz: z, wait: Math.random() * 4, speed: 1.4 + Math.random() * 0.3, busy: 0 });
    }
    // dois amigos dançando perto do chafariz
    Object.assign(this.bots[2], { x: 6.5, z: 9, tx: 6.5, tz: 9, anim: 'dance', busy: 1e9, ry: Math.PI });
    Object.assign(this.bots[3], { x: 8, z: 7.5, tx: 8, tz: 7.5, anim: 'dance', busy: 1e9, ry: -2.4 });
  }

  private nearestBot(): Bot | undefined {
    if (!this.me) return undefined;
    let best: Bot | undefined, bd = 1e9;
    for (const b of this.bots) { const d = Math.hypot(b.x - this.me.x, b.z - this.me.z); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  private botSay(b: Bot | undefined, text: string) { if (b) this.emit({ t: 'chat', id: b.id, name: b.name, text, at: Date.now() }); }
  private botEmote(b: Bot, a: AnimState) { b.anim = a; b.busy = 2.5; this.emit({ t: 'emote', id: b.id, anim: a }); }

  private tick() {
    const now = performance.now(), dt = Math.min(0.3, (now - this.last) / 1000);
    this.last = now;
    for (const b of this.bots) {
      if (b.busy > 0) { b.busy -= dt; if (b.busy <= 0 && b.anim !== 'dance') b.anim = 'idle'; continue; }
      const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
      if (d < 0.3) {
        b.anim = 'idle';
        b.wait -= dt;
        if (b.wait <= 0) {
          const [x, z] = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
          if (okSegment(b.x, b.z, x, z)) { b.tx = x + (Math.random() - 0.5) * 1.5; b.tz = z + (Math.random() - 0.5) * 1.5; }
          b.wait = 2 + Math.random() * 6;
          if (Math.random() < 0.12) this.botEmote(b, Math.random() < 0.5 ? 'wave' : 'agree');
        }
      } else {
        const step = Math.min(d, b.speed * dt);
        b.x += (dx / d) * step; b.z += (dz / d) * step;
        b.ry = Math.atan2(dx, dz);
        b.anim = 'walk';
      }
    }
    this.chatTimer -= dt;
    if (this.chatTimer <= 0) { this.chatTimer = 14 + Math.random() * 18; this.botSay(this.bots[Math.floor(Math.random() * this.bots.length)], GREET[Math.floor(Math.random() * GREET.length)]); }
    this.out({ t: 'snap', at: Date.now(), p: this.bots.map((b) => [b.id, +b.x.toFixed(2), +groundHeight(b.x, b.z).toFixed(2), +b.z.toFixed(2), +b.ry.toFixed(3), b.anim]) });
  }

  dispose() { clearInterval(this.timer); }
}
