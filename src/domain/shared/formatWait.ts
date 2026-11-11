/** "3 h 12 min", "45 min" or "un minuto": no time of day, which would depend on the server time zone. */
export function formatWait(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes === 1) return "un minuto";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
