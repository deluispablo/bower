/**
 * The timer gate (TL-P4-17 addendum 9). A unit test that schedules a real `setTimeout` or `setInterval` of 100 ms or
 * more while fake timers are off waits on the machine's clock, so it is slow under load and says nothing about the
 * code. It fails, naming the test and the call site; the fix is `vi.useFakeTimers()` and advancing time
 * (https://vitest.dev/guide/mocking/timers). `testing/real-timers.json` lists the tests allowed today and may only
 * shrink. Installed by each vitest config's setup file (https://vitest.dev/config/#setupfiles).
 */
export const TIMER_LIMIT_MS = 100;

type Schedule = (handler: unknown, ms?: number, ...rest: unknown[]) => unknown;
export interface TimerHost {
  setTimeout: Schedule;
  setInterval: Schedule;
}

export interface TimerGate {
  /** The problem to fail the finished test with, or null; forgets what the test scheduled. */
  finish(testName: string): string | null;
}

/** The first stack line with a file that is neither this file, a dependency nor Node: where the test (or the code it ran) set the timer. */
const callSite = (): string => {
  const lines = (new Error().stack ?? '').split('\n').slice(1).map((l) => l.trim().replace(/^at /, ''));
  const mine = lines.filter((l) => /:\d+:\d+\)?$/.test(l) && !l.includes('testing/timer-gate.ts'));
  return mine.find((l) => !l.includes('node_modules') && !l.includes('node:')) ?? mine[0] ?? 'an unknown call site';
};

/**
 * Wraps `host.setTimeout` and `host.setInterval`; with fake timers on, vitest swaps them out and the wrap is not reached.
 * A timer counts when it fires: a long timer that is cleared first (a guard, a library's own time limit) waits for nothing.
 */
export function createTimerGate(host: TimerHost, isFake: () => boolean, allow: readonly string[]): TimerGate {
  const fired: string[] = [];
  let test = 0;
  // vi.isFakeTimers() builds vitest's clock on first use, and that reads setTimeout: the wrap must not ask again then.
  let asking = false;
  const wrap = (kind: 'setTimeout' | 'setInterval'): void => {
    const real = host[kind];
    host[kind] = function (this: unknown, handler, ms, ...rest) {
      if (asking || typeof handler !== 'function' || !(Number(ms) >= TIMER_LIMIT_MS)) return real.call(host, handler, ms, ...rest);
      asking = true;
      let fake: boolean;
      try {
        fake = isFake();
      } finally {
        asking = false;
      }
      if (fake) return real.call(host, handler, ms, ...rest);
      const site = `${kind}(${String(ms)}) at ${callSite()}`;
      const scheduledIn = test;
      let counted = false;
      return real.call(
        host,
        (...args: unknown[]): unknown => {
          if (!counted && scheduledIn === test) fired.push(site);
          counted = true;
          return (handler as (...a: unknown[]) => unknown)(...args);
        },
        ms,
        ...rest,
      );
    };
  };
  wrap('setTimeout');
  wrap('setInterval');
  return {
    finish(testName) {
      const found = fired.splice(0);
      test += 1;
      if (found.length === 0 || allow.includes(testName)) return null;
      return `"${testName}" waited on a real timer of ${TIMER_LIMIT_MS} ms or more: ${found.join('; ')}. Use vi.useFakeTimers() and advance the time, or wait for the event, not the clock.`;
    },
  };
}
/** The test name as the unit report writes it: its suites and title joined by a space. */
export function fullName(task: { name: string; suite?: { name: string; type?: string } | undefined }): string {
  const names = [task.name];
  for (let s = task.suite as { name: string; type?: string; suite?: unknown } | undefined; s && s.type !== 'file' && s.name; s = s.suite as typeof s | undefined) names.unshift(s.name);
  return names.join(' ');
}
