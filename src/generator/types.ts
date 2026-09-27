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
  createdAt: string;
}
