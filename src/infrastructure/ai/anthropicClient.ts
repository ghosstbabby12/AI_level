import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config/config";

/**
 * Anthropic clients, created on first use. Each use has its own timeout: interpreting a
 * request must be quick (the fallback answers instead), writing a whole game takes minutes.
 */
const clients = new Map<string, Anthropic>();

function client(name: string, timeout: number, maxRetries: number): Anthropic | null {
  if (!config.anthropicKey) return null;
  let instance = clients.get(name);
  if (!instance) clients.set(name, (instance = new Anthropic({ timeout, maxRetries })));
  return instance;
}

export const interpreterClient = () => client("interpreter", 10_000, 1);
export const gameWriterClient = () => client("gameWriter", 4 * 60_000, 1);
