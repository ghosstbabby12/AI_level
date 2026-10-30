export type Theme =
  | "ice"
  | "lava"
  | "forest"
  | "desert"
  | "dungeon"
  | "overworld"
  | "water"
  | "space";

export type Layout = "maze" | "dungeon" | "platformer";

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
  | "boss";

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
  kinds: Kinds;
  /** Puntuacion de diseno (0-100) del candidato elegido entre varios. */
  quality: number;
  createdAt: string;
}
