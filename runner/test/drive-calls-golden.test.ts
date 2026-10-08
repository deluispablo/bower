import { describe, it, expect } from 'vitest';
import { DRIVE_MS, modelled, type Call } from './modelled';

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

    // Total Drive calls (reads + writes): 106 reads + 28 writes = 134 calls
    const totalDriveCalls = calls.filter((c) => c.kind === 'read' || c.kind === 'write').length;
    expect(totalDriveCalls).toBe(134);

    const count = analyzeCalls(calls);

    // Golden values from C04 runs on both a566241 and 35edc8b (current HEAD):
    // Both have identical call counts: 134 total Drive calls, with no difference.
    // Modelled total: ~461ms (a566241) to ~481ms (HEAD).
    // Live rise from 35s to 49s is NOT explained by extra calls or timing attribution alone:
    // modelled shows no difference, so the live rise is real Drive latency variance.
    expect(count.token).toBe(2);
    expect(count.reads).toBe(17);
    expect(count.model).toBe(2);
    expect(count.apply).toBe(19);
    expect(count.checkpoints).toBe(4);
    expect(count.report).toBe(45);
    expect(count.status).toBe(4);
  });
});

/** The C04 run's Drive calls before the cut (TL-P4-08 addendum 6, at fd99ca3): 106 reads and 28 writes. */
const DRIVE_CALLS_BEFORE = 134;
/** Its modelled apply before the cut, from the opening checkpoint's answer to the closing checkpoint's send, at 150 ms a call. */
const APPLY_MS_BEFORE = 13350;

describe('drive-calls-cut', () => {
  it('the C04 run makes at least 40 percent fewer Drive calls', async () => {
    const { calls, code } = await modelled();
    expect(code).toBe(0);
    const drive = calls.filter((c) => c.kind === 'read' || c.kind === 'write').length;
    expect(drive).toBeLessThanOrEqual(Math.floor(DRIVE_CALLS_BEFORE * 0.6));
  });

  it('offer-and-flat apply takes at most half its modelled time', async () => {
    const { calls, code } = await modelled();
    expect(code).toBe(0);
    const opening = calls.find((c) => c.kind === 'write' && c.name?.startsWith('checkpoint-1-'));
    const closing = calls.find((c) => c.kind === 'write' && c.name?.startsWith('checkpoint-2-'));
    if (!opening || !closing) throw new Error('the opening or the closing checkpoint is missing');
    const apply = closing.at - (opening.at + DRIVE_MS);
    console.log(`apply: modelled ${apply} ms (was ${APPLY_MS_BEFORE})`);
    expect(apply).toBeLessThanOrEqual(APPLY_MS_BEFORE / 2);
  });
});
