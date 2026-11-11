import { CellType } from "./types";

/** One character per cell: a large circuit takes ~10 KB instead of ~90 KB as JSON. */
export const CELL_CODE: Record<CellType, string> = {
  wall: "#", floor: ".", start: "S", exit: "E", trap: "^", enemy: "M", item: "$", boss: "B", power: "P",
};

const CODE_CELL = Object.fromEntries(Object.entries(CELL_CODE).map(([cell, code]) => [code, cell])) as Record<string, CellType>;

export const isCellCode = (code: string): boolean => code in CODE_CELL;

export function encodeGrid(grid: CellType[][]): string[] {
  return grid.map((row) => row.map((cell) => CELL_CODE[cell]).join(""));
}

export function decodeGrid(rows: string[]): CellType[][] {
  return rows.map((row) => [...row].map((code) => CODE_CELL[code]));
}
