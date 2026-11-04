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

test("rechaza textos que no piden un nivel, con un motivo", async () => {
  // Sin API key: se prueba la validacion local, sin llamadas de red.
  delete process.env.ANTHROPIC_API_KEY;
  const { parseDescription: parseFull } = await import("./parser");

  const rejected = ["cuando fue la guerra mundial", "hola, como estas?", "ab", "12345 !!!", "asdfg qwrty", "aaaaaaaaaa"];
  for (const text of rejected) {
    const result = await parseFull(text, 1);
    assert.equal(result.ok, false, `debio rechazar: "${text}"`);
    if (!result.ok) assert.ok(result.reason.length > 10, `sin motivo para: "${text}"`);
  }

  const accepted = ["un laberinto de hielo con trampas", "nivel ambientado en la segunda guerra mundial", "jefe final dificil", "desierto pequeño"];
  for (const text of accepted) {
    const result = await parseFull(text, 1);
    assert.equal(result.ok, true, `debio aceptar: "${text}"`);
  }
});

test("elige el mejor candidato y acompana el nivel con narrativa", async () => {
  const { toGeneratedLevel } = await import("./levelBuilder");
  for (const prompt of ["mazmorra con jefe final, dificil", "un laberinto de hielo con trampas", "plataformas en el espacio"]) {
    const spec = parseDescription(prompt, 3);
    const built = buildLevel(spec);
    assert.ok(built.quality >= 0 && built.quality <= 100, `calidad fuera de rango: ${built.quality}`);

    const level = toGeneratedLevel("id", spec, built, "");
    assert.ok(level.narrative.title.length > 0, "sin titulo");
    assert.ok(level.narrative.story.length > 0, "sin historia");
    assert.equal(level.narrative.bossLine !== null, spec.boss, `frase del jefe incoherente en "${prompt}"`);
    assert.deepEqual(toGeneratedLevel("id", spec, buildLevel(spec), "").narrative, level.narrative, "la narrativa no es deterministica");
  }
});

test("detecta el aspecto de objetos, enemigos y jefe", async () => {
  const { detectKinds } = await import("./keywordParser");
  assert.deepEqual(detectKinds("juego de recoleccion de armas y enemigos random"), { item: "weapon", enemy: "mixed", boss: "monster" });
  assert.deepEqual(detectKinds("mansion embrujada con fantasmas y un vampiro como jefe"), { item: "coin", enemy: "ghost", boss: "vampire" });
  assert.deepEqual(detectKinds("cripta de esqueletos con llaves y un dragon"), { item: "key", enemy: "skeleton", boss: "dragon" });
  assert.deepEqual(detectKinds("estacion espacial con robots y pociones"), { item: "potion", enemy: "robot", boss: "monster" });

  const spec = parseDescription("juego de recoleccion de armas y enemigos", 1);
  assert.equal(spec.items.enabled, true, "pedir armas debe activar los objetos");
});

test("genera tableros arcade simetricos, conectados y sin callejones", () => {
  for (const prompt of ["nivel tipo pacman", "arcade grande con jefe final, dificil", "comecocos con fantasmas pequeño"]) {
    for (let seed = 1; seed <= 25; seed++) {
      const spec = parseDescription(prompt, seed);
      assert.equal(spec.layout, "arcade", prompt);
      const { grid, placed } = buildLevel(spec);
      const label = `"${prompt}" seed=${seed}`;
      const width = grid[0].length;

      assert.equal(validateLevel(grid, spec), null, label);
      assert.ok(placed.items > 50, `${label}: pocos puntos (${placed.items})`);
      assert.equal(countCells(grid, "power"), 4, label);
      assert.equal(countCells(grid, "trap"), 0, label);
      assert.equal(countCells(grid, "exit"), 0, label);
      assert.equal(countCells(grid, "boss"), spec.boss ? 1 : 0, label);
      assert.ok(placed.enemies >= 3, label);

      const open = (x: number, y: number) => grid[y]?.[x] !== undefined && grid[y][x] !== "wall";
      for (let y = 1; y < grid.length - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          assert.equal(open(x, y), open(width - 1 - x, y), `${label}: asimetrico en ${x},${y}`);
          if (!open(x, y)) continue;
          const exits = [open(x + 1, y), open(x - 1, y), open(x, y + 1), open(x, y - 1)].filter(Boolean).length;
          assert.ok(exits >= 2, `${label}: callejon en ${x},${y}`);
        }
      }
      const tunnels = grid.filter((row) => row[0] !== "wall" && row[width - 1] !== "wall");
      assert.equal(tunnels.length, 1, `${label}: debe haber un tunel`);
    }
  }
});

test("genera cuevas organicas validas", () => {
  for (const prompt of ["cuevas de hielo con trampas", "mina abandonada con jefe final, dificil", "caverna pequeña con monedas"]) {
    for (let seed = 1; seed <= 25; seed++) {
      const spec = parseDescription(prompt, seed);
      assert.equal(spec.layout, "cave", prompt);
      const { grid, placed } = buildLevel(spec);
      const label = `"${prompt}" seed=${seed}`;
      assert.equal(validateLevel(grid, spec), null, label);
      assert.equal(countCells(grid, "trap"), placed.traps, label);
      assert.equal(countCells(grid, "boss"), spec.boss ? 1 : 0, label);
    }
  }
});

test("tiro al blanco genera una galeria y respeta lo pedido", () => {
  for (const prompt of ["tiro al blanco", "galeria de tiro dificil con jefe final", "disparar a dianas en el espacio"]) {
    for (let seed = 1; seed <= 25; seed++) {
      const spec = parseDescription(prompt, seed);
      assert.equal(spec.layout, "shooter", prompt);
      const { grid, placed } = buildLevel(spec);
      const label = `"${prompt}" seed=${seed}`;
      assert.equal(validateLevel(grid, spec), null, label);
      assert.ok(placed.items >= 10, `${label}: pocas dianas (${placed.items})`);
      assert.equal(countCells(grid, "item"), placed.items, label);
      assert.equal(countCells(grid, "boss"), spec.boss ? 1 : 0, label);
    }
  }
  const counted = buildLevel(parseDescription("tiro al blanco con 12 dianas, sin bombas", 1));
  assert.equal(counted.placed.items, 12);
});

test("un genero que no existe se rechaza en vez de sustituirse", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const { parseDescription: parseFull } = await import("./parser");
  for (const text of ["carreras de autos", "partida de ajedrez"]) {
    assert.equal((await parseFull(text, 1)).ok, false, text);
  }
  const accepted = await parseFull("tiro al blanco", 1);
  assert.ok(accepted.ok && accepted.spec.layout === "shooter");
});
