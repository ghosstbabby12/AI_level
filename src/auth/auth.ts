import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { first, run } from "../store/db";

export interface PublicUser {
  id: number;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}

export const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

// Contrasenas: scrypt con sal aleatoria, guardado como "sal:hash" en hex.
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// En la base solo se guarda el hash del token: si alguien lee la base, no puede suplantar sesiones.
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await run("DELETE FROM sessions WHERE expires_at < ?", [Date.now()]);
  await run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [hashToken(token), userId, Date.now() + SESSION_MS]);
  return token;
}

export async function deleteSession(token: string): Promise<void> {
  await run("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
}

async function userForToken(token: string): Promise<PublicUser | undefined> {
  const row = await first<PublicUser>(
    "SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
    [hashToken(token), Date.now()],
  );
  return row ? { id: Number(row.id), email: row.email, name: row.name } : undefined;
}

export function readSessionToken(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** Adjunta req.user si la cookie de sesion es valida. No bloquea la peticion. */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const token = readSessionToken(req);
  if (!token) return next();
  userForToken(token)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch(next);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Inicia sesion para generar niveles." });
    return;
  }
  next();
}
