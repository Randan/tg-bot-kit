export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`no answer in ${ms / 1000}s`);
    this.name = 'TimeoutError';
  }
}

/**
 * Rejects when the promise does not settle in time. For clients without a
 * timeout of their own (axios defaults, SDKs): a call that is never answered
 * would otherwise hang the caller forever.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
