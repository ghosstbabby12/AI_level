import { editLevel, LevelChanges } from "../../domain/editing/editLevel";
import { AppError } from "../errors";
import { Deps, StoredGame } from "../ports";

const NOT_YOURS = "Ese juego no existe o no es tuyo.";

/** Edits title, story and map of the user's own game. Anything not sent stays the same. */
export async function editSavedLevel(deps: Deps, id: string, userId: number, changes: LevelChanges): Promise<StoredGame> {
  if (!(await deps.levels.isOwner(id, userId))) throw new AppError("not_found", NOT_YOURS);
  const level = await deps.levels.get(id);
  if (!level) throw new AppError("not_found", NOT_YOURS);

  if (changes.title === undefined && changes.story === undefined && changes.rows === undefined) {
    throw new AppError("invalid", "No hay cambios que guardar.");
  }
  const edited = editLevel(level, changes);
  if (!edited.ok) throw new AppError("invalid", edited.error, { field: edited.field });
  if (!(await deps.levels.update(edited.value, userId))) throw new AppError("not_found", NOT_YOURS);
  return edited.value;
}
