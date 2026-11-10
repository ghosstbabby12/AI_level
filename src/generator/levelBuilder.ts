import { buildArcade } from "./arcade";
import { buildBreakout } from "./breakout";
import { buildCaveLayout } from "./cave";
import { Grid } from "./grid";
import { buildInvaders } from "./invaders";
import { MODES } from "./modes";
import { buildPlatformer } from "./platformer";
import { buildRacing } from "./racing";
import { createRng, Rng } from "./rng";
import { buildShooter } from "./shooter";
import { buildSnake } from "./snake";
import { buildSurvival } from "./survival";
import { THEME_PALETTES } from "./themes";
import { buildDungeonLayout, buildMazeLayout, populateTopDown, TopDownLayout } from "./topDown";
import { templateNarrative } from "./narrative";
import { scoreLevel } from "./quality";
import { BossKind, BuildResult, EnemyKind, GeneratedLevel, ItemKind, Kinds, Layout, LevelSpec, PlacedCounts } from "./types";
import { validateLevel } from "./validator";

const MAX_ATTEMPTS = 40;
/** Candidatos validos que se comparan antes de elegir; mas = mejores niveles pero mas CPU. */
const CANDIDATES = Number(process.env.LEVEL_CANDIDATES) || 8;

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

/** Generador de cada modo; devuelve null si ese intento no salio bien y hay que reintentar. */
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

function buildTopDown(spec: LevelSpec, rng: Rng, layout: TopDownLayout | null): BuildResult | null {
  if (!layout) return null;
  return { grid: layout.grid, placed: populateTopDown(layout, spec, rng) };
}

function attemptBuild(spec: LevelSpec, attempt: number): BuildResult | null {
  const result = BUILDERS[spec.layout](spec, createRng(spec.seed + attempt * 7919));
  return result && validateLevel(result.grid, spec) === null ? result : null;
}

export interface BuiltLevel extends BuildResult {
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

export function describe(spec: LevelSpec, grid: Grid, placed: PlacedCounts, params: Record<string, number> = {}): string[] {
  const kinds = spec.kinds ?? DEFAULT_KINDS;
  const itemNoun = spec.itemLabel ?? ITEM_LABEL[kinds.item];
  const feature = (label: string, enabled: boolean, count: number, noun?: string) =>
    enabled ? `${label}: ${count}${noun ? " " + noun : ""}` : `${label}: ninguno`;

  const head = [`Tipo: ${MODES[spec.layout].label}`, `Tema: ${THEME_LABEL[spec.theme]}`, `Dificultad: ${DIFFICULTY_LABEL[spec.difficulty]}`];
  const bossChip = `Jefe final: ${spec.boss ? BOSS_LABEL[kinds.boss] : "no"}`;
  const specific: Partial<Record<Layout, string[]>> = {
    shooter: [`Dianas: ${placed.items}`, `Blancos moviles: ${placed.enemies}`, `Bombas: ${placed.traps}`, bossChip],
    survival: [`Oleadas: ${params.waves}`, `Enemigos: ${ENEMY_LABEL[kinds.enemy]}`, `Curaciones: ${placed.items}`, `Trampas: ${placed.traps}`, bossChip],
    racing: [`Vueltas: ${params.laps}`, `Rivales: ${placed.enemies}`, `Filas de cajas: ${placed.items}`, `Manchas de aceite: ${placed.traps}`],
    invaders: [`Invasores: ${placed.enemies} ${ENEMY_LABEL[kinds.enemy]}`, bossChip],
    breakout: [`Bloques: ${placed.items}`, `Explosivos: ${placed.traps}`, bossChip],
    snake: [`Por comer: ${placed.items} ${itemNoun}`, `Trampas: ${placed.traps}`],
  };
  const chips = specific[spec.layout];
  if (chips) return [...head, ...chips];

  return [
    `Tipo: ${MODES[spec.layout].label}`,
    `Tema: ${THEME_LABEL[spec.theme]}`,
    `Dificultad: ${DIFFICULTY_LABEL[spec.difficulty]}`,
    `Tamano: ${grid[0].length}x${grid.length}`,
    `Jefe final: ${spec.boss ? BOSS_LABEL[kinds.boss] : "no"}`,
    feature("Trampas", spec.traps.enabled && spec.layout !== "arcade", placed.traps),
    feature("Enemigos", spec.enemies.enabled, placed.enemies, ENEMY_LABEL[kinds.enemy]),
    spec.layout === "arcade"
      ? feature("Por recoger", true, placed.items, kinds.item === "coin" && !spec.itemLabel ? "puntos" : itemNoun)
      : feature("Objetos", spec.items.enabled, placed.items, itemNoun),
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
