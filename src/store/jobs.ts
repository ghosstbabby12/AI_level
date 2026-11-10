import { v4 as uuidv4 } from "uuid";
import { first, run } from "./db";
import { JobStage, publish } from "../realtime/hub";

/**
 * Trabajos largos (juegos escritos por la IA), guardados en la base para que su
 * estado sobreviva a un reinicio. El trabajo en si corre en este proceso: si el
 * servidor se reinicia a mitad, recoverInterruptedJobs lo marca como error al
 * arrancar y el cliente ve un mensaje claro en su siguiente consulta.
 */
export type JobStatus = "pending" | "running" | "done" | "error";
export type { JobStage };
/** El trabajo avisa en que etapa esta; se guarda y se empuja en vivo a las pestanas del usuario. */
export type ReportStage = (stage: JobStage) => void;

export interface Job {
  id: string;
  userId: number;
  status: JobStatus;
  stage: JobStage | null;
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

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
const CLEANUP_INTERVAL_MS = 60 * 60_000;
const INTERRUPTED_MESSAGE = "La creación del juego se interrumpió porque el servidor se reinició. Vuelve a intentarlo.";

const now = () => new Date().toISOString();

async function setStatus(id: string, status: JobStatus, result: unknown, errorMessage: string | null): Promise<void> {
  await run("UPDATE jobs SET status = ?, result = ?, error_message = ?, updated_at = ? WHERE id = ?", [
    status,
    result === undefined ? null : JSON.stringify(result),
    errorMessage,
    now(),
    id,
  ]);
}

async function execute(job: Job, title: string | null, work: (report: ReportStage) => Promise<unknown>): Promise<void> {
  const { id, userId } = job;
  let stage: JobStage | null = null;
  // Primero se avisa en vivo y luego se anota: la base es para quien consulta despues (o sin WebSocket).
  // Un fallo al anotar no debe tumbar el proceso: queda en el log y el trabajo sigue.
  const tell = (status: JobStatus, error?: string) =>
    publish(userId, { type: "job", job: { id, status, stage, title, ...(error !== undefined && { error }) } });
  const note = (status: JobStatus, result: unknown, errorMessage: string | null) =>
    setStatus(id, status, result, errorMessage).catch((error) => console.error(`No se pudo actualizar el trabajo ${id}:`, error));

  await note("running", undefined, null);
  tell("running");
  const report: ReportStage = (next) => {
    if (next === stage) return;
    stage = next;
    tell("running");
    run("UPDATE jobs SET stage = ?, updated_at = ? WHERE id = ? AND status = 'running'", [next, now(), id]).catch((error) =>
      console.error(`No se pudo anotar la etapa del trabajo ${id}:`, error),
    );
  };
  try {
    const result = await work(report);
    // Se anota antes de avisar: quien reciba "done" y pida el resultado ya lo encuentra.
    await note("done", result, null);
    tell("done");
  } catch (error) {
    await note("error", undefined, (error as Error).message);
    tell("error", (error as Error).message);
  }
}

/** Registra el trabajo antes de devolverlo, para que la primera consulta del cliente ya lo encuentre. */
export async function startJob(
  userId: number,
  work: (report: ReportStage) => Promise<unknown>,
  { title = null }: { title?: string | null } = {},
): Promise<Job> {
  const createdAt = now();
  const job: Job = { id: uuidv4(), userId, status: "pending", stage: null, createdAt, updatedAt: createdAt };
  await run("INSERT INTO jobs (id, user_id, status, result, error_message, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, ?, ?)", [
    job.id,
    userId,
    job.status,
    createdAt,
    createdAt,
  ]);
  void execute(job, title, work);
  return job;
}

/** Solo lo ve su dueño: para cualquier otro usuario el trabajo no existe. */
export async function getJob(id: string, userId: number): Promise<Job | undefined> {
  const row = await first<JobRow>(
    "SELECT id, user_id, status, stage, result, error_message, created_at, updated_at FROM jobs WHERE id = ? AND user_id = ?",
    [id, userId],
  );
  if (!row) return undefined;
  return {
    id: row.id,
    userId: Number(row.user_id),
    status: row.status,
    stage: row.stage ?? null,
    result: row.result === null ? undefined : JSON.parse(row.result),
    error: row.error_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Al arrancar no hay ningun trabajo en marcha en este proceso: los que siguen
 * pendientes quedaron huerfanos por un reinicio. Solo debe llamarse al iniciar.
 */
export async function recoverInterruptedJobs(): Promise<number> {
  const result = await run("UPDATE jobs SET status = 'error', error_message = ?, updated_at = ? WHERE status IN ('pending', 'running')", [
    INTERRUPTED_MESSAGE,
    now(),
  ]);
  return result.rowsAffected;
}

export async function deleteOldJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - JOB_RETENTION_MS).toISOString();
  const result = await run("DELETE FROM jobs WHERE created_at < ?", [cutoff]);
  return result.rowsAffected;
}

/** Marca los huerfanos, borra los viejos y repite la limpieza cada hora. */
export async function startJobMaintenance(): Promise<void> {
  const interrupted = await recoverInterruptedJobs();
  if (interrupted) console.warn(`[trabajos] ${interrupted} trabajo(s) interrumpidos por el reinicio`);
  await deleteOldJobs();
  // unref: la limpieza no mantiene vivo el proceso por si sola.
  setInterval(() => {
    deleteOldJobs().catch((error) => console.error("No se pudieron borrar trabajos antiguos:", error));
  }, CLEANUP_INTERVAL_MS).unref();
}
