import { generateFromSpec } from "../generation/toGeneratedLevel";
import { ChainedLevel, LevelSpec } from "../level/types";
import { harderSpec } from "./harderSpec";
import { specFromLevel } from "./specFromLevel";

/**
 * Chained levels: beating a level builds the next one with the same style, theme and story,
 * but harder (see harderSpec). No AI call: free and instant.
 */
export const MAX_STAGE = 99;
const TITLE_MAX = 60;
const STAGE_SUFFIX = /\s+·\s+Nivel\s+\d+$/;

/** Title without the " · Nivel N" suffix the chain adds. */
export function baseTitle(title: string): string {
  return title.replace(STAGE_SUFFIX, "");
}

function stageTitle(title: string, stage: number): string {
  const suffix = ` · Nivel ${stage}`;
  return baseTitle(title).slice(0, TITLE_MAX - suffix.length).trimEnd() + suffix;
}

/**
 * Builds the level that follows `level`, ready to be saved.
 * If the enlarged map yields no valid level, the previous size is used.
 */
export function nextLevel(level: ChainedLevel, id: string): ChainedLevel {
  const stage = Math.min(MAX_STAGE, (level.stage ?? 1) + 1);
  // Laps or waves not requested come from the difficulty: start from what the game had.
  const previous: LevelSpec = { ...specFromLevel(level) };
  previous.rounds ??= level.params?.waves ?? level.params?.laps;
  const narrative = { ...level.narrative, title: stageTitle(level.narrative.title, stage) };
  const spec: LevelSpec = { ...harderSpec(previous, stage), narrative };

  let generated;
  try {
    generated = generateFromSpec(id, spec);
  } catch {
    generated = generateFromSpec(id, { ...spec, width: previous.width, height: previous.height });
  }
  return { ...generated, interpretation: [`Nivel: ${stage}`, ...generated.interpretation], stage };
}
