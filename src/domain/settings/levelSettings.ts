import { countCells } from "../level/grid";
import { ChainedLevel } from "../level/types";
import { CountKey, DIFFICULTY_OPTIONS, FIELDS, MAX_COUNT, Setting } from "./settingFields";

const ITEM_LABEL: Record<string, string> = { coin: "Monedas", gem: "Gemas", key: "Llaves", weapon: "Armas", potion: "Pociones", star: "Estrellas", fruit: "Frutas" };
const CELL_BY_KEY = { traps: "trap", enemies: "enemy", items: "item" } as const;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function currentCount(level: ChainedLevel, key: CountKey): number {
  if (key === "rounds") return level.params?.waves ?? level.params?.laps ?? 1;
  return level.counts ? level.counts[key] : countCells(level.grid, CELL_BY_KEY[key]);
}

/** Settings shown in the level panel, with their current values. */
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
