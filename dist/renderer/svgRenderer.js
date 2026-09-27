"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderSvg = renderSvg;
const themes_1 = require("../generator/themes");
const CELL_FILL = {
    start: "#22c55e",
    exit: "#3b82f6",
    trap: "#f97316",
    enemy: "#dc2626",
    item: "#eab308",
    boss: "#7e22ce",
};
const CELL_LABEL = {
    start: "S",
    exit: "E",
    trap: "!",
    enemy: "M",
    item: "$",
    boss: "B",
};
const TILE_SIZE = 20;
function renderSvg(grid, theme, layout) {
    const palette = themes_1.THEME_PALETTES[theme];
    const height = grid.length;
    const width = grid[0].length;
    const svgWidth = width * TILE_SIZE;
    const svgHeight = height * TILE_SIZE;
    const airColor = layout === "platformer" ? palette.sky[0] : palette.floor;
    const tiles = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = grid[y][x];
            const px = x * TILE_SIZE;
            const py = y * TILE_SIZE;
            if (cell === "wall") {
                tiles.push(`<rect x="${px}" y="${py}" width="${TILE_SIZE}" height="${TILE_SIZE}" fill="${palette.wall}" stroke="${palette.wallAccent}" stroke-width="0.5" />`);
                continue;
            }
            tiles.push(`<rect x="${px}" y="${py}" width="${TILE_SIZE}" height="${TILE_SIZE}" fill="${airColor}" />`);
            const fill = CELL_FILL[cell];
            const label = CELL_LABEL[cell];
            if (fill && label) {
                const cx = px + TILE_SIZE / 2;
                const cy = py + TILE_SIZE / 2;
                tiles.push(`<circle cx="${cx}" cy="${cy}" r="${TILE_SIZE * 0.38}" fill="${fill}" />`, `<text x="${cx}" y="${cy}" font-size="${TILE_SIZE * 0.55}" font-family="monospace" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${label}</text>`);
            }
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="${palette.wall}" />
  ${tiles.join("\n  ")}
</svg>`;
}
