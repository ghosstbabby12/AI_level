import { Router } from "express";
import { login, logout, register } from "../../../application/auth/session";
import { Deps } from "../../../application/ports";
import { handle } from "../middleware/asyncHandler";
import { RateLimits } from "../middleware/rateLimits";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "../middleware/session";

export function authRoutes(deps: Deps, limits: RateLimits): Router {
  const router = Router();

  router.post("/register", limits.auth, handle(async (req, res) => {
    const { user, token } = await register(deps, req.body ?? {});
    setSessionCookie(res, token);
    res.status(201).json({ user });
  }));

  router.post("/login", limits.auth, handle(async (req, res) => {
    const { user, token } = await login(deps, req.body ?? {});
    setSessionCookie(res, token);
    res.json({ user });
  }));

  router.post("/logout", handle(async (req, res) => {
    await logout(deps, readSessionToken(req));
    clearSessionCookie(res);
    res.status(204).end();
  }));

  router.get("/me", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Sin sesion." });
    return res.json({ user: req.user });
  });

  return router;
}
