import fs from "fs";
import path from "path";
import { createClient, InArgs, ResultSet } from "@libsql/client";
import { config } from "../../config/config";

/**
 * With TURSO_DATABASE_URL it uses a cloud SQLite database (Turso), which survives deploys on
 * hosts without a persistent disk. Without it, a local file.
 */
function databaseUrl(): string {
  if (config.databaseUrl) return config.databaseUrl;
  const file = config.databasePath || path.join(__dirname, "..", "..", "..", "data", "app.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return `file:${file}`;
}

export const databaseTarget = databaseUrl();
export const db = createClient({ url: databaseTarget, authToken: config.databaseToken });

export function run(sql: string, args: InArgs = []): Promise<ResultSet> {
  return db.execute({ sql, args });
}

export async function first<T>(sql: string, args: InArgs = []): Promise<T | undefined> {
  const result = await db.execute({ sql, args });
  return result.rows[0] as T | undefined;
}

export const isUniqueViolation = (error: unknown): boolean => /UNIQUE constraint failed/i.test(String(error));
