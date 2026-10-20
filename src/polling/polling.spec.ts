import { POLL_BUSY, Poller } from './poller';
import { Watchdog } from './watchdog';

describe('Poller', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-10-20T09:00:00Z')));
  afterEach(() => jest.useRealTimers());

  it('runs every interval until stopped', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const poller = new Poller({ intervalMs: 60_000, run });
    poller.start();
    poller.start(); // idempotent
    await jest.advanceTimersByTimeAsync(180_000);
    expect(run).toHaveBeenCalledTimes(3);
    poller.stop();
    await jest.advanceTimersByTimeAsync(180_000);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('never runs two rounds at once', async () => {
    let release!: () => void;
    const poller = new Poller({ intervalMs: 60_000, run: () => new Promise<string>(r => (release = () => r('done'))) });
    const first = poller.runNow();
    await expect(poller.runNow()).resolves.toBe(POLL_BUSY);
    release();
    await expect(first).resolves.toBe('done');
    expect(poller.getLastRoundAt()).toEqual(new Date('2026-10-20T09:00:00Z'));
  });

  it('is stuck after three intervals without a finished round', async () => {
    const poller = new Poller({ intervalMs: 60_000, run: async () => undefined });
    expect(poller.getLastRoundAt()).toBeNull();
    jest.setSystemTime(new Date('2026-10-20T09:03:00Z'));
    expect(poller.isStuck()).toBe(false);
    jest.setSystemTime(new Date('2026-10-20T09:03:01Z'));
    expect(poller.isStuck()).toBe(true);
    await poller.runNow();
    expect(poller.isStuck()).toBe(false);
  });

  it('a failing round still counts as finished, and the error goes to onError', async () => {
    const onError = jest.fn();
    const poller = new Poller({ intervalMs: 60_000, run: () => Promise.reject(new Error('db down')), onError });
    poller.start();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(onError).toHaveBeenCalledWith(new Error('db down'));
    expect(poller.getLastRoundAt()).not.toBeNull();
    poller.stop();
  });
});

describe('Watchdog', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does nothing while all is fine', () => {
    const onStuck = jest.fn();
    const watchdog = new Watchdog({ check: () => null, onStuck, exit: jest.fn() });
    watchdog.start();
    jest.advanceTimersByTime(10 * 60_000);
    expect(onStuck).not.toHaveBeenCalled();
    watchdog.stop();
  });

  it('tells, then exits after the grace period, once', () => {
    const onStuck = jest.fn();
    const exit = jest.fn();
    let stuck: string | null = null;
    const watchdog = new Watchdog({ check: () => stuck, onStuck, exit, exitGraceMs: 5000 });
    watchdog.start();
    watchdog.start();

    jest.advanceTimersByTime(60_000);
    stuck = 'poll loop hung';
    jest.advanceTimersByTime(60_000);
    expect(onStuck).toHaveBeenCalledWith('poll loop hung');
    expect(exit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(5000);
    expect(exit).toHaveBeenCalledWith(1);
    jest.advanceTimersByTime(10 * 60_000);
    expect(onStuck).toHaveBeenCalledTimes(1);
  });
});
