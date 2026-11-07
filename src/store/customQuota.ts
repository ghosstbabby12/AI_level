import { first } from "./db";

/**
 * Tope de juegos escritos a medida por usuario en una ventana movil de 24 horas.
 * Cada uno cuesta unos 10-20 centavos de API, asi que el limite es por persona y
 * se calcula desde la base: sobrevive a reinicios y no lo agota un solo usuario.
 */
const WINDOW_MS = 24 * 60 * 60_000;
export const CUSTOM_GAMES_PER_DAY = Number(process.env.CUSTOM_GAMES_PER_USER_PER_DAY) || 5;

export type CustomQuota =
  | { allowed: true; used: number; limit: number }
  | { allowed: false; used: number; limit: number; retryAt: Date };

export async function checkCustomQuota(userId: number, now = new Date()): Promise<CustomQuota> {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  const saved = await first<{ n: number; oldest: string | null }>(
    "SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM levels WHERE user_id = ? AND layout = 'custom' AND created_at >= ?",
    [userId, since],
  );
  // Los que se estan escribiendo aun no estan en levels; sin contarlos, varios pedidos
  // seguidos pasarian el control a la vez. Hoy los trabajos solo se usan para juegos a medida.
  const inProgress = await first<{ n: number }>("SELECT COUNT(*) AS n FROM jobs WHERE user_id = ? AND status IN ('pending', 'running')", [userId]);

  const used = Number(saved?.n ?? 0) + Number(inProgress?.n ?? 0);
  if (used < CUSTOM_GAMES_PER_DAY) return { allowed: true, used, limit: CUSTOM_GAMES_PER_DAY };

  // Se libera un cupo cuando el juego mas antiguo de la ventana cumple 24 horas. Si todos
  // estan aun en proceso, contaran desde que se guarden: unas 24 horas a partir de ahora.
  const oldest = saved?.oldest ? new Date(saved.oldest) : now;
  return { allowed: false, used, limit: CUSTOM_GAMES_PER_DAY, retryAt: new Date(oldest.getTime() + WINDOW_MS) };
}

/** "3 h 12 min", "45 min" o "un minuto": sin hora del dia, que dependeria de la zona horaria del servidor. */
export function formatWait(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes === 1) return "un minuto";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
