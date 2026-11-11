import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Interpretation, LevelInterpreter, ParseTrace } from "../../application/ports";
import { mentionsLevel, parseDescriptionKeywords } from "../../domain/interpretation/keywordParser";
import { basicRejection, NOT_A_LEVEL_REASON } from "../../domain/interpretation/promptCheck";
import { config } from "../../config/config";
import { AiSpec, AiSpecSchema, aiSpecToLevelSpec } from "./aiSpec";
import { interpreterClient } from "./anthropicClient";
import { cached, cacheKey, remember, takeDailySlot } from "./interpretationBudget";
import { SYSTEM_PROMPT } from "./prompts/interpreterPrompt";

type AiCall = Pick<ParseTrace, "model" | "tokensIn" | "tokensOut" | "cacheRead" | "cacheWrite">;
const NO_CALL: AiCall = { model: null, tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 };
const MAX_OUTPUT_TOKENS = 600;

/** Claude's answer (null when unusable) and what it cost, even when unusable. */
async function requestAiSpec(anthropic: Anthropic, description: string): Promise<{ ai: AiSpec | null; call: AiCall }> {
  const response = await anthropic.messages.parse({
    model: config.anthropicModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    // Short classification task: no extended thinking, so tokens go to the JSON.
    thinking: { type: "disabled" },
    // The system prompt is identical on every call, so it is cached (reads cost ~0.1x for 5
    // minutes). The only thing that changes, the description, goes after the cache point.
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `<descripcion>${description}</descripcion>` }],
    output_config: { format: zodOutputFormat(AiSpecSchema) },
  });
  const { usage } = response;
  const call: AiCall = {
    model: response.model,
    tokensIn: usage.input_tokens,
    tokensOut: usage.output_tokens,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
  };
  console.log(`[interpreter] ${call.model} tokens: in=${call.tokensIn} cache_write=${call.cacheWrite} cache_read=${call.cacheRead} out=${call.tokensOut}`);

  if (response.stop_reason !== "end_turn") {
    console.warn(`[interpreter] incomplete answer (stop_reason=${response.stop_reason}); using fallback`);
    return { ai: null, call };
  }
  // parse() already validates with the schema; validated again so we do not depend on that SDK detail.
  const result = AiSpecSchema.safeParse(response.parsed_output);
  if (!result.success) {
    console.warn(`[interpreter] invalid JSON from the model: ${result.error.message}`);
    return { ai: null, call };
  }
  return { ai: result.data, call };
}

function fromAi(ai: AiSpec, description: string, seed: number, trace: ParseTrace): Interpretation {
  if (!ai.is_level_request) return { ok: false, reason: ai.rejection_reason?.trim() || NOT_A_LEVEL_REASON, trace };
  return { ok: true, spec: aiSpecToLevelSpec(ai, description, seed), trace };
}

function describeApiError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "ANTHROPIC_API_KEY invalida";
  if (error instanceof Anthropic.RateLimitError) return "limite de tasa de la API";
  if (error instanceof Anthropic.APIError) return `error de API ${error.status}: ${error.message}`;
  return `fallo inesperado: ${(error as Error).message}`;
}

/**
 * Turns a free description into a LevelSpec by asking Claude for a structured spec, or
 * returns why the text does not ask for a level. Never throws: without an API key, when the
 * call fails or the JSON does not validate, it uses the keyword interpreter.
 */
export async function parseDescription(description: string, seed?: number): Promise<Interpretation> {
  const basic = basicRejection(description);
  if (basic) return { ok: false, reason: basic, trace: { source: "basic", ...NO_CALL } };

  const resolvedSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
  const fallback = (reason: NonNullable<ParseTrace["fallbackReason"]>, call: AiCall = NO_CALL, apiError?: string): Interpretation => {
    const trace: ParseTrace = { source: "keywords", fallbackReason: reason, ...call, ...(apiError ? { apiError } : {}) };
    return mentionsLevel(description)
      ? { ok: true, spec: { ...parseDescriptionKeywords(description, resolvedSeed), source: "keywords" }, trace }
      : { ok: false, reason: NOT_A_LEVEL_REASON, trace };
  };

  const key = cacheKey(description);
  const known = cached(key);
  if (known) return fromAi(known, description, resolvedSeed, { source: "cache", ...NO_CALL });

  const anthropic = interpreterClient();
  if (!anthropic) return fallback("no_key");
  if (!takeDailySlot()) {
    console.warn(`[interpreter] daily cap of ${config.aiDailyLimit} calls reached; using fallback`);
    return fallback("daily_limit");
  }
  try {
    const { ai, call } = await requestAiSpec(anthropic, description);
    if (!ai) return fallback("invalid_output", call);
    remember(key, ai);
    return fromAi(ai, description, resolvedSeed, { source: "ai", ...call });
  } catch (error) {
    const message = describeApiError(error);
    console.warn(`[interpreter] ${message}; using fallback`);
    return fallback("api_error", NO_CALL, message);
  }
}

export const levelInterpreter: LevelInterpreter = { interpret: parseDescription };
