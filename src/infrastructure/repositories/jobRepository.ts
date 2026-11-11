import { Job, JobStage, JobStatus } from "../../application/ports";
import { first, run } from "../database/client";

/** Long jobs are stored so their state survives a restart. */
interface JobRow {
  id: string;
  user_id: number;
  status: JobStatus;
  stage: JobStage | null;
  result: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

const JOB_RETENTION_MS = 24 * 60 * 60_000;
const INTERRUPTED_MESSAGE = "La creación del juego se interrumpió porque el servidor se reinició. Vuelve a intentarlo.";
const now = () => new Date().toISOString();

const toJob = (row: JobRow): Job => ({
  id: row.id,
  userId: Number(row.user_id),
  status: row.status,
  stage: row.stage ?? null,
  result: row.result === null ? undefined : JSON.parse(row.result),
  error: row.error_message ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const jobRepository = {
  async insert(job: Job): Promise<void> {
    await run("INSERT INTO jobs (id, user_id, status, result, error_message, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, ?, ?)", [
      job.id, job.userId, job.status, job.createdAt, job.updatedAt,
    ]);
  },

  async setStatus(id: string, status: JobStatus, result: unknown, errorMessage: string | null): Promise<void> {
    await run("UPDATE jobs SET status = ?, result = ?, error_message = ?, updated_at = ? WHERE id = ?", [
      status, result === undefined ? null : JSON.stringify(result), errorMessage, now(), id,
    ]);
  },

  async setStage(id: string, stage: JobStage): Promise<void> {
    await run("UPDATE jobs SET stage = ?, updated_at = ? WHERE id = ? AND status = 'running'", [stage, now(), id]);
  },

  /** Only its owner sees a job: for anyone else it does not exist. */
  async find(id: string, userId: number): Promise<Job | undefined> {
    const row = await first<JobRow>(
      "SELECT id, user_id, status, stage, result, error_message, created_at, updated_at FROM jobs WHERE id = ? AND user_id = ?",
      [id, userId],
    );
    return row ? toJob(row) : undefined;
  },

  /** At startup no job runs in this process: pending ones were orphaned by a restart. */
  async markInterrupted(): Promise<number> {
    const result = await run("UPDATE jobs SET status = 'error', error_message = ?, updated_at = ? WHERE status IN ('pending', 'running')", [
      INTERRUPTED_MESSAGE, now(),
    ]);
    return result.rowsAffected;
  },

  async deleteOld(): Promise<number> {
    const cutoff = new Date(Date.now() - JOB_RETENTION_MS).toISOString();
    return (await run("DELETE FROM jobs WHERE created_at < ?", [cutoff])).rowsAffected;
  },
};
