import { ChainedLevel, FeatureSpec, LevelSpec } from "../level/types";

const HAZARD_LABELS = {
  traps: ["Trampas", "Bombas", "Explosivos", "Manchas de aceite"],
  enemies: ["Enemigos", "Rivales", "Blancos moviles"],
  items: ["Objetos"],
};

/**
 * Levels saved before chaining existed carry no spec: it is rebuilt from what they do
 * store. Unknown values (how much of each thing was requested) fall back to normal.
 */
export function specFromLevel(level: ChainedLevel): LevelSpec {
  if (level.spec) return level.spec;
  // Each style names its hazards differently; "ninguno" or 0 means they were requested off.
  const disabled = (labels: string[]) =>
    level.interpretation.some((chip) => labels.some((label) => chip === `${label}: ninguno` || chip === `${label}: 0`));
  const feature = (labels: string[]): FeatureSpec => ({ enabled: !disabled(labels), multiplier: 1 });
  return {
    description: level.description,
    seed: level.seed,
    theme: level.theme,
    layout: level.layout,
    difficulty: level.difficulty,
    width: level.width,
    height: level.height,
    boss: level.boss,
    traps: feature(HAZARD_LABELS.traps),
    enemies: feature(HAZARD_LABELS.enemies),
    items: feature(HAZARD_LABELS.items),
    kinds: level.kinds,
    itemLabel: level.itemLabel,
    rounds: level.params?.waves ?? level.params?.laps,
    narrative: level.narrative,
  };
}
