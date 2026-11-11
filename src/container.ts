import { v4 as uuidv4 } from "uuid";
import { Deps } from "./application/ports";
import { config } from "./config/config";
import { customGameWriter } from "./infrastructure/ai/customGameWriter";
import { levelInterpreter } from "./infrastructure/ai/levelInterpreter";
import { jobRunner } from "./infrastructure/jobs/jobRunner";
import { avatarRepository } from "./infrastructure/repositories/avatarRepository";
import { generationRepository } from "./infrastructure/repositories/generationRepository";
import { levelRepository } from "./infrastructure/repositories/levelRepository";
import { quotaRepository } from "./infrastructure/repositories/quotaRepository";
import { sessionRepository } from "./infrastructure/repositories/sessionRepository";
import { userRepository } from "./infrastructure/repositories/userRepository";
import { passwordHasher } from "./infrastructure/security/passwords";

/**
 * Composition root: the only place that knows which implementation backs each port.
 * Use cases receive this object; tests can build their own with fakes.
 */
export const container: Deps = {
  levels: levelRepository,
  users: userRepository,
  sessions: sessionRepository,
  avatars: avatarRepository,
  passwords: passwordHasher,
  interpreter: levelInterpreter,
  gameWriter: customGameWriter,
  jobs: jobRunner,
  generations: generationRepository,
  customQuota: quotaRepository,
  newId: uuidv4,
  settings: { customGamesEnabled: () => config.customGamesEnabled },
};
