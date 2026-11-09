import express, { NextFunction, Request, Response, Router } from "express";
import { deleteOtherSessions, hashPassword, loadUser, readSessionToken, requireAuth, verifyPassword } from "../auth/auth";
import { avatarType, checkEmail, checkName, checkNewPassword, checkPhone, MAX_AVATAR_BYTES } from "../auth/rules";
import { first, run } from "../store/db";
import { rateLimit } from "express-rate-limit";

export const profileRouter = Router();
profileRouter.use(requireAuth);

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const safe = (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res).catch(next);
};

// Propio, para no gastar los intentos de inicio de sesion; frena probar contrasenas desde una sesion robada.
const profileLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiados cambios seguidos. Espera unos minutos e intenta de nuevo." },
});

const isUniqueViolation = (error: unknown) => /UNIQUE constraint failed/i.test(String(error));

/** Comprueba la contrasena actual; las acciones sensibles la exigen aunque haya sesion abierta. */
async function passwordMatches(userId: number, password: unknown): Promise<boolean> {
  if (typeof password !== "string" || password.length === 0) return false;
  const row = await first<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", [userId]);
  return !!row && verifyPassword(password, row.password_hash);
}

profileRouter.get("/", (req, res) => res.json({ user: req.user }));

/**
 * Actualiza nombre, correo y telefono. Solo cambia lo que llega en el cuerpo.
 * Cambiar el correo exige la contrasena actual: el correo es con lo que se entra a la cuenta.
 */
profileRouter.patch("/", profileLimiter, safe(async (req, res) => {
  const user = req.user!;
  const { name, email, phone, currentPassword } = req.body ?? {};
  const changes: Record<string, string | null> = {};

  if (name !== undefined) {
    const check = checkName(name);
    if (!check.ok) return res.status(400).json({ error: check.error, field: "name" });
    changes.name = check.value;
  }
  if (phone !== undefined) {
    const check = checkPhone(phone);
    if (!check.ok) return res.status(400).json({ error: check.error, field: "phone" });
    changes.phone = check.value;
  }
  if (email !== undefined) {
    const check = checkEmail(email);
    if (!check.ok) return res.status(400).json({ error: check.error, field: "email" });
    if (check.value !== user.email) {
      if (!(await passwordMatches(user.id, currentPassword))) {
        return res.status(403).json({ error: "Para cambiar el correo, escribe tu contraseña actual correctamente.", field: "currentPassword" });
      }
      const taken = await first("SELECT 1 FROM users WHERE email = ? AND id != ?", [check.value, user.id]);
      if (taken) return res.status(409).json({ error: "Ya existe otra cuenta con ese correo.", field: "email" });
      changes.email = check.value;
    }
  }

  const columns = Object.keys(changes);
  if (columns.length > 0) {
    try {
      await run(
        `UPDATE users SET ${columns.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
        [...columns.map((c) => changes[c]), new Date().toISOString(), user.id],
      );
    } catch (error) {
      // Dos cuentas pidiendo el mismo correo a la vez: la base tiene la ultima palabra.
      if (isUniqueViolation(error)) return res.status(409).json({ error: "Ya existe otra cuenta con ese correo.", field: "email" });
      throw error;
    }
  }
  return res.json({ user: await loadUser(user.id) });
}));

profileRouter.put("/password", profileLimiter, safe(async (req, res) => {
  const user = req.user!;
  const { currentPassword, newPassword } = req.body ?? {};
  if (!(await passwordMatches(user.id, currentPassword))) {
    return res.status(403).json({ error: "La contraseña actual no es correcta.", field: "currentPassword" });
  }
  const check = checkNewPassword(newPassword);
  if (!check.ok) return res.status(400).json({ error: check.error, field: "newPassword" });
  if (check.value === currentPassword) {
    return res.status(400).json({ error: "La nueva contraseña debe ser distinta de la actual.", field: "newPassword" });
  }

  await run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [hashPassword(check.value), new Date().toISOString(), user.id]);
  await deleteOtherSessions(user.id, readSessionToken(req));
  return res.json({ ok: true });
}));

// La foto llega ya recortada y reducida por el navegador, como binario (no base64 en JSON).
const imageBody = express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_AVATAR_BYTES });

profileRouter.put("/avatar", profileLimiter, (req, res, next) => {
  imageBody(req, res, (error?: unknown) => {
    if ((error as { type?: string } | undefined)?.type === "entity.too.large") {
      return res.status(413).json({ error: `La imagen pesa demasiado (máximo ${MAX_AVATAR_BYTES / 1024} KB).` });
    }
    next(error);
  });
}, safe(async (req, res) => {
  const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const mime = avatarType(data);
  if (!mime) return res.status(415).json({ error: "La foto debe ser una imagen JPG, PNG o WebP." });

  const userId = req.user!.id;
  await run(
    `INSERT INTO user_avatars (user_id, mime, data, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at`,
    [userId, mime, data, Date.now()],
  );
  return res.json({ user: await loadUser(userId) });
}));

profileRouter.delete("/avatar", safe(async (req, res) => {
  const userId = req.user!.id;
  await run("DELETE FROM user_avatars WHERE user_id = ?", [userId]);
  return res.json({ user: await loadUser(userId) });
}));

profileRouter.get("/avatar", safe(async (req, res) => {
  const row = await first<{ mime: string; data: ArrayBuffer }>("SELECT mime, data FROM user_avatars WHERE user_id = ?", [req.user!.id]);
  if (!row) return res.status(404).json({ error: "No tienes foto de perfil." });
  res.setHeader("Content-Type", row.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  // La URL lleva ?v=<fecha de subida>: al cambiar la foto cambia la URL, asi que esta puede guardarse.
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  return res.send(Buffer.from(row.data));
}));
