import { createLimiter, mapWithConcurrency } from './concurrency';
import { isTransientError, retry } from './retry';
import { TimeoutError, withTimeout } from './timeout';

describe('withTimeout', () => {
  afterEach(() => jest.useRealTimers());

  it('passes a timely result through', async () => {
    await expect(withTimeout(Promise.resolve(1), 1000)).resolves.toBe(1);
  });

  it('rejects a call that is never answered', async () => {
    jest.useFakeTimers();
    const result = withTimeout(new Promise(() => undefined), 20_000);
    jest.advanceTimersByTime(20_000);
    await expect(result).rejects.toThrow(new TimeoutError(20_000));
    await expect(result).rejects.toThrow('no answer in 20s');
  });
});

describe('isTransientError', () => {
  it.each([
    ['DNS', Object.assign(new Error('getaddrinfo EAI_AGAIN api.unsplash.com'), { code: 'EAI_AGAIN' })],
    ["undici's fetch failed", Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_SOCKET' } })],
    ['bare fetch failed', new TypeError('fetch failed')],
    ['timeout', new TimeoutError(1000)],
    ['HTTP 503', Object.assign(new Error('x'), { status: 503 })],
    ['HTTP 429', Object.assign(new Error('x'), { statusCode: 429 })],
    ['axios 502', Object.assign(new Error('x'), { response: { status: 502 } })],
  ])('treats %s as transient', (_name, error) => {
    expect(isTransientError(error)).toBe(true);
  });

  it.each([
    ['HTTP 400', Object.assign(new Error('bad'), { status: 400 })],
    ['HTTP 401', Object.assign(new Error('x'), { response: { status: 401 } })],
    ['a plain bug', new Error('cannot read properties of undefined')],
    ['a non-error', 'oops'],
  ])('does not retry %s', (_name, error) => {
    expect(isTransientError(error)).toBe(false);
  });
});

describe('retry', () => {
  afterEach(() => jest.useRealTimers());

  it('retries transient errors with a doubling delay', async () => {
    jest.useFakeTimers();
    const task = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue('ok');
    const onRetry = jest.fn();
    const result = retry(task, { attempts: 3, delayMs: 1000, onRetry });

    await jest.advanceTimersByTimeAsync(999);
    expect(task).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toBe('ok');
    expect(onRetry.mock.calls.map(([, attempt]) => attempt)).toEqual([1, 2]);
  });

  it('gives up after the last attempt', async () => {
    const error = new TypeError('fetch failed');
    const task = jest.fn().mockRejectedValue(error);
    await expect(retry(task, { attempts: 2, delayMs: 1 })).rejects.toBe(error);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('does not retry an error that will not pass', async () => {
    const task = jest.fn().mockRejectedValue(Object.assign(new Error('bad request'), { status: 400 }));
    await expect(retry(task, { attempts: 5, delayMs: 1 })).rejects.toThrow('bad request');
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('takes a custom retry rule', async () => {
    const task = jest.fn().mockRejectedValueOnce(new Error('busy')).mockResolvedValue(1);
    await expect(
      retry(task, { attempts: 2, delayMs: 1, isRetryable: e => (e as Error).message === 'busy' }),
    ).resolves.toBe(1);
  });
});

describe('createLimiter', () => {
  it('runs at most N tasks at once, in order', async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;
    const order: number[] = [];
    const task = (id: number) =>
      limit(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        order.push(id);
        active -= 1;
        return id;
      });

    await expect(Promise.all([1, 2, 3, 4, 5].map(task))).resolves.toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it('frees the slot when a task fails', async () => {
    const limit = createLimiter(1);
    await expect(limit(() => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(limit(async () => 'next')).resolves.toBe('next');
  });

  it('rejects a bad limit', () => {
    expect(() => createLimiter(0)).toThrow('concurrency must be a positive integer');
  });
});

describe('mapWithConcurrency', () => {
  it('keeps the order of results', async () => {
    const result = await mapWithConcurrency([30, 10, 20], 2, async (ms, index) => {
      await new Promise(resolve => setTimeout(resolve, ms));
      return index;
    });
    expect(result).toEqual([0, 1, 2]);
  });

  it('handles an empty list', async () => {
    await expect(mapWithConcurrency([], 3, async x => x)).resolves.toEqual([]);
  });
});
