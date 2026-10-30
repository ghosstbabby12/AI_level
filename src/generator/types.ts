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
  /** Puntuacion de diseno (0-100) del candidato elegido entre varios. */
  quality: number;
  createdAt: string;
}
