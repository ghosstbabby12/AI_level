"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLevel = buildLevel;
exports.describe = describe;
exports.toGeneratedLevel = toGeneratedLevel;
const platformer_1 = require("./platformer");
const rng_1 = require("./rng");
const themes_1 = require("./themes");
const topDown_1 = require("./topDown");
const validator_1 = require("./validator");
const MAX_ATTEMPTS = 40;
const LAYOUT_LABEL = {
    platformer: "Plataformas de scroll lateral",
    maze: "Laberinto",
    dungeon: "Mazmorra con salas y pasillos",
};
const THEME_LABEL = {
    ice: "Hielo",
    lava: "Lava",
    forest: "Bosque",
    desert: "Desierto",
    dungeon: "Mazmorra de piedra",
    overworld: "Mundo abierto (cielo y pasto)",
    water: "Submarino",
    space: "Espacio",
};
const DIFFICULTY_LABEL = { easy: "Facil", normal: "Normal", hard: "Dificil" };
function attemptBuild(spec, attempt) {
    const rng = (0, rng_1.createRng)(spec.seed + attempt * 7919);
    if (spec.layout === "platformer") {
        const { grid, placed } = (0, platformer_1.buildPlatformer)(spec, rng);
        return (0, validator_1.validateLevel)(grid, spec) === null ? { grid, placed } : null;
    }
    const layout = spec.layout === "maze" ? (0, topDown_1.buildMazeLayout)(spec, rng) : (0, topDown_1.buildDungeonLayout)(spec, rng);
    if (!layout)
        return null;
    const placed = (0, topDown_1.populateTopDown)(layout, spec, rng);
    return (0, validator_1.validateLevel)(layout.grid, spec) === null ? { grid: layout.grid, placed } : null;
}
function buildLevel(spec) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const result = attemptBuild(spec, attempt);
        if (result)
            return result;
    }
    throw new Error("No se pudo generar un nivel valido con esa descripcion.");
}
function describe(spec, grid, placed) {
    const feature = (label, enabled, count) => enabled ? `${label}: ${count}` : `${label}: ninguno`;
    return [
        `Tipo: ${LAYOUT_LABEL[spec.layout]}`,
        `Tema: ${THEME_LABEL[spec.theme]}`,
        `Dificultad: ${DIFFICULTY_LABEL[spec.difficulty]}`,
        `Tamano: ${grid[0].length}x${grid.length}`,
        `Jefe final: ${spec.boss ? "si" : "no"}`,
        feature("Trampas", spec.traps.enabled, placed.traps),
        feature("Enemigos", spec.enemies.enabled, placed.enemies),
        feature("Objetos", spec.items.enabled, placed.items),
    ];
}
function toGeneratedLevel(id, spec, grid, placed, ascii) {
    return {
        id,
        description: spec.description,
        seed: spec.seed,
        theme: spec.theme,
        layout: spec.layout,
        difficulty: spec.difficulty,
        boss: spec.boss,
        width: grid[0].length,
        height: grid.length,
        grid,
        ascii,
        palette: themes_1.THEME_PALETTES[spec.theme],
        interpretation: describe(spec, grid, placed),
        createdAt: new Date().toISOString(),
    };
}
