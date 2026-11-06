import { NextFunction, Request, Response, Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth } from "../auth/auth";
import { v4 as uuidv4 } from "uuid";
import { buildLevel, toGeneratedLevel } from "../generator/levelBuilder";
import { parseDescription } from "../generator/parser";
import { renderAscii } from "../renderer/asciiRenderer";
import { renderSvg } from "../renderer/svgRenderer";
import { deleteLevel, encodeGrid, getLevel, listLevels, saveLevel } from "../store/levelStore";
import { parseDescriptionKeywords } from "../generator/keywordParser";
import { MODE_PRIORITY, MODES } from "../generator/modes";
import { GeneratedLevel } from "../generator/types";

export const levelsRouter = Router();

const MAX_DESCRIPTION_LENGTH = 500;

// Cada generacion puede llamar a la API de Claude: limita cuantas pide cada IP.
const generateLimiter = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.GENERATE_LIMIT_PER_MINUTE) || 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiadas generaciones seguidas. Espera un minuto e intenta de nuevo." },
});

// Express 4 no captura errores de handlers async.
type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const safe = (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res).catch(next);
};

const withUrls = (level: GeneratedLevel) => ({ ...level, imageUrl: `/api/levels/${level.id}/image`, tag: MODES[level.layout].example.tag });

levelsRouter.post("/generate", requireAuth, generateLimiter, safe(async (req, res) => {
  const { description, seed } = req.body ?? {};

  if (typeof description !== "string" || description.trim().length === 0) {
    return res.status(400).json({ error: "El campo 'description' es requerido y debe ser texto." });
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return res.status(400).json({ error: `La descripcion no puede superar ${MAX_DESCRIPTION_LENGTH} caracteres.` });
  }
  if (seed !== undefined && !Number.isInteger(seed)) {
    return res.status(400).json({ error: "El campo 'seed' debe ser un entero." });
  }

  const parsed = await parseDescription(description, seed);
  if (!parsed.ok) {
    return res.status(422).json({ error: parsed.reason, code: "invalid_description" });
  }
  const { spec } = parsed;

  let level: GeneratedLevel;
  try {
    const built = buildLevel(spec);
    level = toGeneratedLevel(uuidv4(), spec, built, renderAscii(built.grid, spec.theme, spec.layout));
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }

  // Si la base falla, el nivel se puede jugar igual: solo no quedara en "Mis juegos".
  let saved = true;
  try {
    await saveLevel(level, req.user!.id);
  } catch (error) {
    saved = false;
    console.error("No se pudo guardar el nivel:", error);
  }

  return res.status(201).json({ ...withUrls(level), saved, obstacles: spec.obstacles ?? [], interpretedBy: spec.source });
}));

// Ejemplos de la portada: se generan sin IA (gratis) y siempre iguales. La cuadricula va
// compacta, una cadena por fila, porque son once niveles en una sola respuesta.
const EXAMPLE_SEED = 7;
let examples: unknown[] | null = null;

levelsRouter.get("/examples", (_req, res) => {
  examples ??= MODE_PRIORITY.map((mode) => {
    const { tag, text } = MODES[mode].example;
    const spec = parseDescriptionKeywords(text, EXAMPLE_SEED);
    const { grid, ascii: _ascii, ...level } = toGeneratedLevel(`ejemplo-${mode}`, spec, buildLevel(spec), "");
    return { tag, text, level: { ...level, rows: encodeGrid(grid) } };
  });
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.json(examples);
});

levelsRouter.get("/mine", requireAuth, safe(async (req, res) => {
  const levels = await listLevels(req.user!.id);
  return res.json(levels.map((l) => ({ ...l, label: MODES[l.layout]?.label ?? l.layout, tag: MODES[l.layout]?.example.tag ?? "" })));
}));

levelsRouter.get("/:id", safe(async (req, res) => {
  const level = await getLevel(req.params.id);
  if (!level) return res.status(404).json({ error: "Nivel no encontrado." });
  return res.json(withUrls(level));
}));

levelsRouter.delete("/:id", requireAuth, safe(async (req, res) => {
  const deleted = await deleteLevel(req.params.id, req.user!.id);
  return deleted ? res.status(204).end() : res.status(404).json({ error: "Nivel no encontrado." });
}));

levelsRouter.get("/:id/image", safe(async (req, res) => {
  const level = await getLevel(req.params.id);
  if (!level) return res.status(404).json({ error: "Nivel no encontrado." });
  res.setHeader("Content-Type", "image/svg+xml");
  return res.send(renderSvg(level.grid, level.theme, level.layout));
}));
