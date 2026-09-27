import { Grid, makeGrid, Point } from "./grid";
import { Rng } from "./rng";
import { Difficulty, FeatureSpec, LevelSpec, PlacedCounts } from "./types";

export interface PlatformerLayout {
  grid: Grid;
  placed: PlacedCounts;
}

interface Run {
  x0: number;
  x1: number;
  g: number;
}

interface Pit {
  x: number;
  width: number;
  groundBefore: number;
}

const PER_100_COLUMNS: Record<Difficulty, { traps: number; enemies: number; items: number }> = {
  easy: { traps: 5, enemies: 6, items: 16 },
  normal: { traps: 9, enemies: 10, items: 12 },
  hard: { traps: 15, enemies: 16, items: 8 },
};

function target(feature: FeatureSpec, width: number, per100: number): number {
  if (!feature.enabled) return 0;
  if (feature.count !== undefined) return feature.count;
  return Math.max(1, Math.round((width / 100) * per100 * feature.multiplier));
}


function pickSpots(lo: number, hi: number, spacing: number, max: number, rng: Rng): number[] {
  const spots: number[] = [];
  if (hi < lo) return spots;
  const candidates: number[] = [];
  for (let c = lo; c <= hi; c++) candidates.push(c);
  for (const c of rng.shuffle(candidates)) {
    if (spots.length >= max) break;
    if (spots.every((x) => Math.abs(x - c) >= spacing)) spots.push(c);
  }
  return spots;
}

/**
 * Nivel de plataformas de scroll lateral. Las fisicas del cliente permiten
 * saltar ~4 tiles de alto y ~5 de largo, asi que el terreno solo usa pozos de
 * hasta 3 tiles y escalones de hasta 2 de subida: siempre se puede completar.
 * `floor` = aire, `wall` = suelo/bloques solidos.
 */
