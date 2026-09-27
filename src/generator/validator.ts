import { bfsDistances, countCells, findCell, Grid, Point } from "./grid";
import { CellType, LevelSpec } from "./types";

const isSolid = (cell: CellType) => cell === "wall";

/** Recorrido top-down: hay camino de inicio a salida sin pisar trampas. */
function topDownSolvable(grid: Grid, start: Point, exit: Point): boolean {
  const distances = bfsDistances(grid, start, (cell) => cell === "wall" || cell === "trap");
  return distances[exit.y][exit.x] !== -1;
}

/**
 * Alcanzabilidad en plataformas con las reglas de salto que el cliente garantiza:
 * subir hasta 3 tiles, salvar hasta 3 tiles vacios, caer hasta 6 tiles de lado.
 * Las trampas no son pisables: hay que saltarlas.
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

export function validateLevel(grid: Grid, spec: LevelSpec): string | null {
  const start = findCell(grid, "start");
  const exit = findCell(grid, "exit");
  if (!start || countCells(grid, "start") !== 1) return "debe haber exactamente un inicio";
  if (!exit || countCells(grid, "exit") !== 1) return "debe haber exactamente una salida";
  if (countCells(grid, "boss") !== (spec.boss ? 1 : 0)) return "cantidad de jefes incorrecta";

  const solvable = spec.layout === "platformer" ? platformerSolvable(grid, start, exit) : topDownSolvable(grid, start, exit);
  return solvable ? null : "la salida no es alcanzable";
}
