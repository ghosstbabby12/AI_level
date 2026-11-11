import assert from "node:assert/strict";
import fs from "node:fs";
import { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

// Temporary database: production is never touched.
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "profile-")), "test.db");
delete process.env.TURSO_DATABASE_URL;

test("rules: optional phone in the usual formats", async () => {
  const { checkPhone } = await import("../domain/user/userRules");
  assert.deepEqual(checkPhone(""), { ok: true, value: null });
  assert.deepEqual(checkPhone(null), { ok: true, value: null });
  assert.deepEqual(checkPhone("  +34  600 12-34-56 "), { ok: true, value: "+34 600 12-34-56" });
  assert.equal(checkPhone("(55) 1234 5678").ok, true);
  assert.equal(checkPhone("12345").ok, false, "muy corto");
  assert.equal(checkPhone("1234567890123456").ok, false, "mas de 15 digitos");
  assert.equal(checkPhone("600-ABC-123").ok, false, "letras");
  assert.equal(checkPhone("6+00123456").ok, false, "+ en medio");
});

test("rules: name, email and real image type", async () => {
  const { avatarType, checkEmail, checkName } = await import("../domain/user/userRules");
  assert.deepEqual(checkName("  Ana   María "), { ok: true, value: "Ana María" });
  assert.equal(checkName("   ").ok, false);
  assert.equal(checkName("x".repeat(41)).ok, false);
  assert.deepEqual(checkEmail(" Ana@Mail.COM "), { ok: true, value: "ana@mail.com" });
  assert.equal(checkEmail("ana@mail").ok, false);

  assert.equal(avatarType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(avatarType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(avatarType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(avatarType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
});

// ---------- Routes, against a real server ----------

let base = "";
let close = () => {};

before(async () => {
  // The database starts like production did: users without phone or updated_at, with one account.
  const { createClient } = await import("@libsql/client");
  const old = createClient({ url: `file:${process.env.DB_PATH}` });
  await old.execute("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL)");
  const { hashPassword } = await import("../infrastructure/security/passwords");
  await old.execute({ sql: "INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)", args: ["vieja@test.dev", "Vieja", hashPassword("secreta123"), "2026-01-01T00:00:00.000Z"] });
  old.close();

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

/** Minimal client with its own session cookie, like a browser. */
function client() {
  let cookie = "";
  return async (method: string, url: string, body?: unknown, type = "application/json") => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(cookie && { cookie }), ...(body !== undefined && { "content-type": type }) },
      body: body === undefined ? undefined : type === "application/json" ? JSON.stringify(body) : (body as Buffer),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    let data: any = text;
    try { data = JSON.parse(text); } catch { /* binario */ }
    return { status: res.status, data, res };
  };
}

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);

test("profile: view, edit name and phone, and keep them saved", async () => {
  const call = client();
  const reg = await call("POST", "/api/auth/register", { name: "Ana", email: "ana@test.dev", password: "secreta123" });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.user.phone, null);
  assert.equal(reg.data.user.avatarUrl, null);
  assert.ok(reg.data.user.createdAt);

  const upd = await call("PATCH", "/api/profile", { name: " Ana  Ruiz ", phone: "+34 600 123 456" });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.user.name, "Ana Ruiz");
  assert.equal(upd.data.user.phone, "+34 600 123 456");

  // What the session returns comes from the database, not from the previous answer.
  const me = await call("GET", "/api/auth/me");
  assert.equal(me.data.user.name, "Ana Ruiz");
  assert.equal(me.data.user.phone, "+34 600 123 456");

  const bad = await call("PATCH", "/api/profile", { phone: "abc" });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.field, "phone");

  const cleared = await call("PATCH", "/api/profile", { phone: "" });
  assert.equal(cleared.data.user.phone, null);
});

