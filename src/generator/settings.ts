import { countCells } from "./grid";
import { buildLevel, toGeneratedLevel } from "./levelBuilder";
import { ChainedLevel, specFromLevel } from "./progression";
import { renderAscii } from "../renderer/asciiRenderer";
import { Difficulty, FeatureSpec, Layout, LevelSpec } from "./types";

/**
 * Ajustes editables desde los chips del nivel ("Dificultad: Normal", "Trampas: 3"): se cambian sin
 * reescribir el pedido y se arma una variante con la misma semilla, asi el mapa se parece al anterior.
 * Cada estilo solo ofrece lo que su generador respeta de verdad.
 */

export type SettingKey = "difficulty" | "traps" | "enemies" | "items" | "boss" | "rounds";

export type Setting =
  | { key: "difficulty"; label: string; kind: "choice"; value: Difficulty; options: Array<{ value: Difficulty; label: string }> }
  | { key: "boss"; label: string; kind: "toggle"; value: boolean }
  | { key: "traps" | "enemies" | "items" | "rounds"; label: string; kind: "number"; value: number; min: number; max: number };

type CountKey = "traps" | "enemies" | "items" | "rounds";

const DIFFICULTY_OPTIONS: Array<{ value: Difficulty; label: string }> = [
  { value: "easy", label: "Fácil" },
  { value: "normal", label: "Normal" },
  { value: "hard", label: "Difícil" },
];

const ITEM_LABEL: Record<string, string> = { coin: "Monedas", gem: "Gemas", key: "Llaves", weapon: "Armas", potion: "Pociones", star: "Estrellas", fruit: "Frutas" };

/** Que se puede cambiar en cada estilo, con su nombre y su tope. "items" sin nombre usa el de los objetos. */
const FIELDS: Record<Layout, Array<{ key: CountKey | "boss"; label?: string; min?: number; max?: number }>> = {
  maze: [{ key: "traps", label: "Trampas" }, { key: "enemies", label: "Enemigos" }, { key: "items" }, { key: "boss" }],
  dungeon: [{ key: "traps", label: "Trampas" }, { key: "enemies", label: "Enemigos" }, { key: "items" }, { key: "boss" }],
  cave: [{ key: "traps", label: "Trampas" }, { key: "enemies", label: "Enemigos" }, { key: "items" }, { key: "boss" }],
  platformer: [{ key: "traps", label: "Trampas" }, { key: "enemies", label: "Enemigos" }, { key: "items" }, { key: "boss" }],
  arcade: [{ key: "enemies", label: "Enemigos", max: 12 }, { key: "boss" }],
  survival: [{ key: "rounds", label: "Oleadas", min: 1, max: 10 }, { key: "items", label: "Curaciones" }, { key: "traps", label: "Trampas" }, { key: "boss" }],
  shooter: [{ key: "items", label: "Dianas", min: 1 }, { key: "enemies", label: "Blancos móviles" }, { key: "traps", label: "Bombas" }, { key: "boss" }],
  racing: [{ key: "rounds", label: "Vueltas", min: 1, max: 6 }, { key: "enemies", label: "Rivales", max: 6 }, { key: "traps", label: "Manchas de aceite" }],
  invaders: [{ key: "enemies", label: "Invasores", min: 1, max: 60 }, { key: "boss" }],
  breakout: [{ key: "traps", label: "Explosivos", max: 20 }, { key: "boss" }],
  snake: [{ key: "items", label: "Comida", min: 1 }, { key: "traps", label: "Trampas" }],
};

const MAX_COUNT = 30;
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function currentCount(level: ChainedLevel, key: CountKey): number {
  if (key === "rounds") return level.params?.waves ?? level.params?.laps ?? 1;
  if (level.counts) return level.counts[key];
  return countCells(level.grid, key === "traps" ? "trap" : key === "enemies" ? "enemy" : "item");
}

/** Los ajustes que muestra el panel del nivel, con sus valores actuales. */
export function levelSettings(level: ChainedLevel): Setting[] {
  const settings: Setting[] = [{ key: "difficulty", label: "Dificultad", kind: "choice", value: level.difficulty, options: DIFFICULTY_OPTIONS }];
  for (const field of FIELDS[level.layout]) {
    if (field.key === "boss") {
      settings.push({ key: "boss", label: "Jefe final", kind: "toggle", value: level.boss });
      continue;
    }
    const label = field.label ?? capitalize(level.itemLabel ?? ITEM_LABEL[level.kinds.item] ?? "Objetos");
    settings.push({ key: field.key, label, kind: "number", value: currentCount(level, field.key), min: field.min ?? 0, max: field.max ?? MAX_COUNT });
  }
  return settings;
}

export type Changes = Partial<Record<SettingKey, unknown>>;
type Result = { ok: true; value: ChainedLevel } | { ok: false; error: string; field?: string };

/** Arma la variante con los ajustes cambiados. Lo que no llega queda como estaba. */
export function remixLevel(level: ChainedLevel, changes: Changes, id: string): Result {
  const available = new Map(levelSettings(level).map((s) => [s.key, s]));
  let spec: LevelSpec = { ...specFromLevel(level) };
  let touched = false;

  for (const [key, raw] of Object.entries(changes)) {
    if (raw === undefined) continue;
    const setting = available.get(key as SettingKey);
    if (!setting) return { ok: false, error: "Ese ajuste no existe en este estilo de juego.", field: key };
    touched = true;
    if (setting.kind === "choice") {
      if (!setting.options.some((o) => o.value === raw)) return { ok: false, error: "Elige Fácil, Normal o Difícil.", field: key };
      spec.difficulty = raw as Difficulty;
    } else if (setting.kind === "toggle") {
      if (typeof raw !== "boolean") return { ok: false, error: "El jefe final se activa o se quita.", field: key };
      spec.boss = raw;
    } else {
      if (!Number.isInteger(raw) || (raw as number) < setting.min || (raw as number) > setting.max) {
        return { ok: false, error: `${setting.label}: elige un número entre ${setting.min} y ${setting.max}.`, field: key };
      }
      const n = raw as number;
      if (setting.key === "rounds") spec.rounds = n;
      else {
        const feature: FeatureSpec = { ...spec[setting.key], enabled: n > 0, count: n > 0 ? n : undefined };
        spec = { ...spec, [setting.key]: feature };
      }
    }
  }
  if (!touched) return { ok: false, error: "No cambiaste ningún ajuste." };

  let built;
  try {
    built = buildLevel(spec);
  } catch {
    return { ok: false, error: "Con esos ajustes no cabe un nivel que se pueda ganar. Prueba con menos cantidad." };
  }
  const generated = toGeneratedLevel(id, spec, built, renderAscii(built.grid, spec.theme, spec.layout));
  const stage = level.stage;
  return {
    ok: true,
    value: { ...generated, interpretation: stage ? [`Nivel: ${stage}`, ...generated.interpretation] : generated.interpretation, stage, spec },
  };
}
