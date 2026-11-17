import type { WebSocketServer, WebSocket } from "ws";

let wss: WebSocketServer | null = null;

export function setBroadcastServer(server: WebSocketServer): void {
  wss = server;
}

export function broadcast(event: string, payload: unknown): void {
  if (!wss) return;
  const message = JSON.stringify({ event, payload, at: new Date().toISOString() });
  for (const client of wss.clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(message);
    }
  }
}

export function attachClient(ws: WebSocket): void {
  ws.send(JSON.stringify({ event: "connected", payload: { ok: true }, at: new Date().toISOString() }));
}
