import { newToken } from "../security/tokens";

/**
 * WebSocket authentication by ticket. In production the frontend lives on another domain and
 * reaches the API through a rewrite that may not pass WebSockets: the browser asks for a ticket
 * over HTTP (with its cookie) and connects straight to the backend with it. Single use, 30 s.
 * Since it does not rely on cookies, a foreign site cannot open the connection for the user.
 */
const TICKET_TTL_MS = 30_000;
const tickets = new Map<string, { userId: number; expiresAt: number }>();

export function issueTicket(userId: number): string {
  const now = Date.now();
  for (const [key, ticket] of tickets) if (ticket.expiresAt < now) tickets.delete(key);
  const ticket = newToken(24);
  tickets.set(ticket, { userId, expiresAt: now + TICKET_TTL_MS });
  return ticket;
}

/** Returns the user of a valid ticket and burns it; undefined when missing, used or expired. */
export function redeemTicket(ticket: string | null): number | undefined {
  if (!ticket) return undefined;
  const entry = tickets.get(ticket);
  tickets.delete(ticket);
  return entry && entry.expiresAt >= Date.now() ? entry.userId : undefined;
}
