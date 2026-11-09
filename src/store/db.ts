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
const client = createClient({ url, authToken: env("TURSO_AUTH_TOKEN")?.replace(/^Bearer\s+/i, "") });

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
  `CREATE TABLE IF NOT EXISTS levels (
    id          TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    title       TEXT NOT NULL,
    layout      TEXT NOT NULL,
    theme       TEXT NOT NULL,
    data        TEXT NOT NULL,
    created_at  TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS levels_by_user ON levels (user_id, created_at)`,
  // Trabajos largos (juegos escritos por la IA). result guarda el JSON completo que recibe el cliente.
  `CREATE TABLE IF NOT EXISTS jobs (
    id            TEXT PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        TEXT NOT NULL CHECK (status IN ('pending', 'running', 'done', 'error')),
    result        TEXT,
    error_message TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS jobs_by_status ON jobs (status, created_at)`,
  // Una fila por pedido a POST /generate: que se interpreto, con que modelo, cuanto costo y como termino.
  // Los tokens van separados como los factura la API: entrada normal, escritura y lectura de cache.
  // Las columnas custom_* son la segunda llamada (escribir el juego a medida), que llena el trabajo al terminar.
  `CREATE TABLE IF NOT EXISTS generations (
    id                 TEXT PRIMARY KEY,
    user_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    prompt_original    TEXT NOT NULL,
    source             TEXT NOT NULL CHECK (source IN ('basic', 'cache', 'ai', 'keywords')),
    fallback_reason    TEXT CHECK (fallback_reason IN ('no_key', 'daily_limit', 'api_error', 'invalid_output')),
    fit                TEXT,
    layout             TEXT,
    model              TEXT,
    tokens_in          INTEGER NOT NULL DEFAULT 0,
    tokens_out         INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    custom_model       TEXT,
    custom_tokens_in   INTEGER NOT NULL DEFAULT 0,
    custom_tokens_out  INTEGER NOT NULL DEFAULT 0,
    latency_ms         INTEGER NOT NULL,
    custom_latency_ms  INTEGER,
    status             TEXT NOT NULL CHECK (status IN ('pending', 'success', 'rejected', 'error')),
    rejection_kind     TEXT CHECK (rejection_kind IN ('invalid_input', 'quota', 'disabled')),
    error_message      TEXT,
    job_id             TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS generations_by_user ON generations (user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS generations_by_status ON generations (status)`,
  // Foto de perfil, aparte de users para no arrastrar el binario en cada consulta de sesion.
  // updated_at (ms) versiona la URL de la imagen, asi el navegador puede guardarla en cache.
  `CREATE TABLE IF NOT EXISTS user_avatars (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    mime       TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
    data       BLOB NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
];

// Columnas agregadas despues de crear la tabla: CREATE TABLE IF NOT EXISTS no las suma
// a una base que ya existe (como la de produccion), asi que se agregan si faltan.
const ADDED_COLUMNS: Record<string, Record<string, string>> = {
  users: { phone: "TEXT", updated_at: "TEXT" },
};

async function addMissingColumns(): Promise<void> {
  for (const [table, columns] of Object.entries(ADDED_COLUMNS)) {
    const info = await client.execute(`PRAGMA table_info(${table})`);
    const existing = new Set(info.rows.map((row) => String(row.name)));
    for (const [column, type] of Object.entries(columns)) {
      if (existing.has(column)) continue;
      try {
        await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      } catch (error) {
        // Otra instancia pudo agregarla al mismo tiempo.
        if (!/duplicate column/i.test(String(error))) throw error;
      }
    }
  }
}

async function migrate(): Promise<void> {
  try {
    for (const sql of SCHEMA) await client.execute(sql);
    await addMissingColumns();
  } catch (error) {
    // Muestra a que base se intento conectar (sin el token) para facilitar el diagnostico.
    const target = url.startsWith("file:") ? url : url.replace(/^(\w+:\/\/[^/?]+).*/, "$1");
    console.error(`No se pudieron crear las tablas en ${target}`);
    const status = (error as { cause?: { status?: number } }).cause?.status;
    if (status === 400 || status === 401) {
      console.error("Turso rechazo el token: revisa TURSO_AUTH_TOKEN (debe ser un token de esta base de datos, completo y sin espacios).");
    }
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
