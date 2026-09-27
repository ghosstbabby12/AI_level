import { bfsDistances, farthestCell, Grid, makeGrid, manhattan, neighbors4, Point } from "./grid";
import { braid, generateMaze } from "./mazeGenerator";
import { Rng } from "./rng";
import { CellType, Difficulty, FeatureSpec, LevelSpec, PlacedCounts } from "./types";

export interface TopDownLayout {
  grid: Grid;
  start: Point;
  exit: Point;
  boss?: Point;
}

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

const center = (r: Room): Point => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

function carveRect(grid: Grid, x0: number, y0: number, w: number, h: number): Point[] {
  const cells: Point[] = [];
  for (let y = Math.max(1, y0); y < Math.min(grid.length - 1, y0 + h); y++) {
    for (let x = Math.max(1, x0); x < Math.min(grid[0].length - 1, x0 + w); x++) {
      grid[y][x] = "floor";
      cells.push({ x, y });
    }
  }
  return cells;
}

export function buildMazeLayout(spec: LevelSpec, rng: Rng): TopDownLayout {
  const grid = generateMaze(spec.width, spec.height, rng);
  braid(grid, rng, 0.08);
  const w = grid[0].length;
  const h = grid.length;
  const start = { x: 1, y: 1 };

  if (spec.boss) {
    carveRect(grid, w - 6, h - 6, 5, 5);
    return { grid, start, exit: { x: w - 2, y: h - 2 }, boss: { x: w - 4, y: h - 4 } };
  }

  const distances = bfsDistances(grid, start);
  return { grid, start, exit: farthestCell(grid, distances) };
}

function carveCorridor(grid: Grid, a: Point, b: Point, rng: Rng): void {
  const horizontalFirst = rng.chance(0.5);
  const carveH = (y: number, x1: number, x2: number) => {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) grid[y][x] = "floor";
  };
  const carveV = (x: number, y1: number, y2: number) => {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) grid[y][x] = "floor";
  };
  if (horizontalFirst) {
    carveH(a.y, a.x, b.x);
    carveV(b.x, a.y, b.y);
  } else {
    carveV(a.x, a.y, b.y);
    carveH(b.y, a.x, b.x);
  }
}

export function buildDungeonLayout(spec: LevelSpec, rng: Rng): TopDownLayout | null {
  const w = spec.width;
  const h = spec.height;
  const grid = makeGrid(w, h, "wall");
  const maxRooms = Math.max(5, Math.floor((w * h) / 90));
  const rooms: Room[] = [];

  for (let attempt = 0; attempt < 400 && rooms.length < maxRooms; attempt++) {
    const rw = rng.int(4, 9);
    const rh = rng.int(4, 7);
    const room: Room = { x: rng.int(1, w - rw - 1), y: rng.int(1, h - rh - 1), w: rw, h: rh };
    const overlaps = rooms.some(
      (r) => !(room.x + room.w + 1 < r.x || r.x + r.w + 1 < room.x || room.y + room.h + 1 < r.y || r.y + r.h + 1 < room.y)
    );
    if (!overlaps) rooms.push(room);
  }
  if (rooms.length < 4) return null;

  for (const room of rooms) carveRect(grid, room.x, room.y, room.w, room.h);

  for (let i = 1; i < rooms.length; i++) {
    const c = center(rooms[i]);
    let nearest = 0;
    for (let j = 1; j < i; j++) {
      if (manhattan(c, center(rooms[j])) < manhattan(c, center(rooms[nearest]))) nearest = j;
    }
    carveCorridor(grid, c, center(rooms[nearest]), rng);
  }
  for (let i = 0; i < Math.floor(rooms.length / 3); i++) {
    const [a, b] = rng.shuffle(rooms);
    carveCorridor(grid, center(a), center(b), rng);
  }

  const farthestRoomFrom = (from: Point): Room => {
    const distances = bfsDistances(grid, from);
    return rooms.reduce((best, r) => {
      const c = center(r);
      const bc = center(best);
      return distances[c.y][c.x] > distances[bc.y][bc.x] ? r : best;
    });
  };

  const startRoom = farthestRoomFrom(center(rooms[0]));
  const start = center(startRoom);
  const endRoom = farthestRoomFrom(start);
  const endCenter = center(endRoom);
  if (endRoom === startRoom) return null;

  if (!spec.boss) {
    const distances = bfsDistances(grid, start);
    return { grid, start, exit: farthestCell(grid, distances) };
  }

  const arena = carveRect(grid, endCenter.x - 4, endCenter.y - 3, 9, 7);
  const distances = bfsDistances(grid, start);
  const arenaSet = new Set(arena.map((p) => `${p.x},${p.y}`));
  const exit = farthestCell(
    grid,
    distances,
    (p) => arenaSet.has(`${p.x},${p.y}`) && manhattan(p, endCenter) >= 2
  );
  return { grid, start, exit, boss: endCenter };
}

