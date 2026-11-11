import { z } from "zod";
import { detectSize } from "../../domain/interpretation/sizes";
import { BOSS_KINDS, ENEMY_KINDS, FeatureSpec, ITEM_KINDS, LAYOUTS, LevelSpec } from "../../domain/level/types";

/**
 * What the model decides: only the user's intent, never the grid.
 * The seed and exact dimensions are set here, not by the model.
 */
const FeatureSchema = z.object({
  enabled: z.boolean(),
  count: z.number().int().nullable(),
  intensity: z.enum(["few", "normal", "many"]),
});

export const AiSpecSchema = z.object({
  // First, so the model decides validity before filling in the rest.
  is_level_request: z.boolean(),
  rejection_reason: z.string().nullable(),
  fit: z.enum(["exact", "adapted", "custom"]),
  adaptation_note: z.string().nullable(),
  layout: z.enum(LAYOUTS),
  theme: z.enum(["ice", "lava", "forest", "desert", "dungeon", "overworld", "water", "space"]),
  difficulty: z.enum(["easy", "normal", "hard"]),
  size: z.enum(["small", "normal", "large"]),
  boss: z.boolean(),
  traps: FeatureSchema,
  enemies: FeatureSchema,
  items: FeatureSchema,
  obstacles: z.array(z.string()),
  rounds: z.number().int().nullable(),
  item_kind: z.enum(ITEM_KINDS),
  item_label: z.string().nullable(),
  enemy_kind: z.enum(ENEMY_KINDS),
  boss_kind: z.enum(BOSS_KINDS),
  title: z.string(),
  story: z.string(),
  boss_line: z.string().nullable(),
});

export type AiSpec = z.infer<typeof AiSpecSchema>;

const MAX_COUNT = 30;
const MAX_OBSTACLES = 8;
const MAX_ROUNDS = 10;
const MULTIPLIERS: Record<AiSpec["traps"]["intensity"], number> = { few: 0.5, normal: 1.4, many: 1.9 };

function toFeature(feature: AiSpec["traps"]): FeatureSpec {
  const count = feature.enabled && feature.count !== null && feature.count > 0 ? Math.min(feature.count, MAX_COUNT) : undefined;
  return { enabled: feature.enabled, count, multiplier: MULTIPLIERS[feature.intensity] };
}

/** The model's text is shown in the UI: letters and spaces only, and short. */
function cleanItemLabel(label: string | null | undefined): string | undefined {
  const clean = (label ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return /^[a-záéíóúüñ ]{2,24}$/.test(clean) ? clean : undefined;
}

const trimTo = (text: string | null | undefined, max: number) => text?.trim().slice(0, max) || undefined;

/** Turns the model output into the LevelSpec the generator consumes. */
export function aiSpecToLevelSpec(ai: AiSpec, description: string, seed: number): LevelSpec {
  return {
    description,
    seed,
    theme: ai.theme,
    layout: ai.layout,
    difficulty: ai.difficulty,
    ...detectSize(description, ai.layout, ai.size),
    boss: ai.boss,
    traps: toFeature(ai.traps),
    enemies: toFeature(ai.enemies),
    items: toFeature(ai.items),
    obstacles: ai.obstacles.slice(0, MAX_OBSTACLES),
    kinds: { item: ai.item_kind, enemy: ai.enemy_kind, boss: ai.boss_kind },
    itemLabel: cleanItemLabel(ai.item_label),
    rounds: ai.rounds !== null && ai.rounds > 0 ? Math.min(ai.rounds, MAX_ROUNDS) : undefined,
    source: "ai",
    fit: ai.fit,
    adaptationNote: ai.fit === "adapted" ? trimTo(ai.adaptation_note, 200) : undefined,
    narrative: {
      title: ai.title.trim().slice(0, 60),
      story: ai.story.trim().slice(0, 240),
      bossLine: ai.boss ? trimTo(ai.boss_line, 120) ?? null : null,
    },
  };
}
