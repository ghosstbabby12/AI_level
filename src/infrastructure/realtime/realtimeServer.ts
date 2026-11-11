import { IncomingMessage, Server } from "http";
import { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";
import { config } from "../../config/config";
import { addConnection, connectionCount, RealtimeEvent } from "./connections";
import { redeemTicket } from "./tickets";

export const REALTIME_PATH = "/api/realtime";
const MAX_SOCKETS_PER_USER = 8;
const HEARTBEAT_MS = 25_000;

/** URL the browser must connect to: PUBLIC_WS_URL or, otherwise, this same host. */
export function realtimeUrl(protocol: string, host: string | undefined): string {
  return config.publicWsUrl ?? `${protocol === "https" ? "wss" : "ws"}://${host}${REALTIME_PATH}`;
}

function reject(socket: Duplex, status: number, reason: string): void {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/** Heartbeat: finds dead connections (phone without network) and keeps proxies from closing idle ones. */
function startHeartbeat(wss: WebSocketServer): void {
  const timer = setInterval(() => {
    for (const ws of wss.clients as Set<WebSocket & { alive?: boolean }>) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  timer.unref();
  wss.on("close", () => clearInterval(timer));
}

/** Hooks the WebSocket onto Express's HTTP server, at REALTIME_PATH. */
export function attachRealtime(server: Server): WebSocketServer {
  // The client never sends useful data: a low cap keeps anyone from filling memory.
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== REALTIME_PATH) return reject(socket, 404, "Not Found");
    const userId = redeemTicket(url.searchParams.get("ticket"));
    if (userId === undefined) return reject(socket, 401, "Unauthorized");
    if (connectionCount(userId) >= MAX_SOCKETS_PER_USER) return reject(socket, 429, "Too Many Requests");
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, userId));
  });

  wss.on("connection", (ws: WebSocket & { alive?: boolean }, userId: number) => {
    addConnection(userId, ws);
    ws.alive = true;
    ws.on("pong", () => (ws.alive = true));
    ws.on("error", () => ws.terminate());
    ws.send(JSON.stringify({ type: "hello" } satisfies RealtimeEvent));
  });

  startHeartbeat(wss);
  return wss;
}
