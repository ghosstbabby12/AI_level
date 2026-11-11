import "./config/env";
import { config } from "./config/config";
import { container } from "./container";
import { setLevelCandidates } from "./domain/generation/levelBuilder";
import { dbReady } from "./infrastructure/database/migrate";
import { startJobMaintenance } from "./infrastructure/jobs/jobMaintenance";
import { attachRealtime } from "./infrastructure/realtime/realtimeServer";
import { recoverInterruptedGenerations } from "./infrastructure/repositories/generationRepository";
import { createApp } from "./interfaces/http/app";

/** Entry point: prepares the database, cleans up after a restart and starts HTTP + WebSocket. */
async function main(): Promise<void> {
  setLevelCandidates(config.levelCandidates);
  await dbReady;
  await startJobMaintenance();
  const interrupted = await recoverInterruptedGenerations();
  if (interrupted) console.warn(`[generations] ${interrupted} custom game(s) interrupted by the restart`);

  const server = createApp(container).listen(config.port, () => {
    console.log(`Artificial Levels API listening on http://localhost:${config.port}`);
    if (!config.anthropicKey) console.warn("ANTHROPIC_API_KEY not set: the keyword interpreter will be used.");
  });
  attachRealtime(server);
}

main().catch((error) => {
  console.error("Could not start the server:", error);
  process.exit(1);
});
