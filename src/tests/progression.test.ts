import assert from "node:assert/strict";
import fs from "node:fs";
import { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "progression-")), "test.db");
delete process.env.TURSO_DATABASE_URL;
delete process.env.ANTHROPIC_API_KEY;

test("progression: the 11 styles chain 12 levels, each harder and within limits", async () => {
  const { nextLevel } = await import("../domain/progression/progression");
  const { harderSpec } = await import("../domain/progression/harderSpec");
  const { parseDescriptionKeywords } = await import("../domain/interpretation/keywordParser");
  const { buildLevel } = await import("../domain/generation/levelBuilder");
  const { toGeneratedLevel } = await import("../domain/generation/toGeneratedLevel");
  const { MODES, MODE_PRIORITY } = await import("../domain/level/modes");

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

  // Disabled features stay disabled, and requested amounts grow up to a cap.
  const base = parseDescriptionKeywords("un laberinto sin trampas con 25 enemigos", 3);
  assert.equal(base.traps.enabled, false);
  let spec = base;
  for (let stage = 2; stage < 8; stage++) spec = harderSpec(spec, stage);
  assert.equal(spec.traps.enabled, false);
  assert.equal(spec.enemies.count, 30);
  // Deterministic: the same level always leads to the same next one.
  assert.deepEqual(harderSpec(base, 2), harderSpec(base, 2));
  assert.notEqual(harderSpec(base, 2).seed, base.seed);
});

test("progression: waves and laps go up", async () => {
  const { nextLevel } = await import("../domain/progression/progression");
  const { parseDescriptionKeywords } = await import("../domain/interpretation/keywordParser");
  const { buildLevel } = await import("../domain/generation/levelBuilder");
  const { toGeneratedLevel } = await import("../domain/generation/toGeneratedLevel");
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

// ---------- Route, against a real server ----------

let base = "";
let close = () => {};

before(async () => {
  const { createApp } = await import("../interfaces/http/app");
  const { container } = await import("../container");
  const { dbReady } = await import("../infrastructure/database/migrate");
  await dbReady;
  const server = createApp(container).listen(0);
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

test("route: next level from a generated one, from an example and without a session", async () => {
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

test("route: a level saved before chaining existed (no spec) also has a next one", async () => {
  const call = await account("viejo@test.dev");
  const { parseDescriptionKeywords } = await import("../domain/interpretation/keywordParser");
  const { buildLevel } = await import("../domain/generation/levelBuilder");
  const { toGeneratedLevel } = await import("../domain/generation/toGeneratedLevel");
  const { levelRepository } = await import("../infrastructure/repositories/levelRepository");
  const saveLevel = levelRepository.save;
  const { first } = await import("../infrastructure/database/client");
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
