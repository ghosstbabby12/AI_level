import { v4 as uuidv4 } from "uuid";
import { Job, JobRunner, JobStage, JobStatus, ReportStage } from "../../application/ports";
import { publish } from "../realtime/connections";
import { jobRepository } from "../repositories/jobRepository";

/**
 * Runs long jobs (games written by the AI) in this process. Every change is pushed live to
 * the user's tabs first and then stored: the database is for whoever asks later (or without
 * WebSocket). A failure to store never kills the process: it is logged and the job goes on.
 */
const logFailure = (id: string) => (error: unknown) => console.error(`Could not update job ${id}:`, error);

async function execute(job: Job, title: string | null, work: (report: ReportStage) => Promise<unknown>): Promise<void> {
  const { id, userId } = job;
  let stage: JobStage | null = null;
  const tell = (status: JobStatus, error?: string) =>
    publish(userId, { type: "job", job: { id, status, stage, title, ...(error !== undefined && { error }) } });
  const note = (status: JobStatus, result: unknown, errorMessage: string | null) =>
    jobRepository.setStatus(id, status, result, errorMessage).catch(logFailure(id));

  await note("running", undefined, null);
  tell("running");
  const report: ReportStage = (next) => {
    if (next === stage) return;
    stage = next;
    tell("running");
    jobRepository.setStage(id, next).catch(logFailure(id));
  };
  try {
    const result = await work(report);
    // Stored before announcing: whoever receives "done" and asks for the result already finds it.
    await note("done", result, null);
    tell("done");
  } catch (error) {
    await note("error", undefined, (error as Error).message);
    tell("error", (error as Error).message);
  }
}

export const jobRunner: JobRunner = {
  async start(userId, work, { title = null } = {}) {
    const createdAt = new Date().toISOString();
    const job: Job = { id: uuidv4(), userId, status: "pending", stage: null, createdAt, updatedAt: createdAt };
    await jobRepository.insert(job);
    void execute(job, title, work);
    return job;
  },
  get: (id, userId) => jobRepository.find(id, userId),
};
