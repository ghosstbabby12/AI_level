import { Difficulty, Layout } from "../level/types";

/**
 * Settings editable from the level chips ("Dificultad: Normal", "Trampas: 3"). They change
 * without rewriting the request. Each style only offers what its builder really honours.
 */
export type SettingKey = "difficulty" | "traps" | "enemies" | "items" | "boss" | "rounds";
export type CountKey = "traps" | "enemies" | "items" | "rounds";

export type Setting =
  | { key: "difficulty"; label: string; kind: "choice"; value: Difficulty; options: Array<{ value: Difficulty; label: string }> }
  | { key: "boss"; label: string; kind: "toggle"; value: boolean }
  | { key: CountKey; label: string; kind: "number"; value: number; min: number; max: number };

export interface FieldRule {
  key: CountKey | "boss";
  /** Without a label, "items" uses the name of the collectibles. */
  label?: string;
  min?: number;
  max?: number;
}

export const MAX_COUNT = 30;

export const DIFFICULTY_OPTIONS: Array<{ value: Difficulty; label: string }> = [
  { value: "easy", label: "Fácil" },
  { value: "normal", label: "Normal" },
  { value: "hard", label: "Difícil" },
];

const ADVENTURE: FieldRule[] = [{ key: "traps", label: "Trampas" }, { key: "enemies", label: "Enemigos" }, { key: "items" }, { key: "boss" }];

/** What can be changed per style, with its label and cap. */
export const FIELDS: Record<Layout, FieldRule[]> = {
  maze: ADVENTURE,
  dungeon: ADVENTURE,
  cave: ADVENTURE,
  platformer: ADVENTURE,
  arcade: [{ key: "enemies", label: "Enemigos", max: 12 }, { key: "boss" }],
  survival: [{ key: "rounds", label: "Oleadas", min: 1, max: 10 }, { key: "items", label: "Curaciones" }, { key: "traps", label: "Trampas" }, { key: "boss" }],
  shooter: [{ key: "items", label: "Dianas", min: 1 }, { key: "enemies", label: "Blancos móviles" }, { key: "traps", label: "Bombas" }, { key: "boss" }],
  racing: [{ key: "rounds", label: "Vueltas", min: 1, max: 6 }, { key: "enemies", label: "Rivales", max: 6 }, { key: "traps", label: "Manchas de aceite" }],
  invaders: [{ key: "enemies", label: "Invasores", min: 1, max: 60 }, { key: "boss" }],
  breakout: [{ key: "traps", label: "Explosivos", max: 20 }, { key: "boss" }],
  snake: [{ key: "items", label: "Comida", min: 1 }, { key: "traps", label: "Trampas" }],
};
