import { rateLimit } from "express-rate-limit";
import { config } from "../../../config/config";

const limiter = (windowMs: number, limit: number, error?: string) =>
  rateLimit({ windowMs, limit, standardHeaders: "draft-8", legacyHeaders: false, ...(error && { message: { error } }) });

const MINUTE = 60_000;

/** Created per app, so every test server starts with fresh counters. */
export function createRateLimits() {
  return {
    /** Stops brute force against passwords. */
    auth: limiter(15 * MINUTE, 20, "Demasiados intentos. Espera unos minutos e intenta de nuevo."),
    /** Separate from sign-in, so it does not spend login attempts; stops guessing passwords from a stolen session. */
    profile: limiter(15 * MINUTE, 30, "Demasiados cambios seguidos. Espera unos minutos e intenta de nuevo."),
    /** Each generation may call the Claude API. */
    generate: limiter(MINUTE, config.generateLimitPerMinute, "Demasiadas generaciones seguidas. Espera un minuto e intenta de nuevo."),
    /** Editing never calls the AI: its own, wider limit. */
    edit: limiter(MINUTE, 60, "Demasiados cambios seguidos. Espera un minuto e intenta de nuevo."),
    /** A tab asks for a ticket when it connects and reconnects; the cap only stops abuse. */
    ticket: limiter(MINUTE, 30),
  };
}

export type RateLimits = ReturnType<typeof createRateLimits>;
