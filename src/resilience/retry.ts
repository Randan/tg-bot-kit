import { TimeoutError } from './timeout';

export interface RetryOptions {
  /** Attempts in total, the first one included. */
  attempts: number;
  /** Delay before the 2nd attempt; doubles after each further failure. */
  delayMs: number;
  /** Whether an error is worth another try; by default only transient network errors. */
  isRetryable?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number) => void;
}

const TRANSIENT_CODES = new Set([
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'ECONNABORTED',
]);

function codeOf(error: unknown): string | undefined {
  const err = error as { code?: unknown; cause?: { code?: unknown } };
  const code = err?.code ?? err?.cause?.code;
  return typeof code === 'string' ? code : undefined;
}

function statusOf(error: unknown): number | undefined {
  const err = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * A failure that may pass on its own: DNS hiccups, dropped connections,
 * Node's "fetch failed", timeouts, and HTTP 408/429/5xx.
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof TimeoutError) {
    return true;
  }
  const code = codeOf(error);
  if (code && TRANSIENT_CODES.has(code)) {
    return true;
  }
  const status = statusOf(error);
  if (status !== undefined) {
    return status === 408 || status === 429 || status >= 500;
  }
  return error instanceof Error && /fetch failed|socket hang up|network/i.test(error.message);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Runs `task` until it succeeds, a non-retryable error comes, or the attempts run out. */
export async function retry<T>(task: () => Promise<T>, options: RetryOptions): Promise<T> {
  const isRetryable = options.isRetryable ?? isTransientError;
  let delay = options.delayMs;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= options.attempts || !isRetryable(error)) {
        throw error;
      }
      options.onRetry?.(error, attempt);
      await sleep(delay);
      delay *= 2;
    }
  }
}
