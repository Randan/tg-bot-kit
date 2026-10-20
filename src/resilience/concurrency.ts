/**
 * Lets at most `max` tasks run at once; the rest wait in order. For APIs with a
 * concurrency limit, e.g. a batch of forwarded voice messages hitting a
 * speech-to-text API all at the same moment.
 */
export function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`concurrency must be a positive integer, got ${max}`);
  }
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    active -= 1;
    queue.shift()?.();
  };

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) {
      await new Promise<void>(resolve => queue.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      next();
    }
  };
}

/** Maps items with at most `concurrency` mappers running, keeping the order of results. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = createLimiter(Math.max(1, Math.min(concurrency, items.length || 1)));
  return Promise.all(items.map((item, index) => limit(() => mapper(item, index))));
}
