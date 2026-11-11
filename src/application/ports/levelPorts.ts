import { ChainedLevel, CustomGame, LevelSpec } from "../../domain/level/types";

/** A saved game: a generated level (11 styles) or a game written by the AI. */
export type StoredGame = ChainedLevel | CustomGame;

export interface LevelSummary {
  id: string;
  description: string;
  title: string;
  layout: StoredGame["layout"];
  theme: StoredGame["theme"];
  createdAt: string;
}

export interface LevelRepository {
  save(game: StoredGame, userId: number): Promise<void>;
  /** Only when the game belongs to the user; false otherwise. */
  update(game: StoredGame, userId: number): Promise<boolean>;
  get(id: string): Promise<StoredGame | undefined>;
  listByUser(userId: number, limit?: number): Promise<LevelSummary[]>;
  remove(id: string, userId: number): Promise<boolean>;
  isOwner(id: string, userId: number): Promise<boolean>;
}

/**
 * How the interpretation went and what it cost, logged in the generations table.
 * - basic: rejected by the local check, no AI call.
 * - cache: the same description was already interpreted; nothing paid.
 * - ai: Claude answered.
 * - keywords: the keyword interpreter was used; fallbackReason says why.
 */
export interface ParseTrace {
  source: "basic" | "cache" | "ai" | "keywords";
  fallbackReason?: "no_key" | "daily_limit" | "api_error" | "invalid_output";
  /** Model that answered according to the API, not the configured one. */
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheWrite: number;
  apiError?: string;
}

/** Either a spec ready to build, or why the text was rejected; always with its trace. */
export type Interpretation = ({ ok: true; spec: LevelSpec } | { ok: false; reason: string }) & { trace: ParseTrace };

export interface LevelInterpreter {
  interpret(description: string, seed?: number): Promise<Interpretation>;
}
