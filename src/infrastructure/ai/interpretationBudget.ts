import { normalize } from "../../domain/interpretation/textMatching";
import { config } from "../../config/config";
import { AiSpec } from "./aiSpec";

/** Same description -> same spec: it is reused without paying for the call again. */
const CACHE_SIZE = 500;
const cache = new Map<string, AiSpec>();

export const cacheKey = (description: string): string => normalize(description).replace(/\s+/g, " ").trim();

export function cached(key: string): AiSpec | undefined {
  const spec = cache.get(key);
  if (spec) remember(key, spec);
  return spec;
}

export function remember(key: string, spec: AiSpec): void {
  cache.delete(key);
  cache.set(key, spec);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
}

/** Daily cap of API calls to bound spending; past it, the keyword fallback is used. */
const usage = { day: "", calls: 0 };

export function takeDailySlot(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (usage.day !== today) {
    usage.day = today;
    usage.calls = 0;
  }
  if (usage.calls >= config.aiDailyLimit) return false;
  usage.calls++;
  return true;
}
