import { NextFunction, Request, RequestHandler, Response } from "express";
import { SessionRepository } from "../../../application/ports";
import { PublicUser } from "../../../domain/user/user";
import { config } from "../../../config/config";
import { SESSION_MS } from "../../../domain/user/sessionPolicy";

declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}

export const SESSION_COOKIE = "session";

export function readSessionToken(req: Request): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: config.production, maxAge: SESSION_MS, path: "/" });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** Attaches req.user when the session cookie is valid. Never blocks the request. */
export const attachUser =
  (sessions: SessionRepository): RequestHandler =>
  (req, _res, next) => {
    const token = readSessionToken(req);
    if (!token) return next();
    sessions
      .findUser(token)
      .then((user) => {
        req.user = user;
        next();
      })
      .catch(next);
  };

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Tu sesión terminó. Vuelve a iniciar sesión." });
    return;
  }
  next();
}
