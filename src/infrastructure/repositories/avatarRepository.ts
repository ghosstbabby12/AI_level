import { AvatarRepository } from "../../application/ports";
import { AvatarMime } from "../../domain/user/user";
import { first, run } from "../database/client";

export const avatarRepository: AvatarRepository = {
  async save(userId, mime, data) {
    await run(
      `INSERT INTO user_avatars (user_id, mime, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at`,
      [userId, mime, data, Date.now()],
    );
  },

  async remove(userId) {
    await run("DELETE FROM user_avatars WHERE user_id = ?", [userId]);
  },

  async find(userId) {
    const row = await first<{ mime: AvatarMime; data: ArrayBuffer }>("SELECT mime, data FROM user_avatars WHERE user_id = ?", [userId]);
    return row ? { mime: row.mime, data: Buffer.from(row.data) } : undefined;
  },
};
