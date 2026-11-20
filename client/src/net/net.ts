// Conexão com o servidor (WebSocket em /ws). Se o servidor não responder (ex.: prévia
// estática), cai automaticamente para o modo offline, que simula a mesma API com bots.
import { Appearance, C2S, PROTOCOL_VERSION, S2C } from '../../../shared/protocol';
import { OfflineServer } from './offline';

type Handler = (m: S2C) => void;

export class Net {
  private ws: WebSocket | null = null;
  private offline: OfflineServer | null = null;
  private handlers: Handler[] = [];
  mode: 'online' | 'offline' = 'online';
  ping = 0;
  private pingTimer = 0;

  on(h: Handler) { this.handlers.push(h); }
  private emit(m: S2C) { for (const h of this.handlers) h(m); }

  send(m: C2S) {
    if (this.offline) { this.offline.receive(m); return; }
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  /** Tenta o servidor real; se falhar em ~6 s, usa o modo offline. */
  async connect(name: string, look: Appearance, token?: string, opts: { forceOffline?: boolean } = {}): Promise<void> {
    const hello: C2S = { t: 'hello', v: PROTOCOL_VERSION, name, look, token };
    const hostedPreview = (window as unknown as { CIDADE_VIVA_OFFLINE?: boolean }).CIDADE_VIVA_OFFLINE === true; // prévia estática (sem servidor)
    if (!opts.forceOffline && !hostedPreview && location.protocol.startsWith('http')) {
      const ok = await this.tryWs(hello);
      if (ok) return;
    }
    this.mode = 'offline';
    this.offline = new OfflineServer((m) => this.emit(m));
    this.offline.receive(hello);
  }

  private tryWs(hello: C2S): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: boolean) => { if (!done) { done = true; resolve(v); } };
      let ws: WebSocket;
      try {
        const url = new URL('ws', location.href);
        url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(url.toString());
      } catch { finish(false); return; }
      const timer = setTimeout(() => { try { ws.close(); } catch { /* */ } finish(false); }, 6000);
      ws.onopen = () => { ws.send(JSON.stringify(hello)); };
      ws.onmessage = (ev) => {
        let m: S2C;
        try { m = JSON.parse(String(ev.data)); } catch { return; }
        if (m.t === 'welcome') { clearTimeout(timer); this.ws = ws; this.mode = 'online'; finish(true); this.startPing(); }
        if (m.t === 'pong') this.ping = Math.round(performance.now() - m.at);
        this.emit(m);
      };
      ws.onerror = () => { clearTimeout(timer); finish(false); };
      ws.onclose = () => {
        clearTimeout(timer);
        if (!done) { finish(false); return; }
        if (this.ws === ws) { this.ws = null; this.emit({ t: 'notice', level: 'error', text: 'Conexão perdida. Recarregue a página para voltar.' }); }
      };
    });
  }

  private startPing() {
    clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => this.send({ t: 'ping', at: performance.now() }), 4000);
  }
}
