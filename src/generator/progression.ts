import { buildLevel, toGeneratedLevel } from "./levelBuilder";
import { MODES } from "./modes";
import { renderAscii } from "../renderer/asciiRenderer";
import { Difficulty, FeatureSpec, GeneratedLevel, LevelSpec } from "./types";

/**
 * Niveles encadenados: al superar un nivel se arma el siguiente con el mismo estilo, tema e
 * historia, pero mas dificil. No llama a la IA: es gratis e instantaneo.
 *
 * Como sube la dificultad, nivel a nivel:
 * - Facil -> Normal -> Dificil (cada modo ya cuenta enemigos, trampas, rivales... segun esto).
 * - Ya en Dificil: enemigos y trampas crecen un 15 % por nivel, con tope.
 * - Las cantidades pedidas a mano ("5 trampas") crecen un 20 %.
 * - El mapa crece un 6 % por nivel hasta el maximo del modo.
 * - Supervivencia suma una oleada; carreras, una vuelta cada dos niveles.
 * Lo que el usuario desactivo ("sin trampas") sigue desactivado.
 */

export const MAX_STAGE = 99;
const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];
const MAX_MULTIPLIER = 3;
const MAX_COUNT = 30;
const MAX_WAVES = 10;
const MAX_LAPS = 6;
const SIZE_GROWTH = 1.06;

const TITLE_MAX = 60;
const STAGE_SUFFIX = /\s+·\s+Nivel\s+\d+$/;

export type ChainedLevel = GeneratedLevel & { stage?: number; spec?: LevelSpec };

/** Titulo sin el " · Nivel N" que le agrega la cadena. */
export function baseTitle(title: string): string {
  return title.replace(STAGE_SUFFIX, "");
}

function stageTitle(title: string, stage: number): string {
  const suffix = ` · Nivel ${stage}`;
  return baseTitle(title).slice(0, TITLE_MAX - suffix.length).trimEnd() + suffix;
}

/**
 * Niveles guardados antes de existir la cadena no traen su especificacion: se rehace con lo que
 * si guardan. Lo que no se sabe (cuanto pidio de cada cosa) queda en lo normal.
 */
export function specFromLevel(level: ChainedLevel): LevelSpec {
  if (level.spec) return level.spec;
  // Cada estilo nombra distinto sus peligros; "ninguno" o 0 quiere decir que se pidio sin ellos.
  const disabled = (labels: string[]) =>
    level.interpretation.some((chip) => labels.some((label) => chip === `${label}: ninguno` || chip === `${label}: 0`));
  const feature = (enabled: boolean): FeatureSpec => ({ enabled, multiplier: 1 });
  return {
    description: level.description,
    seed: level.seed,
    theme: level.theme,
    layout: level.layout,
    difficulty: level.difficulty,
    width: level.width,
    height: level.height,
    boss: level.boss,
    traps: feature(!disabled(["Trampas", "Bombas", "Explosivos", "Manchas de aceite"])),
    enemies: feature(!disabled(["Enemigos", "Rivales", "Blancos moviles"])),
    items: feature(!disabled(["Objetos"])),
    kinds: level.kinds,
    itemLabel: level.itemLabel,
    rounds: level.params?.waves ?? level.params?.laps,
    narrative: level.narrative,
  };
}

function grow(feature: FeatureSpec, pastHard: boolean): FeatureSpec {
  if (!feature.enabled) return feature;
  return {
    enabled: true,
    count: feature.count === undefined ? undefined : Math.min(MAX_COUNT, Math.ceil(feature.count * 1.2)),
    multiplier: pastHard ? Math.min(MAX_MULTIPLIER, +(feature.multiplier * 1.15).toFixed(3)) : feature.multiplier,
  };
}

function grownSize(spec: LevelSpec): { width: number; height: number } {
  const mode = MODES[spec.layout];
  const clamp = (value: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, value));
  let width = clamp(Math.round(spec.width * SIZE_GROWTH), mode.limits.w);
  let height = clamp(Math.round(spec.height * SIZE_GROWTH), mode.limits.h);
  if (mode.oddSize) {
    // Los laberintos necesitan medidas impares; si el tope es par se baja uno en vez de pasarse.
    if (width % 2 === 0) width += width + 1 > mode.limits.w[1] ? -1 : 1;
    if (height % 2 === 0) height += height + 1 > mode.limits.h[1] ? -1 : 1;
  }
  return { width, height };
}

/** Especificacion del nivel siguiente. Determinista: el mismo nivel siempre lleva al mismo siguiente. */
export function harderSpec(previous: LevelSpec, stage: number): LevelSpec {
  const index = DIFFICULTIES.indexOf(previous.difficulty);
  const pastHard = index === DIFFICULTIES.length - 1;
  let rounds = previous.rounds;
  if (previous.layout === "survival" && rounds !== undefined) rounds = Math.min(MAX_WAVES, rounds + 1);
  if (previous.layout === "racing" && rounds !== undefined && stage % 2 === 1) rounds = Math.min(MAX_LAPS, rounds + 1);
  return {
    ...previous,
    seed: (previous.seed * 31 + stage * 7919) % 2 ** 31,
    difficulty: pastHard ? "hard" : DIFFICULTIES[index + 1],
    ...grownSize(previous),
    traps: grow(previous.traps, pastHard),
    enemies: grow(previous.enemies, pastHard),
    items: previous.items,
    rounds,
  };
}

/**
 * Arma y devuelve el nivel siguiente a `level`, listo para guardar.
 * Si el mapa agrandado no da un nivel valido, se intenta con el tamano anterior.
 */
export function nextLevel(level: ChainedLevel, id: string): ChainedLevel {
  const stage = Math.min(MAX_STAGE, (level.stage ?? 1) + 1);
  // Vueltas u oleadas que no se pidieron salen de la dificultad: se parte de las que tuvo la partida.
  const previous = { ...specFromLevel(level) };
  previous.rounds ??= level.params?.waves ?? level.params?.laps;
  const narrative = { ...level.narrative, title: stageTitle(level.narrative.title, stage) };
  let spec: LevelSpec = { ...harderSpec(previous, stage), narrative };

  let built;
  try {
    built = buildLevel(spec);
  } catch {
    spec = { ...spec, width: previous.width, height: previous.height };
    built = buildLevel(spec);
  }
  const generated = toGeneratedLevel(id, spec, built, renderAscii(built.grid, spec.theme, spec.layout));
  return { ...generated, interpretation: [`Nivel: ${stage}`, ...generated.interpretation], stage, spec };
}
