import { ChainedLevel, CustomGame } from "../level/types";
import { fail, ok, Result } from "../shared/result";
import { applyGrid } from "./mapRules";
import { checkStory, checkTitle } from "./textRules";

/**
 * Editing of saved levels: title, story and, for styles that allow it, the map.
 * The user paints the map cell by cell, so mapRules checks everything the game takes for
 * granted, above all that it can still be won (the same validator used for generated levels).
 */
export type Editable = ChainedLevel | CustomGame;
export interface LevelChanges { title?: unknown; story?: unknown; rows?: unknown }

/** Applies whatever arrives (title, story, map); anything missing stays the same. */
export function editLevel(level: Editable, changes: LevelChanges): Result<Editable> {
  let next: Editable = level;
  if (changes.rows !== undefined) {
    if (level.layout === "custom") return fail("Los juegos libres no tienen un mapa que editar.", "rows");
    const map = applyGrid(level, changes.rows);
    if (!map.ok) return map;
    next = map.value;
  }
  const narrative = { ...next.narrative };
  if (changes.title !== undefined) {
    const title = checkTitle(changes.title);
    if (!title.ok) return title;
    narrative.title = title.value;
  }
  if (changes.story !== undefined) {
    const story = checkStory(changes.story);
    if (!story.ok) return story;
    narrative.story = story.value;
  }
  return ok({ ...next, narrative, editedAt: new Date().toISOString() } as Editable);
}
