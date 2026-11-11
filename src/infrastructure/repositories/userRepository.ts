import { EmailTakenError } from "../../application/errors";
import { UserRepository } from "../../application/ports";
import { first, isUniqueViolation, run } from "../database/client";
import { toPublicUser, USER_COLUMNS, USER_FROM, UserRow } from "./userRows";

const now = () => new Date().toISOString();

export const userRepository: UserRepository = {
  async findById(id) {
    const row = await first<UserRow>(`SELECT ${USER_COLUMNS} FROM ${USER_FROM} WHERE u.id = ?`, [id]);
    return row ? toPublicUser(row) : undefined;
  },

  async findCredentials(email) {
    const row = await first<{ id: number; password_hash: string }>("SELECT id, password_hash FROM users WHERE email = ?", [email]);
    return row ? { id: Number(row.id), passwordHash: row.password_hash } : undefined;
  },

  async passwordHash(id) {
    const row = await first<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", [id]);
    return row?.password_hash;
  },

  async emailTaken(email, exceptId) {
    return !!(await first("SELECT 1 FROM users WHERE email = ? AND id != ?", [email, exceptId ?? -1]));
  },

  async create({ email, name, passwordHash }) {
    const at = now();
    const result = await run("INSERT INTO users (email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", [
      email, name, passwordHash, at, at,
    ]);
    return Number(result.lastInsertRowid);
  },

  async update(id, fields) {
    const columns = Object.keys(fields) as Array<keyof typeof fields>;
    const assignments = columns.map((column) => `${column} = ?`).join(", ");
    try {
      await run(`UPDATE users SET ${assignments}, updated_at = ? WHERE id = ?`, [...columns.map((c) => fields[c] ?? null), now(), id]);
    } catch (error) {
      if (isUniqueViolation(error)) throw new EmailTakenError();
      throw error;
    }
  },

  async setPasswordHash(id, hash) {
    await run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [hash, now(), id]);
  },
};
