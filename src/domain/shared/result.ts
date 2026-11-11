/** Outcome of a domain rule: a value, or a message for the user (and the field it refers to). */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string; field?: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const fail = <T = never>(error: string, field?: string): Result<T> => ({ ok: false, error, ...(field && { field }) });
