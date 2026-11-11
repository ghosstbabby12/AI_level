import { Grid, makeGrid, Point } from "../../level/grid";
import { Rng } from "../../level/rng";
import { BuildResult, Difficulty, LevelSpec } from "../../level/types";

const RIVALS: Record<Difficulty, number> = { easy: 2, normal: 3, hard: 4 };
const OIL: Record<Difficulty, number> = { easy: 2, normal: 4, hard: 7 };
const CONTROL_POINTS = 14;
const TRACK_RADIUS = 3;
const MAX_RIVALS = 6;
const DEFAULT_LAPS = 3;
const CLEAR_AROUND_START = 14;

/** Interpolates a closed curve through the control points (Catmull-Rom). */
function closedCurve(points: Array<{ x: number; y: number }>, samples: number): Array<{ x: number; y: number }> {
  const n = points.length;
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [points[(i - 1 + n) % n], points[i], points[(i + 1) % n], points[(i + 2) % n]];
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return out;
}

/** Closed circuit: a curve around the centre never crosses itself. */
export function buildRacing(spec: LevelSpec, rng: Rng): BuildResult | null {
  const { width, height } = spec;
  const cx = width / 2;
  const cy = height / 2;
  const marginX = cx - TRACK_RADIUS - 3;
  const marginY = cy - TRACK_RADIUS - 3;

  const controls = Array.from({ length: CONTROL_POINTS }, (_, i) => {
    const angle = (i / CONTROL_POINTS) * Math.PI * 2;
    const radius = rng.next() * 0.45 + 0.55;
    return { x: cx + Math.cos(angle) * marginX * radius, y: cy + Math.sin(angle) * marginY * radius };
  });
  const curve = closedCurve(controls, 24);
  if (curve.some((p) => p.x < TRACK_RADIUS + 1 || p.y < TRACK_RADIUS + 1 || p.x > width - TRACK_RADIUS - 2 || p.y > height - TRACK_RADIUS - 2)) return null;

  const grid: Grid = makeGrid(width, height, "wall");
  for (const p of curve) {
    for (let y = -TRACK_RADIUS; y <= TRACK_RADIUS; y++) {
      for (let x = -TRACK_RADIUS; x <= TRACK_RADIUS; x++) {
        if (x * x + y * y <= TRACK_RADIUS * TRACK_RADIUS + 1) grid[Math.round(p.y) + y][Math.round(p.x) + x] = "floor";
      }
    }
  }

  // Route: one cell per step; rivals follow it and laps are counted along it.
  const route: Point[] = [];
  for (const p of curve) {
    const q = { x: Math.round(p.x), y: Math.round(p.y) };
    const last = route[route.length - 1];
    if (!last || last.x !== q.x || last.y !== q.y) route.push(q);
  }

  const start = route[0];
  grid[start.y][start.x] = "start";

  // Rivals start right behind the finish line, staggered.
  const rivalCount = spec.enemies.enabled ? Math.min(spec.enemies.count ?? RIVALS[spec.difficulty], MAX_RIVALS) : 0;
  let rivals = 0;
  for (let i = 0; i < rivalCount; i++) {
    const p = route[(route.length - 3 - i * 3) % route.length];
    if (grid[p.y][p.x] === "floor") {
      grid[p.y][p.x] = "enemy";
      rivals++;
    }
  }

  // Boosts and oil, spread along the track and away from the start.
  const onTrack = (from: number, count: number, cell: "item" | "trap"): number => {
    let placed = 0;
    const step = Math.floor((route.length - CLEAR_AROUND_START * 2) / Math.max(1, count));
    for (let i = 0; i < count; i++) {
      // The start area stays clear: nobody should start on oil.
      const p = route[CLEAR_AROUND_START + (from + i * step) % (route.length - CLEAR_AROUND_START * 2)];
      const side = rng.int(-1, 1);
      const q = { x: p.x + side, y: p.y + rng.int(-1, 1) };
      if (grid[q.y]?.[q.x] === "floor") {
        grid[q.y][q.x] = cell;
        placed++;
      }
    }
    return placed;
  };
  const items = spec.items.enabled || !spec.items.count ? onTrack(15, spec.items.count ?? 4, "item") : 0;
  const traps = spec.traps.enabled ? onTrack(30, spec.traps.count ?? OIL[spec.difficulty], "trap") : 0;

  return {
    grid,
    placed: { traps, enemies: rivals, items },
    route,
    params: { laps: spec.rounds ?? DEFAULT_LAPS },
  };
}
