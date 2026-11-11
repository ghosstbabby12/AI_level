import Anthropic from "@anthropic-ai/sdk";
import { UserFacingError } from "../../application/errors";
import { CustomGameUsage, CustomGameWriter } from "../../application/ports";
import { config } from "../../config/config";
import { gameWriterClient } from "./anthropicClient";
import { findGameProblems } from "./gameChecks";
import { SYSTEM_PROMPT, userMessage } from "./prompts/customGamePrompt";

/** A full single-file game fits comfortably; more would be paying for padding. */
const MAX_OUTPUT_TOKENS = 20_000;
const MAX_HTML_BYTES = 200_000;

/** What the user reads when the game could not be fixed; the technical detail goes to the log. */
const UNFIXABLE =
  "La IA escribió un juego con errores y no pudo corregirlo, así que no se guardó ni cuenta para tu límite diario. " +
  "Vuelve a intentarlo o describe el juego de otra forma (por ejemplo, con reglas más simples).";

export class InvalidGameError extends UserFacingError {
  constructor(readonly problems: string[]) {
    super(UNFIXABLE, `juego invalido tras corregir: ${problems.join(" | ")}`);
  }
}

async function requestGame(messages: Anthropic.MessageParam[]) {
  const anthropic = gameWriterClient();
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY no definida");
  const message = await anthropic.messages
    .stream({ model: config.anthropicModel, max_tokens: MAX_OUTPUT_TOKENS, thinking: { type: "disabled" }, system: SYSTEM_PROMPT, messages })
    .finalMessage();
  const usage: CustomGameUsage = { model: message.model, tokensIn: message.usage.input_tokens, tokensOut: message.usage.output_tokens };
  console.log(`[custom game] ${usage.model} tokens: in=${usage.tokensIn} out=${usage.tokensOut}`);
  const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  return { text, usage, stop: message.stop_reason };
}

function extractHtml(text: string): string {
  const fenced = text.match(/```html\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

const addUsage = (total: CustomGameUsage | null, usage: CustomGameUsage): CustomGameUsage =>
  total ? { ...usage, tokensIn: total.tokensIn + usage.tokensIn, tokensOut: total.tokensOut + usage.tokensOut } : usage;

const fixRequest = (problems: string[]) =>
  `El juego no se puede publicar porque tiene estos problemas:\n${problems.map((p) => `- ${p}`).join("\n")}\n\n` +
  "Corrígelos y responde con el documento HTML completo corregido, dentro de un bloque ```html.";

/**
 * Asks Claude for a whole game and returns its HTML. When the game has problems, one fix is
 * requested with the exact detail; if it is still broken, InvalidGameError and nothing is saved.
 * onUsage receives the running total after every call, before validating it: a rejected game
 * was paid for too and must be logged.
 */
export const customGameWriter: CustomGameWriter = {
  async write(spec, onUsage, onStage) {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage(spec) }];
    let total: CustomGameUsage | null = null;
    let problems: string[] = [];

    for (let attempt = 1; attempt <= 2; attempt++) {
      onStage(attempt === 1 ? "writing" : "fixing");
      const { text, usage, stop } = await requestGame(messages);
      total = addUsage(total, usage);
      onUsage(total);
      if (stop === "max_tokens") throw new UserFacingError("El juego quedó demasiado largo y salió incompleto. Prueba a pedir algo más sencillo.");
      if (stop === "refusal") throw new UserFacingError("No se puede crear un juego con esa descripción.");

      onStage("validating");
      const html = extractHtml(text);
      if (Buffer.byteLength(html) > MAX_HTML_BYTES) throw new UserFacingError("El juego resultó demasiado grande. Prueba a pedir algo más sencillo.");
      problems = findGameProblems(html);
      if (problems.length === 0) return html;

      console.warn(`[custom game] attempt ${attempt} has problems: ${problems.join(" | ")}`);
      messages.push({ role: "assistant", content: text }, { role: "user", content: fixRequest(problems) });
    }
    throw new InvalidGameError(problems);
  },
};
