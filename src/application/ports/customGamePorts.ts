import { LevelSpec } from "../../domain/level/types";

/** What writing a game cost, with the model that answered according to the API. */
export interface CustomGameUsage {
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export type JobStage = "writing" | "validating" | "fixing" | "saving";
export type JobStatus = "pending" | "running" | "done" | "error";
/** A running job reports its stage; it is stored and pushed live to the user's tabs. */
export type ReportStage = (stage: JobStage) => void;

export interface CustomGameWriter {
  /** Returns the game HTML. Throws UserFacingError when the game cannot be written. */
  write(spec: LevelSpec, onUsage: (usage: CustomGameUsage) => void, onStage: ReportStage): Promise<string>;
}

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

export interface JobRunner {
  /** Stores the job before returning it, so the client's first poll already finds it. */
  start(userId: number, work: (report: ReportStage) => Promise<unknown>, options?: { title?: string | null }): Promise<Job>;
  /** Only its owner sees a job: for anyone else it does not exist. */
  get(id: string, userId: number): Promise<Job | undefined>;
}

export type CustomQuota =
  | { allowed: true; used: number; limit: number }
  | { allowed: false; used: number; limit: number; retryAt: Date };

export interface CustomQuotaChecker {
  check(userId: number, now?: Date): Promise<CustomQuota>;
}
