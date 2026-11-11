/**
 * Every environment variable the app reads, in one place. Values are read when used
 * (getters), so tests and the hosting panel can change them without reloading modules.
 */
const text = (name: string): string | undefined => {
  // Pasting values into a hosting panel often adds spaces or quotes.
  const value = process.env[name]?.trim().replace(/^["']|["']$/g, "");
  return value || undefined;
};
const number = (name: string, fallback: number): number => Number(process.env[name]) || fallback;

export const config = {
  get port() { return number("PORT", 3000); },
  /** Behind a cloud proxy: without it, rate limits would see every user as the proxy IP. */
  get trustProxy() { return Number(process.env.TRUST_PROXY ?? 1); },
  get production() { return process.env.NODE_ENV === "production"; },
  /** Development only: serves the frontend from its repo to have a single origin. */
  get frontendDir() { return text("FRONTEND_DIR"); },

  get databaseUrl() { return text("TURSO_DATABASE_URL"); },
  get databaseToken() { return text("TURSO_AUTH_TOKEN")?.replace(/^Bearer\s+/i, ""); },
  get databasePath() { return process.env.DB_PATH; },

  get anthropicKey() { return text("ANTHROPIC_API_KEY"); },
  get anthropicModel() { return process.env.ANTHROPIC_MODEL || "claude-opus-5"; },
  /** Daily cap of AI interpretations to bound spending; past it, the keyword fallback is used. */
  get aiDailyLimit() { return number("AI_DAILY_LIMIT", 1000); },

  get customGamesEnabled() { return process.env.CUSTOM_GAMES !== "off"; },
  get customGamesPerDay() { return number("CUSTOM_GAMES_PER_USER_PER_DAY", 5); },
  get generateLimitPerMinute() { return number("GENERATE_LIMIT_PER_MINUTE", 20); },
  get levelCandidates() { return number("LEVEL_CANDIDATES", 8); },
  get publicWsUrl() { return text("PUBLIC_WS_URL"); },
};
