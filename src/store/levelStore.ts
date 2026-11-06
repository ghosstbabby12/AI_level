import { renderAscii } from "../renderer/asciiRenderer";
import { CellType, CustomGame, GeneratedLevel } from "../generator/types";
import { first, run } from "./db";

/** Un caracter por casilla: un circuito grande ocupa ~10 KB en vez de ~90 KB como JSON. */
const CELL_CODE: Record<CellType, string> = {
  wall: "#", floor: ".", start: "S", exit: "E", trap: "^", enemy: "M", item: "$", boss: "B", power: "P",
};
const CODE_CELL = Object.fromEntries(Object.entries(CELL_CODE).map(([cell, code]) => [code, cell])) as Record<string, CellType>;

export function encodeGrid(grid: CellType[][]): string[] {
  return grid.map((row) => row.map((cell) => CELL_CODE[cell]).join(""));
}

export function decodeGrid(rows: string[]): CellType[][] {
  return rows.map((row) => [...row].map((code) => CODE_CELL[code]));
}

export type StoredGame = GeneratedLevel | CustomGame;

export interface LevelSummary {
  id: string;
  description: string;
  title: string;
  layout: StoredGame["layout"];
  theme: StoredGame["theme"];
  createdAt: string;
}

interface LevelRow extends LevelSummary {
  data: string;
}

// Los niveles recien creados o abiertos se piden varias veces seguidas (juego, imagen, compartir).
const CACHE_SIZE = 100;
const cache = new Map<string, StoredGame>();

function remember(level: StoredGame): void {
  cache.delete(level.id);
  cache.set(level.id, level);
  if (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export async function saveLevel(level: GeneratedLevel, userId: number): Promise<void> {
  // El ASCII se puede rehacer a partir de la cuadricula: no se guarda.
  const { grid, ascii: _ascii, ...rest } = level;
  await run(
    "INSERT INTO levels (id, user_id, description, title, layout, theme, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [level.id, userId, level.description, level.narrative.title, level.layout, level.theme, JSON.stringify({ ...rest, rows: encodeGrid(grid) }), level.createdAt],
  );
  remember(level);
}

/** Los juegos a medida se guardan tal cual: su HTML no tiene cuadricula que comprimir. */
export async function saveCustomGame(game: CustomGame, userId: number): Promise<void> {
  await run(
    "INSERT INTO levels (id, user_id, description, title, layout, theme, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [game.id, userId, game.description, game.narrative.title, game.layout, game.theme, JSON.stringify(game), game.createdAt],
  );
  remember(game);
}

export async function getLevel(id: string): Promise<StoredGame | undefined> {
  const cached = cache.get(id);
  if (cached) return cached;
  const row = await first<{ data: string }>("SELECT data FROM levels WHERE id = ?", [id]);
  if (!row) return undefined;
  const parsed = JSON.parse(row.data);
  if (parsed.layout === "custom") {
    remember(parsed as CustomGame);
    return parsed as CustomGame;
  }
  const { rows, ...rest }: Omit<GeneratedLevel, "grid" | "ascii"> & { rows: string[] } = parsed;
  const grid = decodeGrid(rows);
  const level: GeneratedLevel = { ...rest, grid, ascii: renderAscii(grid, rest.theme, rest.layout) };
  remember(level);
  return level;
}

export async function listLevels(userId: number, limit = 60): Promise<LevelSummary[]> {
  const result = await run(
    "SELECT id, description, title, layout, theme, created_at AS createdAt FROM levels WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    [userId, limit],
  );
  return result.rows.map((row) => {
    const r = row as unknown as LevelRow;
    return { id: r.id, description: r.description, title: r.title, layout: r.layout, theme: r.theme, createdAt: r.createdAt };
  });
}

/** Solo borra si el nivel es de ese usuario. */
export async function deleteLevel(id: string, userId: number): Promise<boolean> {
  const result = await run("DELETE FROM levels WHERE id = ? AND user_id = ?", [id, userId]);
  cache.delete(id);
  return result.rowsAffected > 0;
}
