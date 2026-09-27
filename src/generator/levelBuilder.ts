import { Grid } from "./grid";
import { buildPlatformer } from "./platformer";
import { createRng } from "./rng";
import { THEME_PALETTES } from "./themes";
import { buildDungeonLayout, buildMazeLayout, populateTopDown } from "./topDown";
import { GeneratedLevel, LevelSpec, PlacedCounts } from "./types";
import { validateLevel } from "./validator";

const MAX_ATTEMPTS = 40;

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

export function buildLevel(spec: LevelSpec): { grid: Grid; placed: PlacedCounts } {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = attemptBuild(spec, attempt);
    if (result) return result;
  }
  throw new Error("No se pudo generar un nivel valido con esa descripcion.");
}

export function describe(spec: LevelSpec, grid: Grid, placed: PlacedCounts): string[] {
  const feature = (label: string, enabled: boolean, count: number) =>
    enabled ? `${label}: ${count}` : `${label}: ninguno`;

  return [
    `Tipo: ${LAYOUT_LABEL[spec.layout]}`,
    `Tema: ${THEME_LABEL[spec.theme]}`,
    `Dificultad: ${DIFFICULTY_LABEL[spec.difficulty]}`,
    `Tamano: ${grid[0].length}x${grid.length}`,
    `Jefe final: ${spec.boss ? "si" : "no"}`,
    feature("Trampas", spec.traps.enabled, placed.traps),
    feature("Enemigos", spec.enemies.enabled, placed.enemies),
    feature("Objetos", spec.items.enabled, placed.items),
  ];
}

export function toGeneratedLevel(id: string, spec: LevelSpec, grid: Grid, placed: PlacedCounts, ascii: string): GeneratedLevel {
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
    createdAt: new Date().toISOString(),
  };
}
