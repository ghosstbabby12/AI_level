import { MAX_STAGE, nextLevel } from "../../domain/progression/progression";
import { ChainedLevel } from "../../domain/level/types";
import { AppError } from "../errors";
import { Deps } from "../ports";
import { getPlayableLevel } from "./levelQueries";
import { saveQuietly } from "./saveQuietly";

/**
 * Next, harder level after beating one. No AI, so it spends no quota. It goes to the
 * "Mis juegos" of whoever plays it (even if the previous one was shared by someone else).
 */
export async function createNextLevel(deps: Deps, id: string, userId: number): Promise<{ level: ChainedLevel; saved: boolean }> {
  const previous = await getPlayableLevel(deps, id);
  if (previous.layout === "custom") {
    throw new AppError("conflict", "Los juegos libres no tienen niveles siguientes. Prueba «Otra variante».");
  }
  if ((previous.stage ?? 1) >= MAX_STAGE) throw new AppError("conflict", `Llegaste al último nivel (${MAX_STAGE}). ¡Enhorabuena!`);

  let level: ChainedLevel;
  try {
    level = nextLevel(previous, deps.newId());
  } catch (error) {
    throw new AppError("failed", (error as Error).message);
  }
  return { level, saved: await saveQuietly(deps.levels, level, userId) };
}
