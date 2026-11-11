import { MODES } from "../level/modes";
import { Difficulty, FeatureSpec, LevelSpec } from "../level/types";

/**
 * How difficulty grows, level by level:
 * - Easy -> Normal -> Hard (each mode already scales enemies, traps, rivals... with it).
 * - Once on Hard: enemies and traps grow 15 % per level, capped.
 * - Explicit amounts ("5 trampas") grow 20 %.
 * - The map grows 6 % per level up to the mode maximum.
 * - Survival adds one wave; racing, one lap every two levels.
 * Whatever the user disabled ("sin trampas") stays disabled.
 */
const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];
const MAX_MULTIPLIER = 3;
const MAX_COUNT = 30;
const MAX_WAVES = 10;
const MAX_LAPS = 6;
const SIZE_GROWTH = 1.06;

function grow(feature: FeatureSpec, pastHard: boolean): FeatureSpec {
  if (!feature.enabled) return feature;
  return {
    enabled: true,
    count: feature.count === undefined ? undefined : Math.min(MAX_COUNT, Math.ceil(feature.count * 1.2)),
    multiplier: pastHard ? Math.min(MAX_MULTIPLIER, +(feature.multiplier * 1.15).toFixed(3)) : feature.multiplier,
  };
}

const clamp = (value: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, value));

/** Mazes need odd sizes; when the cap is even, go one down instead of over. */
const toOdd = (value: number, max: number) => (value % 2 === 1 ? value : value + 1 > max ? value - 1 : value + 1);

function grownSize(spec: LevelSpec): { width: number; height: number } {
  const { limits, oddSize } = MODES[spec.layout];
  const width = clamp(Math.round(spec.width * SIZE_GROWTH), limits.w);
  const height = clamp(Math.round(spec.height * SIZE_GROWTH), limits.h);
  return oddSize ? { width: toOdd(width, limits.w[1]), height: toOdd(height, limits.h[1]) } : { width, height };
}

function nextRounds(previous: LevelSpec, stage: number): number | undefined {
  const rounds = previous.rounds;
  if (rounds === undefined) return undefined;
  if (previous.layout === "survival") return Math.min(MAX_WAVES, rounds + 1);
  if (previous.layout === "racing" && stage % 2 === 1) return Math.min(MAX_LAPS, rounds + 1);
  return rounds;
}

/** Spec of the next level. Deterministic: the same level always leads to the same next one. */
export function harderSpec(previous: LevelSpec, stage: number): LevelSpec {
  const index = DIFFICULTIES.indexOf(previous.difficulty);
  const pastHard = index === DIFFICULTIES.length - 1;
  return {
    ...previous,
    seed: (previous.seed * 31 + stage * 7919) % 2 ** 31,
    difficulty: pastHard ? "hard" : DIFFICULTIES[index + 1],
    ...grownSize(previous),
    traps: grow(previous.traps, pastHard),
    enemies: grow(previous.enemies, pastHard),
    rounds: nextRounds(previous, stage),
  };
}
