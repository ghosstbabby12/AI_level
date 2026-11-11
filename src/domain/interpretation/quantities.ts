import { FeatureSpec } from "../level/types";
import { pattern } from "./textMatching";
import { NUMBER_WORDS } from "./vocabulary";

export interface Quantity {
  mentioned: boolean;
  negated: boolean;
  count?: number;
  multiplier: number;
}

const MAX_ROUNDS = 10;
const MANY = "muchos|muchas|mucho|many|lots|varios|varias|numerosos|numerosas";
const FEW = "pocos|pocas|few|poco";

/** How much of something the text asks for: mentioned, negated ("sin trampas"), a number or "muchos"/"pocos". */
export function readQuantity(text: string, stems: string[]): Quantity {
  const stem = pattern(stems);
  const word = stem.slice(2);
  const mentioned = new RegExp(stem).test(text);
  const negated = new RegExp(`\\b(?:sin|no|without)\\s+(?:\\w+\\s+)?${word}`).test(text);

  let count: number | undefined;
  const countMatch = text.match(new RegExp(`\\b(\\d+|${Object.keys(NUMBER_WORDS).join("|")})\\s+(?:\\w+\\s+)?${word}`));
  if (countMatch) {
    const raw = countMatch[1];
    const value = /^\d+$/.test(raw) ? parseInt(raw, 10) : NUMBER_WORDS[raw];
    if (value > 0) count = value;
  }

  let multiplier = mentioned ? 1.4 : 1;
  if (new RegExp(`\\b(?:${MANY})\\s+(?:de\\s+|of\\s+)?(?:\\w+\\s+)?${word}`).test(text)) multiplier = 1.9;
  else if (new RegExp(`\\b(?:${FEW})\\s+(?:\\w+\\s+)?${word}`).test(text)) multiplier = 0.5;

  return { mentioned, negated, count, multiplier };
}

export function toFeature(quantity: Quantity, defaultEnabled: boolean): FeatureSpec {
  const enabled = quantity.negated ? false : quantity.mentioned || defaultEnabled;
  return { enabled, count: enabled ? quantity.count : undefined, multiplier: quantity.multiplier };
}

/** "5 vueltas", "3 oleadas"... */
export function detectRounds(text: string): number | undefined {
  const match = text.match(/\b(\d+)\s+(?:vueltas?|laps?|oleadas?|waves?|hordas?)\b/);
  return match ? Math.min(MAX_ROUNDS, Math.max(1, parseInt(match[1], 10))) : undefined;
}
