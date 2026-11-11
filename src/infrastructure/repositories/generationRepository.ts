import { v4 as uuidv4 } from "uuid";
import { GenerationLog, GenerationRecord } from "../../application/ports";
import { run } from "../database/client";

/**
 * Traceability of POST /generate: one row per request. Writes run in the background and a
 * database failure only reaches the log, so logging never blocks or breaks the answer.
 */
export const INTERRUPTED_ON_RESTART = "interrupted_on_restart";

const now = () => new Date().toISOString();
const logFailure = (what: string) => (error: unknown) => console.error(`[generations] could not ${what}:`, error);

const INSERT = `INSERT INTO generations (id, user_id, prompt_original, source, fallback_reason, fit, layout, model,
  tokens_in, tokens_out, cache_read_tokens, cache_write_tokens, latency_ms, status, rejection_kind,
  error_message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const FINISH = `UPDATE generations SET status = ?, error_message = ?, custom_model = ?, custom_tokens_in = ?,
  custom_tokens_out = ?, custom_latency_ms = ?, updated_at = ? WHERE id = ? AND status = 'pending'`;

/** Later updates are chained after the INSERT, so they never arrive before the row exists. */
function after(record: GenerationRecord, what: string, sql: string, args: (string | number | null)[]): Promise<void> {
  record.chain = record.chain.then(() => run(sql, args)).then(() => undefined, logFailure(what));
  return record.chain;
}

export const generationRepository: GenerationLog = {
  record(entry) {
    const id = uuidv4();
    const { trace } = entry;
    const at = now();
    const written = run(INSERT, [
      id, entry.userId, entry.prompt, trace.source, trace.fallbackReason ?? null, entry.fit ?? null, entry.layout ?? null, trace.model,
      trace.tokensIn, trace.tokensOut, trace.cacheRead, trace.cacheWrite, Math.round(entry.latencyMs), entry.status,
      entry.rejectionKind ?? null,
      // When the AI failed and the fallback was used, the request succeeds but the reason is kept.
      entry.errorMessage ?? trace.apiError ?? null,
      at, at,
    ]).then(() => undefined, logFailure(`log generation ${id}`));
    return { id, chain: written };
  },

  linkJob(record, jobId) {
    return after(record, `link job ${jobId}`, "UPDATE generations SET job_id = ?, updated_at = ? WHERE id = ?", [jobId, now(), record.id]);
  },

  /** Only touches pending rows: if the startup sweep already marked it interrupted, it is kept. */
  finishCustom(record, outcome) {
    return after(record, `close generation ${record.id}`, FINISH, [
      outcome.status, outcome.errorMessage ?? null, outcome.usage?.model ?? null, outcome.usage?.tokensIn ?? 0,
      outcome.usage?.tokensOut ?? 0, Math.round(outcome.latencyMs), now(), record.id,
    ]);
  },
};

/** At startup no game is being written in this process: pending rows were orphaned by a restart. */
export async function recoverInterruptedGenerations(): Promise<number> {
  const result = await run("UPDATE generations SET status = 'error', error_message = ?, updated_at = ? WHERE status = 'pending'", [
    INTERRUPTED_ON_RESTART,
    now(),
  ]);
  return result.rowsAffected;
}