export function buildPlatformer(spec: LevelSpec, rng: Rng): PlatformerLayout {
  const w = spec.width;
  const h = spec.height;
  const gMin = 6;
  const gMax = h - 3;
  const arenaLength = spec.boss ? 18 : 10;
  const arenaStart = w - arenaLength;

  const top: number[] = Array(w).fill(h);
  const runs: Run[] = [];
  const pits: Pit[] = [];

  let g = gMax;
  for (let x = 1; x < 8; x++) top[x] = g;
  let x = 8;

  while (x < arenaStart) {
    const roll = rng.next();
    if (roll < 0.2) {
      const pitWidth = spec.difficulty === "easy" ? 2 : rng.int(2, 3);
      if (x + pitWidth + 4 <= arenaStart) {
        pits.push({ x, width: pitWidth, groundBefore: g });
        x += pitWidth;
      }
    } else if (roll < 0.32) {
      const rise = rng.int(1, 2);
      if (g - rise >= gMin) g -= rise;
    } else if (roll < 0.44) {
      const drop = rng.int(1, 3);
      if (g + drop <= gMax) g += drop;
    }

    const length = Math.min(rng.int(5, 15), arenaStart - x);
    if (length <= 0) break;
    for (let i = 0; i < length; i++) top[x + i] = g;
    runs.push({ x0: x, x1: x + length - 1, g });
    x += length;
  }
  for (; x < w - 1; x++) top[x] = g;
  const groundEnd = g;

  const stretches: Run[] = [];
  for (let cx = 8; cx < arenaStart; ) {
    if (top[cx] >= h) {
      cx++;
      continue;
    }
    let end = cx;
    while (end + 1 < arenaStart && top[end + 1] === top[cx]) end++;
    stretches.push({ x0: cx, x1: end, g: top[cx] });
    cx = end + 1;
  }

  const grid = makeGrid(w, h, "floor");
  for (let cx = 0; cx < w; cx++) {
    for (let cy = 0; cy < h; cy++) {
      if (cx === 0 || cx === w - 1 || cy >= top[cx]) grid[cy][cx] = "wall";
    }
  }

  const isAir = (px: number, py: number) => py >= 0 && py < h && grid[py][px] === "floor";
  const placed: PlacedCounts = { traps: 0, enemies: 0, items: 0 };
  const groundOf = (px: number) => top[px];

  grid[gMax - 1][2] = "start";
  const exit: Point = { x: w - 3, y: groundEnd - 1 };
  grid[exit.y][exit.x] = "exit";
  if (spec.boss) grid[groundEnd - 1][w - 7] = "boss";

  const platformTiles: Point[] = [];
  for (const run of stretches) {
    const length = run.x1 - run.x0 + 1;
    if (length >= 6 && rng.chance(0.35)) {
      const platformWidth = rng.int(2, Math.min(4, length - 3));
      const px = rng.int(run.x0 + 1, run.x1 - platformWidth);
      for (let i = 0; i < platformWidth; i++) {
        grid[run.g - 3][px + i] = "wall";
        platformTiles.push({ x: px + i, y: run.g - 3 });
      }
    }
  }

  const trapTarget = target(spec.traps, w, PER_100_COLUMNS[spec.difficulty].traps);
  const trapColumns: number[] = [];
  trapStretches: for (const stretch of rng.shuffle(stretches.filter((r) => r.x1 - r.x0 + 1 >= 10))) {
    const maxGroups = Math.floor((stretch.x1 - stretch.x0 + 1) / 8);
    for (const sx of pickSpots(stretch.x0 + 5, stretch.x1 - 4, 7, maxGroups, rng)) {
      if (placed.traps >= trapTarget) break trapStretches;
      const spikeWidth = Math.min(rng.int(1, 2), trapTarget - placed.traps);
      for (let i = 0; i < spikeWidth; i++) {
        grid[stretch.g - 1][sx + i] = "trap";
        trapColumns.push(sx + i);
      }
      placed.traps += spikeWidth;
    }
  }

  const enemyTarget = target(spec.enemies, w, PER_100_COLUMNS[spec.difficulty].enemies);
  const segments: Run[] = [];
  for (const run of stretches) {
    let segmentStart = run.x0;
    for (let cx = run.x0; cx <= run.x1 + 1; cx++) {
      if (cx > run.x1 || trapColumns.includes(cx)) {
        if (cx - 1 >= segmentStart) segments.push({ x0: segmentStart, x1: cx - 1, g: run.g });
        segmentStart = cx + 1;
      }
    }
  }
  enemySegments: for (const segment of rng.shuffle(segments.filter((sg) => sg.x1 - sg.x0 + 1 >= 7))) {
    const afterSpikes = trapColumns.includes(segment.x0 - 1);
    const beforeSpikes = trapColumns.includes(segment.x1 + 1);
    const lo = segment.x0 + (afterSpikes ? 4 : 2);
    const hi = segment.x1 - (beforeSpikes ? 3 : 2);
    for (const ex of pickSpots(lo, hi, 4, Math.floor((segment.x1 - segment.x0 + 1) / 4), rng)) {
      if (placed.enemies >= enemyTarget) break enemySegments;
      grid[segment.g - 1][ex] = "enemy";
      placed.enemies++;
    }
  }
  if (spec.enemies.enabled && placed.enemies === 0) {
    grid[groundEnd - 1][spec.boss ? arenaStart + 3 : arenaStart + 2] = "enemy";
    placed.enemies++;
  }

  const itemTarget = target(spec.items, w, PER_100_COLUMNS[spec.difficulty].items);
  const coinGroups: Point[][] = [];
  for (const pit of pits) {
    const group: Point[] = [];
    for (let i = 0; i < pit.width; i++) group.push({ x: pit.x + i, y: pit.groundBefore - 3 });
    coinGroups.push(group);
  }
  for (const run of stretches) {
    if (run.x1 - run.x0 + 1 >= 5 && rng.chance(0.5)) {
      const count = rng.int(3, 4);
      const startX = rng.int(run.x0, run.x1 - count + 1);
      coinGroups.push(Array.from({ length: count }, (_, i) => ({ x: startX + i, y: run.g - 2 })));
    }
  }
  for (const tile of platformTiles) coinGroups.push([{ x: tile.x, y: tile.y - 1 }]);

  for (const group of rng.shuffle(coinGroups)) {
    if (placed.items >= itemTarget) break;
    for (const p of group) {
      if (isAir(p.x, p.y) && placed.items < itemTarget && groundOf(p.x) > p.y) {
        grid[p.y][p.x] = "item";
        placed.items++;
      }
    }
  }

  return { grid, placed };
}
