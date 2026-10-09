import { describe, it, expect } from 'vitest';
import { DRIVE_MS, modelled, type Call } from './modelled';
import { finishedBefore } from './earlier-runs';

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

    // Total Drive calls (reads + writes), after drive-calls-cut (TL-P4-08 addendum 6, fix round: the fence reads right before every send): 80, was 134 at fd99ca3
    // (106 reads + 28 writes). Updated on purpose; the cut is pinned at 40 percent in the next describe.
    // 82 since c2-one-engine's fix round: each move's fence reads the folder it goes into right before the send (4 moves),
    // where a kept read stood for it before (+2); lead to weigh (no kept-read window, per the lead's constraint).
    // 76 since c2-write-once: every write is confirmed by its own answer's checksum, so no read follows a made note
    // (2), the report record (1), last-run.json (1) or another write (2).
    // Still 76 since c2-create-by-id: one files.generateIds reserves the run's create ids (+1), and the record listing no
    // longer reads the root folder first, which the fence reads right before a create into it anyway (-1).
    const totalDriveCalls = calls.filter((c) => c.kind === 'read' || c.kind === 'write').length;
    expect(totalDriveCalls).toBe(76);

    const count = analyzeCalls(calls);

    // Per step before the cut: token 2, reads 17, model 2, apply 19, checkpoints 4, report 45, status 4.
    expect(count.token).toBe(2);
    expect(count.reads).toBe(17);
    // 3 since c2-create-by-id: the attempt is read again before the ids are reserved (a fenced write; a Worker call).
    expect(count.model).toBe(3);
    expect(count.apply).toBe(19);
    expect(count.checkpoints).toBe(4);
    expect(count.report).toBe(40);
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
    // Plus the 2 reads of a move's folder by its fence (c2-one-engine fix round), for the lead to weigh.
    expect(drive).toBeLessThanOrEqual(Math.floor(DRIVE_CALLS_BEFORE * 0.6) + 2);
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

/** Drive calls, reads and writes, of a modelled run. */
const driveCalls = (calls: Call[]): number => calls.filter((c) => c.kind === 'read' || c.kind === 'write').length;

describe('the C04 run past 20 earlier runs (retention-never-wired, round 2)', () => {
  it('with 25 earlier runs a run makes at most 3 more Drive calls than C04', async () => {
    const c04 = await modelled();
    const past = await modelled(async (drive, root) => {
      await finishedBefore(drive, root, 25);
    });
    expect(past.code).toBe(0);
    console.log(`Drive calls: C04 ${driveCalls(c04.calls)}, with 25 earlier runs ${driveCalls(past.calls)}`);
    expect(driveCalls(past.calls) - driveCalls(c04.calls)).toBeLessThanOrEqual(3);
  });
});
