import fs from "fs";
import path from "path";
import { createClient, InArgs, ResultSet } from "@libsql/client";

/**
 * Con TURSO_DATABASE_URL usa una base SQLite en la nube (Turso), que sobrevive
 * a los despliegues en hostings sin disco persistente. Sin ella, usa un archivo local.
 */
function databaseUrl(): string {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL;
  const file = process.env.DB_PATH || path.join(__dirname, "..", "..", "data", "app.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return `file:${file}`;
}

const client = createClient({ url: databaseUrl(), authToken: process.env.TURSO_AUTH_TOKEN });

/** Se resuelve cuando las tablas existen; server.ts lo espera antes de aceptar peticiones. */
export const dbReady: Promise<void> = client.executeMultiple(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
`);

export function run(sql: string, args: InArgs = []): Promise<ResultSet> {
  return client.execute({ sql, args });
}

export async function first<T>(sql: string, args: InArgs = []): Promise<T | undefined> {
  const result = await client.execute({ sql, args });
  return result.rows[0] as T | undefined;
}
