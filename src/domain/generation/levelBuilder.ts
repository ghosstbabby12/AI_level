import { createRng, Rng } from "../level/rng";
import { BuildResult, Layout, LevelSpec } from "../level/types";
import { buildArcade } from "./builders/arcade";
import { buildBreakout } from "./builders/breakout";
import { buildCaveLayout } from "./builders/cave";
import { buildInvaders } from "./builders/invaders";
import { buildPlatformer } from "./builders/platformer";
import { buildRacing } from "./builders/racing";
import { buildShooter } from "./builders/shooter";
import { buildSnake } from "./builders/snake";
import { buildSurvival } from "./builders/survival";
import { buildDungeonLayout, buildMazeLayout, populateTopDown, TopDownLayout } from "./builders/topDown";
import { scoreLevel } from "./quality";
import { validateLevel } from "./validator";

const MAX_ATTEMPTS = 40;

/** Valid candidates compared before choosing; more = better levels but more CPU. Set at startup. */
let candidates = 8;
export function setLevelCandidates(value: number): void {
  if (Number.isInteger(value) && value > 0) candidates = value;
}

function buildTopDown(spec: LevelSpec, rng: Rng, layout: TopDownLayout | null): BuildResult | null {
  return layout ? { grid: layout.grid, placed: populateTopDown(layout, spec, rng) } : null;
}

/** Builder for each mode; returns null when an attempt fails and must be retried. */
const BUILDERS: Record<Layout, (spec: LevelSpec, rng: Rng) => BuildResult | null> = {
  platformer: buildPlatformer,
  arcade: buildArcade,
  shooter: buildShooter,
  survival: buildSurvival,
  racing: buildRacing,
  invaders: buildInvaders,
  breakout: buildBreakout,
  snake: buildSnake,
  maze: (spec, rng) => buildTopDown(spec, rng, buildMazeLayout(spec, rng)),
  cave: (spec, rng) => buildTopDown(spec, rng, buildCaveLayout(spec, rng)),
  dungeon: (spec, rng) => buildTopDown(spec, rng, buildDungeonLayout(spec, rng)),
};

function attemptBuild(spec: LevelSpec, attempt: number): BuildResult | null {
  const result = BUILDERS[spec.layout](spec, createRng(spec.seed + attempt * 7919));
  return result && validateLevel(result.grid, spec) === null ? result : null;
}

export interface BuiltLevel extends BuildResult {
  /** Design score (0-100) of the chosen candidate. */
  quality: number;
}

/** Builds several valid levels from the same base seed and returns the best scored one (deterministic). */
export function buildLevel(spec: LevelSpec): BuiltLevel {
  let best: BuiltLevel | null = null;
  let valid = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && valid < candidates; attempt++) {
    const result = attemptBuild(spec, attempt);
    if (!result) continue;
    valid++;
    const quality = scoreLevel(result.grid, spec, result.placed);
    if (!best || quality > best.quality) best = { ...result, quality };
  }
  if (!best) throw new Error("No se pudo generar un nivel valido con esa descripcion.");
  return best;
}
