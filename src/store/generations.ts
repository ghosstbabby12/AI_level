import { v4 as uuidv4 } from "uuid";
import type { CustomGameUsage } from "../generator/customGame";
import type { ParseTrace } from "../generator/parser";
import { run } from "./db";

/**
 * Trazabilidad de POST /generate: una fila por pedido con lo que se interpreto, el
 * modelo, los tokens y como termino. Registrar nunca bloquea ni rompe la respuesta:
 * las escrituras corren en segundo plano y un fallo de la base solo queda en el log.
 */
export type GenerationStatus = "pending" | "success" | "rejected" | "error";

/** Por que no se genero: culpa del texto, del tope de gasto o de la configuracion. */
export type RejectionKind = "invalid_input" | "quota" | "disabled";

/** Lo que se marca en las filas que quedaron pendientes cuando el servidor se reinicio. */
export const INTERRUPTED_ON_RESTART = "interrupted_on_restart";

export interface GenerationEntry {
  userId: number | null;
  prompt: string;
  trace: ParseTrace;
  fit?: string | null;
  layout?: string | null;
  status: GenerationStatus;
  rejectionKind?: RejectionKind;
  errorMessage?: string | null;
  /** Desde que llego el pedido hasta que se respondio. */
  latencyMs: number;
}

/**
 * Una fila ya enviada a la base. Las actualizaciones posteriores se encadenan detras
 * del INSERT, asi nunca llegan antes que la fila aunque el trabajo termine enseguida.
 */
export interface GenerationRecord {
  id: string;
  chain: Promise<void>;
}

const now = () => new Date().toISOString();
const logFailure = (what: string) => (error: unknown) => console.error(`[generations] no se pudo ${what}:`, error);

export function recordGeneration(entry: GenerationEntry): GenerationRecord {
  const id = uuidv4();
  const { trace } = entry;
  const createdAt = now();
  const written = run(
    `INSERT INTO generations (id, user_id, prompt_original, source, fallback_reason, fit, layout, model,
       tokens_in, tokens_out, cache_read_tokens, cache_write_tokens, latency_ms, status, rejection_kind,
       error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      entry.userId,
      entry.prompt,
      trace.source,
      trace.fallbackReason ?? null,
      entry.fit ?? null,
      entry.layout ?? null,
      trace.model,
      trace.tokensIn,
      trace.tokensOut,
      trace.cacheRead,
      trace.cacheWrite,
      Math.round(entry.latencyMs),
      entry.status,
      entry.rejectionKind ?? null,
      // Si la IA fallo y se uso el respaldo, el pedido sale bien pero el motivo queda anotado.
      entry.errorMessage ?? trace.apiError ?? null,
      createdAt,
      createdAt,
    ],
  ).then(() => undefined, logFailure(`registrar la generacion ${id}`));
  return { id, chain: written };
}

function after(record: GenerationRecord, what: string, sql: string, args: (string | number | null)[]): Promise<void> {
  record.chain = record.chain.then(() => run(sql, args)).then(() => undefined, logFailure(what));
  return record.chain;
}

/** Enlaza la fila con su trabajo en segundo plano (juego a medida). */
export function linkJob(record: GenerationRecord, jobId: string): Promise<void> {
  return after(record, `enlazar el trabajo ${jobId}`, "UPDATE generations SET job_id = ?, updated_at = ? WHERE id = ?", [jobId, now(), record.id]);
}

export interface CustomOutcome {
  status: "success" | "error";
  errorMessage?: string;
  /** Ausente si la llamada fallo antes de que la API respondiera (nada que facturar). */
  usage?: CustomGameUsage;
  latencyMs: number;
}

/**
 * Cierra una fila pendiente con el resultado de escribir el juego. Solo toca filas
 * en pending: si el barrido de arranque ya la marco como interrumpida, no se pisa.
 */
export function finishCustomGeneration(record: GenerationRecord, outcome: CustomOutcome): Promise<void> {
  return after(
    record,
    `cerrar la generacion ${record.id}`,
    `UPDATE generations SET status = ?, error_message = ?, custom_model = ?, custom_tokens_in = ?, custom_tokens_out = ?,
       custom_latency_ms = ?, updated_at = ?
     WHERE id = ? AND status = 'pending'`,
    [
      outcome.status,
      outcome.errorMessage ?? null,
      outcome.usage?.model ?? null,
      outcome.usage?.tokensIn ?? 0,
      outcome.usage?.tokensOut ?? 0,
      Math.round(outcome.latencyMs),
      now(),
      record.id,
    ],
  );
}

/**
 * Al arrancar ningun juego se esta escribiendo en este proceso: las filas pendientes
 * quedaron huerfanas por un reinicio. Solo debe llamarse al iniciar.
 */
export async function recoverInterruptedGenerations(): Promise<number> {
  const result = await run("UPDATE generations SET status = 'error', error_message = ?, updated_at = ? WHERE status = 'pending'", [
    INTERRUPTED_ON_RESTART,
    now(),
  ]);
  return result.rowsAffected;
}
