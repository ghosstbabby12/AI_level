import { Grid, makeGrid } from "./grid";
import { Rng } from "./rng";

/**
 * Laberinto perfecto por recursive backtracker sobre una grilla de tamano impar.
 * Las celdas de indice impar son salas y se conectan abriendo la pared entre ellas.
 */
export function generateMaze(width: number, height: number, rng: Rng): Grid {
  const w = width % 2 === 0 ? width + 1 : width;
  const h = height % 2 === 0 ? height + 1 : height;
  const grid = makeGrid(w, h, "wall");

  const cols = (w - 1) / 2;
  const rows = (h - 1) / 2;
  const visited = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const toGrid = (cx: number, cy: number) => ({ x: cx * 2 + 1, y: cy * 2 + 1 });

  const stack: Array<[number, number]> = [[0, 0]];
  visited[0][0] = true;
  grid[1][1] = "floor";

  const directions = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];

  while (stack.length > 0) {
    const [cx, cy] = stack[stack.length - 1];
    const options: Array<[number, number]> = [];
    for (const [dx, dy] of directions) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !visited[ny][nx]) options.push([nx, ny]);
    }

    if (options.length === 0) {
      stack.pop();
      continue;
    }

    const [nx, ny] = rng.pick(options);
    const current = toGrid(cx, cy);
    const next = toGrid(nx, ny);
    grid[(current.y + next.y) / 2][(current.x + next.x) / 2] = "floor";
    grid[next.y][next.x] = "floor";
    visited[ny][nx] = true;
    stack.push([nx, ny]);
  }

  return grid;
}

/** Abre una fraccion de paredes que separan dos pasillos para crear rutas alternativas (asi las trampas se pueden esquivar). */
export function braid(grid: Grid, rng: Rng, ratio: number): void {
  const candidates: Array<[number, number]> = [];
  for (let y = 1; y < grid.length - 1; y++) {
    for (let x = 1; x < grid[0].length - 1; x++) {
      if (grid[y][x] !== "wall") continue;
      const horizontal = grid[y][x - 1] === "floor" && grid[y][x + 1] === "floor";
      const vertical = grid[y - 1][x] === "floor" && grid[y + 1][x] === "floor";
      if (horizontal !== vertical) candidates.push([x, y]);
    }
  }
  const toOpen = Math.round(candidates.length * ratio);
  for (const [x, y] of rng.shuffle(candidates).slice(0, toOpen)) {
    grid[y][x] = "floor";
  }
}
