import { NextFunction, Request, Response, Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth } from "../auth/auth";
import { v4 as uuidv4 } from "uuid";
import { buildLevel, toGeneratedLevel } from "../generator/levelBuilder";
import { parseDescription } from "../generator/parser";
import { renderAscii } from "../renderer/asciiRenderer";
import { renderSvg } from "../renderer/svgRenderer";
import { deleteLevel, encodeGrid, getLevel, isOwner, listLevels, saveCustomGame, saveLevel, StoredGame, updateLevel } from "../store/levelStore";
import { editLevel } from "../generator/editing";
import { CustomGameError, CustomGameUsage, InvalidGameError, writeCustomGame } from "../generator/customGame";
import { ReportStage } from "../store/jobs";
import { finishCustomGeneration, GenerationEntry, linkJob, recordGeneration } from "../store/generations";
import { checkCustomQuota, formatWait } from "../store/customQuota";
import { getJob, startJob } from "../store/jobs";
import { parseDescriptionKeywords } from "../generator/keywordParser";
import { MODE_PRIORITY, MODES } from "../generator/modes";
import { CustomGame, LevelSpec } from "../generator/types";
import { ChainedLevel, MAX_STAGE, nextLevel } from "../generator/progression";

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

// Editar no llama a la IA: limite propio y mas amplio, para no gastar el de generar.
const editLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiados cambios seguidos. Espera un minuto e intenta de nuevo." },
});

// Express 4 no captura errores de handlers async.
type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const safe = (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res).catch(next);
};

const CUSTOM_LABEL = "Juego libre";
const CUSTOM_TAG = "Libre";
// La especificacion se guarda para armar el nivel siguiente, pero no hace falta en el navegador.
const withUrls = (level: StoredGame) => {
  if (level.layout === "custom") return { ...level, tag: CUSTOM_TAG };
  const { spec: _spec, ...rest } = level as ChainedLevel;
  // Tras editar el mapa cambia la URL de la imagen, para que no se muestre la vieja guardada en cache.
  const version = level.editedAt ? `?v=${Date.parse(level.editedAt)}` : "";
  return { ...rest, imageUrl: `/api/levels/${level.id}/image${version}`, tag: MODES[level.layout].example.tag };
};


async function createCustomGame(spec: LevelSpec, userId: number, onUsage: (usage: CustomGameUsage) => void, report: ReportStage) {
  const html = await writeCustomGame(spec, onUsage, report);
  report("saving");
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

  const startedAt = Date.now();
  const userId = req.user!.id;
  const parsed = await parseDescription(description, seed);
  // Cada salida de aqui en adelante deja una fila en generations (sin esperar a la base).
  const track = (entry: Pick<GenerationEntry, "status" | "rejectionKind" | "errorMessage">) =>
    recordGeneration({
      userId,
      prompt: description,
      trace: parsed.trace,
      fit: parsed.ok ? parsed.spec.fit ?? null : null,
      layout: parsed.ok ? parsed.spec.layout : null,
      latencyMs: Date.now() - startedAt,
      ...entry,
    });

  if (!parsed.ok) {
    track({ status: "rejected", rejectionKind: "invalid_input", errorMessage: parsed.reason });
    return res.status(422).json({ error: parsed.reason, code: "invalid_description" });
  }
  const { spec } = parsed;

  // Ningun estilo sirve: la IA escribe el juego. Tarda minutos, asi que se responde
  // enseguida con un trabajo que el cliente consulta hasta que termina.
  if (spec.fit === "custom") {
    if (process.env.CUSTOM_GAMES === "off") {
      const error = "Los juegos creados a medida están desactivados por ahora. Prueba con un estilo existente.";
      track({ status: "rejected", rejectionKind: "disabled", errorMessage: error });
      return res.status(503).json({ error, code: "custom_disabled" });
    }
    const quota = await checkCustomQuota(userId);
    if (!quota.allowed) {
      const waitMs = quota.retryAt.getTime() - Date.now();
      const error = `Llegaste al límite de ${quota.limit} juegos creados a medida en 24 horas. Podrás crear otro en ${formatWait(waitMs)}. Mientras tanto, puedes generar niveles de los estilos existentes.`;
      track({ status: "rejected", rejectionKind: "quota", errorMessage: error });
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil(waitMs / 1000))));
      return res.status(429).json({ error, code: "custom_limit", limit: quota.limit, retryAt: quota.retryAt.toISOString() });
    }

    // La fila nace pendiente y el trabajo la cierra; si el servidor se reinicia antes,
    // el barrido de arranque la marca como interrumpida.
    const record = track({ status: "pending" });
    let job;
    try {
      job = await startJob(userId, async (report) => {
        const writingStartedAt = Date.now();
        let usage: CustomGameUsage | undefined;
        try {
          const game = await createCustomGame(spec, userId, (u) => (usage = u), report);
          void finishCustomGeneration(record, { status: "success", usage, latencyMs: Date.now() - writingStartedAt });
          return game;
        } catch (error) {
          // En la base, el error real; al usuario, solo los mensajes pensados para el.
          const detail = error instanceof InvalidGameError ? `juego invalido tras corregir: ${error.problems.join(" | ")}` : (error as Error).message;
          void finishCustomGeneration(record, { status: "error", errorMessage: detail, usage, latencyMs: Date.now() - writingStartedAt });
          throw error instanceof CustomGameError ? error : new Error("No se pudo crear el juego. Inténtalo de nuevo.");
        }
      }, { title: spec.narrative?.title ?? null });
    } catch (error) {
      void finishCustomGeneration(record, { status: "error", errorMessage: `no se pudo iniciar el trabajo: ${(error as Error).message}`, latencyMs: 0 });
      throw error;
    }
    void linkJob(record, job.id);
    return res.status(202).json({ job: job.id, title: spec.narrative?.title, story: spec.narrative?.story });
  }

  let level: ChainedLevel;
  try {
    const built = buildLevel(spec);
    level = { ...toGeneratedLevel(uuidv4(), spec, built, renderAscii(built.grid, spec.theme, spec.layout)), spec };
  } catch (error) {
    track({ status: "error", errorMessage: (error as Error).message });
    return res.status(500).json({ error: (error as Error).message });
  }
  track({ status: "success" });

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

