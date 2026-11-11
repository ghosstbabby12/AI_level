import express, { Router } from "express";
import { AppError } from "../../../application/errors";
import { Deps } from "../../../application/ports";
import { getAvatar, removeAvatar, setAvatar } from "../../../application/profile/avatar";
import { changePassword } from "../../../application/profile/changePassword";
import { updateProfile } from "../../../application/profile/updateProfile";
import { MAX_AVATAR_BYTES } from "../../../domain/user/userRules";
import { handle } from "../middleware/asyncHandler";
import { RateLimits } from "../middleware/rateLimits";
import { readSessionToken, requireAuth } from "../middleware/session";

/** The photo arrives already cropped and shrunk by the browser, as binary (not base64 in JSON). */
const imageBody = express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_AVATAR_BYTES });
const readImage: express.RequestHandler = (req, res, next) =>
  imageBody(req, res, (error?: unknown) => {
    const tooLarge = (error as { type?: string } | undefined)?.type === "entity.too.large";
    next(tooLarge ? new AppError("too_large", `La imagen pesa demasiado (máximo ${MAX_AVATAR_BYTES / 1024} KB).`) : error);
  });

export function profileRoutes(deps: Deps, limits: RateLimits): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", (req, res) => res.json({ user: req.user }));

  router.patch("/", limits.profile, handle(async (req, res) => {
    res.json({ user: await updateProfile(deps, req.user!, req.body ?? {}) });
  }));

  router.put("/password", limits.profile, handle(async (req, res) => {
    await changePassword(deps, req.user!.id, readSessionToken(req), req.body ?? {});
    res.json({ ok: true });
  }));

  router.put("/avatar", limits.profile, readImage, handle(async (req, res) => {
    const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    res.json({ user: await setAvatar(deps, req.user!.id, data) });
  }));

  router.delete("/avatar", handle(async (req, res) => {
    res.json({ user: await removeAvatar(deps, req.user!.id) });
  }));

  router.get("/avatar", handle(async (req, res) => {
    const avatar = await getAvatar(deps, req.user!.id);
    res.setHeader("Content-Type", avatar.mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    // The URL carries ?v=<upload time>: a new photo means a new URL, so this one can be cached.
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.send(avatar.data);
  }));

  return router;
}
