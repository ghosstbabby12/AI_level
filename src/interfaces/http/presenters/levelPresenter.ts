import { Example } from "../../../application/levels/examples";
import { LevelSummary, StoredGame } from "../../../application/ports";
import { encodeGrid } from "../../../domain/level/gridCodec";
import { MODES } from "../../../domain/level/modes";
import { levelSettings } from "../../../domain/settings/levelSettings";

/** JSON shape of a game for the browser. The spec is kept for chaining, but never sent. */
const CUSTOM_LABEL = "Juego libre";
const CUSTOM_TAG = "Libre";

export function presentLevel(game: StoredGame) {
  if (game.layout === "custom") return { ...game, tag: CUSTOM_TAG };
  const { spec: _spec, ...rest } = game;
  // After a map edit the image URL changes, so the cached old image is not shown.
  const version = game.editedAt ? `?v=${Date.parse(game.editedAt)}` : "";
  return { ...rest, imageUrl: `/api/levels/${game.id}/image${version}`, tag: MODES[game.layout].example.tag, settings: levelSettings(game) };
}

export function presentSummary(summary: LevelSummary) {
  if (summary.layout === "custom") return { ...summary, label: CUSTOM_LABEL, tag: CUSTOM_TAG };
  return { ...summary, label: MODES[summary.layout].label, tag: MODES[summary.layout].example.tag };
}

/** Home page examples go compact (one string per grid row): eleven levels in one answer. */
export function presentExample({ tag, text, level }: Example) {
  const { grid, ascii: _ascii, spec: _spec, ...rest } = level;
  return { tag, text, level: { ...rest, rows: encodeGrid(grid), settings: levelSettings(level) } };
}
