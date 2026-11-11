import { Grid, makeGrid, manhattan, Point } from "../../level/grid";
import { Rng } from "../../level/rng";
import { Difficulty, LevelSpec, PlacedCounts } from "../../level/types";

const BASE: Record<Difficulty, { targets: number; moving: number; bombs: number }> = {
  easy: { targets: 14, moving: 3, bombs: 2 },
  normal: { targets: 18, moving: 5, bombs: 4 },
  hard: { targets: 22, moving: 8, bombs: 6 },
};
const MIN_SPACING = 3;

/**
 * Shooting gallery: the grid only says where each target appears. "item" is a fixed
 * target, "enemy" a moving one (its row is its lane) and "trap" a bomb that must not
 * be shot. The game spawns them a few at a time.
 */
export function buildShooter(spec: LevelSpec, rng: Rng): { grid: Grid; placed: PlacedCounts } {
  const { width, height } = spec;
  const grid = makeGrid(width, height, "floor");
  for (let x = 0; x < width; x++) {
    grid[0][x] = "wall";
    grid[height - 1][x] = "wall";
  }
  for (let y = 0; y < height; y++) {
    grid[y][0] = "wall";
    grid[y][width - 1] = "wall";
  }

  const start = { x: Math.floor(width / 2), y: height - 2 };
  grid[start.y][start.x] = "start";
  if (spec.boss) grid[2][Math.floor(width / 2)] = "boss";

  const spots: Point[] = [];
  for (let y = 2; y < height - 3; y++) {
    for (let x = 2; x < width - 2; x++) if (grid[y][x] === "floor") spots.push({ x, y });
  }

  const base = BASE[spec.difficulty];
  const wanted = (count: number | undefined, fallback: number, multiplier: number) =>
    count ?? Math.round(fallback * (multiplier > 1.5 ? 1.4 : multiplier < 1 ? 0.6 : 1));

  const taken: Point[] = [];
  const place = (cell: "item" | "enemy" | "trap", amount: number): number => {
    let placed = 0;
    for (const p of rng.shuffle(spots)) {
      if (placed >= amount) break;
      if (grid[p.y][p.x] !== "floor" || taken.some((o) => manhattan(o, p) < MIN_SPACING)) continue;
      grid[p.y][p.x] = cell;
      taken.push(p);
      placed++;
    }
    return placed;
  };

  // Targets go first: without them there is no game, even if many bombs were requested.
  const items = place("item", Math.max(1, wanted(spec.items.count, base.targets, spec.items.multiplier)));
  const enemies = spec.enemies.enabled ? place("enemy", wanted(spec.enemies.count, base.moving, 1)) : 0;
  const traps = spec.traps.enabled ? place("trap", wanted(spec.traps.count, base.bombs, 1)) : 0;

  return { grid, placed: { traps, enemies, items } };
}
