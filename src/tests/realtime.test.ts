import assert from "node:assert/strict";
import fs from "node:fs";
import { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "realtime-")), "test.db");
delete process.env.TURSO_DATABASE_URL;
delete process.env.PUBLIC_WS_URL;

let base = "";
let close = () => {};

before(async () => {
  const { createApp } = await import("../interfaces/http/app");
  const { container } = await import("../container");
  const { dbReady } = await import("../infrastructure/database/migrate");
  await dbReady;
  const server = createApp(container).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { attachRealtime } = await import("../infrastructure/realtime/realtimeServer");
  const wss = attachRealtime(server);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => { for (const ws of wss.clients) ws.terminate(); wss.close(); server.close(); };
});
after(() => close());

/** Registers an account and returns its id and a function to request tickets with its cookie. */
async function account(email: string) {
  const res = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Prueba", email, password: "secreta123" }),
  });
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const { user } = (await res.json()) as { user: { id: number } };
  const ticket = async () =>
    (await (await fetch(base + "/api/realtime/ticket", { method: "POST", headers: { cookie } })).json()) as { ticket: string; url: string };
  return { id: user.id as number, ticket };
}

/** Opens the socket and collects messages; resolves on the greeting, fails when rejected. */
function connect(url: string) {
  const messages: any[] = [];
  const ws = new WebSocket(url);
  const waiters: Array<() => void> = [];
  ws.addEventListener("message", (e) => { messages.push(JSON.parse(String(e.data))); waiters.splice(0).forEach((w) => w()); });
  const opened = new Promise<void>((resolve, reject) => {
    ws.addEventListener("error", () => reject(new Error("rechazado")));
    const check = () => (messages.some((m) => m.type === "hello") ? resolve() : waiters.push(check));
    check();
  });
  /** Waits until some message matches the condition. */
  const until = (fn: (m: any) => boolean, ms = 3000) =>
    new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no llego el mensaje")), ms);
      const check = () => { const m = messages.find(fn); if (m) { clearTimeout(timer); resolve(m); } else waiters.push(check); };
      check();
    });
  return { ws, messages, opened, until };
}

test("realtime: no valid ticket, no connection; each ticket works only once", async () => {
  const ana = await account("ana@rt.dev");
  const { ticket, url } = await ana.ticket();
  assert.match(url, /^ws:\/\/127\.0\.0\.1:\d+\/api\/realtime$/);

  await assert.rejects(connect(`${url}?ticket=inventado`).opened);
  await assert.rejects(connect(url).opened);
  const first = connect(`${url}?ticket=${ticket}`);
  await first.opened;
  await assert.rejects(connect(`${url}?ticket=${ticket}`).opened, "reusar el ticket");
  first.ws.close();

  const anon = await fetch(base + "/api/realtime/ticket", { method: "POST" });
  assert.equal(anon.status, 401);
});

test("realtime: job stages reach every tab of the owner in order, and nobody else", async () => {
  const { jobRunner } = await import("../infrastructure/jobs/jobRunner");
  const jobs = { startJob: jobRunner.start, getJob: jobRunner.get };
  const owner = await account("dueno@rt.dev");
  const stranger = await account("otro@rt.dev");
  const t1 = await owner.ticket();
  const t2 = await owner.ticket();
  const t3 = await stranger.ticket();
  const tabA = connect(`${t1.url}?ticket=${t1.ticket}`);
  const tabB = connect(`${t2.url}?ticket=${t2.ticket}`);
  const other = connect(`${t3.url}?ticket=${t3.ticket}`);
  await Promise.all([tabA.opened, tabB.opened, other.opened]);

  let finish!: (value: unknown) => void;
  let reportStage!: (stage: "writing" | "validating" | "fixing" | "saving") => void;
  const job = await jobs.startJob(owner.id, (report) => {
    reportStage = report;
    return new Promise((resolve) => (finish = resolve));
  }, { title: "Duelo de prueba" });

  await tabA.until((m) => m.type === "job" && m.job.status === "running");
  reportStage("writing");
  await tabA.until((m) => m.job?.stage === "writing");
  // The stage is stored too, for whoever polls without WebSocket or after reloading.
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await jobs.getJob(job.id, owner.id))!.stage, "writing");

  reportStage("validating");
  reportStage("validating"); // repetida: no se vuelve a avisar
  reportStage("fixing");
  reportStage("saving");
  finish({ ok: true });
  const done = await tabA.until((m) => m.job?.status === "done");
  assert.deepEqual(done.job, { id: job.id, status: "done", stage: "saving", title: "Duelo de prueba" });
  // When "done" arrives, the result is already stored.
  assert.deepEqual((await jobs.getJob(job.id, owner.id))!.result, { ok: true });

  const seen = (tab: typeof tabA) => tab.messages.filter((m) => m.type === "job").map((m) => `${m.job.status}:${m.job.stage ?? "-"}`);
  const expected = ["running:-", "running:writing", "running:validating", "running:fixing", "running:saving", "done:saving"];
  assert.deepEqual(seen(tabA), expected);
  await tabB.until((m) => m.job?.status === "done");
  assert.deepEqual(seen(tabB), expected, "la otra pestaña recibe lo mismo");
  assert.deepEqual(seen(other), [], "otra cuenta no se entera de nada");

  const failing = await jobs.startJob(owner.id, async () => { throw new Error("salió incompleto"); }, { title: "Roto" });
  const err = await tabA.until((m) => m.job?.id === failing.id && m.job.status === "error");
  assert.equal(err.job.error, "salió incompleto");

  for (const t of [tabA, tabB, other]) t.ws.close();
});
