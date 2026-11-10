import assert from "node:assert/strict";
import fs from "node:fs";
import { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "settings-")), "test.db");
delete process.env.TURSO_DATABASE_URL;
delete process.env.ANTHROPIC_API_KEY;

test("objetos: se muestran con la palabra del usuario", async () => {
  const { detectItemLabel, pluralize } = await import("./keywordParser");
  assert.equal(detectItemLabel("un laberinto donde recoges manzanas"), "manzanas");
  assert.equal(detectItemLabel("busca la manzana dorada"), "manzanas");
  assert.equal(detectItemLabel("junta 5 pociones de vida"), "pociones");
  assert.equal(detectItemLabel("un nivel de hielo"), undefined);
  assert.equal(pluralize("poción"), "pociones");
  assert.equal(pluralize("pez"), "peces");
  assert.equal(pluralize("flor"), "flores");

  const { parseDescriptionKeywords } = await import("./keywordParser");
  const { buildLevel, toGeneratedLevel } = await import("./levelBuilder");
  const spec = parseDescriptionKeywords("un laberinto con 12 manzanas", 4);
  const level = toGeneratedLevel("x", spec, buildLevel(spec), "");
  assert.equal(level.itemLabel, "manzanas");
  assert.ok(level.interpretation.some((c) => /^Objetos: \d+ manzanas$/.test(c)), level.interpretation.join(" | "));
  assert.ok(level.counts && level.counts.items > 0);
});

test("ajustes: cada estilo ofrece lo que su generador respeta, y la variante los aplica", async () => {
  const { levelSettings, remixLevel } = await import("./settings");
  const { parseDescriptionKeywords } = await import("./keywordParser");
  const { buildLevel, toGeneratedLevel } = await import("./levelBuilder");
  const { MODES, MODE_PRIORITY } = await import("./modes");
  for (const mode of MODE_PRIORITY) {
    const spec = parseDescriptionKeywords(MODES[mode].example.text, 9);
    const level = { ...toGeneratedLevel("a", spec, buildLevel(spec), ""), spec };
    const settings = levelSettings(level);
    assert.equal(settings[0].key, "difficulty", mode);
    const harder = remixLevel(level, { difficulty: "hard" }, "b");
    assert.ok(harder.ok, `${mode}: ${!harder.ok && harder.error}`);
    if (harder.ok) assert.equal(harder.value.difficulty, "hard");
  }

  const spec = parseDescriptionKeywords("un laberinto de hielo", 2);
  const maze = { ...toGeneratedLevel("m", spec, buildLevel(spec), ""), spec };
  const traps = remixLevel(maze, { traps: 3, enemies: 0 }, "n");
  assert.ok(traps.ok);
  if (traps.ok) {
    assert.equal(traps.value.counts!.traps, 3);
    assert.equal(traps.value.counts!.enemies, 0);
    assert.equal(traps.value.theme, "ice", "mismo tema");
    assert.equal(traps.value.seed, maze.seed, "misma semilla");
  }
  assert.equal(remixLevel(maze, { traps: 99 }, "n").ok, false);
  assert.equal(remixLevel(maze, { difficulty: "imposible" }, "n").ok, false);
  assert.equal(remixLevel(maze, { rounds: 3 }, "n").ok, false, "un laberinto no tiene vueltas");
  assert.equal(remixLevel(maze, {}, "n").ok, false);
});

let base = "";
let close = () => {};
before(async () => {
  const express = (await import("express")).default;
  const { attachUser } = await import("../auth/auth");
  const { authRouter } = await import("../routes/auth");
  const { levelsRouter } = await import("../routes/levels");
  const { dbReady } = await import("../store/db");
  await dbReady;
  const app = express();
  app.use(express.json());
  app.use(attachUser);
  app.use("/api/auth", authRouter);
  app.use("/api/levels", levelsRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
after(() => close());

test("ruta: variante desde los chips, sin perder el nivel anterior", async () => {
  const reg = await fetch(base + "/api/auth/register", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Prueba", email: "chips@test.dev", password: "secreta123" }),
  });
  const cookie = reg.headers.get("set-cookie")!.split(";")[0];
  const call = async (method: string, url: string, body?: unknown) => {
    const r = await fetch(base + url, { method, headers: { cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, data: (await r.json()) as any };
  };
  const level = (await call("POST", "/api/levels/generate", { description: "un laberinto con manzanas" })).data;
  assert.ok(Array.isArray(level.settings));
  assert.deepEqual(level.settings.map((s: any) => s.key), ["difficulty", "traps", "enemies", "items", "boss"]);
  assert.equal(level.settings.find((s: any) => s.key === "items").label, "Manzanas");

  const remix = await call("POST", `/api/levels/${level.id}/remix`, { difficulty: "easy", boss: true });
  assert.equal(remix.status, 201);
  assert.equal(remix.data.difficulty, "easy");
  assert.equal(remix.data.boss, true);
  assert.notEqual(remix.data.id, level.id);
  assert.equal(remix.data.spec, undefined);
  assert.equal((await call("GET", `/api/levels/${level.id}`)).status, 200, "el anterior sigue ahi");

  const bad = await call("POST", `/api/levels/${level.id}/remix`, { traps: -1 });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.field, "traps");

  const example = await call("POST", "/api/levels/ejemplo-racing/remix", { rounds: 2 });
  assert.equal(example.status, 201);
  assert.equal(example.data.params.laps, 2);
  const examples = (await call("GET", "/api/levels/examples")).data;
  assert.ok(examples.every((e: any) => Array.isArray(e.level.settings)));
});
