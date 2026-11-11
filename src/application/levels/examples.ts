import { generateFromSpec } from "../../domain/generation/toGeneratedLevel";
import { parseDescriptionKeywords } from "../../domain/interpretation/keywordParser";
import { MODE_PRIORITY, MODES } from "../../domain/level/modes";
import { ChainedLevel, Layout } from "../../domain/level/types";

/** Home page examples: built without AI (free) and always the same. */
const EXAMPLE_SEED = 7;
const PREFIX = "ejemplo-";

export interface Example {
  tag: string;
  text: string;
  level: ChainedLevel;
}

let cache: Example[] | null = null;

export const isExampleId = (id: string): boolean => id.startsWith(PREFIX);

function buildExample(mode: Layout): ChainedLevel {
  const spec = parseDescriptionKeywords(MODES[mode].example.text, EXAMPLE_SEED);
  return generateFromSpec(`${PREFIX}${mode}`, spec);
}

export function exampleLevels(): Example[] {
  cache ??= MODE_PRIORITY.map((mode) => ({ ...MODES[mode].example, level: buildExample(mode) }));
  return cache;
}

/** The example of a mode by its id ("ejemplo-maze"), so levels can be chained or remixed from it. */
export function exampleLevel(id: string): ChainedLevel | undefined {
  const mode = id.slice(PREFIX.length);
  return (MODE_PRIORITY as readonly string[]).includes(mode) ? buildExample(mode as Layout) : undefined;
}
