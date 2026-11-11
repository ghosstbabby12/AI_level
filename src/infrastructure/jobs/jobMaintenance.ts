import { jobRepository } from "../repositories/jobRepository";

const CLEANUP_INTERVAL_MS = 60 * 60_000;

/** Marks orphaned jobs, deletes old ones and repeats the cleanup every hour. Call once at startup. */
export async function startJobMaintenance(): Promise<void> {
  const interrupted = await jobRepository.markInterrupted();
  if (interrupted) console.warn(`[jobs] ${interrupted} job(s) interrupted by the restart`);
  await jobRepository.deleteOld();
  // unref: the cleanup alone does not keep the process alive.
  setInterval(() => {
    jobRepository.deleteOld().catch((error) => console.error("Could not delete old jobs:", error));
  }, CLEANUP_INTERVAL_MS).unref();
}
