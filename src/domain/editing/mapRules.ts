import { describe } from "../generation/describeLevel";
import { validateLevel } from "../generation/validator";
import { countCells, findCell, Grid } from "../level/grid";
import { decodeGrid, isCellCode } from "../level/gridCodec";
import { ChainedLevel } from "../level/types";
import { specFromLevel } from "../progression/specFromLevel";
import { renderAscii } from "../rendering/asciiRenderer";
import { fail, ok, Result } from "../shared/result";
import { EDITABLE_CELLS, FIXED_START, FRIENDLY_PROBLEMS, MAX_ENEMIES } from "./editableCells";

const rowsFail = (error: string) => fail<ChainedLevel>(error, "rows");

/** Same size as the original and only known cell codes. */
function decodeRows(level: ChainedLevel, rows: unknown): Result<Grid> {
  const h = level.grid.length;
  const w = level.grid[0].length;
  const sameSize = Array.isArray(rows) && rows.length === h && rows.every((row) => typeof row === "string" && row.length === w);
  if (!sameSize) return fail(`El mapa debe medir ${w}×${h}, como el original.`, "rows");
  if ((rows as string[]).some((row) => [...row].some((code) => !isCellCode(code)))) return fail("El mapa tiene casillas desconocidas.", "rows");
  return ok(decodeGrid(rows as string[]));
}

/** Only cells the style can draw, and the border stays untouched (games never look outside the map). */
function checkCells(level: ChainedLevel, grid: Grid): string | null {
  const allowed = EDITABLE_CELLS[level.layout]!;
  const h = grid.length;
  const w = grid[0].length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const before = level.grid[y][x];
      if (grid[y][x] === before) continue;
      if (!allowed.includes(grid[y][x])) return "Este estilo no usa una de las casillas que pusiste.";
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return "El borde del mapa no se puede cambiar.";
    }
  }
  return null;
}

function checkStart(level: ChainedLevel, grid: Grid): string | null {
  if (!FIXED_START.includes(level.layout)) return null;
  const was = findCell(level.grid, "start");
  const now = findCell(grid, "start");
  const same = countCells(grid, "start") === 1 && was && now && was.x === now.x && was.y === now.y;
  return same ? null : "En este estilo el jugador sale siempre del mismo sitio: no muevas el inicio.";
}

function withGrid(level: ChainedLevel, grid: Grid, boss: boolean): ChainedLevel {
  const spec = { ...specFromLevel(level), boss };
  const counts = { traps: countCells(grid, "trap"), enemies: countCells(grid, "enemy"), items: countCells(grid, "item") };
  const chips = describe(spec, grid, counts, level.params);
  return {
    ...level,
    grid,
    ascii: renderAscii(grid, level.theme, level.layout),
    boss,
    counts,
    spec: level.spec ? { ...level.spec, boss } : undefined,
    interpretation: level.stage ? [`Nivel: ${level.stage}`, ...chips] : chips,
  };
}

/** Checks the edited map (rows encoded as stored in the database) and returns the updated level. */
export function applyGrid(level: ChainedLevel, rows: unknown): Result<ChainedLevel> {
  if (!EDITABLE_CELLS[level.layout]) return rowsFail("El mapa de este estilo no se puede editar; sí el título y la historia.");
  const decoded = decodeRows(level, rows);
  if (!decoded.ok) return decoded;
  const grid = decoded.value;

  const problem = checkCells(level, grid) ?? checkStart(level, grid);
  if (problem) return rowsFail(problem);
  const bosses = countCells(grid, "boss");
  if (bosses > 1) return rowsFail("Solo puede haber un jefe.");
  if (countCells(grid, "enemy") > MAX_ENEMIES) return rowsFail(`Demasiados enemigos (máximo ${MAX_ENEMIES}).`);

  const unplayable = validateLevel(grid, { ...specFromLevel(level), boss: bosses === 1 });
  if (unplayable) return rowsFail(FRIENDLY_PROBLEMS[unplayable] ?? "Ese mapa no se puede jugar: revisa el inicio, la salida y los caminos.");
  return ok(withGrid(level, grid, bosses === 1));
}
