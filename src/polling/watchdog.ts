export interface WatchdogOptions {
  /** Why the process is stuck, or null while it is fine. */
  check: () => string | null;
  /** Told before the exit, e.g. the admin. */
  onStuck: (reason: string) => void;
  intervalMs?: number;
  /** Time for the alert to leave before the process exits. */
  exitGraceMs?: number;
  exit?: (code: number) => void;
}

/**
 * Exits the process when something never recovers in-process (a hung poll
 * loop), so Docker (`restart: unless-stopped`) starts a fresh one.
 */
export class Watchdog {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly options: WatchdogOptions) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => this.tick(), this.options.intervalMs ?? 60_000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    const reason = this.options.check();
    if (!reason) {
      return;
    }
    this.stop();
    this.options.onStuck(reason);
    const exit = this.options.exit ?? ((code: number) => process.exit(code));
    setTimeout(() => exit(1), this.options.exitGraceMs ?? 5000);
  }
}
