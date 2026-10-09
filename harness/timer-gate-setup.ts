// Setup file for the unit tests of the app, the api and the runner (their vitest configs): fails a test that waits on the
// real clock (harness/timer-gate.ts). https://vitest.dev/config/#setupfiles
import { afterAll, afterEach, beforeEach, vi } from 'vitest';
import allowed from './real-timers.json';
import { createTimerGate, fullName } from './timer-gate';

const gate = createTimerGate(globalThis as never, () => vi.isFakeTimers(), allowed.tests);
afterEach(({ task }) => {
  const problem = gate.finish(fullName(task));
  if (problem) throw new Error(problem);
});

// Each test's CPU time (this process, user plus system), written when the file's tests end for check-harness to report
// (scripts/harness-rules.mjs cpuReport). A report only: it never fails a test, since it moves with the machine. The
// api tests run in the Workers runtime, which has no process CPU clock: they report nothing.
/** Whether this runtime can read its process CPU time (the Workers runtime has the function but not the clock). */
const hasCpuClock = (): boolean => {
  try {
    process.cpuUsage();
    return true;
  } catch {
    // expected: the runtime has no CPU clock, so nothing is reported.
    return false;
  }
};
if (hasCpuClock()) {
  const cpu: Array<{ name: string; ms: number }> = [];
  let began = process.cpuUsage();
  beforeEach(() => {
    began = process.cpuUsage();
  });
  afterEach(({ task }) => {
    const used = process.cpuUsage(began);
    cpu.push({ name: fullName(task), ms: Math.round((used.user + used.system) / 1000) });
  });
  afterAll(async () => {
    if (!cpu.length) return;
    try {
      const { mkdirSync, writeFileSync } = await import('node:fs');
      mkdirSync('test-results/cpu', { recursive: true });
      writeFileSync(`test-results/cpu/${process.pid}-${Date.now()}.json`, JSON.stringify(cpu));
    } catch (cause) {
      // expected: a read-only checkout loses only the report.
      console.warn('CPU report not written', cause);
    }
  });
}
