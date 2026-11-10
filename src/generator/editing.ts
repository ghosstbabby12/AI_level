import { renderAscii } from "../renderer/asciiRenderer";
import { decodeGrid } from "../store/levelStore";
import { countCells, findCell } from "./grid";
import { describe } from "./levelBuilder";
import { ChainedLevel, specFromLevel } from "./progression";
import { CellType, CustomGame, Layout } from "./types";
import { validateLevel } from "./validator";

/**
 * Edicion de escenarios guardados: titulo, historia y, en los estilos que lo permiten, el mapa.
 *
 * El mapa lo pinta el usuario casilla a casilla, asi que aqui se comprueba todo lo que el juego da
 * por hecho: mismas medidas, solo casillas que ese estilo sabe dibujar, el borde intacto (los juegos
 * no miran fuera del mapa) y, sobre todo, que se pueda ganar: el mismo validador de los niveles generados.
 */

export const TITLE_MAX = 60;
export const STORY_MAX = 240;
const MAX_ENEMIES = 150;

/** Casillas que cada estilo usa (y sabe dibujar). Carreras no se edita: su recorrido se calcula aparte. */
export const EDITABLE_CELLS: Partial<Record<Layout, CellType[]>> = {
  maze: ["wall", "floor", "start", "exit", "trap", "enemy", "item", "boss"],
  dungeon: ["wall", "floor", "start", "exit", "trap", "enemy", "item", "boss"],
  cave: ["wall", "floor", "start", "exit", "trap", "enemy", "item", "boss"],
  platformer: ["wall", "floor", "start", "exit", "trap", "enemy", "item", "boss"],
  arcade: ["wall", "floor", "start", "enemy", "item", "power", "boss"],
  survival: ["wall", "floor", "start", "trap", "enemy", "item", "boss"],
  shooter: ["wall", "floor", "start", "trap", "enemy", "item", "boss"],
  invaders: ["wall", "floor", "start", "enemy", "boss"],
  breakout: ["wall", "floor", "start", "trap", "enemy", "item", "power", "boss"],
  snake: ["wall", "floor", "start", "trap", "item"],
};

/** Estilos donde el jugador sale siempre del mismo sitio (abajo, al centro): el inicio no se mueve. */
const FIXED_START: Layout[] = ["shooter", "invaders", "breakout"];

const CODES: Record<string, CellType> = {
  "#": "wall", ".": "floor", S: "start", E: "exit", "^": "trap", M: "enemy", $: "item", B: "boss", P: "power",
};

/** El validador habla para el programador; el usuario necesita saber que arreglar. */
const FRIENDLY: Record<string, string> = {
  "debe haber exactamente un inicio": "Coloca un punto de inicio (y solo uno).",
  "debe haber exactamente una salida": "Coloca una salida (y solo una).",
  "la salida no es alcanzable": "No se puede llegar del inicio a la salida: abre un camino (las trampas también lo cortan).",
  "hay zonas inalcanzables": "Hay casillas a las que no se puede llegar desde el inicio: ábreles paso o conviértelas en pared.",
  "hay puntos inalcanzables": "Hay cosas que recoger o enemigos encerrados donde no se llega desde el inicio.",
  "no hay nada que recoger": "Pon al menos un objeto o poder que recoger: se gana recogiéndolo todo.",
  "no hay dianas": "Pon al menos una diana (objeto) a la que disparar.",
  "faltan puntos de aparicion": "Deja al menos 3 puntos de aparición de enemigos.",
  "no hay invasores": "Pon al menos un invasor.",
  "no hay bloques": "Pon al menos un bloque que romper.",
  "no hay comida": "Pon al menos una comida.",
};

export type Edit<T> = { ok: true; value: T } | { ok: false; error: string; field: string };

export function checkTitle(value: unknown): Edit<string> {
  const title = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!title) return { ok: false, error: "El título no puede quedar vacío.", field: "title" };
  if (title.length > TITLE_MAX) return { ok: false, error: `El título admite hasta ${TITLE_MAX} caracteres.`, field: "title" };
  return { ok: true, value: title };
}

