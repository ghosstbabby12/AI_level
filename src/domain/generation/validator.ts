import { bfsDistances, countCells, findCell, Grid, Point } from "../level/grid";
import { CellType, Layout, LevelSpec } from "../level/types";

const isSolid = (cell: CellType) => cell === "wall";

/** Top-down route: there is a path from start to exit without stepping on traps. */
function topDownSolvable(grid: Grid, start: Point, exit: Point): boolean {
  const distances = bfsDistances(grid, start, (cell) => cell === "wall" || cell === "trap");
  return distances[exit.y][exit.x] !== -1;
}

/**
 * Platformer reachability with the jump rules the client guarantees: climb up to 3
 * tiles, clear up to 3 empty tiles, fall up to 6 tiles sideways. Traps cannot be
 * stepped on: they must be jumped over.
 */
function platformerSolvable(grid: Grid, start: Point, exit: Point): boolean {
  const h = grid.length;
  const w = grid[0].length;

  const surface = (cx: number): number => {
    let y = h;
    while (y - 1 >= 0 && isSolid(grid[y - 1][cx])) y--;
    return y;
  };
  const surfaces = Array.from({ length: w }, (_, cx) => surface(cx));

  const standing: Point[][] = Array.from({ length: w }, () => []);
  for (let cx = 0; cx < w; cx++) {
    for (let cy = 0; cy < h - 1; cy++) {
      const cell = grid[cy][cx];
      if (!isSolid(cell) && cell !== "trap" && isSolid(grid[cy + 1][cx])) standing[cx].push({ x: cx, y: cy });
    }
  }

  const key = (p: Point) => p.y * w + p.x;
  const seen = new Set<number>([key(start)]);
  const queue: Point[] = [start];

  for (let head = 0; head < queue.length; head++) {
    const from = queue[head];
    if (from.x === exit.x && from.y === exit.y) return true;

    for (let cx = Math.max(0, from.x - 6); cx <= Math.min(w - 1, from.x + 6); cx++) {
      if (cx === from.x) continue;
      const dx = Math.abs(cx - from.x);
      for (const to of standing[cx]) {
        if (seen.has(key(to))) continue;
        const rise = from.y - to.y;
        const reachable = rise >= 0 ? rise <= 3 && dx <= (rise === 3 ? 3 : 4) : dx <= 6;
        if (!reachable) continue;

        const lowestFloor = Math.min(from.y, to.y) + 1;
        let clear = true;
        for (let mid = Math.min(cx, from.x) + 1; mid < Math.max(cx, from.x); mid++) {
          if (surfaces[mid] < lowestFloor) {
            clear = false;
            break;
          }
        }
        if (!clear) continue;

        seen.add(key(to));
        queue.push(to);
      }
    }
  }
  return false;
}

/** In arcade you win by collecting everything: no exit, but everything must be reachable. */
function validateArcade(grid: Grid, spec: LevelSpec): string | null {
  const start = findCell(grid, "start");
  if (!start || countCells(grid, "start") !== 1) return "debe haber exactamente un inicio";
  if (countCells(grid, "boss") !== (spec.boss ? 1 : 0)) return "cantidad de jefes incorrecta";
  if (countCells(grid, "item") + countCells(grid, "power") === 0) return "no hay nada que recoger";

  const distances = bfsDistances(grid, start);
  const unreachable = grid.some((row, y) =>
    row.some((cell, x) => (cell === "item" || cell === "power" || cell === "enemy" || cell === "boss") && distances[y][x] === -1)
  );
  return unreachable ? "hay puntos inalcanzables" : null;
}

function validateReachable(grid: Grid, spec: LevelSpec): string | null {
  const start = findCell(grid, "start");
  if (!start || countCells(grid, "start") !== 1) return "debe haber exactamente un inicio";
  if (countCells(grid, "boss") !== (spec.boss ? 1 : 0)) return "cantidad de jefes incorrecta";
  const distances = bfsDistances(grid, start);
  const unreachable = grid.some((row, y) => row.some((cell, x) => cell !== "wall" && distances[y][x] === -1));
  return unreachable ? "hay zonas inalcanzables" : null;
}

/** Modes without an exit: each one checks what it needs to be winnable. */
const CUSTOM: Partial<Record<Layout, (grid: Grid, spec: LevelSpec) => string | null>> = {
  arcade: validateArcade,
  shooter: (grid, spec) => {
    if (countCells(grid, "boss") !== (spec.boss ? 1 : 0)) return "cantidad de jefes incorrecta";
    return countCells(grid, "item") > 0 ? null : "no hay dianas";
  },
  survival: (grid, spec) => validateReachable(grid, spec) ?? (countCells(grid, "enemy") >= 3 ? null : "faltan puntos de aparicion"),
  racing: (grid) => {
    if (!findCell(grid, "start")) return "falta la salida de la carrera";
    return null;
  },
  invaders: (grid) => (countCells(grid, "enemy") > 0 ? null : "no hay invasores"),
  breakout: (grid) => (countCells(grid, "start") === 1 && countCells(grid, "item") > 0 ? null : "no hay bloques"),
  snake: (grid) => (validateReachable(grid, { boss: false } as LevelSpec) ?? (countCells(grid, "item") > 0 ? null : "no hay comida")),
};

export function validateLevel(grid: Grid, spec: LevelSpec): string | null {
  const custom = CUSTOM[spec.layout];
  if (custom) return custom(grid, spec);

  const start = findCell(grid, "start");
  const exit = findCell(grid, "exit");
  if (!start || countCells(grid, "start") !== 1) return "debe haber exactamente un inicio";
  if (!exit || countCells(grid, "exit") !== 1) return "debe haber exactamente una salida";
  if (countCells(grid, "boss") !== (spec.boss ? 1 : 0)) return "cantidad de jefes incorrecta";

  const solvable = spec.layout === "platformer" ? platformerSolvable(grid, start, exit) : topDownSolvable(grid, start, exit);
  return solvable ? null : "la salida no es alcanzable";
}
