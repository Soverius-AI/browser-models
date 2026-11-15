/**
 * Waits for a shared promise, but stops waiting when `signal` aborts. The work itself goes on
 * (a model download is shared by every caller), only this caller gives up.
 */
export function untilAborted<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(signal.reason);
    signal.addEventListener('abort', stop, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', stop));
  });
}

/**
 * True for the error of a stopped operation: an aborted signal, or a load that ended because
 * the model was unloaded. Nothing failed, so it is not shown to the user.
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
