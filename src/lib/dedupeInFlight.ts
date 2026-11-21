const inFlight = new Map<string, Promise<unknown>>();

/**
 * Share one in-flight request between callers that ask for the same thing at
 * the same time (several components on mount, React Strict Mode's double
 * effect in dev). Once it settles the next call starts a fresh request.
 */
export function dedupeInFlight<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
