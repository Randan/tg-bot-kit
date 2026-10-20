export const POLL_BUSY = 'busy' as const;

export interface PollerOptions<T> {
  intervalMs: number;
  /** One round. Errors are the task's to handle; one that escapes goes to `onError`. */
  run: () => Promise<T>;
  /** A loop that finished no round for this many intervals is stuck. */
  stuckAfterIntervals?: number;
  onError?: (error: unknown) => void;
}

/**
 * Runs a task every `intervalMs`, never two rounds at once, and knows when it
 * is stuck. A plain interval, not a cron step: `*\/7` leaves a gap every hour.
 */
export class Poller<T = void> {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly createdAt = Date.now();
  private lastRoundAt: number | null = null;

  constructor(private readonly options: PollerOptions<T>) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      this.runNow().catch(error => this.options.onError?.(error));
    }, this.options.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One round right now, or `busy` when one is already running. */
  async runNow(): Promise<T | typeof POLL_BUSY> {
    if (this.running) {
      return POLL_BUSY;
    }
    this.running = true;
    try {
      return await this.options.run();
    } finally {
      this.lastRoundAt = Date.now();
      this.running = false;
    }
  }

  getLastRoundAt(): Date | null {
    return this.lastRoundAt === null ? null : new Date(this.lastRoundAt);
  }

  isStuck(): boolean {
    const stuckAfterMs = this.options.intervalMs * (this.options.stuckAfterIntervals ?? 3);
    return Date.now() - (this.lastRoundAt ?? this.createdAt) > stuckAfterMs;
  }
}
