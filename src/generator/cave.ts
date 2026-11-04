import { bfsDistances, farthestCell, Grid, makeGrid, neighbors4, Point } from "./grid";
import { Rng } from "./rng";
import { LevelSpec } from "./types";
import { TopDownLayout } from "./topDown";

const FILL = 0.45;
const SMOOTHING_PASSES = 5;
/** Por debajo de esta fraccion de suelo, la cueva queda demasiado pequena y se reintenta. */
const MIN_FLOOR_RATIO = 0.3;

function smooth(grid: Grid): Grid {
  const height = grid.length;
  const width = grid[0].length;
  const next = makeGrid(width, height, "wall");
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let walls = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) if (grid[y + dy][x + dx] === "wall") walls++;
      }
      next[y][x] = walls >= 5 ? "wall" : "floor";
    }
  }
  return next;
}

/** Deja solo la region de suelo mas grande; devuelve sus celdas. */
function keepLargestRegion(grid: Grid): Point[] {
  const seen = grid.map((row) => row.map(() => false));
  let largest: Point[] = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      if (grid[y][x] === "wall" || seen[y][x]) continue;
      const region: Point[] = [{ x, y }];
      seen[y][x] = true;
      for (let head = 0; head < region.length; head++) {
        for (const n of neighbors4(region[head])) {
          if (grid[n.y]?.[n.x] !== undefined && grid[n.y][n.x] !== "wall" && !seen[n.y][n.x]) {
            seen[n.y][n.x] = true;
            region.push(n);
          }
        }
      }
      if (region.length > largest.length) largest = region;
    }
  }
  const keep = new Set(largest.map((p) => p.y * grid[0].length + p.x));
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell !== "wall" && !keep.has(y * grid[0].length + x)) row[x] = "wall";
  }));
  return largest;
}

/** Cueva organica por automata celular: formas naturales en vez de salas y pasillos rectos. */
export function buildCaveLayout(spec: LevelSpec, rng: Rng): TopDownLayout | null {
  const { width, height } = spec;
  let grid = makeGrid(width, height, "wall");
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) grid[y][x] = rng.chance(FILL) ? "wall" : "floor";
  }
  for (let pass = 0; pass < SMOOTHING_PASSES; pass++) grid = smooth(grid);

  const floor = keepLargestRegion(grid);
  if (floor.length < width * height * MIN_FLOOR_RATIO) return null;

  const start = floor.reduce((best, p) => (p.x + p.y < best.x + best.y ? p : best));
  const exit = farthestCell(grid, bfsDistances(grid, start));
  if (!spec.boss) return { grid, start, exit };

  // El jefe espera a pocos pasos de la salida.
  const fromExit = bfsDistances(grid, exit);
  const boss = rng.shuffle(floor).find((p) => fromExit[p.y][p.x] >= 3 && fromExit[p.y][p.x] <= 6);
  return boss ? { grid, start, exit, boss } : null;
}
