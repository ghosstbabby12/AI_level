import { NextFunction, Request, Response, Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  hashPassword,
  loadUser,
  readSessionToken,
  setSessionCookie,
  verifyPassword,
} from "../auth/auth";
import { first, run } from "../store/db";
import { checkEmail, checkName, checkNewPassword } from "../auth/rules";

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

authRouter.post("/register", authLimiter, safe(async (req, res) => {
  const { name, email, password } = req.body ?? {};
  const nameCheck = checkName(name);
  if (!nameCheck.ok) return res.status(400).json({ error: nameCheck.error });
  const emailCheck = checkEmail(email);
  if (!emailCheck.ok) return res.status(400).json({ error: emailCheck.error });
  const passwordCheck = checkNewPassword(password);
  if (!passwordCheck.ok) return res.status(400).json({ error: passwordCheck.error });
  const cleanName = nameCheck.value;
  const cleanEmail = emailCheck.value;

  const exists = await first("SELECT 1 FROM users WHERE email = ?", [cleanEmail]);
  if (exists) {
    return res.status(409).json({ error: "Ya existe una cuenta con ese correo." });
  }

  const now = new Date().toISOString();
  const result = await run("INSERT INTO users (email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", [
    cleanEmail,
    cleanName,
    hashPassword(password),
    now,
    now,
  ]);
  const id = Number(result.lastInsertRowid);

  setSessionCookie(res, await createSession(id));
  return res.status(201).json({ user: await loadUser(id) });
}));

authRouter.post("/login", authLimiter, safe(async (req, res) => {
  const { email, password } = req.body ?? {};
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  const row = await first<{ id: number; password_hash: string }>("SELECT id, password_hash FROM users WHERE email = ?", [cleanEmail]);
  if (!row || typeof password !== "string" || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: "Correo o contrasena incorrectos." });
  }

  const id = Number(row.id);
  setSessionCookie(res, await createSession(id));
  return res.json({ user: await loadUser(id) });
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
