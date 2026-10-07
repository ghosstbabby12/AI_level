import { NextFunction, Request, Response, Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  hashPassword,
  PublicUser,
  readSessionToken,
  setSessionCookie,
  verifyPassword,
} from "../auth/auth";
import { first, run } from "../store/db";

export const authRouter = Router();

// Express 4 no captura errores de handlers async: sin esto, un fallo de la base tumbaria el servidor.
type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const safe = (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res).catch(next);
};

// Frena ataques de fuerza bruta contra contrasenas.
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera unos minutos e intenta de nuevo." },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

interface UserRow extends PublicUser {
  password_hash: string;
}

authRouter.post("/register", authLimiter, safe(async (req, res) => {
  const { name, email, password } = req.body ?? {};
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (cleanName.length === 0 || cleanName.length > 40) {
    return res.status(400).json({ error: "Escribe un nombre de hasta 40 caracteres." });
  }
  if (!EMAIL_RE.test(cleanEmail) || cleanEmail.length > 254) {
    return res.status(400).json({ error: "El correo no es valido." });
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD || password.length > 200) {
    return res.status(400).json({ error: `La contrasena debe tener al menos ${MIN_PASSWORD} caracteres.` });
  }

  const exists = await first("SELECT 1 FROM users WHERE email = ?", [cleanEmail]);
  if (exists) {
    return res.status(409).json({ error: "Ya existe una cuenta con ese correo." });
  }

  const result = await run("INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)", [
    cleanEmail,
    cleanName,
    hashPassword(password),
    new Date().toISOString(),
  ]);
  const user: PublicUser = { id: Number(result.lastInsertRowid), email: cleanEmail, name: cleanName };

  setSessionCookie(res, await createSession(user.id));
  return res.status(201).json({ user });
}));

authRouter.post("/login", authLimiter, safe(async (req, res) => {
  const { email, password } = req.body ?? {};
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  const row = await first<UserRow>("SELECT id, email, name, password_hash FROM users WHERE email = ?", [cleanEmail]);
  if (!row || typeof password !== "string" || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: "Correo o contrasena incorrectos." });
  }

  const id = Number(row.id);
  setSessionCookie(res, await createSession(id));
  return res.json({ user: { id, email: row.email, name: row.name } });
}));

authRouter.post("/logout", safe(async (req, res) => {
  const token = readSessionToken(req);
  if (token) await deleteSession(token);
  clearSessionCookie(res);
  return res.status(204).end();
}));

authRouter.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Sin sesion." });
  return res.json({ user: req.user });
});
