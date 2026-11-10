import crypto from "crypto";
import { IncomingMessage, Server } from "http";
import { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";

/**
 * Avisos en vivo por WebSocket: el servidor empuja los cambios (etapas de un juego a medida,
 * juego listo, error) a todas las pestanas abiertas del usuario, en vez de que pregunten cada pocos segundos.
 *
 * Autenticacion por ticket: en produccion el frontend vive en otro dominio y llega al API por un
 * rewrite, que no garantiza pasar WebSockets. El navegador pide un ticket por HTTP (con su cookie,
 * a traves del rewrite) y se conecta directo al backend con el. Ticket de un solo uso y 30 s de vida.
 * Como no depende de cookies, una web ajena no puede abrir la conexion en nombre del usuario.
 *
 * Todo vive en memoria: con una sola instancia basta. Con varias, publish deberia pasar por un
 * canal compartido (p. ej. Redis), porque cada instancia solo conoce a sus propios sockets.
 */

export const REALTIME_PATH = "/api/realtime";
const TICKET_TTL_MS = 30_000;
const MAX_SOCKETS_PER_USER = 8;
const HEARTBEAT_MS = 25_000;

export type JobStage = "writing" | "validating" | "fixing" | "saving";

export type RealtimeEvent =
  | { type: "hello" }
  | {
      type: "job";
      job: { id: string; status: "pending" | "running" | "done" | "error"; stage: JobStage | null; title: string | null; error?: string };
    };

const tickets = new Map<string, { userId: number; expiresAt: number }>();
const sockets = new Map<number, Set<WebSocket>>();

export function issueTicket(userId: number): string {
  const now = Date.now();
  for (const [key, t] of tickets) if (t.expiresAt < now) tickets.delete(key);
  const ticket = crypto.randomBytes(24).toString("base64url");
  tickets.set(ticket, { userId, expiresAt: now + TICKET_TTL_MS });
  return ticket;
}

function redeemTicket(ticket: string | null): number | undefined {
  if (!ticket) return undefined;
  const entry = tickets.get(ticket);
  tickets.delete(ticket);
  return entry && entry.expiresAt >= Date.now() ? entry.userId : undefined;
}

/** Envia el evento a todas las conexiones del usuario. Sin conexiones no hace nada: el sondeo cubre. */
export function publish(userId: number, event: RealtimeEvent): void {
  const set = sockets.get(userId);
  if (!set) return;
  const data = JSON.stringify(event);
  for (const ws of set) if (ws.readyState === WebSocket.OPEN) ws.send(data);
}

export function connectionCount(userId: number): number {
  return sockets.get(userId)?.size ?? 0;
}

/** URL a la que debe conectarse el navegador: PUBLIC_WS_URL o, si no, este mismo host. */
export function realtimeUrl(protocol: string, host: string | undefined): string {
  const configured = process.env.PUBLIC_WS_URL?.trim();
  if (configured) return configured;
  return `${protocol === "https" ? "wss" : "ws"}://${host}${REALTIME_PATH}`;
}

function reject(socket: Duplex, status: number, reason: string): void {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/** Engancha el WebSocket al servidor HTTP de Express, en la ruta REALTIME_PATH. */
export function attachRealtime(server: Server): WebSocketServer {
  // El cliente nunca manda datos utiles: un tope bajo evita que alguien llene la memoria.
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
    let set = sockets.get(userId);
    if (!set) sockets.set(userId, (set = new Set()));
    set.add(ws);
    ws.alive = true;
    ws.on("pong", () => (ws.alive = true));
    ws.on("error", () => ws.terminate());
    ws.on("close", () => {
      set!.delete(ws);
      if (set!.size === 0 && sockets.get(userId) === set) sockets.delete(userId);
    });
    ws.send(JSON.stringify({ type: "hello" } satisfies RealtimeEvent));
  });

  // Latido: detecta conexiones muertas (movil sin red) y mantiene viva la conexion tras proxies
  // que cortan las inactivas.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients as Set<WebSocket & { alive?: boolean }>) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();
  wss.on("close", () => clearInterval(heartbeat));
  return wss;
}
