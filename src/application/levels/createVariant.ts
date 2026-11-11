import { ChainedLevel } from "../../domain/level/types";
import { remixLevel, SettingChanges } from "../../domain/settings/remixLevel";
import { AppError } from "../errors";
import { Deps } from "../ports";
import { getPlayableLevel } from "./levelQueries";
import { saveQuietly } from "./saveQuietly";

/**
 * Variant with settings changed from the chips (difficulty, amounts, boss) without
 * rewriting the request. It is a new game in "Mis juegos": the previous one is kept.
 */
export async function createVariant(deps: Deps, id: string, userId: number, changes: SettingChanges) {
  const previous = await getPlayableLevel(deps, id);
  if (previous.layout === "custom") throw new AppError("conflict", "Los juegos libres no tienen ajustes.");

  const remixed = remixLevel(previous, changes, deps.newId());
  if (!remixed.ok) throw new AppError("invalid", remixed.error, { field: remixed.field });
  const level: ChainedLevel = remixed.value;
  return { level, saved: await saveQuietly(deps.levels, level, userId) };
}
