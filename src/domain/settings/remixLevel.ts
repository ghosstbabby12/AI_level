import { generateFromSpec } from "../generation/toGeneratedLevel";
import { ChainedLevel, Difficulty, LevelSpec } from "../level/types";
import { specFromLevel } from "../progression/specFromLevel";
import { fail, ok, Result } from "../shared/result";
import { levelSettings } from "./levelSettings";
import { Setting, SettingKey } from "./settingFields";

export type SettingChanges = Partial<Record<SettingKey, unknown>>;

/** Applies one changed setting to the spec, or explains why the value is not valid. */
function applySetting(spec: LevelSpec, setting: Setting, raw: unknown): Result<LevelSpec> {
  if (setting.kind === "choice") {
    if (!setting.options.some((o) => o.value === raw)) return fail("Elige Fácil, Normal o Difícil.", setting.key);
    return ok({ ...spec, difficulty: raw as Difficulty });
  }
  if (setting.kind === "toggle") {
    if (typeof raw !== "boolean") return fail("El jefe final se activa o se quita.", setting.key);
    return ok({ ...spec, boss: raw });
  }
  const n = raw as number;
  if (!Number.isInteger(raw) || n < setting.min || n > setting.max) {
    return fail(`${setting.label}: elige un número entre ${setting.min} y ${setting.max}.`, setting.key);
  }
  if (setting.key === "rounds") return ok({ ...spec, rounds: n });
  return ok({ ...spec, [setting.key]: { ...spec[setting.key], enabled: n > 0, count: n > 0 ? n : undefined } });
}

/**
 * Builds a variant with the changed settings and the same seed, so the map looks like the
 * previous one. Anything not sent stays as it was.
 */
export function remixLevel(level: ChainedLevel, changes: SettingChanges, id: string): Result<ChainedLevel> {
  const available = new Map(levelSettings(level).map((s) => [s.key, s]));
  let spec: LevelSpec = { ...specFromLevel(level) };
  let touched = false;
  for (const [key, raw] of Object.entries(changes)) {
    if (raw === undefined) continue;
    const setting = available.get(key as SettingKey);
    if (!setting) return fail("Ese ajuste no existe en este estilo de juego.", key);
    const next = applySetting(spec, setting, raw);
    if (!next.ok) return next;
    spec = next.value;
    touched = true;
  }
  if (!touched) return fail("No cambiaste ningún ajuste.");

  let generated;
  try {
    generated = generateFromSpec(id, spec);
  } catch {
    return fail("Con esos ajustes no cabe un nivel que se pueda ganar. Prueba con menos cantidad.");
  }
  const chips = level.stage ? [`Nivel: ${level.stage}`, ...generated.interpretation] : generated.interpretation;
  return ok({ ...generated, interpretation: chips, stage: level.stage });
}
