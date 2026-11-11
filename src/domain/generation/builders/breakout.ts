import { CellType } from "../../level/types";
import { Grid, makeGrid } from "../../level/grid";
import { Rng } from "../../level/rng";
import { BuildResult, Difficulty, LevelSpec } from "../../level/types";

const ROWS: Record<Difficulty, number> = { easy: 5, normal: 6, hard: 7 };
const TOUGH: Record<Difficulty, number> = { easy: 0.08, normal: 0.18, hard: 0.3 };
const SOLID: Record<Difficulty, number> = { easy: 0, normal: 2, hard: 4 };

/** "item" = brick, "enemy" = tough brick, "trap" = explosive, "power" = power-up, "wall" = unbreakable. */
export function buildBreakout(spec: LevelSpec, rng: Rng): BuildResult | null {
  const { width, height } = spec;
  const grid: Grid = makeGrid(width, height, "floor");
  const cx = (width - 1) / 2;
  const rows = ROWS[spec.difficulty];
  grid[height - 2][Math.floor(cx)] = "start";

  const patterns: Array<(dx: number, row: number) => boolean> = [
    () => true,
    (dx, row) => dx <= row * 2 + 1,
    (dx, row) => dx >= row - 1,
    (dx, row) => (Math.floor(dx) + row) % 2 === 0,
    (dx, row) => dx + Math.abs(row - rows / 2) * 2 <= cx - 1,
    (dx) => Math.floor(dx) % 3 !== 2,
  ];
  const pattern = rng.pick(patterns);

  // Symmetric patterns: the left half is decided and mirrored.
  const firstRow = spec.boss ? 4 : 2;
  const set = (x: number, y: number, cell: CellType) => {
    grid[y][x] = cell;
    grid[y][width - 1 - x] = cell;
  };
  for (let row = 0; row < rows; row++) {
    for (let x = 1; x <= cx; x++) {
      if (pattern(cx - x, row)) set(x, firstRow + row, rng.chance(TOUGH[spec.difficulty]) ? "enemy" : "item");
    }
  }
  if (spec.boss) grid[2][Math.floor(cx)] = "boss";

  const bricks: Array<{ x: number; y: number }> = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if ((cell === "item" || cell === "enemy") && x <= cx) bricks.push({ x, y });
  }));

  const shuffled = rng.shuffle(bricks);
  let next = 0;
  const assign = (cell: CellType, amount: number): number => {
    let placed = 0;
    for (; placed < amount && next < shuffled.length; next++, placed++) set(shuffled[next].x, shuffled[next].y, cell);
    return placed * 2;
  };
  const traps = spec.traps.enabled ? assign("trap", spec.traps.count !== undefined ? Math.ceil(spec.traps.count / 2) : 2) : 0;
  assign("power", 2);
  assign("wall", SOLID[spec.difficulty]);

  let breakable = 0;
  grid.forEach((row) => row.forEach((cell) => {
    if (cell === "item" || cell === "enemy" || cell === "trap" || cell === "power") breakable++;
  }));
  if (breakable < 12) return null;

  return { grid, placed: { traps, enemies: 0, items: breakable } };
}
