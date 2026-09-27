"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderAscii = renderAscii;
const THEME_WALL_EMOJI = {
    ice: "🧊",
    lava: "🟥",
    forest: "🌲",
    desert: "🟨",
    dungeon: "🧱",
    overworld: "🟫",
    water: "🟦",
    space: "⬛",
};
const SYMBOLS = {
    start: "🟢",
    exit: "🚪",
    trap: "⚠️",
    enemy: "👹",
    item: "💎",
    boss: "🐲",
};
function renderAscii(grid, theme, layout) {
    const wall = THEME_WALL_EMOJI[theme];
    const air = layout === "platformer" ? "🟦" : "⬜";
    return grid
        .map((row) => row.map((cell) => (cell === "wall" ? wall : cell === "floor" ? air : SYMBOLS[cell])).join(""))
        .join("\n");
}
