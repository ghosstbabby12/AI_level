import { Grid, makeGrid, neighbors4, Point } from "../../level/grid";
import { generateMaze } from "./maze";
import { Rng } from "../../level/rng";
import { Difficulty, LevelSpec, PlacedCounts } from "../../level/types";

const BASE_ENEMIES: Record<Difficulty, number> = { easy: 3, normal: 4, hard: 5 };
const MAX_ENEMIES = 8;
const MIN_HALF_WIDTH = 9;
const MIN_HEIGHT = 13;

const isOpen = (grid: Grid, p: Point) => grid[p.y]?.[p.x] !== undefined && grid[p.y][p.x] !== "wall";
const isInner = (grid: Grid, p: Point) => p.x > 0 && p.y > 0 && p.x < grid[0].length - 1 && p.y < grid.length - 1;

/** Opens a wall towards another corridor at every dead end; in arcade nobody should get cornered. */
function removeDeadEnds(grid: Grid, rng: Rng, open: (p: Point) => void): void {
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let y = 1; y < grid.length - 1; y++) {
      for (let x = 1; x < grid[0].length - 1; x++) {
        const cell = { x, y };
        if (!isOpen(grid, cell) || neighbors4(cell).filter((n) => isOpen(grid, n)).length !== 1) continue;
        const walls = rng.shuffle(neighbors4(cell)).filter((n) => {
          if (isOpen(grid, n) || !isInner(grid, n)) return false;
          return isOpen(grid, { x: n.x + (n.x - x), y: n.y + (n.y - y) });
        });
        if (walls.length > 0) {
          open(walls[0]);
          changed = true;
        }
      }
    }
    if (!changed) return;
  }
}

/**
 * Arcade board: symmetric maze without dead ends, with a central lair, a tunnel
 * joining both sides and dots in every corridor. You win by collecting them all,
 * so there is no exit and no traps.
 */
export function buildArcade(spec: LevelSpec, rng: Rng): { grid: Grid; placed: PlacedCounts } {
  let halfWidth = Math.max(MIN_HALF_WIDTH, Math.floor((spec.width + 1) / 2));
  if (halfWidth % 2 === 0) halfWidth += 1;
  const height = Math.max(MIN_HEIGHT, spec.height % 2 === 0 ? spec.height + 1 : spec.height);
  const half = generateMaze(halfWidth, height, rng);

  const width = halfWidth * 2 - 1;
  const grid = makeGrid(width, height, "wall");
  const mirrorOpen = (p: Point) => {
    grid[p.y][p.x] = "floor";
    grid[p.y][width - 1 - p.x] = "floor";
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < halfWidth; x++) if (half[y][x] === "floor") mirrorOpen({ x, y });
  }

  const cx = halfWidth - 1;
  const cy = Math.floor(height / 2);

  // The central column joins both halves.
  for (let y = 3; y < height - 1; y += 4) grid[y][cx] = "floor";
  grid[height - 2][cx] = "floor";

  // Central lair where the chasers come from.
  const house: Point[] = [];
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 2; x <= cx + 2; x++) {
      grid[y][x] = "floor";
      house.push({ x, y });
    }
  }

  removeDeadEnds(grid, rng, mirrorOpen);

  // Side tunnel: leaving through one side takes you to the other.
  const tunnelRow = cy % 2 === 1 ? cy : cy + 1;
  grid[tunnelRow][0] = "floor";
  grid[tunnelRow][width - 1] = "floor";

  const inHouse = (x: number, y: number) => house.some((p) => p.x === x && p.y === y);
  const start = { x: cx, y: height - 2 };
  grid[start.y][start.x] = "start";

  const powers = [
    { x: 1, y: 3 },
    { x: width - 2, y: 3 },
    { x: 1, y: height - 4 },
    { x: width - 2, y: height - 4 },
  ];

  const placed: PlacedCounts = { traps: 0, enemies: 0, items: 0 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] !== "floor" || inHouse(x, y) || x === 0 || x === width - 1) continue;
      grid[y][x] = powers.some((p) => p.x === x && p.y === y) ? "power" : "item";
      if (grid[y][x] === "item") placed.items++;
    }
  }

  const center = { x: cx, y: cy };
  if (spec.boss) grid[center.y][center.x] = "boss";

  if (spec.enemies.enabled) {
    const wanted = spec.enemies.count ?? BASE_ENEMIES[spec.difficulty] + (spec.enemies.multiplier > 1.5 ? 2 : 0);
    const spots = rng.shuffle(house.filter((p) => grid[p.y][p.x] === "floor"));
    for (const p of spots.slice(0, Math.min(wanted, MAX_ENEMIES))) {
      grid[p.y][p.x] = "enemy";
      placed.enemies++;
    }
  }

  return { grid, placed };
}
