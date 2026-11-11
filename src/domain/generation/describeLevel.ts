import { Grid } from "../level/grid";
import { MODES } from "../level/modes";
import { BossKind, EnemyKind, ItemKind, Kinds, Layout, LevelSpec, PlacedCounts } from "../level/types";

/** Spanish labels: these chips are read by the player. */
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
export const ITEM_LABEL: Record<ItemKind, string> = {
  coin: "monedas", gem: "gemas", key: "llaves", weapon: "armas", potion: "pociones", star: "estrellas", fruit: "frutas",
};
const ENEMY_LABEL: Record<EnemyKind, string> = {
  blob: "criaturas", slime: "slimes", ghost: "fantasmas", skeleton: "esqueletos", robot: "robots", bat: "murcielagos", mixed: "variados",
};
const BOSS_LABEL: Record<BossKind, string> = { monster: "monstruo", dragon: "dragon", vampire: "vampiro", mech: "robot gigante" };

export const DEFAULT_KINDS: Kinds = { item: "coin", enemy: "blob", boss: "monster" };

const feature = (label: string, enabled: boolean, count: number, noun?: string) =>
  enabled ? `${label}: ${count}${noun ? " " + noun : ""}` : `${label}: ninguno`;

/** Chips for modes whose pieces mean something special (targets, spawn points, bricks...). */
function specificChips(spec: LevelSpec, placed: PlacedCounts, params: Record<string, number>, itemNoun: string): string[] | undefined {
  const kinds = spec.kinds ?? DEFAULT_KINDS;
  const boss = `Jefe final: ${spec.boss ? BOSS_LABEL[kinds.boss] : "no"}`;
  const byMode: Partial<Record<Layout, string[]>> = {
    shooter: [`Dianas: ${placed.items}`, `Blancos moviles: ${placed.enemies}`, `Bombas: ${placed.traps}`, boss],
    survival: [`Oleadas: ${params.waves}`, `Enemigos: ${ENEMY_LABEL[kinds.enemy]}`, `Curaciones: ${placed.items}`, `Trampas: ${placed.traps}`, boss],
    racing: [`Vueltas: ${params.laps}`, `Rivales: ${placed.enemies}`, `Filas de cajas: ${placed.items}`, `Manchas de aceite: ${placed.traps}`],
    invaders: [`Invasores: ${placed.enemies} ${ENEMY_LABEL[kinds.enemy]}`, boss],
    breakout: [`Bloques: ${placed.items}`, `Explosivos: ${placed.traps}`, boss],
    snake: [`Por comer: ${placed.items} ${itemNoun}`, `Trampas: ${placed.traps}`],
  };
  return byMode[spec.layout];
}

/** Human-readable summary of a level ("Tipo: Laberinto", "Trampas: 6"...). */
export function describe(spec: LevelSpec, grid: Grid, placed: PlacedCounts, params: Record<string, number> = {}): string[] {
  const kinds = spec.kinds ?? DEFAULT_KINDS;
  const itemNoun = spec.itemLabel ?? ITEM_LABEL[kinds.item];
  const head = [`Tipo: ${MODES[spec.layout].label}`, `Tema: ${THEME_LABEL[spec.theme]}`, `Dificultad: ${DIFFICULTY_LABEL[spec.difficulty]}`];
  const specific = specificChips(spec, placed, params, itemNoun);
  if (specific) return [...head, ...specific];

  const arcade = spec.layout === "arcade";
  return [
    ...head,
    `Tamano: ${grid[0].length}x${grid.length}`,
    `Jefe final: ${spec.boss ? BOSS_LABEL[kinds.boss] : "no"}`,
    feature("Trampas", spec.traps.enabled && !arcade, placed.traps),
    feature("Enemigos", spec.enemies.enabled, placed.enemies, ENEMY_LABEL[kinds.enemy]),
    arcade
      ? feature("Por recoger", true, placed.items, kinds.item === "coin" && !spec.itemLabel ? "puntos" : itemNoun)
      : feature("Objetos", spec.items.enabled, placed.items, itemNoun),
  ];
}
