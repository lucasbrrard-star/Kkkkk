// Moderação básica: nomes, filtro de palavras e limite de mensagens (token bucket).
import { CHAT_MAX, NAME_MAX } from '../../shared/protocol';

const BLOCKED = ['porra', 'caralho', 'merda', 'puta', 'fdp', 'buceta', 'viado', 'arrombado', 'cuzão', 'cuzao', 'desgraça', 'vagabund', 'otario', 'otário'];

export function cleanName(raw: unknown): string {
  let n = String(raw ?? '').normalize('NFC').replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  if (n.length < 2 || BLOCKED.some((w) => n.toLowerCase().includes(w))) n = 'Visitante' + Math.floor(Math.random() * 900 + 100);
  return n;
}

export function cleanChat(raw: unknown): string | null {
  let t = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
  if (!t) return null;
  for (const w of BLOCKED) t = t.replace(new RegExp(w, 'gi'), (m) => '*'.repeat(m.length));
  return t;
}

export class Bucket {
  private tokens: number;
  private last = Date.now();
  constructor(private cap = 3, private perSec = 1) { this.tokens = cap; }
  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.cap, this.tokens + ((now - this.last) / 1000) * this.perSec);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
