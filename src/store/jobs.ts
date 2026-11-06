import { v4 as uuidv4 } from "uuid";

/**
 * Trabajos largos (juegos escritos por la IA). Viven en memoria: si el servidor
 * se reinicia a mitad, el cliente vera "no encontrado" y podra reintentar.
 */
export interface Job {
  id: string;
  userId: number;
  status: "pending" | "done" | "failed";
  result?: unknown;
  error?: string;
  createdAt: number;
}

const JOB_TTL_MS = 15 * 60_000;
const jobs = new Map<string, Job>();

function sweep(): void {
  const now = Date.now();
  for (const [id, job] of jobs) if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
}

export function startJob(userId: number, work: () => Promise<unknown>): Job {
  sweep();
  const job: Job = { id: uuidv4(), userId, status: "pending", createdAt: Date.now() };
  jobs.set(job.id, job);
  work()
    .then((result) => {
      job.status = "done";
      job.result = result;
    })
    .catch((error) => {
      job.status = "failed";
      job.error = (error as Error).message;
    });
  return job;
}

export function getJob(id: string, userId: number): Job | undefined {
  const job = jobs.get(id);
  return job && job.userId === userId ? job : undefined;
}
