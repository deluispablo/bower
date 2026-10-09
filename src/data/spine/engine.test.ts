/**
 * One engine for every run (TL-P4-14 `c2-one-engine`): the fake run service applies a plan the way the runner does on
 * Drive, so the demo and the e2e suites run the live protocol. The runner's side of each claim is pinned by its own
 * suite (`runner/test/overhead.test.ts`: one opening and one closing checkpoint per batch; `runner/test/recovery.test.ts`:
 * every effect stamped, a write with no answer read back by its stamp and never sent twice).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Checkpoint } from '../contracts/run-checkpoint';
import { sha256Sync } from '../contracts/hashes';
import { FakeDrive, type FencedCall } from '../drive/fake-drive';
import type { FaultAction } from '../drive/drive-api';
import { SYSTEM } from '../vault/layout';
import { planRun } from '../fake/fake-runner';
import { FakeRunService } from '../fake/fake-run-service';
import { seedFakeDrive } from '../fake/seed';
import { RunRecords, type RunManifest } from './records';

const AT = Date.UTC(2026, 9, 7, 9);
const ACCOUNT = 'you@example.com';
const RUN_ID = 'run-alex-1';

afterEach(() => vi.restoreAllMocks());

/** The stamp the runner puts on an operation's effect: 32 hex of SHA-256(`<run_id>:<operation id>`) (TL-P4-05 addendum 2). */
const stampOf = (runId: string, operationId: string): string => sha256Sync(`${runId}:${operationId}`).slice(0, 32);

/** A thing possibly moved, then emptied from the Bin before Bower read it back (TL-P4-14 addendum 7). */
const UNCONFIRMED_GONE = "Bower couldn't confirm this; the file is gone.";

/** The pretend Drive's stored files, for a person's change no API call makes (emptying the Bin, a Bin at an instant). */
const storedOf = (drive: FakeDrive): Map<string, { trashed: boolean }> => (drive as unknown as { files: Map<string, { trashed: boolean }> }).files;

const stampOfCall = (call: FencedCall): string | undefined =>
  (call.op === 'update' ? call.patch.appProperties : call.appProperties)?.bowerOp ?? undefined;

/** Alex's default folder on the fake, its run planned and admitted, and every fenced write the run sends. */
async function applied(fault?: (call: FencedCall, drive: FakeDrive) => FaultAction, landed?: (call: FencedCall, drive: FakeDrive) => void): Promise<{ drive: FakeDrive; root: string; manifest: RunManifest; calls: FencedCall[]; chain: Checkpoint[]; view: string }> {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
  const runs = new FakeRunService({ drive, clock: () => AT, scale: 'instant' });
  const plan = await planRun(drive, root, { scope: 'all', allowWeb: false, runId: RUN_ID, requestId: 'request-alex-1', requestedAt: AT });
  const calls: FencedCall[] = [];
  drive.fault = {
    before: (call) => {
      calls.push(call);
      return fault?.(call, drive) ?? 'pass';
    },
    applied: (call) => landed?.(call, drive),
  };
  await runs.admit({ account: ACCOUNT, rootId: root }, plan.manifest);
  for (let i = 0; i < 20; i++) {
    await runs.settled();
    const run = await runs.status({ account: ACCOUNT, rootId: root });
    if (run?.phase === 'done' || run?.phase === 'failed') break;
  }
  await runs.settled();
  const found = await new RunRecords(drive, root).found(RUN_ID);
  // The report the person is shown, as the run left it in their folder.
  const files = await drive.listAll(root);
  const sys = files.find((f) => f.folder && f.name === SYSTEM.dir && f.parents[0] === root);
  const last = files.find((f) => f.name === 'last-run.json' && f.parents[0] === sys?.id);
  const view = last ? await drive.readText(last.id) : '';
  return { drive, root, manifest: plan.manifest, calls, chain: found.kind === 'run' ? found.chain : [], view };
}

