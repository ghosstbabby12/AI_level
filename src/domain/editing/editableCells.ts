import { CellType, Layout } from "../level/types";

const ADVENTURE: CellType[] = ["wall", "floor", "start", "exit", "trap", "enemy", "item", "boss"];

/** Cells each style uses (and can draw). Racing is not editable: its route is computed separately. */
export const EDITABLE_CELLS: Partial<Record<Layout, CellType[]>> = {
  maze: ADVENTURE,
  dungeon: ADVENTURE,
  cave: ADVENTURE,
  platformer: ADVENTURE,
  arcade: ["wall", "floor", "start", "enemy", "item", "power", "boss"],
  survival: ["wall", "floor", "start", "trap", "enemy", "item", "boss"],
  shooter: ["wall", "floor", "start", "trap", "enemy", "item", "boss"],
  invaders: ["wall", "floor", "start", "enemy", "boss"],
  breakout: ["wall", "floor", "start", "trap", "enemy", "item", "power", "boss"],
  snake: ["wall", "floor", "start", "trap", "item"],
};

/** Styles where the player always starts at the same spot (bottom centre): the start cannot move. */
export const FIXED_START: Layout[] = ["shooter", "invaders", "breakout"];

export const MAX_ENEMIES = 150;

/** The validator speaks to developers; the user needs to know what to fix. */
export const FRIENDLY_PROBLEMS: Record<string, string> = {
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
