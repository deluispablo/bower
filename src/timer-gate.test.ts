/** The timer gate (testing/timer-gate.ts) on fixtures: a fake host stands in for the clock, so no test here waits. */
import { describe, expect, it, vi } from 'vitest';
import { createTimerGate, fullName, type TimerHost } from '../testing/timer-gate';

/** A host whose timers fire when the fixture says, instead of after the time asked for. */
const fixtureHost = (): { host: TimerHost; fireAll: () => void } => {
  const due: Array<() => void> = [];
  const schedule = (handler: unknown): number => (due.push(handler as () => void), due.length);
  return { host: { setTimeout: schedule, setInterval: schedule }, fireAll: () => due.splice(0).forEach((f) => f()) };
};

describe('the timer gate', () => {
  it('a real wait of 100 ms or more fails the unit run', () => {
    const { host, fireAll } = fixtureHost();
    const gate = createTimerGate(host, () => false, []);
    host.setTimeout(() => undefined, 150);
    fireAll();
    const problem = gate.finish('a suite a test that waits');
    // It names the test and the call site (this file), and says what to do.
    expect(problem).toContain('"a suite a test that waits"');
    expect(problem).toContain('setTimeout(150)');
    expect(problem).toContain('timer-gate.test.ts');
    expect(problem).toContain('vi.useFakeTimers()');
    // The next test starts clean.
    expect(gate.finish('the next test')).toBeNull();
  });

  it('a timer under 100 ms, one cleared before it fires, or an allowed test, passes', () => {
    const { host, fireAll } = fixtureHost();
    const gate = createTimerGate(host, () => false, ['an allowed test']);
    host.setTimeout(() => undefined, 99);
    host.setTimeout(() => undefined, 150);
    // Not fired: a guard that is cleared waited for nothing.
    expect(gate.finish('guard')).toBeNull();
    host.setInterval(() => undefined, 100);
    fireAll();
    expect(gate.finish('an interval')).toContain('setInterval(100)');
    host.setTimeout(() => undefined, 500);
    fireAll();
    expect(gate.finish('an allowed test')).toBeNull();
  });

  it('a wait under fake timers passes the timer gate', () => {
    const { host, fireAll } = fixtureHost();
    let fake = true;
    const gate = createTimerGate(host, () => fake, []);
    host.setTimeout(() => undefined, 150);
    fireAll();
    expect(gate.finish('a fake wait')).toBeNull();
    // The same wait with fake timers off fails.
    fake = false;
    host.setTimeout(() => undefined, 150);
    fireAll();
    expect(gate.finish('a real wait')).toContain('a real wait');
  });

  it('a wait under vitest fake timers runs without waiting, in the installed gate', async () => {
    vi.useFakeTimers();
    try {
      let done = false;
      setTimeout(() => (done = true), 150);
      await vi.advanceTimersByTimeAsync(150);
      expect(done).toBe(true);
      expect(vi.isFakeTimers()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the test name is its suites and title, joined as the unit report writes it', () => {
    const file = { name: 'src/a.test.ts', type: 'file' };
    const suite = { name: 'outer', type: 'suite', suite: file };
    expect(fullName({ name: 'inner test', suite: { name: 'inner', type: 'suite', suite } as never })).toBe('outer inner inner test');
    expect(fullName({ name: 'top test', suite: file })).toBe('top test');
  });
});
