import { CustomGameWriter, CustomQuotaChecker, JobRunner } from "./customGamePorts";
import { GenerationLog } from "./generationPorts";
import { LevelInterpreter, LevelRepository } from "./levelPorts";
import { AvatarRepository, PasswordHasher, SessionRepository, UserRepository } from "./userPorts";

export * from "./customGamePorts";
export * from "./generationPorts";
export * from "./levelPorts";
export * from "./userPorts";

/** Everything the use cases need from the outside world. Built once in container.ts. */
export interface Deps {
  levels: LevelRepository;
  users: UserRepository;
  sessions: SessionRepository;
  avatars: AvatarRepository;
  passwords: PasswordHasher;
  interpreter: LevelInterpreter;
  gameWriter: CustomGameWriter;
  jobs: JobRunner;
  generations: GenerationLog;
  customQuota: CustomQuotaChecker;
  newId: () => string;
  settings: { customGamesEnabled: () => boolean };
}
