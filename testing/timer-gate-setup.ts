// Setup file for the unit tests of the app, the api and the runner (their vitest configs): fails a test that waits on the
// real clock (testing/timer-gate.ts). https://vitest.dev/config/#setupfiles
import { afterEach, vi } from 'vitest';
import allowed from './real-timers.json';
import { createTimerGate, fullName } from './timer-gate';

const gate = createTimerGate(globalThis as never, () => vi.isFakeTimers(), allowed.tests);
afterEach(({ task }) => {
  const problem = gate.finish(fullName(task));
  if (problem) throw new Error(problem);
});

