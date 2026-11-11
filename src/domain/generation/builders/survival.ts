import { bfsDistances, Grid, makeGrid, manhattan, Point } from "../../level/grid";
import { Rng } from "../../level/rng";
import { BuildResult, Difficulty, LevelSpec } from "../../level/types";

const WAVES: Record<Difficulty, number> = { easy: 3, normal: 5, hard: 6 };
const PICKUPS: Record<Difficulty, number> = { easy: 5, normal: 4, hard: 3 };
const TRAPS: Record<Difficulty, number> = { easy: 2, normal: 4, hard: 6 };
const SPAWN_POINTS = 10;
const SAFE_RADIUS = 5;

/** Arena with pillars to dodge around. "enemy" cells are spawn points, not enemies. */
export function buildSurvival(spec: LevelSpec, rng: Rng): BuildResult | null {
  const { width, height } = spec;
  const grid: Grid = makeGrid(width, height, "floor");
  for (let x = 0; x < width; x++) grid[0][x] = grid[height - 1][x] = "wall";
  for (let y = 0; y < height; y++) grid[y][0] = grid[y][width - 1] = "wall";

  const start = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  const pillars = Math.floor((width * height) / 70);
  for (let i = 0; i < pillars; i++) {
    const w = rng.int(1, 3);
    const h = rng.int(1, 2);
    const x0 = rng.int(3, width - 4 - w);
    const y0 = rng.int(3, height - 4 - h);
    if (manhattan({ x: x0, y: y0 }, start) < SAFE_RADIUS + 2) continue;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) grid[y][x] = "wall";
  }

  // No corner may be left isolated.
  const reach = bfsDistances(grid, start);
  if (grid.some((row, y) => row.some((cell, x) => cell === "floor" && reach[y][x] === -1))) return null;
  grid[start.y][start.x] = "start";

  const floor = (accept: (p: Point) => boolean): Point[] => {
    const cells: Point[] = [];
    grid.forEach((row, y) => row.forEach((cell, x) => {
      if (cell === "floor" && accept({ x, y })) cells.push({ x, y });
    }));
    return rng.shuffle(cells);
  };

  // Enemies spawn near the borders, far from the centre.
  const nearEdge = (p: Point) => p.x <= 2 || p.y <= 2 || p.x >= width - 3 || p.y >= height - 3;
  const spawns: Point[] = [];
  for (const p of floor(nearEdge)) {
    if (spawns.length >= SPAWN_POINTS) break;
    if (spawns.some((o) => manhattan(o, p) < 6)) continue;
    spawns.push(p);
    grid[p.y][p.x] = "enemy";
  }

  if (spec.boss) {
    const spot = floor((p) => p.y <= 2 && Math.abs(p.x - start.x) < 4)[0];
    if (!spot) return null;
    grid[spot.y][spot.x] = "boss";
  }

  const clear = (p: Point) => manhattan(p, start) > 2;
  const items = floor(clear).slice(0, spec.items.enabled ? spec.items.count ?? PICKUPS[spec.difficulty] : 0);
  items.forEach((p) => (grid[p.y][p.x] = "item"));
  const traps = floor((p) => manhattan(p, start) > SAFE_RADIUS).slice(0, spec.traps.enabled ? spec.traps.count ?? TRAPS[spec.difficulty] : 0);
  traps.forEach((p) => (grid[p.y][p.x] = "trap"));

  return {
    grid,
    placed: { traps: traps.length, enemies: spawns.length, items: items.length },
    params: { waves: spec.rounds ?? WAVES[spec.difficulty] },
  };
}
