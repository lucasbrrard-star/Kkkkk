// Servidor da Cidade Viva: HTTP (arquivos do cliente em produção + /health) e WebSocket (/ws).
// Distribui jogadores em instâncias da cidade inicial (salas) com capacidade fixa.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { C2S, PROTOCOL_VERSION, sanitizeLook } from '../../shared/protocol';
import { Room, Client } from './room';
import { Store } from './store';
import { Bucket, cleanName } from './moderation';

const PORT = Number(process.env.PORT ?? 8787);
const STATIC = path.resolve('dist/client');
const store = new Store();
const rooms: Room[] = [];
let roomSeq = 1;

function pickRoom(): Room {
  let r = rooms.find((x) => !x.full);
  if (!r) {
    r = new Room(`cidade-inicial-${roomSeq++}`, store, (empty) => {
      if (rooms.length > 1) { empty.dispose(); rooms.splice(rooms.indexOf(empty), 1); }
    });
    rooms.push(r);
  }
  return r;
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.map((r) => ({ id: r.id, players: r.players.size })) }));
    return;
  }
  // arquivos estáticos do cliente (produção)
  let f = path.join(STATIC, decodeURIComponent(url.pathname));
  if (!f.startsWith(STATIC)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(STATIC, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); res.end('Cliente não compilado. Rode: npm run build'); return; }
  const ext = path.extname(f);
  res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=86400' });
  fs.createReadStream(f).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', (ws) => {
  let client: Client | null = null;
  let room: Room | null = null;
  const msgBucket = new Bucket(40, 25); // proteção contra inundação de mensagens
  ws.on('message', (raw) => {
    if (!msgBucket.take()) return;
    let m: C2S;
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (!client) {
      if (m.t !== 'hello' || m.v !== PROTOCOL_VERSION) { ws.close(4000, 'versão incompatível'); return; }
      const look = sanitizeLook(m.look);
      client = { id: crypto.randomBytes(4).toString('hex'), ws, name: cleanName(m.name), look, token: typeof m.token === 'string' ? m.token.slice(0, 64) : '', x: 0, y: 0, z: 0, ry: 0, anim: 'idle', lastAt: Date.now(), chat: new Bucket(3, 1), strikes: 0 };
      room = pickRoom();
      room.join(client);
      return;
    }
    switch (m.t) {
      case 'state': room!.state(client, m); break;
      case 'chat': room!.chat(client, m.text); break;
      case 'emote': room!.emote(client, m.anim); break;
      case 'buyLot': room!.buyLot(client, m.id); break;
      case 'look': room!.look(client, sanitizeLook(m.look)); break;
      case 'ping': room!.send(client, { t: 'pong', at: m.at }); break;
    }
  });
  ws.on('close', () => { if (client && room) room.leave(client); });
  ws.on('error', () => ws.close());
});

server.listen(PORT, () => console.log(`Cidade Viva: servidor em http://localhost:${PORT} (WebSocket em /ws)`));
