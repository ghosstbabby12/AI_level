import assert from "node:assert/strict";
import fs from "node:fs";
import { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "editing-")), "test.db");
delete process.env.TURSO_DATABASE_URL;
delete process.env.ANTHROPIC_API_KEY;

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

/** Filas de texto (una por fila) a partir de lo que devuelve la API: cuadricula de celdas. */
const CODE: Record<string, string> = { wall: "#", floor: ".", start: "S", exit: "E", trap: "^", enemy: "M", item: "$", boss: "B", power: "P" };
const toRows = (grid: string[][]) => grid.map((row) => row.map((c) => CODE[c]).join(""));
const setCell = (rows: string[], x: number, y: number, code: string) => rows.map((r, i) => (i === y ? r.slice(0, x) + code + r.slice(x + 1) : r));
const find = (rows: string[], code: string) => {
  for (let y = 0; y < rows.length; y++) { const x = rows[y].indexOf(code); if (x !== -1) return { x, y }; }
  return null;
};

test("editar: titulo e historia quedan guardados, y no se puede dejar el titulo vacio", async () => {
  const call = await account("edita@test.dev");
  const level = (await call("POST", "/api/levels/generate", { description: "un laberinto de lava" })).data;

  const ok = await call("PATCH", `/api/levels/${level.id}`, { title: "  Mi   laberinto  ", story: "Escapa del volcán." });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.narrative.title, "Mi laberinto");
  assert.equal(ok.data.narrative.story, "Escapa del volcán.");
  assert.ok(ok.data.editedAt);
  assert.equal(ok.data.spec, undefined);

  const again = await call("GET", `/api/levels/${level.id}`);
  assert.equal(again.data.narrative.title, "Mi laberinto");
  const mine = await call("GET", "/api/levels/mine");
  assert.equal(mine.data[0].title, "Mi laberinto", "la lista usa el titulo nuevo");

  const empty = await call("PATCH", `/api/levels/${level.id}`, { title: "   " });
  assert.equal(empty.status, 400);
  assert.equal(empty.data.field, "title");
  assert.equal((await call("PATCH", `/api/levels/${level.id}`, { story: "x".repeat(241) })).data.field, "story");
  assert.equal((await call("PATCH", `/api/levels/${level.id}`, {})).status, 400);
});

test("editar: el mapa se guarda si se puede jugar, y se rechaza con un motivo claro si no", async () => {
  const call = await account("mapa@test.dev");
  const level = (await call("POST", "/api/levels/generate", { description: "un laberinto con jefe final" })).data;
  const rows = toRows(level.grid);
  const start = find(rows, "S")!;
  const exit = find(rows, "E")!;

  // Mover la salida junto al inicio (a un suelo vecino) siempre deja un nivel jugable.
  const neighbour = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: start.x + dx, y: start.y + dy })).find((p) => rows[p.y][p.x] === ".")!;
  let moved = setCell(setCell(rows, exit.x, exit.y, "."), neighbour.x, neighbour.y, "E");
  const saved = await call("PATCH", `/api/levels/${level.id}`, { rows: moved });
  assert.equal(saved.status, 200, saved.data?.error);
  assert.equal(saved.data.grid[neighbour.y][neighbour.x], "exit");
  assert.match(saved.data.imageUrl, /\/image\?v=\d+$/, "la imagen cambia de URL");
  const reread = await call("GET", `/api/levels/${level.id}`);
  assert.deepEqual(toRows(reread.data.grid), moved);

  // Quitar el jefe: el nivel pasa a no tenerlo.
  const boss = find(moved, "B")!;
  moved = setCell(moved, boss.x, boss.y, ".");
  const noBoss = await call("PATCH", `/api/levels/${level.id}`, { rows: moved });
  assert.equal(noBoss.data.boss, false);
  assert.ok(noBoss.data.interpretation.includes("Jefe final: no"));

  const reject = async (bad: unknown, pattern: RegExp) => {
    const r = await call("PATCH", `/api/levels/${level.id}`, { rows: bad, title: "No debe guardarse" });
    assert.equal(r.status, 400, String(pattern));
    assert.equal(r.data.field, "rows");
    assert.match(r.data.error, pattern);
  };
  const s = find(moved, "S")!;
  const e = find(moved, "E")!;
  await reject(setCell(moved, s.x, s.y, "."), /inicio/);
  await reject(setCell(moved, e.x, e.y, "."), /salida/);
  // En el mapa original la salida esta lejos del inicio: rodearla de trampas corta el camino.
  let walled = rows;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (walled[exit.y + dy][exit.x + dx] !== "#") walled = setCell(walled, exit.x + dx, exit.y + dy, "^");
  await reject(walled, /llegar/);
  await reject(setCell(moved, 0, 0, "."), /borde/);
  const floors: Array<{ x: number; y: number }> = [];
  moved.forEach((r, y) => [...r].forEach((c, x) => c === "." && floors.push({ x, y })));
  await reject(setCell(setCell(moved, floors[0].x, floors[0].y, "B"), floors[1].x, floors[1].y, "B"), /un jefe/);
  await reject(moved.slice(1), /medir/);
  await reject(moved.map((r, i) => (i === 3 ? r.slice(0, 2) + "Z" + r.slice(3) : r)), /desconocidas/);
  await reject(setCell(moved, s.x, s.y, "P"), /no usa/);

  assert.equal((await call("GET", `/api/levels/${level.id}`)).data.narrative.title === "No debe guardarse", false, "si el mapa falla, no se guarda nada");
});

