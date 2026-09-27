"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeGrid = makeGrid;
exports.inBounds = inBounds;
exports.neighbors4 = neighbors4;
exports.manhattan = manhattan;
exports.bfsDistances = bfsDistances;
exports.farthestCell = farthestCell;
exports.countCells = countCells;
exports.findCell = findCell;
function makeGrid(width, height, fill) {
    return Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
}
function inBounds(grid, x, y) {
    return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length;
}
function neighbors4(p) {
    return [
        { x: p.x + 1, y: p.y },
        { x: p.x - 1, y: p.y },
        { x: p.x, y: p.y + 1 },
        { x: p.x, y: p.y - 1 },
    ];
}
function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
/** BFS 4-direccional; devuelve distancias (-1 = inalcanzable). `blocked` decide que celdas no se pueden pisar. */
function bfsDistances(grid, start, blocked = (cell) => cell === "wall") {
    const distances = grid.map((row) => row.map(() => -1));
    distances[start.y][start.x] = 0;
    const queue = [start];
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
function farthestCell(grid, distances, accept = () => true) {
    let best = { x: 1, y: 1 };
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
function countCells(grid, type) {
    return grid.reduce((sum, row) => sum + row.filter((cell) => cell === type).length, 0);
}
function findCell(grid, type) {
    for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[y].length; x++) {
            if (grid[y][x] === type)
                return { x, y };
        }
    }
    return null;
}
