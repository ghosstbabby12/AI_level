import { MODES } from "../level/modes";
import { Layout } from "../level/types";
import { has } from "./textMatching";
import { LARGE_STEMS, SMALL_STEMS } from "./vocabulary";

export type SizeHint = "small" | "normal" | "large";

const clamp = (value: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, value));

function baseSize(text: string, layout: Layout, hint?: SizeHint): [number, number] {
  const explicit = text.match(/\b(\d{2,3})\s*[x×]\s*(\d{2,3})\b/);
  if (explicit) return [parseInt(explicit[1], 10), parseInt(explicit[2], 10)];
  const { sizes } = MODES[layout];
  if (hint) return sizes[hint];
  if (has(text, SMALL_STEMS)) return sizes.small;
  if (has(text, LARGE_STEMS)) return sizes.large;
  return sizes.normal;
}

/** Explicit sizes ("41x27") win; otherwise the hint or the size keywords are used. */
export function detectSize(text: string, layout: Layout, hint?: SizeHint): { width: number; height: number } {
  const [rawWidth, rawHeight] = baseSize(text, layout, hint);
  const { limits, oddSize } = MODES[layout];
  let width = clamp(rawWidth, limits.w);
  let height = clamp(rawHeight, limits.h);
  if (oddSize) {
    if (width % 2 === 0) width += 1;
    if (height % 2 === 0) height += 1;
  }
  return { width, height };
}
