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

/** Look of items, enemies and boss: the game has a sprite for each one. */
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

/** Title, setting and boss line that come with the level. */
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
  /** Hazards mentioned by the user, as summarised by the model. */
  obstacles?: string[];
  /** Who interpreted the description: Claude or the keyword fallback. */
  source?: "ai" | "keywords";
  /** Written by the AI; without it, levelBuilder uses per-theme templates. */
  narrative?: Narrative;
  kinds?: Kinds;
  /** What the user called the collectibles, in plural ("manzanas"); otherwise the sprite name is used. */
  itemLabel?: string;
  /** Laps or waves explicitly requested. */
  rounds?: number;
  /** How well the request fits an existing style. "custom": a new game must be written. */
  fit?: "exact" | "adapted" | "custom";
  /** When adapted, how it was interpreted (shown to the user). */
  adaptationNote?: string;
}

/** What a mode builder produces. */
export interface BuildResult {
  grid: CellType[][];
  placed: PlacedCounts;
  /** Ordered route, for the modes that need it (racing). */
  route?: Array<{ x: number; y: number }>;
  /** Game parameters: laps, waves... */
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

/** Game written by the AI when no style fits: an HTML document that runs sandboxed. */
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
  /** Last user edit (title, story). */
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
  /** Name of the collectibles as the user asked for them ("manzanas"). */
  itemLabel?: string;
  /** How many traps, enemies and items were placed. */
  counts?: PlacedCounts;
  /** Instructions for the player. */
  controls: string;
  route?: Array<{ x: number; y: number }>;
  params?: Record<string, number>;
  /** Design score (0-100) of the candidate chosen among several. */
  quality: number;
  createdAt: string;
  /** Last user edit (title, story or map). */
  editedAt?: string;
}

/** A generated level that may be part of a chain (stage) and keeps the spec it was built from. */
export type ChainedLevel = GeneratedLevel & { stage?: number; spec?: LevelSpec };
