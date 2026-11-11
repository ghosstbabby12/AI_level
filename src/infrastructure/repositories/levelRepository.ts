import { LevelRepository, LevelSummary, StoredGame } from "../../application/ports";
import { decodeGrid, encodeGrid } from "../../domain/level/gridCodec";
import { ChainedLevel, CustomGame } from "../../domain/level/types";
import { renderAscii } from "../../domain/rendering/asciiRenderer";
import { first, run } from "../database/client";

/** Recently created or opened levels are requested several times in a row (game, image, share). */
const CACHE_SIZE = 100;
const cache = new Map<string, StoredGame>();

function remember(game: StoredGame): void {
  cache.delete(game.id);
  cache.set(game.id, game);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
}

/** Custom games are stored as they are; levels keep their grid compact and drop the ASCII (rebuilt on read). */
function serialize(game: StoredGame): string {
  if (game.layout === "custom") return JSON.stringify(game);
  const { grid, ascii: _ascii, ...rest } = game;
  return JSON.stringify({ ...rest, rows: encodeGrid(grid) });
}

function deserialize(data: string): StoredGame {
  const parsed = JSON.parse(data);
  if (parsed.layout === "custom") return parsed as CustomGame;
  const { rows, ...rest } = parsed as Omit<ChainedLevel, "grid" | "ascii"> & { rows: string[] };
  const grid = decodeGrid(rows);
  return { ...rest, grid, ascii: renderAscii(grid, rest.theme, rest.layout) };
}

export const levelRepository: LevelRepository = {
  async save(game, userId) {
    await run(
      "INSERT INTO levels (id, user_id, description, title, layout, theme, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [game.id, userId, game.description, game.narrative.title, game.layout, game.theme, serialize(game), game.createdAt],
    );
    remember(game);
  },

  async update(game, userId) {
    const result = await run("UPDATE levels SET title = ?, data = ? WHERE id = ? AND user_id = ?", [game.narrative.title, serialize(game), game.id, userId]);
    if (result.rowsAffected === 0) return false;
    remember(game);
    return true;
  },

  async get(id) {
    const cached = cache.get(id);
    if (cached) return cached;
    const row = await first<{ data: string }>("SELECT data FROM levels WHERE id = ?", [id]);
    if (!row) return undefined;
    const game = deserialize(row.data);
    remember(game);
    return game;
  },

  async listByUser(userId, limit = 60) {
    const result = await run(
      "SELECT id, description, title, layout, theme, created_at AS createdAt FROM levels WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
      [userId, limit],
    );
    return result.rows.map((row) => {
      const r = row as unknown as LevelSummary;
      return { id: r.id, description: r.description, title: r.title, layout: r.layout, theme: r.theme, createdAt: r.createdAt };
    });
  },

  async remove(id, userId) {
    const result = await run("DELETE FROM levels WHERE id = ? AND user_id = ?", [id, userId]);
    cache.delete(id);
    return result.rowsAffected > 0;
  },

  async isOwner(id, userId) {
    return !!(await first("SELECT 1 FROM levels WHERE id = ? AND user_id = ?", [id, userId]));
  },
};
