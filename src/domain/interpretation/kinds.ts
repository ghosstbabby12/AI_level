import { MODES } from "../level/modes";
import { Kinds, Layout } from "../level/types";
import { normalize, pattern } from "./textMatching";
import { BOSS_KIND_STEMS, ENEMY_KIND_STEMS, ITEM_KIND_STEMS, ITEM_NOUNS } from "./vocabulary";

function firstKind<K extends string>(text: string, table: [K, string[]][], fallback: K): K {
  let best: { kind: K; at: number } | null = null;
  for (const [kind, stems] of table) {
    const at = text.search(new RegExp(pattern(stems)));
    if (at !== -1 && (!best || at < best.at)) best = { kind, at };
  }
  return best ? best.kind : fallback;
}

/** Look of items, enemies and boss from the first one mentioned. */
export function detectKinds(description: string): Kinds {
  const text = normalize(description);
  return {
    item: firstKind(text, ITEM_KIND_STEMS, "coin"),
    enemy: firstKind(text, ENEMY_KIND_STEMS, "blob"),
    boss: firstKind(text, BOSS_KIND_STEMS, "monster"),
  };
}

/** Each mode has a default look for whatever was not requested. */
export function withLayoutDefaults(kinds: Kinds, layout: Layout): Kinds {
  const defaults = MODES[layout].kinds ?? {};
  return {
    item: kinds.item === "coin" ? defaults.item ?? "coin" : kinds.item,
    enemy: kinds.enemy === "blob" ? defaults.enemy ?? "blob" : kinds.enemy,
    boss: kinds.boss === "monster" ? defaults.boss ?? "monster" : kinds.boss,
  };
}

/** "manzana" -> "manzanas", "pocion" -> "pociones", "pez" -> "peces". */
export function pluralize(word: string): string {
  if (/s$/.test(word)) return word;
  if (/z$/.test(word)) return word.slice(0, -1) + "ces";
  if (/[aeiouáéó]$/.test(word)) return word + "s";
  return word.replace(/ó(n)$/, "o$1").replace(/í(n)$/, "i$1").replace(/ú(n)$/, "u$1") + "es";
}

/** The collectible named in the text, in plural and with its accents ("pociones"). */
export function detectItemLabel(description: string): string | undefined {
  for (const raw of description.toLowerCase().match(/[a-záéíóúüñ]+/g) ?? []) {
    const plain = normalize(raw);
    const noun = ITEM_NOUNS.find((n) => plain === n || plain === pluralize(n) || plain === n + "s" || plain === n + "es");
    if (noun) return pluralize(raw);
  }
  return undefined;
}
