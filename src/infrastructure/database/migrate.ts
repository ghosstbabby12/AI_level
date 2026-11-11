import { databaseTarget, db } from "./client";
import { ADDED_COLUMNS, SCHEMA } from "./schema";

async function addMissingColumns(): Promise<void> {
  for (const [table, columns] of Object.entries(ADDED_COLUMNS)) {
    const info = await db.execute(`PRAGMA table_info(${table})`);
    const existing = new Set(info.rows.map((row) => String(row.name)));
    for (const [column, type] of Object.entries(columns)) {
      if (existing.has(column)) continue;
      try {
        await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      } catch (error) {
        // Another instance may have added it at the same time.
        if (!/duplicate column/i.test(String(error))) throw error;
      }
    }
  }
}

/** Shows which database it tried (without the token) to make the problem easy to find. */
function explainFailure(error: unknown): void {
  const target = databaseTarget.startsWith("file:") ? databaseTarget : databaseTarget.replace(/^(\w+:\/\/[^/?]+).*/, "$1");
  console.error(`Could not create the tables in ${target}`);
  const status = (error as { cause?: { status?: number } }).cause?.status;
  if (status === 400 || status === 401) {
    console.error("Turso rejected the token: check TURSO_AUTH_TOKEN (a full token for this database, without spaces).");
  }
}

async function migrate(): Promise<void> {
  try {
    for (const sql of SCHEMA) await db.execute(sql);
    await addMissingColumns();
  } catch (error) {
    explainFailure(error);
    throw error;
  }
}

/** Resolves once the tables exist; server.ts waits for it before accepting requests. */
export const dbReady: Promise<void> = migrate();
