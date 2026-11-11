import { SessionRepository } from "../../application/ports";
import { first, run } from "../database/client";
import { hashToken, newToken } from "../security/tokens";
import { SESSION_MS } from "../../domain/user/sessionPolicy";
import { toPublicUser, USER_COLUMNS, UserRow } from "./userRows";

export const sessionRepository: SessionRepository = {
  async create(userId) {
    const token = newToken();
    await run("DELETE FROM sessions WHERE expires_at < ?", [Date.now()]);
    await run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [hashToken(token), userId, Date.now() + SESSION_MS]);
    return token;
  },

  async remove(token) {
    await run("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
  },

  async removeOthers(userId, keepToken) {
    await run("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", [userId, keepToken ? hashToken(keepToken) : ""]);
  },

  async findUser(token) {
    const row = await first<UserRow>(
      `SELECT ${USER_COLUMNS} FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN user_avatars a ON a.user_id = u.id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
      [hashToken(token), Date.now()],
    );
    return row ? toPublicUser(row) : undefined;
  },
};
