import { AppError } from "../errors";
import { Deps, Job, LevelSummary, StoredGame } from "../ports";
import { exampleLevel, isExampleId } from "./examples";

const notFound = (message = "Nivel no encontrado.") => new AppError("not_found", message);

export async function getLevel(deps: Deps, id: string): Promise<StoredGame> {
  const level = await deps.levels.get(id);
  if (!level) throw notFound();
  return level;
}

/** A saved level or a home page example: both can be chained or remixed. */
export async function getPlayableLevel(deps: Deps, id: string): Promise<StoredGame> {
  const level = isExampleId(id) ? exampleLevel(id) : await deps.levels.get(id);
  if (!level) throw notFound("Ese nivel ya no existe.");
  return level;
}

export function listMyLevels(deps: Deps, userId: number): Promise<LevelSummary[]> {
  return deps.levels.listByUser(userId);
}

/** Only deletes when the level belongs to the user. */
export async function deleteLevel(deps: Deps, id: string, userId: number): Promise<void> {
  if (!(await deps.levels.remove(id, userId))) throw notFound();
}

export async function getJob(deps: Deps, id: string, userId: number): Promise<Job> {
  const job = await deps.jobs.get(id, userId);
  if (!job) throw notFound("Ese trabajo ya no existe. Vuelve a intentarlo.");
  return job;
}
