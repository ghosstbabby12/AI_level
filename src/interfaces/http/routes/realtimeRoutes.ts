import { Router } from "express";
import { realtimeUrl } from "../../../infrastructure/realtime/realtimeServer";
import { issueTicket } from "../../../infrastructure/realtime/tickets";
import { RateLimits } from "../middleware/rateLimits";
import { requireAuth } from "../middleware/session";

/** Single-use ticket to open the WebSocket, and the URL to connect to. */
export function realtimeRoutes(limits: RateLimits): Router {
  const router = Router();
  router.post("/ticket", requireAuth, limits.ticket, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ticket: issueTicket(req.user!.id), url: realtimeUrl(req.protocol, req.get("host")) });
  });
  return router;
}
