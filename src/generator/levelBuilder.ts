import { Grid } from "./grid";
import { buildPlatformer } from "./platformer";
import { createRng } from "./rng";
import { THEME_PALETTES } from "./themes";
import { buildDungeonLayout, buildMazeLayout, populateTopDown } from "./topDown";
import { templateNarrative } from "./narrative";
import { scoreLevel } from "./quality";
import { BossKind, EnemyKind, GeneratedLevel, ItemKind, Kinds, LevelSpec, PlacedCounts } from "./types";
import { validateLevel } from "./validator";

const MAX_ATTEMPTS = 40;
/** Candidatos validos que se comparan antes de elegir; mas = mejores niveles pero mas CPU. */
const CANDIDATES = Number(process.env.LEVEL_CANDIDATES) || 8;

const LAYOUT_LABEL = {
  platformer: "Plataformas de scroll lateral",
  maze: "Laberinto",
  dungeon: "Mazmorra con salas y pasillos",
};

const THEME_LABEL = {
  ice: "Hielo",
  lava: "Lava",
  forest: "Bosque",
  desert: "Desierto",
  dungeon: "Mazmorra de piedra",
  overworld: "Mundo abierto (cielo y pasto)",
  water: "Submarino",
  space: "Espacio",
};

const DIFFICULTY_LABEL = { easy: "Facil", normal: "Normal", hard: "Dificil" };

const ITEM_LABEL: Record<ItemKind, string> = {
  coin: "monedas", gem: "gemas", key: "llaves", weapon: "armas", potion: "pociones", star: "estrellas", fruit: "frutas",
};
const ENEMY_LABEL: Record<EnemyKind, string> = {
  blob: "criaturas", slime: "slimes", ghost: "fantasmas", skeleton: "esqueletos", robot: "robots", bat: "murcielagos", mixed: "variados",
};
const BOSS_LABEL: Record<BossKind, string> = { monster: "monstruo", dragon: "dragon", vampire: "vampiro", mech: "robot gigante" };

const DEFAULT_KINDS: Kinds = { item: "coin", enemy: "blob", boss: "monster" };

function attemptBuild(spec: LevelSpec, attempt: number): { grid: Grid; placed: PlacedCounts } | null {
  const rng = createRng(spec.seed + attempt * 7919);

  if (spec.layout === "platformer") {
    const { grid, placed } = buildPlatformer(spec, rng);
    return validateLevel(grid, spec) === null ? { grid, placed } : null;
  }

  const layout = spec.layout === "maze" ? buildMazeLayout(spec, rng) : buildDungeonLayout(spec, rng);
  if (!layout) return null;
  const placed = populateTopDown(layout, spec, rng);
  return validateLevel(layout.grid, spec) === null ? { grid: layout.grid, placed } : null;
}

export interface BuiltLevel {
  grid: Grid;
  placed: PlacedCounts;
  /** Puntuacion de diseno (0-100) del candidato elegido. */
  quality: number;
}

/** Genera varios niveles validos con la misma semilla base y devuelve el mejor puntuado (deterministico). */
export function buildLevel(spec: LevelSpec): BuiltLevel {
  let best: BuiltLevel | null = null;
  let valid = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && valid < CANDIDATES; attempt++) {
    const result = attemptBuild(spec, attempt);
    if (!result) continue;
    valid++;
    const quality = scoreLevel(result.grid, spec, result.placed);
    if (!best || quality > best.quality) best = { ...result, quality };
  }
  if (!best) throw new Error("No se pudo generar un nivel valido con esa descripcion.");
  return best;
}

export function describe(spec: LevelSpec, grid: Grid, placed: PlacedCounts): string[] {
  const kinds = spec.kinds ?? DEFAULT_KINDS;
  const feature = (label: string, enabled: boolean, count: number, noun?: string) =>
    enabled ? `${label}: ${count}${noun ? " " + noun : ""}` : `${label}: ninguno`;

  return [
    `Tipo: ${LAYOUT_LABEL[spec.layout]}`,
    `Tema: ${THEME_LABEL[spec.theme]}`,
    `Dificultad: ${DIFFICULTY_LABEL[spec.difficulty]}`,
    `Tamano: ${grid[0].length}x${grid.length}`,
    `Jefe final: ${spec.boss ? BOSS_LABEL[kinds.boss] : "no"}`,
    feature("Trampas", spec.traps.enabled, placed.traps),
    feature("Enemigos", spec.enemies.enabled, placed.enemies, ENEMY_LABEL[kinds.enemy]),
    feature("Objetos", spec.items.enabled, placed.items, ITEM_LABEL[kinds.item]),
  ];
}

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
    interpretation: describe(spec, grid, placed),
    narrative: spec.narrative ?? templateNarrative(spec),
    kinds: spec.kinds ?? DEFAULT_KINDS,
    quality: built.quality,
    createdAt: new Date().toISOString(),
  };
}
