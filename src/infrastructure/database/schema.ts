/** One statement per entry: the most basic operation of the protocol, supported by every Turso database. */
export const SCHEMA = [
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
  // Long jobs (games written by the AI). result keeps the full JSON the client receives.
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
  // One row per POST /generate: what was interpreted, with which model, its cost and how it ended.
  // Tokens are split the way the API bills them. custom_* columns belong to the second call
  // (writing the custom game), filled in by the job when it finishes.
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
  // Profile photo, apart from users so session lookups never drag the binary along.
  // updated_at (ms) versions the image URL, so the browser can cache it.
  `CREATE TABLE IF NOT EXISTS user_avatars (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    mime       TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
    data       BLOB NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
];

/**
 * Columns added after a table was created: CREATE TABLE IF NOT EXISTS does not add them to an
 * existing database (like production), so migrate.ts adds them when missing.
 */
export const ADDED_COLUMNS: Record<string, Record<string, string>> = {
  users: { phone: "TEXT", updated_at: "TEXT" },
  // Stage of the running custom game (writing, validating, fixing, saving), to show real progress.
  jobs: { stage: "TEXT" },
};
