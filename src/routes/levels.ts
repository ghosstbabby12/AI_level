import { NextFunction, Request, Response, Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth } from "../auth/auth";
import { v4 as uuidv4 } from "uuid";
import { buildLevel, toGeneratedLevel } from "../generator/levelBuilder";
import { parseDescription } from "../generator/parser";
import { renderAscii } from "../renderer/asciiRenderer";
import { renderSvg } from "../renderer/svgRenderer";
import { deleteLevel, encodeGrid, getLevel, listLevels, saveCustomGame, saveLevel, StoredGame } from "../store/levelStore";
import { CustomGameError, writeCustomGame } from "../generator/customGame";
import { checkCustomQuota, formatWait } from "../store/customQuota";
import { getJob, startJob } from "../store/jobs";
import { parseDescriptionKeywords } from "../generator/keywordParser";
import { MODE_PRIORITY, MODES } from "../generator/modes";
import { CustomGame, GeneratedLevel, LevelSpec } from "../generator/types";

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

const CUSTOM_LABEL = "Juego libre";
const CUSTOM_TAG = "Libre";
const withUrls = (level: StoredGame) =>
  level.layout === "custom"
    ? { ...level, tag: CUSTOM_TAG }
    : { ...level, imageUrl: `/api/levels/${level.id}/image`, tag: MODES[level.layout].example.tag };


async function createCustomGame(spec: LevelSpec, userId: number) {
  const html = await writeCustomGame(spec);
  const game: CustomGame = {
    id: uuidv4(),
    layout: "custom",
    description: spec.description,
    theme: spec.theme,
    difficulty: spec.difficulty,
    narrative: spec.narrative ?? { title: "Juego libre", story: spec.description, bossLine: null },
    interpretation: [`Tipo: ${CUSTOM_LABEL}`, "Escrito a medida por la IA"],
    controls: "Los controles se explican en la pantalla de inicio del juego.",
    html,
    createdAt: new Date().toISOString(),
  };
  let saved = true;
  try {
    await saveCustomGame(game, userId);
  } catch (error) {
    saved = false;
    console.error("No se pudo guardar el juego libre:", error);
  }
  return { ...withUrls(game), saved };
}

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

  // Ningun estilo sirve: la IA escribe el juego. Tarda minutos, asi que se responde
  // enseguida con un trabajo que el cliente consulta hasta que termina.
  if (spec.fit === "custom") {
    if (process.env.CUSTOM_GAMES === "off") {
      return res.status(503).json({ error: "Los juegos creados a medida están desactivados por ahora. Prueba con un estilo existente.", code: "custom_disabled" });
    }
    const quota = await checkCustomQuota(req.user!.id);
    if (!quota.allowed) {
      const waitMs = quota.retryAt.getTime() - Date.now();
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil(waitMs / 1000))));
      return res.status(429).json({
        error: `Llegaste al límite de ${quota.limit} juegos creados a medida en 24 horas. Podrás crear otro en ${formatWait(waitMs)}. Mientras tanto, puedes generar niveles de los estilos existentes.`,
        code: "custom_limit",
        limit: quota.limit,
        retryAt: quota.retryAt.toISOString(),
      });
    }
    const job = await startJob(req.user!.id, () =>
      createCustomGame(spec, req.user!.id).catch((error) => {
        throw error instanceof CustomGameError ? error : new Error("No se pudo crear el juego. Inténtalo de nuevo.");
      }),
    );
    return res.status(202).json({ job: job.id, title: spec.narrative?.title, story: spec.narrative?.story });
  }

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

levelsRouter.get("/jobs/:id", requireAuth, safe(async (req, res) => {
  const job = await getJob(req.params.id, req.user!.id);
  if (!job) return res.status(404).json({ error: "Ese trabajo ya no existe. Vuelve a intentarlo." });
  if (job.status === "error") return res.status(500).json({ status: job.status, error: job.error });
  return res.json({ status: job.status, level: job.result });
}));

levelsRouter.get("/mine", requireAuth, safe(async (req, res) => {
  const levels = await listLevels(req.user!.id);
  return res.json(levels.map((l) =>
    l.layout === "custom" ? { ...l, label: CUSTOM_LABEL, tag: CUSTOM_TAG } : { ...l, label: MODES[l.layout].label, tag: MODES[l.layout].example.tag },
  ));
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
  if (!level || level.layout === "custom") return res.status(404).json({ error: "Nivel no encontrado." });
  res.setHeader("Content-Type", "image/svg+xml");
  return res.send(renderSvg(level.grid, level.theme, level.layout));
}));
