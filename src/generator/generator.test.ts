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

test("sin IA, un genero que no existe se rechaza en vez de sustituirse", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const { parseDescription: parseFull } = await import("./parser");
  for (const text of ["partida de ajedrez", "sopa de letras"]) {
    assert.equal((await parseFull(text, 1)).ok, false, text);
  }
  const accepted = await parseFull("tiro al blanco", 1);
  assert.ok(accepted.ok && accepted.spec.layout === "shooter");
});

test("cada modo nuevo se genera, es valido y respeta lo pedido", () => {
  const cases: Array<[string, string]> = [
    ["survival", "supervivencia contra hordas de zombies"],
    ["survival", "sobrevivir a 4 oleadas con jefe final, dificil"],
    ["racing", "carreras de autos en el desierto"],
    ["racing", "circuito de kart pequeño, facil"],
    ["invaders", "matamarcianos dificil con jefe final"],
    ["invaders", "batalla de naves"],
    ["breakout", "rompe bloques en el espacio"],
    ["breakout", "arkanoid dificil con jefe final"],
    ["snake", "juego de la serpiente en el bosque"],
    ["snake", "snake dificil grande"],
  ];
  for (const [layout, prompt] of cases) {
    for (let seed = 1; seed <= 25; seed++) {
      const spec = parseDescription(prompt, seed);
      const label = `"${prompt}" seed=${seed}`;
      assert.equal(spec.layout, layout, label);
      const built = buildLevel(spec);
      assert.equal(validateLevel(built.grid, spec), null, label);
      assert.ok(built.quality >= 0 && built.quality <= 100, label);
    }
  }
  assert.equal(buildLevel(parseDescription("sobrevivir a 4 oleadas", 1)).params?.waves, 4);
  assert.equal(buildLevel(parseDescription("carrera a 5 vueltas", 1)).params?.laps, 5);
  assert.equal(buildLevel(parseDescription("snake con 7 manzanas", 1)).placed.items, 7);
});

test("el circuito de carreras es cerrado y transitable", () => {
  for (let seed = 1; seed <= 25; seed++) {
    const { grid, route } = buildLevel(parseDescription("carreras de autos", seed));
    assert.ok(route && route.length > 60, `ruta corta en seed=${seed}`);
    for (const p of route) assert.notEqual(grid[p.y][p.x], "wall", `ruta sobre muro seed=${seed}`);
    const [first, last] = [route[0], route[route.length - 1]];
    assert.ok(Math.abs(first.x - last.x) + Math.abs(first.y - last.y) <= 4, `circuito abierto seed=${seed}`);
  }
});

test("cada ejemplo de la portada genera el modo que anuncia", async () => {
  const { MODES, MODE_PRIORITY } = await import("./modes");
  for (const mode of MODE_PRIORITY) {
    const spec = parseDescription(MODES[mode].example.text, 7);
    assert.equal(spec.layout, mode, MODES[mode].example.text);
    assert.equal(validateLevel(buildLevel(spec).grid, spec), null, mode);
  }
});

test("los niveles se guardan, se listan por usuario y se borran", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "levels-"));
  delete process.env.TURSO_DATABASE_URL;
  process.env.DB_PATH = path.join(dir, "test.db");
  const { dbReady, run } = await import("../store/db");
  await dbReady;
  const store = await import("../store/levelStore");
  const { toGeneratedLevel } = await import("./levelBuilder");

  await run("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (1, 'a@a.co', 'A', 'x', 'now'), (2, 'b@b.co', 'B', 'x', 'now')");
  const spec = parseDescription("carreras de autos", 3);
  const level = toGeneratedLevel("nivel-1", spec, buildLevel(spec), "");
  await store.saveLevel(level, 1);

  // Se lee la fila guardada en la base (no la cache): la cuadricula y la ruta vuelven intactas.
  const { first } = await import("../store/db");
  const row = await first<{ data: string }>("SELECT data FROM levels WHERE id = ?", ["nivel-1"]);
  const stored = JSON.parse(row!.data);
  assert.deepEqual(store.decodeGrid(stored.rows), level.grid);
  assert.deepEqual(stored.route, level.route);
  assert.equal(stored.narrative.title, level.narrative.title);
  assert.equal(stored.ascii, undefined, "el ASCII no se guarda");

  assert.equal((await store.listLevels(1)).length, 1);
  assert.equal((await store.listLevels(2)).length, 0);
  assert.equal(await store.deleteLevel("nivel-1", 2), false, "otro usuario no puede borrarlo");
  assert.equal(await store.deleteLevel("nivel-1", 1), true);
  assert.equal(await store.getLevel("nivel-1"), undefined);
  assert.deepEqual(store.decodeGrid(store.encodeGrid(level.grid)), level.grid);
});

test("los trabajos largos guardan su resultado y solo los ve su dueño", async () => {
  const { startJob, getJob } = await import("../store/jobs");
  const ok = startJob(1, async () => ({ listo: true }));
  const bad = startJob(1, async () => { throw new Error("salió incompleto"); });
  assert.equal(getJob(ok.id, 1)?.status, "pending");
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(getJob(ok.id, 1)?.result, { listo: true });
  assert.equal(getJob(bad.id, 1)?.status, "failed");
  assert.equal(getJob(bad.id, 1)?.error, "salió incompleto");
  assert.equal(getJob(ok.id, 2), undefined, "otro usuario no ve el trabajo");
});
