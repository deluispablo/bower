import { describe, it, expect } from 'vitest';
import { DRIVE_MS, drivecalls, modelled } from './modelled';
import { finishedBefore, runFolders } from './earlier-runs';
import type { FakeDrive } from '../../src/data/drive/fake-drive';

describe('the C04 run makes the golden number of Drive calls per step', () => {
  it('the C04 run makes the golden number of Drive calls per step', async () => {
    const { calls, code, timing } = await modelled();
    expect(code).toBe(0);

    // Total Drive calls (reads + writes), after drive-calls-cut (TL-P4-08 addendum 6, fix round: the fence reads right before every send): 80, was 134 at fd99ca3
    // (106 reads + 28 writes). Updated on purpose; the cut is pinned at 40 percent in the next describe.
    // 82 since c2-one-engine's fix round: each move's fence reads the folder it goes into right before the send (4 moves),
    // where a kept read stood for it before (+2); lead to weigh (no kept-read window, per the lead's constraint).
    // 76 since c2-write-once: every write is confirmed by its own answer's checksum, so no read follows a made note
    // (2), the report record (1), last-run.json (1) or another write (2).
    // Still 76 since c2-create-by-id: one files.generateIds reserves the run's create ids (+1), and the record listing no
    // longer reads the root folder first, which the fence reads right before a create into it anyway (-1).
    // 78 recorded exception: retention wiring (main 5733eb8, lead ruling option a).
    const totalDriveCalls = calls.filter((c) => c.kind === 'read' || c.kind === 'write').length;
    expect(totalDriveCalls).toBe(78);
    // The counts are timing's own (`timing.ts`), read from the line the runner logs; the golden infers no phase.
    expect(drivecalls(timing)).toBe(78);
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
const driveCalls = (run: { timing: string }): number => drivecalls(run.timing);

describe('the C04 run past 20 earlier runs (retention-never-wired, round 2)', () => {
  it('with 25 earlier runs a run makes 88 Drive calls', async () => {
    const c04 = await modelled();
    const past = await modelled(async (drive, root) => {
      await finishedBefore(drive, root, 25);
    });
    expect(past.code).toBe(0);
    console.log(`Drive calls: C04 ${driveCalls(c04)}, with 25 earlier runs ${driveCalls(past)}`);
    // +3: the children of the 3 run folders it bins are listed first (retention round 6, option A).
    expect(driveCalls(past)).toBe(88);
  });
});

describe('run records carry their run mark (retention round 6)', () => {
  it('every record Bower writes in a run folder carries its run mark', async () => {
    let seen: { drive: FakeDrive; root: string } | null = null;
    const run = await modelled(async (drive, root) => {
      seen = { drive, root };
    });
    expect(run.code).toBe(0);
    if (!seen) throw new Error('no drive');
    const { drive, root } = seen as { drive: FakeDrive; root: string };
    const folders = await runFolders(drive, root);
    expect(folders.size).toBe(1);
    const [runId, folder] = [...folders][0] ?? ['', null];
    if (!folder) throw new Error('no run folder');
    const inside = (await drive.listAll(root)).filter((f) => f.parents.includes(folder.id));
    // The manifest, its checkpoints, the report and dispositions.json at least.
    expect(inside.length).toBeGreaterThanOrEqual(4);
    expect(inside.filter((f) => f.appProperties?.bowerRun !== runId).map((f) => f.name)).toEqual([]);
  });
});