const DENSITY: Record<Difficulty, { traps: number; enemies: number; items: number }> = {
  easy: { traps: 0.02, enemies: 0.015, items: 0.03 },
  normal: { traps: 0.04, enemies: 0.03, items: 0.03 },
  hard: { traps: 0.07, enemies: 0.05, items: 0.025 },
};

function target(feature: FeatureSpec, floorCount: number, density: number): number {
  if (!feature.enabled) return 0;
  if (feature.count !== undefined) return feature.count;
  return Math.max(1, Math.round(floorCount * density * feature.multiplier));
}

function isDeadEnd(grid: Grid, p: Point): boolean {
  return neighbors4(p).filter((n) => grid[n.y]?.[n.x] !== undefined && grid[n.y][n.x] !== "wall").length === 1;
}

/** Coloca inicio, salida, jefe, trampas, enemigos y objetos; las trampas nunca cortan todos los caminos a la salida. */
export function populateTopDown(layout: TopDownLayout, spec: LevelSpec, rng: Rng): PlacedCounts {
  const { grid, start, exit, boss } = layout;
  grid[start.y][start.x] = "start";
  grid[exit.y][exit.x] = "exit";
  if (boss) grid[boss.y][boss.x] = "boss";

  const floorCells = (): Point[] => {
    const cells: Point[] = [];
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] === "floor") cells.push({ x, y });
      }
    }
    return cells;
  };

  const total = floorCells().length;
  const density = DENSITY[spec.difficulty];
  const safe = (p: Point) =>
    manhattan(p, start) > 4 && manhattan(p, exit) > 1 && (!boss || manhattan(p, boss) > 3);

  const placed: PlacedCounts = { traps: 0, enemies: 0, items: 0 };
  const blocksExit = (cell: CellType) => cell === "wall" || cell === "trap";

  const trapTarget = target(spec.traps, total, density.traps);
  for (const p of rng.shuffle(floorCells().filter(safe))) {
    if (placed.traps >= trapTarget) break;
    grid[p.y][p.x] = "trap";
    const reachable = bfsDistances(grid, start, blocksExit)[exit.y][exit.x] !== -1;
    if (reachable) placed.traps++;
    else grid[p.y][p.x] = "floor";
  }

  const enemyTarget = target(spec.enemies, total, density.enemies);
  const enemies: Point[] = [];
  for (const p of rng.shuffle(floorCells().filter(safe))) {
    if (placed.enemies >= enemyTarget) break;
    if (enemies.some((e) => manhattan(e, p) < 3)) continue;
    grid[p.y][p.x] = "enemy";
    enemies.push(p);
    placed.enemies++;
  }

  const itemTarget = target(spec.items, total, density.items);
  const candidates = floorCells().filter((p) => manhattan(p, start) > 1 && manhattan(p, exit) > 1);
  const deadEnds = rng.shuffle(candidates.filter((p) => isDeadEnd(grid, p)));
  const others = rng.shuffle(candidates.filter((p) => !isDeadEnd(grid, p)));
  for (const p of [...deadEnds, ...others]) {
    if (placed.items >= itemTarget) break;
    grid[p.y][p.x] = "item";
    placed.items++;
  }

  return placed;
}
