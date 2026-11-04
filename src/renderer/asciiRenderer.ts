import { CellType, Layout, Theme } from "../generator/types";

const THEME_WALL_EMOJI: Record<Theme, string> = {
  ice: "🧊",
  lava: "🟥",
  forest: "🌲",
  desert: "🟨",
  dungeon: "🧱",
  overworld: "🟫",
  water: "🟦",
  space: "⬛",
};

const SYMBOLS: Record<Exclude<CellType, "wall" | "floor">, string> = {
  start: "🟢",
  exit: "🚪",
  trap: "⚠️",
  enemy: "👹",
  item: "💎",
  boss: "🐲",
  power: "⭐",
};

export function renderAscii(grid: CellType[][], theme: Theme, layout: Layout): string {
  const wall = THEME_WALL_EMOJI[theme];
  const air = layout === "platformer" || layout === "shooter" ? "🟦" : "⬜";
  return grid
    .map((row) => row.map((cell) => (cell === "wall" ? wall : cell === "floor" ? air : SYMBOLS[cell])).join(""))
    .join("\n");
}