test("profile: changing the email requires the password and cannot reuse another one", async () => {
  const ana = client();
  const beto = client();
  await ana("POST", "/api/auth/register", { name: "Ana", email: "ana2@test.dev", password: "secreta123" });
  await beto("POST", "/api/auth/register", { name: "Beto", email: "beto@test.dev", password: "secreta123" });

  const noPass = await ana("PATCH", "/api/profile", { email: "nueva@test.dev" });
  assert.equal(noPass.status, 403);
  const wrongPass = await ana("PATCH", "/api/profile", { email: "nueva@test.dev", currentPassword: "otra-cosa" });
  assert.equal(wrongPass.status, 403);
  const taken = await ana("PATCH", "/api/profile", { email: "BETO@test.dev", currentPassword: "secreta123" });
  assert.equal(taken.status, 409);

  // The same email (with other capitals) is not a change: no password asked.
  const same = await ana("PATCH", "/api/profile", { email: "ANA2@test.dev", name: "Ana B" });
  assert.equal(same.status, 200);

  const ok = await ana("PATCH", "/api/profile", { email: "Nueva@Test.dev", currentPassword: "secreta123" });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.email, "nueva@test.dev");

  const relogin = client();
  assert.equal((await relogin("POST", "/api/auth/login", { email: "ana2@test.dev", password: "secreta123" })).status, 401);
  assert.equal((await relogin("POST", "/api/auth/login", { email: "nueva@test.dev", password: "secreta123" })).status, 200);
});

test("profile: changing the password closes the other sessions", async () => {
  const here = client();
  const other = client();
  await here("POST", "/api/auth/register", { name: "Caro", email: "caro@test.dev", password: "secreta123" });
  await other("POST", "/api/auth/login", { email: "caro@test.dev", password: "secreta123" });

  assert.equal((await here("PUT", "/api/profile/password", { currentPassword: "mala-clave", newPassword: "nueva-clave-1" })).status, 403);
  assert.equal((await here("PUT", "/api/profile/password", { currentPassword: "secreta123", newPassword: "corta" })).status, 400);
  assert.equal((await here("PUT", "/api/profile/password", { currentPassword: "secreta123", newPassword: "secreta123" })).status, 400);
  assert.equal((await here("PUT", "/api/profile/password", { currentPassword: "secreta123", newPassword: "nueva-clave-1" })).status, 200);

  assert.equal((await here("GET", "/api/auth/me")).status, 200, "esta sesion sigue abierta");
  assert.equal((await other("GET", "/api/auth/me")).status, 401, "la otra se cerro");
  const login = client();
  assert.equal((await login("POST", "/api/auth/login", { email: "caro@test.dev", password: "secreta123" })).status, 401);
  assert.equal((await login("POST", "/api/auth/login", { email: "caro@test.dev", password: "nueva-clave-1" })).status, 200);
});

test("profile: upload, view and remove the photo", async () => {
  const call = client();
  await call("POST", "/api/auth/register", { name: "Dani", email: "dani@test.dev", password: "secreta123" });

  const svg = await call("PUT", "/api/profile/avatar", Buffer.from("<svg/>"), "image/png");
  assert.equal(svg.status, 415, "se mira el contenido, no la cabecera");
  const huge = await call("PUT", "/api/profile/avatar", Buffer.concat([JPEG, Buffer.alloc(400 * 1024)]), "image/jpeg");
  assert.equal(huge.status, 413);

  const up = await call("PUT", "/api/profile/avatar", JPEG, "image/jpeg");
  assert.equal(up.status, 200);
  assert.match(up.data.user.avatarUrl, /^\/api\/profile\/avatar\?v=\d+$/);

  const img = await call("GET", up.data.user.avatarUrl);
  assert.equal(img.status, 200);
  assert.equal(img.res.headers.get("content-type"), "image/jpeg");

  // Someone else never sees this photo: the route always serves the requester's.
  const stranger = client();
  await stranger("POST", "/api/auth/register", { name: "Eva", email: "eva@test.dev", password: "secreta123" });
  assert.equal((await stranger("GET", "/api/profile/avatar")).status, 404);
  assert.equal((await client()("GET", "/api/profile/avatar")).status, 401);

  const removed = await call("DELETE", "/api/profile/avatar");
  assert.equal(removed.data.user.avatarUrl, null);
  assert.equal((await call("GET", "/api/profile/avatar")).status, 404);
});

test("profile: an account created before the migration signs in and can complete its profile", async () => {
  const call = client();
  const login = await call("POST", "/api/auth/login", { email: "vieja@test.dev", password: "secreta123" });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.phone, null);
  assert.equal(login.data.user.createdAt, "2026-01-01T00:00:00.000Z");
  const upd = await call("PATCH", "/api/profile", { phone: "600 123 456" });
  assert.equal(upd.data.user.phone, "600 123 456");
});
