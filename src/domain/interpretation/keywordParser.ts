import { MODES, MODE_PRIORITY } from "../level/modes";
import { Difficulty, Layout, LevelSpec, Theme } from "../level/types";
import { detectItemLabel, detectKinds, withLayoutDefaults } from "./kinds";
import { detectRounds, readQuantity, toFeature } from "./quantities";
import { detectSize } from "./sizes";
import { countMatches, has, normalize } from "./textMatching";
import {
  BOSS_STEMS, EASY_STEMS, ENEMY_STEMS, GENERIC_LEVEL_STEMS, HARD_STEMS, ITEM_STEMS, THEME_STEMS, TRAP_STEMS,
} from "./vocabulary";

/** true when the text mentions something the generator can build. Used to reject unrelated requests without AI. */
export function mentionsLevel(description: string): boolean {
  const text = normalize(description);
  const groups = [
    GENERIC_LEVEL_STEMS, ...MODE_PRIORITY.map((m) => MODES[m].stems), ...Object.values(THEME_STEMS),
    TRAP_STEMS, ENEMY_STEMS, ITEM_STEMS, BOSS_STEMS, HARD_STEMS, EASY_STEMS,
  ];
  return groups.some((stems) => has(text, stems));
}

function detectTheme(text: string, layout: Layout): Theme {
  let best: Theme | null = null;
  let bestScore = 0;
  for (const theme of Object.keys(THEME_STEMS) as Theme[]) {
    const score = countMatches(text, THEME_STEMS[theme]);
    if (score > bestScore) {
      best = theme;
      bestScore = score;
    }
  }
  return best ?? MODES[layout].theme;
}

function detectLayout(text: string): Layout | null {
  return MODE_PRIORITY.find((mode) => has(text, MODES[mode].stems)) ?? null;
}

const detectDifficulty = (text: string): Difficulty => (has(text, HARD_STEMS) ? "hard" : has(text, EASY_STEMS) ? "easy" : "normal");

/**
 * Rule-based interpreter, no network. It is the fallback when the Claude API is not
 * available. It turns a description (Spanish/English) into a concrete spec: level type,
 * theme, difficulty, size, final boss, amounts ("5 trampas"), intensity ("muchos
 * enemigos") and negations ("sin trampas").
 */
export function parseDescriptionKeywords(description: string, seed?: number): LevelSpec {
  const text = normalize(description || "");
  const theme = detectTheme(text, detectLayout(text) ?? "maze");
  const layout: Layout = detectLayout(text) ?? (theme === "dungeon" ? "dungeon" : "maze");
  const boss = readQuantity(text, BOSS_STEMS);

  return {
    description,
    seed: seed ?? Math.floor(Math.random() * 2 ** 31),
    theme,
    layout,
    difficulty: detectDifficulty(text),
    ...detectSize(text, layout),
    boss: boss.mentioned && !boss.negated,
    traps: toFeature(readQuantity(text, TRAP_STEMS), true),
    enemies: toFeature(readQuantity(text, ENEMY_STEMS), true),
    items: toFeature(readQuantity(text, ITEM_STEMS), MODES[layout].itemsByDefault ?? false),
    kinds: withLayoutDefaults(detectKinds(description), layout),
    itemLabel: detectItemLabel(description),
    rounds: detectRounds(text),
  };
}
