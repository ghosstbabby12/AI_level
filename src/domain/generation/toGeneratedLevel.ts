import { MODES } from "../level/modes";
import { templateNarrative } from "../level/narrative";
import { THEME_PALETTES } from "../level/themes";
import { GeneratedLevel, LevelSpec } from "../level/types";
import { renderAscii } from "../rendering/asciiRenderer";
import { DEFAULT_KINDS, describe } from "./describeLevel";
import { buildLevel, BuiltLevel } from "./levelBuilder";

/** Turns a built grid into the level the player receives (palette, chips, story, controls...). */
export function toGeneratedLevel(id: string, spec: LevelSpec, built: BuiltLevel, ascii: string): GeneratedLevel {
  const { grid, placed } = built;
  return {
    id,
    description: spec.description,
    seed: spec.seed,
    theme: spec.theme,
    layout: spec.layout,
    difficulty: spec.difficulty,
    boss: spec.boss,
    width: grid[0].length,
    height: grid.length,
    grid,
    ascii,
    palette: THEME_PALETTES[spec.theme],
    interpretation: describe(spec, grid, placed, built.params),
    narrative: spec.narrative ?? templateNarrative(spec),
    adaptationNote: spec.adaptationNote,
    kinds: spec.kinds ?? DEFAULT_KINDS,
    itemLabel: spec.itemLabel,
    counts: placed,
    controls: MODES[spec.layout].controls,
    route: built.route,
    params: built.params,
    quality: built.quality,
    createdAt: new Date().toISOString(),
  };
}

/** Builds the level for a spec and keeps the spec, so it can be chained or remixed later. */
export function generateFromSpec(id: string, spec: LevelSpec): GeneratedLevel & { spec: LevelSpec } {
  const built = buildLevel(spec);
  return { ...toGeneratedLevel(id, spec, built, renderAscii(built.grid, spec.theme, spec.layout)), spec };
}
