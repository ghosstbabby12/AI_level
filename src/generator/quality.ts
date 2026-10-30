import { bfsDistances, findCell, Grid, neighbors4, Point } from "./grid";
import { CellType, Difficulty, FeatureSpec, LevelSpec, PlacedCounts } from "./types";

/**
 * Puntua de 0 a 100 que tan bien disenado esta un nivel ya valido. Sirve para
 * generar varios candidatos y quedarse con el mejor: no decide si es jugable
 * (eso lo hace validator.ts), sino si es interesante y fiel a lo pedido.
 */
export function scoreLevel(grid: Grid, spec: LevelSpec, placed: PlacedCounts): number {
  const score = spec.layout === "platformer" ? scorePlatformer(grid, spec, placed) : scoreTopDown(grid, spec, placed);
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

const isHazard = (cell: CellType) => cell === "trap" || cell === "enemy";

/** Fraccion de peligros pegados a la ruta principal que se busca segun la dificultad. */
const ENGAGEMENT_TARGET: Record<Difficulty, number> = { easy: 0.35, normal: 0.55, hard: 0.75 };

/** 1 si se coloco exactamente lo pedido; baja segun la diferencia. Sin cantidad explicita no penaliza. */
function fidelity(spec: LevelSpec, placed: PlacedCounts): number {
  const parts = (["traps", "enemies", "items"] as const)
    .map((key) => ({ wanted: (spec[key] as FeatureSpec).count, got: placed[key] }))
    .filter((p): p is { wanted: number; got: number } => p.wanted !== undefined && p.wanted > 0)
    .map((p) => 1 - Math.min(1, Math.abs(p.got - p.wanted) / p.wanted));
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 1;
}

/** Celdas de un camino mas corto entre inicio y salida (se reconstruye hacia atras desde la salida). */
function mainPath(distances: number[][], exit: Point): Point[] {
  const path: Point[] = [exit];
  let current = exit;
  while (distances[current.y][current.x] > 0) {
    const d = distances[current.y][current.x];
    const prev = neighbors4(current).find((n) => distances[n.y]?.[n.x] === d - 1);
    if (!prev) break;
    path.push(prev);
    current = prev;
  }
  return path;
}

/** Distancia de cada celda a la celda mas cercana del conjunto (BFS multi-origen, atravesando todo menos muros). */
function distanceToSet(grid: Grid, sources: Point[]): number[][] {
  const dist = grid.map((row) => row.map(() => -1));
  const queue: Point[] = [];
  for (const p of sources) {
    dist[p.y][p.x] = 0;
    queue.push(p);
  }
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    for (const n of neighbors4(c)) {
      if (grid[n.y]?.[n.x] !== undefined && grid[n.y][n.x] !== "wall" && dist[n.y][n.x] === -1) {
        dist[n.y][n.x] = dist[c.y][c.x] + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}

function scoreTopDown(grid: Grid, spec: LevelSpec, placed: PlacedCounts): number {
  const start = findCell(grid, "start");
  const exit = findCell(grid, "exit");
  if (!start || !exit) return 0;
  const width = grid[0].length;
  const height = grid.length;

  // 1) Recorrido: una ruta larga respecto al tamano obliga a explorar.
  const distances = bfsDistances(grid, start, (cell) => cell === "wall" || cell === "trap");
  const pathLength = distances[exit.y][exit.x];
  const journey = Math.min(1, pathLength / (1.2 * (width + height)));

  // 2) Peligros en juego: cuantos quedan a 2 pasos o menos de la ruta principal.
  const hazards: Point[] = [];
  grid.forEach((row, y) => row.forEach((cell, x) => isHazard(cell) && hazards.push({ x, y })));
  let engagement = 1;
  if (hazards.length > 0) {
    const nearPath = distanceToSet(grid, mainPath(distances, exit));
    const engaged = hazards.filter((h) => nearPath[h.y][h.x] !== -1 && nearPath[h.y][h.x] <= 2).length / hazards.length;
    engagement = 1 - Math.min(1, Math.abs(engaged - ENGAGEMENT_TARGET[spec.difficulty]) / 0.5);
  }

  // 3) El jefe custodia la salida.
  let guard = 1;
  const boss = findCell(grid, "boss");
  if (spec.boss && boss) {
    const fromExit = bfsDistances(grid, exit, (cell) => cell === "wall");
    const d = fromExit[boss.y][boss.x];
    guard = d === -1 ? 0 : d <= 4 ? 1 : Math.max(0, 1 - (d - 4) / 12);
  }

  return 0.35 * journey + 0.35 * engagement + 0.15 * guard + 0.15 * fidelity(spec, placed);
}

const SAFE_START_COLUMNS = 6;
const SEGMENTS = 6;

function scorePlatformer(grid: Grid, spec: LevelSpec, placed: PlacedCounts): number {
  const width = grid[0].length;
  const hazardColumns: number[] = [];
  grid.forEach((row) => row.forEach((cell, x) => isHazard(cell) && hazardColumns.push(x)));

  // 1) Ritmo: peligros repartidos a lo largo de todo el nivel, sin tramos vacios.
  let coverage = 1;
  if (hazardColumns.length >= 3) {
    const filled = new Set(hazardColumns.map((x) => Math.min(SEGMENTS - 1, Math.floor((x / width) * SEGMENTS))));
    coverage = filled.size / SEGMENTS;
  }

  // 2) Arranque seguro: nada que golpee al jugador en cuanto aparece.
  const start = findCell(grid, "start");
  const safeStart = start && hazardColumns.some((x) => Math.abs(x - start.x) < SAFE_START_COLUMNS) ? 0 : 1;

  return 0.5 * coverage + 0.2 * safeStart + 0.3 * fidelity(spec, placed);
}