/** El ejemplo de la portada de un modo, con su especificacion, para encadenar desde el. */
function exampleLevel(id: string): ChainedLevel | undefined {
  const mode = id.slice("ejemplo-".length);
  if (!(MODE_PRIORITY as readonly string[]).includes(mode)) return undefined;
  const spec = parseDescriptionKeywords(MODES[mode as keyof typeof MODES].example.text, EXAMPLE_SEED);
  return { ...toGeneratedLevel(id, spec, buildLevel(spec), ""), spec };
}

/**
 * Nivel siguiente, mas dificil, al superar uno. Sin IA, asi que no gasta cuota.
 * Queda en "Mis juegos" de quien lo juega (aunque el anterior fuera compartido por otra persona).
 */
levelsRouter.post("/:id/next", requireAuth, generateLimiter, safe(async (req, res) => {
  const id = req.params.id;
  const previous = id.startsWith("ejemplo-") ? exampleLevel(id) : await getLevel(id);
  if (!previous) return res.status(404).json({ error: "Ese nivel ya no existe." });
  if (previous.layout === "custom") {
    return res.status(409).json({ error: "Los juegos libres no tienen niveles siguientes. Prueba «Otra variante»." });
  }
  if (((previous as ChainedLevel).stage ?? 1) >= MAX_STAGE) {
    return res.status(409).json({ error: `Llegaste al último nivel (${MAX_STAGE}). ¡Enhorabuena!` });
  }

  let level: ChainedLevel;
  try {
    level = nextLevel(previous as ChainedLevel, uuidv4());
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
  let saved = true;
  try {
    await saveLevel(level, req.user!.id);
  } catch (error) {
    saved = false;
    console.error("No se pudo guardar el nivel siguiente:", error);
  }
  return res.status(201).json({ ...withUrls(level), saved });
}));

levelsRouter.get("/jobs/:id", requireAuth, safe(async (req, res) => {
  const job = await getJob(req.params.id, req.user!.id);
  if (!job) return res.status(404).json({ error: "Ese trabajo ya no existe. Vuelve a intentarlo." });
  if (job.status === "error") return res.status(500).json({ status: job.status, error: job.error });
  return res.json({ status: job.status, stage: job.stage, level: job.result });
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

// Editar escenario: titulo, historia y mapa. Solo quien lo creo; lo que no llega en el cuerpo queda igual.
levelsRouter.patch("/:id", requireAuth, editLimiter, safe(async (req, res) => {
  const userId = req.user!.id;
  if (!(await isOwner(req.params.id, userId))) return res.status(404).json({ error: "Ese juego no existe o no es tuyo." });
  const level = await getLevel(req.params.id);
  if (!level) return res.status(404).json({ error: "Ese juego no existe o no es tuyo." });

  const { title, story, rows } = req.body ?? {};
  if (title === undefined && story === undefined && rows === undefined) return res.status(400).json({ error: "No hay cambios que guardar." });
  const edited = editLevel(level, { title, story, rows });
  if (!edited.ok) return res.status(400).json({ error: edited.error, field: edited.field });
  if (!(await updateLevel(edited.value, userId))) return res.status(404).json({ error: "Ese juego no existe o no es tuyo." });
  return res.json(withUrls(edited.value));
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
