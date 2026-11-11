import { generateFromSpec } from "../../domain/generation/toGeneratedLevel";
import { ChainedLevel } from "../../domain/level/types";
import { AppError, invalid } from "../errors";
import { Deps, GenerationEntry, Interpretation } from "../ports";
import { saveQuietly } from "./saveQuietly";
import { startCustomGame, Track } from "./startCustomGame";

const MAX_DESCRIPTION_LENGTH = 500;

export interface GenerateInput {
  userId: number;
  description: unknown;
  seed?: unknown;
}

export type GenerateOutcome =
  | { kind: "level"; level: ChainedLevel; saved: boolean; obstacles: string[]; interpretedBy?: "ai" | "keywords" }
  | { kind: "job"; jobId: string; title?: string; story?: string };

function checkInput({ description, seed }: GenerateInput): { description: string; seed?: number } {
  if (typeof description !== "string" || description.trim().length === 0) {
    throw invalid("El campo 'description' es requerido y debe ser texto.");
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) throw invalid(`La descripcion no puede superar ${MAX_DESCRIPTION_LENGTH} caracteres.`);
  if (seed !== undefined && !Number.isInteger(seed)) throw invalid("El campo 'seed' debe ser un entero.");
  return { description, seed: seed as number | undefined };
}

/** Every exit from here on leaves a row in generations (without waiting for the database). */
function tracker(deps: Deps, userId: number, prompt: string, parsed: Interpretation, startedAt: number): Track {
  return (entry: Pick<GenerationEntry, "status" | "rejectionKind" | "errorMessage">) =>
    deps.generations.record({
      userId,
      prompt,
      trace: parsed.trace,
      fit: parsed.ok ? parsed.spec.fit ?? null : null,
      layout: parsed.ok ? parsed.spec.layout : null,
      latencyMs: Date.now() - startedAt,
      ...entry,
    });
}

/**
 * Turns a description into a game. Styles that fit are built right away; anything else
 * becomes a background job where the AI writes a game from scratch.
 */
export async function generateLevel(deps: Deps, input: GenerateInput): Promise<GenerateOutcome> {
  const { description, seed } = checkInput(input);
  const startedAt = Date.now();
  const parsed = await deps.interpreter.interpret(description, seed);
  const track = tracker(deps, input.userId, description, parsed, startedAt);

  if (!parsed.ok) {
    track({ status: "rejected", rejectionKind: "invalid_input", errorMessage: parsed.reason });
    throw new AppError("unprocessable", parsed.reason, { code: "invalid_description" });
  }
  const { spec } = parsed;
  if (spec.fit === "custom") return startCustomGame(deps, spec, input.userId, track);

  let level: ChainedLevel;
  try {
    level = generateFromSpec(deps.newId(), spec);
  } catch (error) {
    track({ status: "error", errorMessage: (error as Error).message });
    throw new AppError("failed", (error as Error).message);
  }
  track({ status: "success" });
  const saved = await saveQuietly(deps.levels, level, input.userId);
  return { kind: "level", level, saved, obstacles: spec.obstacles ?? [], interpretedBy: spec.source };
}