test("editar: solo quien lo creo, y no en carreras ni el mapa de un juego libre", async () => {
  const owner = await account("duena@test.dev");
  const other = await account("ajeno@test.dev");
  const level = (await owner("POST", "/api/levels/generate", { description: "un laberinto" })).data;
  assert.equal((await other("PATCH", `/api/levels/${level.id}`, { title: "Robado" })).status, 404);
  assert.equal((await fetch(base + `/api/levels/${level.id}`, { method: "PATCH" })).status, 401);
  assert.equal((await owner("PATCH", "/api/levels/no-existe", { title: "x" })).status, 404);

  const race = (await owner("POST", "/api/levels/generate", { description: "una carrera de coches" })).data;
  assert.equal(race.layout, "racing");
  const raceRows = await owner("PATCH", `/api/levels/${race.id}`, { rows: toRows(race.grid) });
  assert.equal(raceRows.status, 400);
  assert.match(raceRows.data.error, /no se puede editar/);
  assert.equal((await owner("PATCH", `/api/levels/${race.id}`, { title: "Gran premio" })).status, 200);

  // En invasores el jugador sale siempre del mismo sitio.
  const inv = (await owner("POST", "/api/levels/generate", { description: "space invaders" })).data;
  assert.equal(inv.layout, "invaders");
  const rows = toRows(inv.grid);
  const s = find(rows, "S")!;
  const moved = await owner("PATCH", `/api/levels/${inv.id}`, { rows: setCell(setCell(rows, s.x, s.y, "."), s.x - 1, s.y, "S") });
  assert.match(moved.data.error, /mismo sitio/);

  const { saveCustomGame } = await import("../store/levelStore");
  const { first } = await import("../store/db");
  const user = await first<{ id: number }>("SELECT id FROM users WHERE email = ?", ["duena@test.dev"]);
  await saveCustomGame({
    id: "libre-1", layout: "custom", description: "un duelo", theme: "dungeon", difficulty: "normal",
    narrative: { title: "Duelo", story: "Antes", bossLine: null }, interpretation: [], controls: "", html: "<p>hola</p>", createdAt: new Date().toISOString(),
  }, user!.id);
  const custom = await owner("PATCH", "/api/levels/libre-1", { title: "Duelo final", story: "Después" });
  assert.equal(custom.status, 200);
  assert.equal(custom.data.narrative.title, "Duelo final");
  assert.equal(custom.data.html, "<p>hola</p>");
  assert.equal((await owner("PATCH", "/api/levels/libre-1", { rows: ["#"] })).status, 400);
});

test("editar: un nivel editado sigue teniendo nivel siguiente", async () => {
  const call = await account("cadena@test.dev");
  const level = (await call("POST", "/api/levels/generate", { description: "un laberinto de hielo" })).data;
  await call("PATCH", `/api/levels/${level.id}`, { title: "Hielo eterno" });
  const next = await call("POST", `/api/levels/${level.id}/next`);
  assert.equal(next.status, 201);
  assert.equal(next.data.narrative.title, "Hielo eterno · Nivel 2");
});
