import { GeneratedLevel } from "../generator/types";

const MAX_LEVELS = 200;

const levels = new Map<string, GeneratedLevel>();

export function saveLevel(level: GeneratedLevel): void {
  levels.set(level.id, level);
  if (levels.size > MAX_LEVELS) {
    const oldestKey = levels.keys().next().value;
    if (oldestKey) levels.delete(oldestKey);
  }
}

export function getLevel(id: string): GeneratedLevel | undefined {
  return levels.get(id);
}
