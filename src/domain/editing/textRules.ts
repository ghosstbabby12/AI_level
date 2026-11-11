import { fail, ok, Result } from "../shared/result";

export const TITLE_MAX = 60;
export const STORY_MAX = 240;

export function checkTitle(value: unknown): Result<string> {
  const title = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!title) return fail("El título no puede quedar vacío.", "title");
  if (title.length > TITLE_MAX) return fail(`El título admite hasta ${TITLE_MAX} caracteres.`, "title");
  return ok(title);
}

export function checkStory(value: unknown): Result<string> {
  if (typeof value !== "string") return fail("La historia debe ser texto.", "story");
  const story = value.replace(/[ \t]+/g, " ").trim();
  if (story.length > STORY_MAX) return fail(`La historia admite hasta ${STORY_MAX} caracteres.`, "story");
  return ok(story);
}
