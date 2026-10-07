import fs from "fs";
import path from "path";
import { createClient, InArgs, ResultSet } from "@libsql/client";

/** Quita espacios y comillas que suelen colarse al pegar valores en el panel del hosting. */
function env(name: string): string | undefined {
  const value = process.env[name]?.trim().replace(/^["']|["']$/g, "");
  return value || undefined;
}

/**
 * Con TURSO_DATABASE_URL usa una base SQLite en la nube (Turso), que sobrevive
 * a los despliegues en hostings sin disco persistente. Sin ella, usa un archivo local.
 */
function databaseUrl(): string {
  const remote = env("TURSO_DATABASE_URL");
  if (remote) return remote;
  const file = process.env.DB_PATH || path.join(__dirname, "..", "..", "data", "app.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return `file:${file}`;
}

const url = databaseUrl();
const client = createClient({ url, authToken: env("TURSO_AUTH_TOKEN") });

// Una sentencia por llamada: es la operacion mas basica del protocolo y la soportan todas las bases de Turso.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  )`,
];

async function migrate(): Promise<void> {
  try {
    for (const sql of SCHEMA) await client.execute(sql);
  } catch (error) {
    // Muestra a que base se intento conectar (sin el token) para facilitar el diagnostico.
    const target = url.startsWith("file:") ? url : url.replace(/^(\w+:\/\/[^/?]+).*/, "$1");
    console.error(`No se pudieron crear las tablas en ${target}`);
    throw error;
  }
}

/** Se resuelve cuando las tablas existen; server.ts lo espera antes de aceptar peticiones. */
export const dbReady: Promise<void> = migrate();

export function run(sql: string, args: InArgs = []): Promise<ResultSet> {
  return client.execute({ sql, args });
}

export async function first<T>(sql: string, args: InArgs = []): Promise<T | undefined> {
  const result = await client.execute({ sql, args });
  return result.rows[0] as T | undefined;
}
