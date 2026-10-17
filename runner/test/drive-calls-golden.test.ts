// B8 measured delta: +5 apply calls (log folder fence/create, month listing/fence/create).
import { describe, it, expect } from 'vitest';
import { DRIVE_MS, countsOf, drivecalls, modelled } from './modelled';
import { finishedBefore, runFolders } from './earlier-runs';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import { readTypeTable } from '../../src/data/contracts/note-format';

// TL-P4-47 addendum 8: first creation of the type table: listing, fence, create.
const TYPE_TABLE_FIRST_CREATE_CALLS = 3;
const MONTH_LOG_FIRST_CREATE_CALLS = 5;
// B8b AC13 (R8): first creation of the health note: root name-check listing, live root fence, create.
const HEALTH_FIRST_CREATE_CALLS = 3;

async function existingTable(drive: FakeDrive, root: string): Promise<void> {
  const sys = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === '.bower');
  if (!sys) throw new Error('The system folder is missing');
  await drive.createText(sys.id, 'type-table.json', JSON.stringify(readTypeTable(null).table));
}

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
    // TL-P4-41 addendum 4, round 3: +10 calls over the 78-call control.
    // Bootstrap: start token + root/folder/nested listings (4); each index/retrieval create:
    // .bower child listing + live parent metadata fence + create (3 each).
    // Removed: log name-check child listing, .bower parent fence and .bower/log.md create.
    // TL-P4-42 addendum 5: questions.json media (+1 reads); hot name-check listing,
    // live .bower parent fence and multipart create (+3 apply).
    // First creation of the type table: listing, fence, create (+3).
    // B8b: first creation of the health note: root listing, root fence, create (+3 apply).
    expect(totalDriveCalls).toBe(107);
    // The counts are timing's own (`timing.ts`), read from the line the runner logs; the golden infers no phase.
    expect(drivecalls(timing)).toBe(107);
    // By timing's phases (the Worker's token, model and status calls are not Drive calls; the two read outside any phase
    // are the run's first listings, before the plan reads).
    const calls_ = Object.fromEntries(Object.entries(countsOf(timing).phases).map(([k, v]) => [k, v.calls]));
    expect(calls_).toEqual({ token: 0, reads: 25, model: 0, apply: 66, checkpoints: 4, report: 10, status: 0, runner: 2 });
  });
  it('reading the type table: one media read', async () => {
    const run = await modelled(existingTable);
    expect(run.code).toBe(0);
    expect(run.calls.filter((c) => c.kind === 'read' || c.kind === 'write')).toHaveLength(105);
    expect(drivecalls(run.timing)).toBe(105);
    expect(Object.fromEntries(Object.entries(countsOf(run.timing).phases).map(([k, v]) => [k, v.calls])))
      .toEqual({ token: 0, reads: 26, model: 0, apply: 63, checkpoints: 4, report: 10, status: 0, runner: 2 });
  });
});

/** The C04 run's Drive calls before the cut (TL-P4-08 addendum 6, at fd99ca3): 106 reads and 28 writes. */
const DRIVE_CALLS_BEFORE = 134;
// Preserve Red repair 3's authorized cut and timing bounds; exact goldens pin round 3 above.
const MAINTENANCE_CALLS = 13;
const APPLY_MAINTENANCE_MS = 1350;
/** Its modelled apply before the cut, from the opening checkpoint's answer to the closing checkpoint's send, at 150 ms a call. */
const APPLY_MS_BEFORE = 13350;

