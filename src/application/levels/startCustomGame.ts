import { CustomGame, LevelSpec } from "../../domain/level/types";
import { formatWait } from "../../domain/shared/formatWait";
import { AppError, UserFacingError } from "../errors";
import { CustomGameUsage, Deps, GenerationEntry, GenerationRecord, ReportStage } from "../ports";
import { saveQuietly } from "./saveQuietly";

export type Track = (entry: Pick<GenerationEntry, "status" | "rejectionKind" | "errorMessage">) => GenerationRecord;

const CUSTOM_LABEL = "Juego libre";
const GENERIC_FAILURE = "No se pudo crear el juego. Inténtalo de nuevo.";

/** Refuses when custom games are off or the user reached the daily cap. */
async function ensureAllowed(deps: Deps, userId: number, track: Track): Promise<void> {
  if (!deps.settings.customGamesEnabled()) {
    const error = "Los juegos creados a medida están desactivados por ahora. Prueba con un estilo existente.";
    track({ status: "rejected", rejectionKind: "disabled", errorMessage: error });
    throw new AppError("unavailable", error, { code: "custom_disabled" });
  }
  const quota = await deps.customQuota.check(userId);
  if (quota.allowed) return;
  const waitMs = quota.retryAt.getTime() - Date.now();
  const error = `Llegaste al límite de ${quota.limit} juegos creados a medida en 24 horas. Podrás crear otro en ${formatWait(waitMs)}. Mientras tanto, puedes generar niveles de los estilos existentes.`;
  track({ status: "rejected", rejectionKind: "quota", errorMessage: error });
  const retryAfter = Math.max(1, Math.ceil(waitMs / 1000));
  throw new AppError("rate_limited", error, { code: "custom_limit", limit: quota.limit, retryAt: quota.retryAt.toISOString() }, retryAfter);
}

/** The AI writes the game; then it is saved. The result is what the client receives. */
async function writeAndSave(deps: Deps, spec: LevelSpec, userId: number, report: ReportStage, onUsage: (u: CustomGameUsage) => void) {
  const html = await deps.gameWriter.write(spec, onUsage, report);
  report("saving");
  const game: CustomGame = {
    id: deps.newId(),
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
  const saved = await saveQuietly(deps.levels, game, userId);
  return { ...game, saved };
}

/**
 * Writing a game takes minutes, so it runs as a job and the client follows it live.
 * The generations row is born pending and the job closes it; if the server restarts
 * first, the startup sweep marks it as interrupted.
 */
export async function startCustomGame(deps: Deps, spec: LevelSpec, userId: number, track: Track) {
  await ensureAllowed(deps, userId, track);
  const record = track({ status: "pending" });
  const finish = deps.generations.finishCustom.bind(deps.generations, record);

  const work = async (report: ReportStage) => {
    const startedAt = Date.now();
    let usage: CustomGameUsage | undefined;
    try {
      // Usage arrives after every AI call: a rejected game was paid for too and must be logged.
      const game = await writeAndSave(deps, spec, userId, report, (u) => (usage = u));
      void finish({ status: "success", usage, latencyMs: Date.now() - startedAt });
      return game;
    } catch (error) {
      // The database keeps the real error; the user only sees messages meant for them.
      const detail = error instanceof UserFacingError && error.detail ? error.detail : (error as Error).message;
      void finish({ status: "error", errorMessage: detail, usage, latencyMs: Date.now() - startedAt });
      throw error instanceof UserFacingError ? error : new Error(GENERIC_FAILURE);
    }
  };

  let job;
  try {
    job = await deps.jobs.start(userId, work, { title: spec.narrative?.title ?? null });
  } catch (error) {
    void finish({ status: "error", errorMessage: `no se pudo iniciar el trabajo: ${(error as Error).message}`, latencyMs: 0 });
    throw error;
  }
  void deps.generations.linkJob(record, job.id);
  return { kind: "job" as const, jobId: job.id, title: spec.narrative?.title, story: spec.narrative?.story };
}