export function checkStory(value: unknown): Edit<string> {
  if (typeof value !== "string") return { ok: false, error: "La historia debe ser texto.", field: "story" };
  const story = value.replace(/[ \t]+/g, " ").trim();
  if (story.length > STORY_MAX) return { ok: false, error: `La historia admite hasta ${STORY_MAX} caracteres.`, field: "story" };
  return { ok: true, value: story };
}

/** Comprueba el mapa editado (filas codificadas como las guarda la base) y devuelve el nivel actualizado. */
export function applyGrid(level: ChainedLevel, rows: unknown): Edit<ChainedLevel> {
  const fail = (error: string): Edit<ChainedLevel> => ({ ok: false, error, field: "rows" });
  const allowed = EDITABLE_CELLS[level.layout];
  if (!allowed) return fail("El mapa de este estilo no se puede editar; sí el título y la historia.");

  const h = level.grid.length;
  const w = level.grid[0].length;
  if (!Array.isArray(rows) || rows.length !== h || rows.some((row) => typeof row !== "string" || row.length !== w)) {
    return fail(`El mapa debe medir ${w}×${h}, como el original.`);
  }
  if (rows.some((row: string) => [...row].some((code) => !CODES[code]))) return fail("El mapa tiene casillas desconocidas.");
  const grid = decodeGrid(rows as string[]);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cell = grid[y][x];
      const before = level.grid[y][x];
      if (cell !== before && !allowed.includes(cell)) return fail("Este estilo no usa una de las casillas que pusiste.");
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (border && cell !== before) return fail("El borde del mapa no se puede cambiar.");
    }
  }
  if (FIXED_START.includes(level.layout)) {
    const was = findCell(level.grid, "start");
    const now = findCell(grid, "start");
    if (countCells(grid, "start") !== 1 || !was || !now || was.x !== now.x || was.y !== now.y) {
      return fail("En este estilo el jugador sale siempre del mismo sitio: no muevas el inicio.");
    }
  }
  const bosses = countCells(grid, "boss");
  if (bosses > 1) return fail("Solo puede haber un jefe.");
  if (countCells(grid, "enemy") > MAX_ENEMIES) return fail(`Demasiados enemigos (máximo ${MAX_ENEMIES}).`);

  const spec = { ...specFromLevel(level), boss: bosses === 1 };
  const problem = validateLevel(grid, spec);
  if (problem) return fail(FRIENDLY[problem] ?? "Ese mapa no se puede jugar: revisa el inicio, la salida y los caminos.");

  const placed = { traps: countCells(grid, "trap"), enemies: countCells(grid, "enemy"), items: countCells(grid, "item") };
  const chips = describe(spec, grid, placed, level.params);
  return {
    ok: true,
    value: {
      ...level,
      grid,
      ascii: renderAscii(grid, level.theme, level.layout),
      boss: spec.boss,
      counts: placed,
      spec: level.spec ? { ...level.spec, boss: spec.boss } : undefined,
      interpretation: level.stage ? [`Nivel: ${level.stage}`, ...chips] : chips,
    },
  };
}

type Editable = ChainedLevel | CustomGame;

/** Aplica lo que llegue (titulo, historia, mapa); lo que no llega queda igual. */
export function editLevel(level: Editable, body: { title?: unknown; story?: unknown; rows?: unknown }): Edit<Editable> {
  let next: Editable = level;
  if (body.rows !== undefined) {
    if (level.layout === "custom") return { ok: false, error: "Los juegos libres no tienen un mapa que editar.", field: "rows" };
    const grid = applyGrid(level, body.rows);
    if (!grid.ok) return grid;
    next = grid.value;
  }
  const narrative = { ...next.narrative };
  if (body.title !== undefined) {
    const title = checkTitle(body.title);
    if (!title.ok) return title;
    narrative.title = title.value;
  }
  if (body.story !== undefined) {
    const story = checkStory(body.story);
    if (!story.ok) return story;
    narrative.story = story.value;
  }
  const editedAt = new Date().toISOString();
  return { ok: true, value: { ...next, narrative, editedAt } as Editable };
}