describe('drive-calls-cut', () => {
  it('the C04 cut keeps its budget plus the 13 authorized maintenance calls', async () => {
    const { calls, code } = await modelled();
    expect(code).toBe(0);
    const drive = calls.filter((c) => c.kind === 'read' || c.kind === 'write').length;
    // TL-P4-42 addendum 5: questions.json media (+1 reads); hot name-check listing,
    // live .bower parent fence and multipart create (+3 apply).
    // Measured cold ceiling: 107 calls, including first creation of the type table, monthly log and health note.
    expect(drive).toBeLessThanOrEqual(Math.floor(DRIVE_CALLS_BEFORE * 0.6) + 2 + MAINTENANCE_CALLS + 1 + TYPE_TABLE_FIRST_CREATE_CALLS
      + MONTH_LOG_FIRST_CREATE_CALLS + HEALTH_FIRST_CREATE_CALLS);
  });

  it('offer-and-flat apply keeps its half-time budget plus the measured maintenance delta', async () => {
    const { calls, code } = await modelled();
    expect(code).toBe(0);
    const opening = calls.find((c) => c.kind === 'write' && c.name?.startsWith('checkpoint-1-'));
    const closing = calls.find((c) => c.kind === 'write' && c.name?.startsWith('checkpoint-2-'));
    if (!opening || !closing) throw new Error('the opening or the closing checkpoint is missing');
    const apply = closing.at - (opening.at + DRIVE_MS);
    console.log(`apply: modelled ${apply} ms (was ${APPLY_MS_BEFORE})`);
    // Red repair 3 bound: measured 4,880 -> 6,230 ms adds 1,350, not a boundary excess.
    // Round 3 measures 5,780 ms after removing three sequential 150 ms log calls; keep the bound.
    expect(apply).toBeLessThanOrEqual(APPLY_MS_BEFORE / 2 + APPLY_MAINTENANCE_MS);
  });
});

/** Drive calls, reads and writes, of a modelled run. */
const driveCalls = (run: { timing: string }): number => drivecalls(run.timing);

describe('the C04 run past 20 earlier runs (retention-never-wired, round 2)', () => {
  it('with 25 earlier runs and first creation of the type table a run makes 115 Drive calls', async () => {
    const c04 = await modelled();
    const past = await modelled(async (drive, root) => {
      await finishedBefore(drive, root, 25);
    });
    expect(past.code).toBe(0);
    console.log(`Drive calls: C04 ${driveCalls(c04)}, with 25 earlier runs ${driveCalls(past)}`);
    // +3: the children of the 3 run folders it bins are listed first (retention round 6, option A).
    // The same 10 maintenance calls plus listing earlier-run folders at the snapshot's extra depth.
    // Round 3 removes the log name-check listing, .bower parent fence and .bower/log.md create.
    // TL-P4-42 addendum 5: questions.json media (+1 reads); hot name-check listing,
    // live .bower parent fence and multipart create (+3 apply).
    // First creation of the type table: listing, fence, create (+3 in each creating run).
    // B8b: first creation of the health note (+3 apply in each creating run).
    expect(driveCalls(c04)).toBe(107);
    // TL-P4-42 addendum 5: questions.json media (+1 reads); hot name-check listing,
    // live .bower parent fence and multipart create (+3 apply).
    // Retained fixture: the same four calls; no hot history media.
    expect(driveCalls(past)).toBe(118);
    expect(Object.fromEntries(Object.entries(countsOf(past.timing).phases).map(([k, v]) => [k, v.calls])))
      .toEqual({ token: 0, reads: 28, model: 0, apply: 65, checkpoints: 4, report: 10, status: 0, runner: 11 });
    // Addendum 4 bounds the whole run under 20%, even when individual phases exceed 20%.
    // TL-P4-42 addendum 5: +600 ms (4 x 150 ms) for questions media, hot name-check listing,
    // live .bower parent fence and multipart create, measured on this branch.
    // B8b: the three sequential health create calls (3 x DRIVE_MS), as the monthly log's are.
    expect(c04.ms).toBeLessThan(11120 * 1.2 + (MONTH_LOG_FIRST_CREATE_CALLS + HEALTH_FIRST_CREATE_CALLS) * DRIVE_MS);
    // TL-P4-42 addendum 5, fix 1: retained base 11,940 + 600 ms for the same four
    // measured cold hot calls above (4 x DRIVE_MS); preserve the 20% factor.
    expect(past.ms).toBeLessThan(12540 * 1.2 + (MONTH_LOG_FIRST_CREATE_CALLS + HEALTH_FIRST_CREATE_CALLS) * DRIVE_MS);
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
