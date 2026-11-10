import assert from "node:assert/strict";
import fs from "node:fs";
import { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "progression-")), "test.db");
delete process.env.TURSO_DATABASE_URL;
delete process.env.ANTHROPIC_API_KEY;

test("progresion: los 11 estilos encadenan 12 niveles, cada uno mas dificil y dentro de los limites", async () => {
  const { nextLevel, harderSpec } = await import("./progression");
  const { parseDescriptionKeywords } = await import("./keywordParser");
  const { buildLevel, toGeneratedLevel } = await import("./levelBuilder");
  const { MODES, MODE_PRIORITY } = await import("./modes");

  for (const mode of MODE_PRIORITY) {
    const spec = { ...parseDescriptionKeywords(MODES[mode].example.text, 7), difficulty: "easy" as const };
    let level = { ...toGeneratedLevel("n1", spec, buildLevel(spec), ""), spec };
    const difficulties = [level.difficulty];
    for (let stage = 2; stage <= 12; stage++) {
      const next = nextLevel(level, `n${stage}`);
      assert.equal(next.stage, stage, mode);
      assert.equal(next.layout, mode);
      assert.equal(next.theme, level.theme, "mismo tema");
      assert.equal(next.narrative.story, level.narrative.story, "misma historia");
      assert.ok(next.narrative.title.endsWith(` · Nivel ${stage}`), next.narrative.title);
      assert.ok(!next.narrative.title.includes("Nivel 2 · Nivel"), "el sufijo no se acumula");
      assert.equal(next.interpretation[0], `Nivel: ${stage}`);
      assert.ok(next.width <= MODES[mode].limits.w[1] && next.height <= MODES[mode].limits.h[1], `${mode} ${next.width}x${next.height}`);
      assert.ok(next.spec!.enemies.multiplier >= level.spec!.enemies.multiplier);
      difficulties.push(next.difficulty);
      level = next as typeof level;
    }
    assert.deepEqual(difficulties.slice(0, 4), ["easy", "normal", "hard", "hard"], mode);
    assert.ok(level.spec!.enemies.multiplier > 1.5, "pasado Dificil, siguen creciendo los enemigos");
  }

  // Lo desactivado sigue desactivado, y las cantidades pedidas crecen con tope.
  const base = parseDescriptionKeywords("un laberinto sin trampas con 25 enemigos", 3);
  assert.equal(base.traps.enabled, false);
  let spec = base;
  for (let stage = 2; stage < 8; stage++) spec = harderSpec(spec, stage);
  assert.equal(spec.traps.enabled, false);
  assert.equal(spec.enemies.count, 30);
  // Determinista: el mismo nivel lleva siempre al mismo siguiente.
  assert.deepEqual(harderSpec(base, 2), harderSpec(base, 2));
  assert.notEqual(harderSpec(base, 2).seed, base.seed);
});

test("progresion: oleadas y vueltas suben", async () => {
  const { nextLevel } = await import("./progression");
  const { parseDescriptionKeywords } = await import("./keywordParser");
  const { buildLevel, toGeneratedLevel } = await import("./levelBuilder");
  const make = (text: string) => {
    const spec = parseDescriptionKeywords(text, 11);
    return { ...toGeneratedLevel("a", spec, buildLevel(spec), ""), spec };
  };
  const arena = make("arena de supervivencia con zombis");
  assert.equal(nextLevel(arena, "b").params!.waves, arena.params!.waves + 1);
  const race = make("una carrera de coches");
  const second = nextLevel(race, "b");
  const third = nextLevel(second, "c");
  assert.equal(third.params!.laps, race.params!.laps + 1);
});

// ---------- Ruta, contra un servidor de verdad ----------

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

async function account(email: string) {
  const res = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Prueba", email, password: "secreta123" }),
  });
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return async (method: string, url: string, body?: unknown) => {
    const r = await fetch(base + url, {
      method,
      headers: { cookie, ...(body !== undefined && { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: (await r.json().catch(() => null)) as any };
  };
}

test("ruta: siguiente nivel desde uno generado, desde un ejemplo y sin sesion", async () => {
  const call = await account("nivel@test.dev");
  const first = await call("POST", "/api/levels/generate", { description: "un laberinto de hielo facil" });
  assert.equal(first.status, 201);
  assert.equal(first.data.spec, undefined, "la especificacion no viaja al navegador");

  const second = await call("POST", `/api/levels/${first.data.id}/next`);
  assert.equal(second.status, 201);
  assert.equal(second.data.stage, 2);
  assert.equal(second.data.saved, true);
  assert.equal(second.data.spec, undefined);
  assert.equal(second.data.layout, "maze");
  assert.equal(second.data.difficulty, "normal");
  assert.match(second.data.imageUrl, /\/image$/);

  const third = await call("POST", `/api/levels/${second.data.id}/next`);
  assert.equal(third.data.stage, 3);
  assert.equal(third.data.difficulty, "hard");
  assert.ok(third.data.narrative.title.endsWith("· Nivel 3"));

  const mine = await call("GET", "/api/levels/mine");
  assert.deepEqual(mine.data.slice(0, 3).map((l: any) => l.id), [third.data.id, second.data.id, first.data.id]);

  const fromExample = await call("POST", "/api/levels/ejemplo-snake/next");
  assert.equal(fromExample.status, 201);
  assert.equal(fromExample.data.layout, "snake");
  assert.equal(fromExample.data.stage, 2);

  assert.equal((await call("POST", "/api/levels/ejemplo-inventado/next")).status, 404);
  assert.equal((await call("POST", "/api/levels/no-existe/next")).status, 404);
  assert.equal((await fetch(base + `/api/levels/${first.data.id}/next`, { method: "POST" })).status, 401);
});

test("ruta: un nivel guardado antes de la cadena (sin especificacion) tambien tiene siguiente", async () => {
  const call = await account("viejo@test.dev");
  const { parseDescriptionKeywords } = await import("./keywordParser");
  const { buildLevel, toGeneratedLevel } = await import("./levelBuilder");
  const { saveLevel } = await import("../store/levelStore");
  const { first } = await import("../store/db");
  const spec = parseDescriptionKeywords("una arena de supervivencia sin trampas", 5);
  const old = toGeneratedLevel("viejo-1", spec, buildLevel(spec), "");
  const owner = await first<{ id: number }>("SELECT id FROM users WHERE email = ?", ["viejo@test.dev"]);
  await saveLevel(old, owner!.id);

  const next = await call("POST", "/api/levels/viejo-1/next");
  assert.equal(next.status, 201);
  assert.equal(next.data.params.waves, old.params!.waves + 1);
  assert.ok(old.interpretation.includes("Trampas: 0"));
  assert.ok(next.data.interpretation.includes("Trampas: 0"), "sigue sin trampas");
});
