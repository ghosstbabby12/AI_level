import assert from "node:assert/strict";
import { test } from "node:test";
import { countCells } from "./grid";
import { buildLevel } from "./levelBuilder";
import { parseDescriptionKeywords as parseDescription } from "./keywordParser";
import { validateLevel } from "./validator";

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

test("el parser entiende el prompt de Mario con jefe", () => {
  const spec = parseDescription(PROMPTS[0], 1);
  assert.equal(spec.layout, "platformer");
  assert.equal(spec.theme, "overworld");
  assert.equal(spec.boss, true);
  assert.equal(spec.traps.enabled, true);
  assert.equal(spec.items.enabled, true);
});

test("el parser respeta negaciones, cantidades y tamaños", () => {
  const spec = parseDescription("mazmorra con 5 trampas, sin enemigos, 41x27", 1);
  assert.equal(spec.layout, "dungeon");
  assert.equal(spec.traps.count, 5);
  assert.equal(spec.enemies.enabled, false);
  assert.equal(spec.width, 41);
  assert.equal(spec.height, 27);
  assert.equal(parseDescription("un laberinto de hielo", 1).theme, "ice");
  assert.equal(parseDescription("mario", 1).theme, "overworld");
});

test("todos los niveles generados son validos y cumplen lo pedido", () => {
  for (const prompt of PROMPTS) {
    for (let seed = 1; seed <= 60; seed++) {
      const spec = parseDescription(prompt, seed);
      const { grid, placed } = buildLevel(spec);
      const label = `"${prompt}" seed=${seed}`;

      assert.equal(validateLevel(grid, spec), null, label);
      assert.equal(countCells(grid, "boss"), spec.boss ? 1 : 0, label);
      assert.equal(countCells(grid, "trap"), placed.traps, label);
      assert.equal(countCells(grid, "enemy"), placed.enemies, label);
      assert.equal(countCells(grid, "item"), placed.items, label);
      if (!spec.traps.enabled) assert.equal(placed.traps, 0, label);
      if (!spec.enemies.enabled) assert.equal(placed.enemies, 0, label);
      if (spec.enemies.enabled) assert.ok(placed.enemies > 0, `${label} sin enemigos`);
    }
  }
});

test("la misma semilla produce el mismo nivel", () => {
  const a = buildLevel(parseDescription(PROMPTS[0], 42));
  const b = buildLevel(parseDescription(PROMPTS[0], 42));
  assert.deepEqual(a.grid, b.grid);
});

test("las cantidades explicitas se respetan cuando hay espacio", () => {
  const { placed } = buildLevel(parseDescription("mazmorra grande con 5 trampas y 7 enemigos", 3));
  assert.equal(placed.traps, 5);
  assert.equal(placed.enemies, 7);
});
