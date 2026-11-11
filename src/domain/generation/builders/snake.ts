import { bfsDistances, Grid, makeGrid, manhattan, Point } from "../../level/grid";
import { Rng } from "../../level/rng";
import { BuildResult, Difficulty, LevelSpec } from "../../level/types";

const FOOD: Record<Difficulty, number> = { easy: 12, normal: 18, hard: 25 };
const OBSTACLES: Record<Difficulty, number> = { easy: 2, normal: 5, hard: 8 };
const TRAPS: Record<Difficulty, number> = { easy: 0, normal: 3, hard: 6 };
const CLEAR_RADIUS = 5;

/** "item" = food in the order it will appear; "wall" = borders and obstacles; "trap" = fixed spikes. */
export function buildSnake(spec: LevelSpec, rng: Rng): BuildResult | null {
  const { width, height } = spec;
  const grid: Grid = makeGrid(width, height, "floor");
  for (let x = 0; x < width; x++) grid[0][x] = grid[height - 1][x] = "wall";
  for (let y = 0; y < height; y++) grid[y][0] = grid[y][width - 1] = "wall";
  const start = { x: Math.floor(width / 2), y: Math.floor(height / 2) };

  // Straight obstacles: they leave corridors to manoeuvre a long snake.
  for (let i = 0; i < OBSTACLES[spec.difficulty]; i++) {
    const horizontal = rng.chance(0.5);
    const length = rng.int(2, 4);
    const x0 = rng.int(3, width - 4 - length);
    const y0 = rng.int(3, height - 4 - length);
    for (let k = 0; k < length; k++) {
      const p = { x: x0 + (horizontal ? k : 0), y: y0 + (horizontal ? 0 : k) };
      if (manhattan(p, start) > CLEAR_RADIUS) grid[p.y][p.x] = "wall";
    }
  }

  const reach = bfsDistances(grid, start);
  if (grid.some((row, y) => row.some((cell, x) => cell === "floor" && reach[y][x] === -1))) return null;
  grid[start.y][start.x] = "start";

  const free: Point[] = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell === "floor" && manhattan({ x, y }, start) > 2) free.push({ x, y });
  }));
  const shuffled = rng.shuffle(free);

  const trapCount = spec.traps.enabled ? spec.traps.count ?? TRAPS[spec.difficulty] : 0;
  const safeTraps = shuffled.filter((p) => manhattan(p, start) > CLEAR_RADIUS).slice(0, trapCount);
  safeTraps.forEach((p) => (grid[p.y][p.x] = "trap"));

  const food = shuffled.filter((p) => grid[p.y][p.x] === "floor").slice(0, spec.items.count ?? FOOD[spec.difficulty]);
  if (food.length < 3) return null;
  food.forEach((p) => (grid[p.y][p.x] = "item"));

  return { grid, placed: { traps: safeTraps.length, enemies: 0, items: food.length } };
}
