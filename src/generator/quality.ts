import { bfsDistances, countCells, findCell, Grid, neighbors4, Point } from "./grid";
import { CellType, Difficulty, FeatureSpec, Layout, LevelSpec, PlacedCounts } from "./types";

/**
 * Puntua de 0 a 100 que tan bien disenado esta un nivel ya valido. Sirve para
 * generar varios candidatos y quedarse con el mejor: no decide si es jugable
 * (eso lo hace validator.ts), sino si es interesante y fiel a lo pedido.
 */
export function scoreLevel(grid: Grid, spec: LevelSpec, placed: PlacedCounts): number {
  const scorer = CUSTOM_SCORES[spec.layout];
  const score = scorer ? scorer(grid) : spec.layout === "platformer" ? scorePlatformer(grid, spec, placed) : scoreTopDown(grid, spec, placed);
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

/** Reparto por toda la zona de juego: premia que no quede vacia ninguna parte. */
function spread(grid: Grid, cells: CellType[]): number {
  const cols = 4;
  const rows = 3;
  const filled = new Set<number>();
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cells.includes(cell)) filled.add(Math.floor((y / grid.length) * rows) * cols + Math.floor((x / row.length) * cols));
  }));
  return filled.size / (cols * rows);
}

/** Pista: cuanto mas suelo ocupa respecto al mapa, mas larga y con mas curvas. */
function scoreRacing(grid: Grid): number {
  const open = grid.reduce((sum, row) => sum + row.filter((cell) => cell !== "wall").length, 0);
  return Math.min(1, open / (grid.length * grid[0].length * 0.38));
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

/** Fraccion de cruces que da margen para esquivar sin que el tablero parezca una plaza abierta. */
const ARCADE_JUNCTION_TARGET = 0.3;

function scoreArcade(grid: Grid): number {
  let open = 0;
  let junctions = 0;
  let deadEnds = 0;
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell === "wall") return;
    open++;
    const exits = neighbors4({ x, y }).filter((n) => grid[n.y]?.[n.x] !== undefined && grid[n.y][n.x] !== "wall").length;
    if (exits >= 3) junctions++;
    if (exits === 1) deadEnds++;
  }));
  const balance = 1 - Math.min(1, Math.abs(junctions / open - ARCADE_JUNCTION_TARGET) / ARCADE_JUNCTION_TARGET);
  return 0.7 * balance + 0.3 * (1 - Math.min(1, deadEnds / 4));
}

/** Blancos repartidos por toda la pantalla: obliga a mover la mira en vez de esperar en un rincon. */
function scoreShooter(grid: Grid): number {
  const cols = 4;
  const rows = 3;
  const filled = new Set<number>();
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell !== "item" && cell !== "enemy") return;
    filled.add(Math.floor((y / grid.length) * rows) * cols + Math.floor((x / row.length) * cols));
  }));
  return filled.size / (cols * rows);
}

const CUSTOM_SCORES: Partial<Record<Layout, (grid: Grid) => number>> = {
  arcade: scoreArcade,
  shooter: scoreShooter,
  racing: scoreRacing,
  survival: (grid) => spread(grid, ["wall", "enemy"]),
  snake: (grid) => spread(grid, ["item"]),
  invaders: (grid) => Math.min(1, countCells(grid, "enemy") / 24),
  breakout: (grid) => spread(grid, ["item", "enemy", "trap", "power"]),
};

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