describe('the runner and the fake run the same engine', () => {
  it('a plan applied through the fake writes one opening and one closing checkpoint per batch, as the runner', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { chain, manifest } = await applied();
    expect(manifest.operations.length).toBeGreaterThan(2);
    // The checkpoints that change an operation's outcome: the batch's opening (every one possibly sent) and its closing.
    const changing = chain.filter((c, i) => i > 0 && JSON.stringify(c.outcomes) !== JSON.stringify(chain[i - 1]?.outcomes));
    expect(changing.length).toBe(2);
    expect(changing.map((c) => [...new Set(c.outcomes.map((o) => o.state))].sort())).toEqual([
      ['possible-effect'],
      [...new Set(chain.at(-1)?.outcomes.map((o) => o.state))].sort(),
    ]);
  });

  it('every effect the fake sends carries the run stamp of its operation, as the runner', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { calls, manifest } = await applied();
    expect(calls.length).toBeGreaterThan(2);
    // Every operation was sent once with its own stamp in the same request (a refused one sends nothing).
    const sent = new Set(calls.map(stampOfCall));
    const stamped = manifest.operations.filter((o) => sent.has(stampOf(RUN_ID, o.operationId)));
    expect(stamped.length).toBe(manifest.operations.length);
  });

  it('a write that never reached Drive is read back by its stamp and never sent twice, as the runner', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const refusedOnce = new Set<string>();
    let target: string | null = null;
    const { calls, manifest, chain } = await applied((call) => {
      if (call.op !== 'update' || refusedOnce.size) return 'pass';
      target = call.id;
      refusedOnce.add(call.id);
      return 'refuse';
    });
    const sends = calls.filter((c) => c.op === 'update' && c.id === target).length;
    expect(target).not.toBeNull();
    expect(sends).toBe(1);
    const op = manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === target);
    expect(chain.at(-1)?.outcomes.find((o) => o.operationId === op?.operationId)?.state).toBe('rejected');
  });

  it('a landed move later purged is reported as applied', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let purged: string | null = null;
    const { manifest, chain } = await applied(undefined, (call, drive) => {
      if (purged !== null || call.op !== 'update') return;
      // Drive answered the move; the person then empties it from the Bin before Bower reads anything more of it.
      purged = call.id;
      (drive as unknown as { files: Map<string, unknown> }).files.delete(call.id);
    });
    const op = manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === purged);
    expect(op).toBeDefined();
    expect(chain.at(-1)?.phase).toBe('done');
    expect(chain.at(-1)?.outcomes.find((o) => o.operationId === op?.operationId)?.state).toBe('applied');
  });
  it('a lost-answer move purged before the read-back is reported as unconfirmed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let purged: string | null = null;
    const isMove = (call: FencedCall): boolean => call.op === 'update' && call.patch.addParent !== undefined;
    const { manifest, chain, view } = await applied(
      (call) => (purged === null && isMove(call) ? 'lose-reply' : 'pass'),
      (call, drive) => {
        if (purged !== null || !isMove(call) || call.op !== 'update') return;
        // The move landed and its answer is lost; the person empties it from the Bin before Bower reads it back.
        purged = call.id;
        storedOf(drive).delete(call.id);
      },
    );
    const op = manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === purged);
    expect(op).toBeDefined();
    expect(chain.at(-1)?.phase).toBe('done');
    const outcome = chain.at(-1)?.outcomes.find((o) => o.operationId === op?.operationId);
    // Neither applied nor moved away: Bower cannot tell whether it landed, and says so.
    expect(outcome?.state === 'rejected' ? outcome.failure : outcome?.state).toEqual({ code: 'unknown', message: UNCONFIRMED_GONE });
    expect(view).toContain(UNCONFIRMED_GONE);
    expect(view).not.toContain("Bower couldn't reach Google Drive");
  });

  it('a move into a folder binned since the run read it is refused', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Right before the first move into another folder is sent, the person puts that folder in the Bin.
    let binned: { folder: string; thing: string } | null = null;
    const { drive, manifest, chain } = await applied((call, d) => {
      if (binned !== null || call.op !== 'update' || call.patch.addParent === undefined) return 'pass';
      binned = { folder: call.patch.addParent, thing: call.id };
      const folder = storedOf(d).get(call.patch.addParent);
      if (folder) folder.trashed = true;
      return 'pass';
    });
    const b = binned as { folder: string; thing: string } | null;
    expect(b).not.toBeNull();
    expect(chain.at(-1)?.phase).toBe('done');
    const op = manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === b?.thing);
    const outcome = chain.at(-1)?.outcomes.find((o) => o.operationId === op?.operationId);
    expect(outcome?.state === 'rejected' ? outcome.failure.code : outcome?.state).toBe('not-found');
    const thing = await drive.evidence(b?.thing ?? '');
    expect(thing?.trashed).toBe(false);
    // The moved thing stays where it was, as on the runner.
    expect(op?.effect.kind === 'move' ? op.effect.before.parents : null).not.toBeNull();
    expect(thing?.file.parents).toEqual(op?.effect.kind === 'move' ? op.effect.before.parents : null);
  });

  it('a fence that reads a real change sets the operation aside', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Right before the first filing move is sent, the person renames the thing it moves: the fence reads that change.
    let renamed: string | null = null;
    const { drive, manifest, chain, view } = await applied((call, d) => {
      if (renamed !== null || call.op !== 'update' || call.patch.addParent === undefined) return 'pass';
      renamed = call.id;
      const stored = (storedOf(d) as unknown as Map<string, { meta: { name: string } }>).get(call.id);
      if (stored) stored.meta.name = 'Renamed by Alex.pdf';
      return 'pass';
    });
    expect(renamed).not.toBeNull();
    expect(chain.at(-1)?.phase).toBe('done');
    const op = manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === renamed);
    if (op?.effect.kind !== 'move') throw new Error('no move');
    const outcome = chain.at(-1)?.outcomes.find((o) => o.operationId === op.operationId);
    expect(outcome?.state === 'rejected' ? outcome.failure.code : outcome?.state).toBe('conflict');
    const thing = await drive.evidence(op.effect.before.fileId);
    expect(thing?.file.name).toBe('Renamed by Alex.pdf');
    expect(thing?.file.parents).toEqual(op.effect.before.parents);
    const report = (JSON.parse(view) as { run: { report: { setAside: { name: string }[] } } }).run.report;
    expect(report.setAside.map((r) => r.name)).toContain(op.effect.before.name);
  });
});
