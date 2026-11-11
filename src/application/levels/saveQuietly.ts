import { LevelRepository, StoredGame } from "../ports";

/**
 * Saves a new game but never fails the request: if the database is down the game can still
 * be played, it just will not appear in "Mis juegos". Returns whether it was saved.
 */
export async function saveQuietly(levels: LevelRepository, game: StoredGame, userId: number): Promise<boolean> {
  try {
    await levels.save(game, userId);
    return true;
  } catch (error) {
    console.error(`Could not save game ${game.id}:`, error);
    return false;
  }
}
