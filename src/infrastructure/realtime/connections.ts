import { WebSocket } from "ws";
import { JobStage, JobStatus } from "../../application/ports";

/**
 * Live notices pushed to every open tab of a user (custom game stages, game ready, error),
 * instead of the tabs asking every few seconds. Everything lives in memory: one instance is
 * enough. With several, publish should go through a shared channel (e.g. Redis).
 */
export type RealtimeEvent =
  | { type: "hello" }
  | { type: "job"; job: { id: string; status: JobStatus; stage: JobStage | null; title: string | null; error?: string } };

const sockets = new Map<number, Set<WebSocket>>();

export function addConnection(userId: number, ws: WebSocket): void {
  let set = sockets.get(userId);
  if (!set) sockets.set(userId, (set = new Set()));
  set.add(ws);
  ws.on("close", () => {
    set!.delete(ws);
    if (set!.size === 0 && sockets.get(userId) === set) sockets.delete(userId);
  });
}

export function connectionCount(userId: number): number {
  return sockets.get(userId)?.size ?? 0;
}

/** Sends the event to every connection of the user. Without connections it does nothing: polling covers it. */
export function publish(userId: number, event: RealtimeEvent): void {
  const set = sockets.get(userId);
  if (!set) return;
  const data = JSON.stringify(event);
  for (const ws of set) if (ws.readyState === WebSocket.OPEN) ws.send(data);
}
