import { Grid, makeGrid } from "../../level/grid";
import { Rng } from "../../level/rng";
import { BuildResult, Difficulty, LevelSpec } from "../../level/types";

const ROWS: Record<Difficulty, number> = { easy: 3, normal: 4, hard: 5 };
const MIN_INVADERS = 6;

/** "enemy" cells are the initial formation and "wall" cells the shields protecting the player. */
export function buildInvaders(spec: LevelSpec, rng: Rng): BuildResult {
  const { width, height } = spec;
  const grid: Grid = makeGrid(width, height, "floor");
  const cx = Math.floor(width / 2);
  grid[height - 2][cx] = "start";
  if (spec.boss) grid[1][cx] = "boss";

  // Each game uses a different formation pattern.
  const patterns: Array<(col: number, row: number) => boolean> = [
    () => true,
    (col, row) => (col + row) % 2 === 0,
    (col, row) => Math.abs(col) >= row - 1,
    (col, row) => Math.abs(col) <= row + 2,
    (col) => col % 3 !== 0,
  ];
  const pattern = rng.pick(patterns);
  const rows = ROWS[spec.difficulty];
  const halfCols = Math.floor((width - 8) / 4);
  const wanted = spec.enemies.count;
  const spots: Array<{ x: number; y: number }> = [];
  for (let row = 0; row < rows; row++) {
    for (let col = -halfCols; col <= halfCols; col++) {
      if (pattern(col, row)) spots.push({ x: cx + col * 2, y: 3 + row });
    }
  }
  const chosen = wanted !== undefined ? rng.shuffle(spots).slice(0, Math.max(wanted, 1)) : spots;
  if (chosen.length < Math.min(MIN_INVADERS, wanted ?? MIN_INVADERS)) {
    chosen.push(...rng.shuffle(spots.filter((s) => !chosen.includes(s))).slice(0, MIN_INVADERS - chosen.length));
  }
  chosen.forEach((p) => (grid[p.y][p.x] = "enemy"));

  // Shields spread above the player; they disappear on hard.
  const shields = spec.difficulty === "hard" ? 2 : 3;
  for (let i = 0; i < shields; i++) {
    const x0 = Math.floor(((i + 1) * width) / (shields + 1)) - 1;
    for (let x = x0; x < x0 + 3; x++) grid[height - 5][x] = "wall";
  }

  return { grid, placed: { traps: 0, enemies: chosen.length, items: 0 } };
}
