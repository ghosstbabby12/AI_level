export type Theme =
  | "ice"
  | "lava"
  | "forest"
  | "desert"
  | "dungeon"
  | "overworld"
  | "water"
  | "space";

export const LAYOUTS = ["maze", "dungeon", "platformer", "arcade", "cave", "shooter", "survival", "racing", "invaders", "breakout", "snake"] as const;
export type Layout = (typeof LAYOUTS)[number];

export type Difficulty = "easy" | "normal" | "hard";

/** Aspecto de objetos, enemigos y jefe: el juego tiene un sprite para cada uno. */
export const ITEM_KINDS = ["coin", "gem", "key", "weapon", "potion", "star", "fruit"] as const;
export const ENEMY_KINDS = ["blob", "slime", "ghost", "skeleton", "robot", "bat", "mixed"] as const;
export const BOSS_KINDS = ["monster", "dragon", "vampire", "mech"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export type EnemyKind = (typeof ENEMY_KINDS)[number];
export type BossKind = (typeof BOSS_KINDS)[number];

export interface Kinds {
  item: ItemKind;
  enemy: EnemyKind;
  boss: BossKind;
}

export type CellType =
  | "wall"
  | "floor"
  | "start"
  | "exit"
  | "trap"
  | "enemy"
  | "item"
  | "boss"
  | "power";

export interface FeatureSpec {
  enabled: boolean;
  count?: number;
  multiplier: number;
}

/** Titulo, ambientacion y frase del jefe que acompanan al nivel. */
export interface Narrative {
  title: string;
  story: string;
  bossLine: string | null;
}

export interface LevelSpec {
  description: string;
  seed: number;
  theme: Theme;
  layout: Layout;
  difficulty: Difficulty;
  width: number;
  height: number;
  boss: boolean;
  traps: FeatureSpec;
  enemies: FeatureSpec;
  items: FeatureSpec;
  /** Peligros mencionados por el usuario, tal como los resumio el modelo. */
  obstacles?: string[];
  /** Quien interpreto la descripcion: Claude o el respaldo por palabras clave. */
  source?: "ai" | "keywords";
  /** Escrita por la IA; sin ella, levelBuilder usa plantillas por tema. */
  narrative?: Narrative;
  kinds?: Kinds;
  /** Vueltas u oleadas pedidas explicitamente. */
  rounds?: number;
  /** Que tan bien encaja el pedido en un estilo existente. "custom": hay que escribir un juego nuevo. */
  fit?: "exact" | "adapted" | "custom";
  /** Si se adapto, como se interpreto (lo lee el usuario). */
  adaptationNote?: string;
}

/** Lo que produce el generador de un modo. */
export interface BuildResult {
  grid: CellType[][];
  placed: PlacedCounts;
  /** Recorrido en orden, para los modos que lo necesitan (carreras). */
  route?: Array<{ x: number; y: number }>;
  /** Parametros de la partida: vueltas, oleadas... */
  params?: Record<string, number>;
}

export interface PlacedCounts {
  traps: number;
  enemies: number;
  items: number;
}

export interface Palette {
  wall: string;
  wallAccent: string;
  floor: string;
  floorAlt: string;
  top: string;
  sky: [string, string];
}

/** Juego escrito por la IA cuando ningun estilo sirve: un documento HTML que se ejecuta aislado. */
export interface CustomGame {
  id: string;
  layout: "custom";
  description: string;
  theme: Theme;
  difficulty: Difficulty;
  narrative: Narrative;
  interpretation: string[];
  controls: string;
  html: string;
  createdAt: string;
  /** Ultima edicion del usuario (titulo, historia). */
  editedAt?: string;
}

export interface GeneratedLevel {
  id: string;
  description: string;
  seed: number;
  theme: Theme;
  layout: Layout;
  difficulty: Difficulty;
  boss: boolean;
  width: number;
  height: number;
  grid: CellType[][];
  ascii: string;
  palette: Palette;
  interpretation: string[];
  narrative: Narrative;
  adaptationNote?: string;
  kinds: Kinds;
  /** Instrucciones para el jugador. */
  controls: string;
  route?: Array<{ x: number; y: number }>;
  params?: Record<string, number>;
  /** Puntuacion de diseno (0-100) del candidato elegido entre varios. */
  quality: number;
  createdAt: string;
  /** Ultima edicion del usuario (titulo, historia o mapa). */
  editedAt?: string;
}
