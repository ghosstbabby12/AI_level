import { CellType } from "./types";

export interface Point {
  x: number;
  y: number;
}

export type Grid = CellType[][];

export function makeGrid(width: number, height: number, fill: CellType): Grid {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
}

export function inBounds(grid: Grid, x: number, y: number): boolean {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length;
}

export function neighbors4(p: Point): Point[] {
  return [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 },
  ];
}

export function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** BFS 4-direccional; devuelve distancias (-1 = inalcanzable). `blocked` decide que celdas no se pueden pisar. */
export function bfsDistances(
  grid: Grid,
  start: Point,
  blocked: (cell: CellType) => boolean = (cell) => cell === "wall"
): number[][] {
  const distances = grid.map((row) => row.map(() => -1));
  distances[start.y][start.x] = 0;
  const queue: Point[] = [start];

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    for (const n of neighbors4(current)) {
      if (inBounds(grid, n.x, n.y) && distances[n.y][n.x] === -1 && !blocked(grid[n.y][n.x])) {
        distances[n.y][n.x] = distances[current.y][current.x] + 1;
        queue.push(n);
      }
    }
  }
  return distances;
}

export function farthestCell(grid: Grid, distances: number[][], accept: (p: Point) => boolean = () => true): Point {
  let best: Point = { x: 1, y: 1 };
  let bestDistance = -1;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (distances[y][x] > bestDistance && accept({ x, y })) {
        bestDistance = distances[y][x];
        best = { x, y };
      }
    }
  }
  return best;
}

export function countCells(grid: Grid, type: CellType): number {
  return grid.reduce((sum, row) => sum + row.filter((cell) => cell === type).length, 0);
}

export function findCell(grid: Grid, type: CellType): Point | null {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === type) return { x, y };
    }
  }
  return null;
}
