import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth } from "../auth/auth";
import { issueTicket, realtimeUrl } from "../realtime/hub";

export const realtimeRouter = Router();

// Una pestana pide un ticket al conectar y al reconectar; el tope solo frena abusos.
const ticketLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });

/** Ticket de un solo uso para abrir el WebSocket, y la URL a la que conectarse. */
realtimeRouter.post("/ticket", requireAuth, ticketLimiter, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ticket: issueTicket(req.user!.id), url: realtimeUrl(req.protocol, req.get("host")) });
});
