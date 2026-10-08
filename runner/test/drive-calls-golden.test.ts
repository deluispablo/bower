import { describe, it, expect } from 'vitest';
import { modelled, type Call } from './modelled';

interface PhaseCount {
  name: string;
  token: number;
  reads: number;
  model: number;
  apply: number;
  checkpoints: number;
  report: number;
  status: number;
}

/**
 * Analyze calls per phase. The run's sequence is:
 * 1. token: Worker /token call(s)
 * 2. reads: Drive GETs before first write (plan reads)
 * 3. model: Worker /attempt call(s) during planning (model inference)
 * 4. apply: Drive writes for folder operations (non-checkpoint writes)
 * 5. checkpoints: Drive multipart writes with "checkpoint-" name
 * 6. report: Drive operations between "saving" and "done" status (includes attempt status checks)
 * 7. status: Worker /status calls
 *
 * Note: in the modelled output, attempt calls in the report phase are status checks during reporting,
 * not the model inference step.
 */
function analyzeCalls(calls: Call[]): PhaseCount {
  const count = {
    name: 'C04',
    token: 0,
    reads: 0,
    model: 0,
    apply: 0,
    checkpoints: 0,
    report: 0,
    status: 0,
  };

  const statusCalls = calls
    .map((c, i) => ({ c, i }))
    .filter((x) => x.c.kind === 'status');
  const firstWrite = calls.findIndex((c) => c.kind === 'write');

  if (firstWrite < 0 || statusCalls.length < 2) {
    throw new Error('Could not find first write or at least 2 status calls');
  }

  // Report phase starts at the second-to-last status call or later
  const reportStartIdx = Math.max(firstWrite, statusCalls[Math.max(0, statusCalls.length - 2)]?.i ?? 0);
  const doneCallIdx = statusCalls[statusCalls.length - 1]?.i ?? calls.length;

  for (const [i, call] of calls.entries()) {
    if (call.kind === 'token') {
      count.token++;
    } else if (call.kind === 'status') {
      count.status++;
    } else if (call.kind === 'attempt') {
      if (i < firstWrite) {
        count.model++;
      } else {
        count.report++;
      }
    } else if (call.kind === 'read') {
      if (i < firstWrite) {
        count.reads++;
      } else if (i >= reportStartIdx && i < doneCallIdx) {
        count.report++;
      }
    } else if (call.kind === 'write') {
      if (call.name?.startsWith('checkpoint-')) {
        count.checkpoints++;
      } else if (i >= reportStartIdx && i < doneCallIdx) {
        count.report++;
      } else {
        count.apply++;
      }
    }
  }

  return count;
}

describe('the C04 run makes the golden number of Drive calls per step', () => {
  it('the C04 run makes the golden number of Drive calls per step', async () => {
    const { calls, code } = await modelled();
    expect(code).toBe(0);

    const count = analyzeCalls(calls);

    // Golden values from C04 runs on both a566241 and 35edc8b (current HEAD):
    // Both have identical call counts, confirming the runner got slower due to timing
    // attribution changes (checkpoints timing), not real extra Drive calls.
    expect(count.token).toBe(2);
    expect(count.reads).toBe(17);
    expect(count.model).toBe(2);
    expect(count.apply).toBe(19);
    expect(count.checkpoints).toBe(4);
    expect(count.report).toBe(45);
    expect(count.status).toBe(4);
  });
});
