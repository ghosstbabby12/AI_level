import { CustomQuotaChecker } from "../../application/ports";
import { config } from "../../config/config";
import { first } from "../database/client";

/**
 * Cap of custom games per user in a moving 24-hour window. Each one costs some API cents,
 * so the limit is per person and computed from the database: it survives restarts.
 */
const WINDOW_MS = 24 * 60 * 60_000;

export const quotaRepository: CustomQuotaChecker = {
  async check(userId, now = new Date()) {
    const limit = config.customGamesPerDay;
    const since = new Date(now.getTime() - WINDOW_MS).toISOString();
    const saved = await first<{ n: number; oldest: string | null }>(
      "SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM levels WHERE user_id = ? AND layout = 'custom' AND created_at >= ?",
      [userId, since],
    );
    // Games still being written are not in levels yet; without counting them, several quick
    // requests would pass the check at once. Jobs are only used for custom games today.
    const inProgress = await first<{ n: number }>("SELECT COUNT(*) AS n FROM jobs WHERE user_id = ? AND status IN ('pending', 'running')", [userId]);

    const used = Number(saved?.n ?? 0) + Number(inProgress?.n ?? 0);
    if (used < limit) return { allowed: true, used, limit };

    // A slot frees up when the oldest game in the window turns 24 hours old. If all of them are
    // still in progress, they will count from when they are saved: about 24 hours from now.
    const oldest = saved?.oldest ? new Date(saved.oldest) : now;
    return { allowed: false, used, limit, retryAt: new Date(oldest.getTime() + WINDOW_MS) };
  },
};
