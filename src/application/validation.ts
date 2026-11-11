import { invalid } from "./errors";

type Check<T> = { ok: true; value: T } | { ok: false; error: string };

/** Returns the checked value, or throws a 400 with the rule's message (and the form field). */
export function valid<T>(check: Check<T>, field?: string): T {
  if (!check.ok) throw invalid(check.error, field);
  return check.value;
}
