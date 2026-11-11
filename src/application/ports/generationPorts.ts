import { CustomGameUsage } from "./customGamePorts";
import { ParseTrace } from "./levelPorts";

export type GenerationStatus = "pending" | "success" | "rejected" | "error";

/** Why nothing was generated: the text, the spending cap or the configuration. */
export type RejectionKind = "invalid_input" | "quota" | "disabled";

export interface GenerationEntry {
  userId: number | null;
  prompt: string;
  trace: ParseTrace;
  fit?: string | null;
  layout?: string | null;
  status: GenerationStatus;
  rejectionKind?: RejectionKind;
  errorMessage?: string | null;
  /** From the request arriving until the answer. */
  latencyMs: number;
}

/** A row already sent to the database; later updates are chained after its INSERT. */
export interface GenerationRecord {
  id: string;
  chain: Promise<void>;
}

export interface CustomOutcome {
  status: "success" | "error";
  errorMessage?: string;
  /** Missing when the call failed before the API answered (nothing billed). */
  usage?: CustomGameUsage;
  latencyMs: number;
}

/** Traceability of POST /generate. Logging never blocks or breaks the answer. */
export interface GenerationLog {
  record(entry: GenerationEntry): GenerationRecord;
  linkJob(record: GenerationRecord, jobId: string): Promise<void>;
  finishCustom(record: GenerationRecord, outcome: CustomOutcome): Promise<void>;
}
