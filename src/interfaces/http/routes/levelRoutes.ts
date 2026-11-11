import { Router } from "express";
import { createNextLevel } from "../../../application/levels/createNextLevel";
import { createVariant } from "../../../application/levels/createVariant";
import { editSavedLevel } from "../../../application/levels/editSavedLevel";
import { exampleLevels } from "../../../application/levels/examples";
import { generateLevel } from "../../../application/levels/generateLevel";
import { deleteLevel, getJob, getLevel, listMyLevels } from "../../../application/levels/levelQueries";
import { Deps, StoredGame } from "../../../application/ports";
import { renderSvg } from "../../../domain/rendering/svgRenderer";
import { handle } from "../middleware/asyncHandler";
import { RateLimits } from "../middleware/rateLimits";
import { requireAuth } from "../middleware/session";
import { presentExample, presentLevel, presentSummary } from "../presenters/levelPresenter";

export function levelRoutes(deps: Deps, limits: RateLimits): Router {
  const router = Router();
  const userId = (req: { user?: { id: number } }) => req.user!.id;

  router.post("/generate", requireAuth, limits.generate, handle(async (req, res) => {
    const { description, seed } = req.body ?? {};
    const outcome = await generateLevel(deps, { userId: userId(req), description, seed });
    // A custom game in progress is recognised by the job field, not by the 202 (proxies may change codes).
    if (outcome.kind === "job") return res.status(202).json({ job: outcome.jobId, title: outcome.title, story: outcome.story });
    const { level, saved, obstacles, interpretedBy } = outcome;
    return res.status(201).json({ ...presentLevel(level), saved, obstacles, interpretedBy });
  }));

  let examples: unknown[] | null = null;
  router.get("/examples", (_req, res) => {
    examples ??= exampleLevels().map(presentExample);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json(examples);
  });

  router.get("/jobs/:id", requireAuth, handle(async (req, res) => {
    const job = await getJob(deps, req.params.id, userId(req));
    if (job.status === "error") return res.status(500).json({ status: job.status, error: job.error });
    const level = job.result ? presentLevel(job.result as StoredGame) : undefined;
    return res.json({ status: job.status, stage: job.stage, level });
  }));

  router.get("/mine", requireAuth, handle(async (req, res) => {
    res.json((await listMyLevels(deps, userId(req))).map(presentSummary));
  }));

  router.post("/:id/next", requireAuth, limits.generate, handle(async (req, res) => {
    const { level, saved } = await createNextLevel(deps, req.params.id, userId(req));
    res.status(201).json({ ...presentLevel(level), saved });
  }));

  router.post("/:id/remix", requireAuth, limits.generate, handle(async (req, res) => {
    const { difficulty, traps, enemies, items, boss, rounds } = req.body ?? {};
    const { level, saved } = await createVariant(deps, req.params.id, userId(req), { difficulty, traps, enemies, items, boss, rounds });
    res.status(201).json({ ...presentLevel(level), saved });
  }));

  router.patch("/:id", requireAuth, limits.edit, handle(async (req, res) => {
    const { title, story, rows } = req.body ?? {};
    res.json(presentLevel(await editSavedLevel(deps, req.params.id, userId(req), { title, story, rows })));
  }));

  router.get("/:id", handle(async (req, res) => {
    res.json(presentLevel(await getLevel(deps, req.params.id)));
  }));

  router.delete("/:id", requireAuth, handle(async (req, res) => {
    await deleteLevel(deps, req.params.id, userId(req));
    res.status(204).end();
  }));

  router.get("/:id/image", handle(async (req, res) => {
    const level = await getLevel(deps, req.params.id);
    if (level.layout === "custom") return res.status(404).json({ error: "Nivel no encontrado." });
    res.setHeader("Content-Type", "image/svg+xml");
    return res.send(renderSvg(level.grid, level.theme, level.layout));
  }));

  return router;
}
