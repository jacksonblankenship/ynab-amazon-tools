/** Message text for anything thrown. */
export const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : String(e));

/**
 * For lookups that can only miss if this script has a bug (e.g. a solver index out of range).
 * Throws rather than letting a missing value turn into a wrong dollar amount.
 */
export function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`Internal error: missing ${what}`);
  return v;
}
