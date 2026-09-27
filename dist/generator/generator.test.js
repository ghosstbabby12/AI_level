"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const grid_1 = require("./grid");
const levelBuilder_1 = require("./levelBuilder");
const parser_1 = require("./parser");
const validator_1 = require("./validator");
const PROMPTS = [
    "genera un mapa tipo Mario bros, esquivar trampas, diseño pixelado y un final con un final Boss",
    "un laberinto de hielo con trampas",
    "un laberinto grande de lava con muchos enemigos, dificil",
    "mazmorra oscura con salas, 5 trampas y jefe final",
    "plataformas en el espacio, dificil, sin trampas",
    "nivel facil de bosque con monedas y sin enemigos",
    "underwater platformer with 8 enemies and a boss",
    "desierto pequeño",
    "",
];
(0, node_test_1.test)("el parser entiende el prompt de Mario con jefe", () => {
    const spec = (0, parser_1.parseDescription)(PROMPTS[0], 1);
    strict_1.default.equal(spec.layout, "platformer");
    strict_1.default.equal(spec.theme, "overworld");
    strict_1.default.equal(spec.boss, true);
    strict_1.default.equal(spec.traps.enabled, true);
    strict_1.default.equal(spec.items.enabled, true);
});
(0, node_test_1.test)("el parser respeta negaciones, cantidades y tamaños", () => {
    const spec = (0, parser_1.parseDescription)("mazmorra con 5 trampas, sin enemigos, 41x27", 1);
    strict_1.default.equal(spec.layout, "dungeon");
    strict_1.default.equal(spec.traps.count, 5);
    strict_1.default.equal(spec.enemies.enabled, false);
    strict_1.default.equal(spec.width, 41);
    strict_1.default.equal(spec.height, 27);
    strict_1.default.equal((0, parser_1.parseDescription)("un laberinto de hielo", 1).theme, "ice");
    strict_1.default.equal((0, parser_1.parseDescription)("mario", 1).theme, "overworld");
});
(0, node_test_1.test)("todos los niveles generados son validos y cumplen lo pedido", () => {
    for (const prompt of PROMPTS) {
        for (let seed = 1; seed <= 60; seed++) {
            const spec = (0, parser_1.parseDescription)(prompt, seed);
            const { grid, placed } = (0, levelBuilder_1.buildLevel)(spec);
            const label = `"${prompt}" seed=${seed}`;
            strict_1.default.equal((0, validator_1.validateLevel)(grid, spec), null, label);
            strict_1.default.equal((0, grid_1.countCells)(grid, "boss"), spec.boss ? 1 : 0, label);
            strict_1.default.equal((0, grid_1.countCells)(grid, "trap"), placed.traps, label);
            strict_1.default.equal((0, grid_1.countCells)(grid, "enemy"), placed.enemies, label);
            strict_1.default.equal((0, grid_1.countCells)(grid, "item"), placed.items, label);
            if (!spec.traps.enabled)
                strict_1.default.equal(placed.traps, 0, label);
            if (!spec.enemies.enabled)
                strict_1.default.equal(placed.enemies, 0, label);
            if (spec.enemies.enabled)
                strict_1.default.ok(placed.enemies > 0, `${label} sin enemigos`);
        }
    }
});
(0, node_test_1.test)("la misma semilla produce el mismo nivel", () => {
    const a = (0, levelBuilder_1.buildLevel)((0, parser_1.parseDescription)(PROMPTS[0], 42));
    const b = (0, levelBuilder_1.buildLevel)((0, parser_1.parseDescription)(PROMPTS[0], 42));
    strict_1.default.deepEqual(a.grid, b.grid);
});
(0, node_test_1.test)("las cantidades explicitas se respetan cuando hay espacio", () => {
    const { placed } = (0, levelBuilder_1.buildLevel)((0, parser_1.parseDescription)("mazmorra grande con 5 trampas y 7 enemigos", 3));
    strict_1.default.equal(placed.traps, 5);
    strict_1.default.equal(placed.enemies, 7);
});
