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
import type { DriveFile, FaultAction } from '../drive/drive-api';
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
async function applied(fault?: (call: FencedCall, drive: FakeDrive) => FaultAction, landed?: (call: FencedCall, drive: FakeDrive) => void): Promise<{ drive: FakeDrive; root: string; manifest: RunManifest; calls: FencedCall[]; chain: Checkpoint[]; view: string; readBacks: string[] }> {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
  // A read of a file right after its own write was answered, with nothing sent between: a read-back the answer's checksum would have done.
  let just: string | null = null;
  const readBacks: string[] = [];
  const fenced = drive.fenced.bind(drive);
  drive.fenced = (check) => {
    const w = fenced(check);
    const noted = async (made: Promise<DriveFile>): Promise<DriveFile> => {
      just = null;
      const f = await made;
      just = f.id;
      return f;
    };
    return { ...w, createText: (...a) => noted(w.createText(...a)), writeText: (...a) => noted(w.writeText(...a)) };
  };
  for (const read of ['readBytes', 'readText'] as const) {
    const real = drive[read].bind(drive) as (id: string) => Promise<never>;
    drive[read] = (id: string) => {
      if (id === just) readBacks.push(id);
      just = null;
      return real(id);
    };
  }
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
  return { drive, root, manifest: plan.manifest, calls, chain: found.kind === 'run' ? found.chain : [], view, readBacks };
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

  it('a run move with a lost answer, then binned by the person, is reported as unconfirmed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let binned: string | null = null;
    const isMove = (call: FencedCall): boolean => call.op === 'update' && call.patch.addParent !== undefined;
    const { manifest, chain, view } = await applied(
      (call) => (binned === null && isMove(call) ? 'lose-reply' : 'pass'),
      (call, drive) => {
        if (binned !== null || !isMove(call) || call.op !== 'update') return;
        // The move landed and its answer is lost; Alex then puts the thing in the Bin in the app, which stamps it.
        binned = call.id;
        const stored = (storedOf(drive) as unknown as Map<string, { trashed: boolean; meta: DriveFile }>).get(call.id);
        if (!stored) return;
        stored.trashed = true;
        stored.meta.appProperties = { ...stored.meta.appProperties, bowerOp: sha256Sync('app-bin').slice(0, 32) };
      },
    );
    const op = manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === binned);
    if (op?.effect.kind !== 'move') throw new Error('no move');
    expect(chain.at(-1)?.phase).toBe('done');
    const outcome = chain.at(-1)?.outcomes.find((o) => o.operationId === op.operationId);
    // Neither applied nor set aside: another writer's stamp says nothing of whether the move landed.
    expect(outcome?.state).toBe('rejected');
    const report = (JSON.parse(view) as { run?: { report?: { setAside: Array<{ name: string }>; unconfirmed?: Array<{ name: string; why: string }> } } }).run?.report;
    expect(report?.unconfirmed ?? []).toContainEqual({ name: op.effect.before.name, why: expect.stringMatching(/^Bower couldn't confirm/) });
    expect(report?.setAside.map((r) => r.name)).not.toContain(op.effect.before.name);
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

describe('write once by the bowerOp stamp', () => {
  const what = (c: FencedCall): string => (c.op === 'create-folder' || c.op === 'create-text' ? `${c.op} ${c.name}` : `${c.op} ${c.id}`);

  it('every write reconciles by its bowerOp stamp', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The key each write carries (c2-create-by-id): a create its reserved id, any other write its stamp.
    const keyOf = (c: FencedCall): string | undefined => (c.op === 'create-folder' || c.op === 'create-text' ? c.reserved : stampOfCall(c));
    // Operations, run records and report files alike: each write carries its key, and its answer confirms it.
    const clean = await applied();
    expect(clean.chain.at(-1)?.phase).toBe('done');
    expect(clean.calls.filter((c) => keyOf(c) === undefined).map(what)).toEqual([]);
    expect(clean.readBacks).toEqual([]);
    // Every answer lost once: each write is found again by its key, never written twice nor taken by its name or text.
    const lost = new Set<string>();
    const blind = await applied((call) => {
      const key = JSON.stringify(call);
      if (lost.has(key)) return 'pass';
      lost.add(key);
      return 'lose-reply';
    });
    expect(blind.chain.at(-1)?.phase).toBe('done');
    const keys = blind.calls.map(keyOf);
    expect(keys.filter((s) => s === undefined).length).toBe(0);
    const carrying = (s: string | undefined): number => [...(blind.drive as unknown as { files: Map<string, { meta: DriveFile }> }).files.values()].filter((f) => f.meta.id === s || f.meta.appProperties?.bowerOp === s).length;
    for (const s of new Set(keys)) expect(carrying(s), s).toBeLessThanOrEqual(1);
    expect(blind.calls.length).toBe(new Set(keys).size);
  });

  it('a lost write that reads back as not landed is never called offline headless', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let target: string | null = null;
    const { manifest, chain, view } = await applied((call) => {
      if (target !== null || call.op !== 'update') return 'pass';
      target = call.id;
      return 'refuse';
    });
    const op = manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === target);
    const outcome = chain.at(-1)?.outcomes.find((o) => o.operationId === op?.operationId);
    expect(outcome?.state).toBe('rejected');
    expect(outcome?.state === 'rejected' ? outcome.failure.code : null).not.toBe('offline');
    expect(view).not.toContain("couldn't reach Google Drive");
  });
});

describe('c2-create-by-id: a run makes each thing by its reserved id', () => {
  it("a run's create whose answer was lost is read back by its reserved id, though a search misses it", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let lost: (FencedCall & { op: 'create-text' }) | null = null;
    let hidden: string | null = null;
    let parentHides = 1;
    const { drive, root, manifest, chain } = await applied(
      (call, d) => {
        if (lost || call.op !== 'create-text' || call.appProperties?.bowerItem === undefined) return 'pass';
        lost = call;
        // Drive's search lags behind the create: a listing of its folder does not show it yet; a read by its id does.
        const listAll = d.listAll.bind(d);
        d.listAll = async (id) => (await listAll(id)).filter((f) => !(id === call.parentId && f.id === hidden && parentHides-- > 0));
        return 'lose-reply';
      },
      (call, d) => {
        if (call !== lost) return;
        const files = (d as unknown as { files: Map<string, { meta: DriveFile }> }).files;
        hidden = [...files.values()].find((f) => f.meta.name === call.name && f.meta.parents[0] === call.parentId)?.meta.id ?? null;
      },
    );
    const made = lost as (FencedCall & { op: 'create-text' }) | null;
    if (!made || hidden === null) throw new Error('no create lost its answer');
    const op = manifest.operations.find((o) => o.effect.kind === 'create-text' && o.effect.name === made.name);
    expect(chain.at(-1)?.outcomes.find((o) => o.operationId === op?.operationId)?.state).toBe('applied');
    const same = (await drive.listAll(root)).filter((f) => f.name === made.name && f.parents[0] === made.parentId);
    expect(same.map((f) => f.id)).toEqual([hidden]);
  });
});


/**
 * c4-create-landed (TL-P4-24 addenda 9 and 10), the reconcile guard: a run's recovery asks write-once's `happened`, never
 * `landed`. A write of this run whose answer was lost and that the person then moved elsewhere in Drive did run, so it
 * is reported applied, and nothing is sent to it again: sending it again would undo what the person did since.
 */
describe('c4-create-landed: a run reconciles on whether its write happened', () => {
  /** Another device moves `id` into another folder, keeping what Bower set on it (a move in Drive itself). */
  const moveAway = (drive: FakeDrive, id: string): void => {
    const files = storedOf(drive) as unknown as Map<string, { meta: DriveFile }>;
    const stored = files.get(id);
    const other = [...files.values()].find((f) => f.meta.folder && f.meta.id !== id && !stored?.meta.parents.includes(f.meta.id));
    if (stored && other) stored.meta = { ...stored.meta, parents: [other.meta.id] };
  };

  it('after a lost answer and an outside move the run reports applied and sends nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const kind of ['move', 'create'] as const) {
      const seen: { lost?: FencedCall; target?: string } = {};
      const picks = (call: FencedCall): boolean => (kind === 'move' ? call.op === 'update' && call.patch.addParent !== undefined : call.op === 'create-text' && call.appProperties?.bowerOp !== undefined);
      const { manifest, calls, chain } = await applied(
        (call) => {
          if (seen.lost !== undefined || !picks(call)) return 'pass';
          seen.lost = call;
          return 'lose-reply';
        },
        (call, drive) => {
          if (call !== seen.lost) return;
          seen.target = call.op === 'update' ? call.id : call.op === 'create-text' ? call.reserved : undefined;
          // It landed; before Bower reads it back, the person moves it elsewhere in Drive.
          if (seen.target !== undefined) moveAway(drive, seen.target);
        },
      );
      const { lost: sent, target: t } = seen;
      if (sent === undefined || t === undefined) throw new Error(`no ${kind} lost its answer`);
      const op = manifest.operations.find((o) => (o.effect.kind === 'move' ? o.effect.before.fileId === t : o.effect.kind === 'create-text' && sent.op === 'create-text' && o.effect.name === sent.name));
      expect({ kind, phase: chain.at(-1)?.phase, n: chain.length }).toEqual({ kind, phase: 'done', n: chain.length });
      expect({ kind, state: chain.at(-1)?.outcomes.find((o) => o.operationId === op?.operationId)?.state }).toEqual({ kind, state: 'applied' });
      // Nothing more sent to it, nor made again in its place.
      const after = calls.slice(calls.indexOf(sent) + 1);
      expect(after.filter((c) => ('id' in c && c.id === t) || (c.op === 'create-text' && sent.op === 'create-text' && c.name === sent.name && c.parentId === sent.parentId))).toEqual([]);
    }
  });
});


describe('b5-read-to-act-fence', () => {
  it('control: unchanged id-bound targets apply once', async () => {
    const result = await applied();
    const moves = result.manifest.operations.filter((op) => op.effect.kind === 'move');
    expect(moves.length).toBeGreaterThan(0);
    for (const op of moves) {
      expect(result.chain.at(-1)?.outcomes.find((outcome) => outcome.operationId === op.operationId)?.state).toBe('applied');
      expect(result.calls.filter((call) => stampOfCall(call) === stampOf(RUN_ID, op.operationId))).toHaveLength(1);
    }
  });
  it.each(['name', 'place'] as const)('refuses a changed %s at the actual move fence', async (field) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let changed: string | null = null;
    const result = await applied((call, drive) => {
      if (changed !== null || call.op !== 'update' || call.patch.addParent === undefined) return 'pass';
      changed = call.id;
      const stored = (storedOf(drive) as unknown as Map<string, { meta: DriveFile }>).get(call.id);
      if (!stored) throw new Error('Missing fenced target');
      if (field === 'name') stored.meta.name = 'Alex renamed this.txt';
      else stored.meta.parents = ['OTHER_FOLDER_ID'];
      return 'pass';
    });
    expect(changed).not.toBeNull();
    const op = result.manifest.operations.find((operation) => operation.effect.kind === 'move' && operation.effect.before.fileId === changed);
    expect(result.chain.at(-1)?.outcomes.find((outcome) => outcome.operationId === op?.operationId))
      .toMatchObject({ state: 'rejected', failure: { code: 'conflict' } });
  });
  it('refuses changed runner JSON bytes between plan and content write', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let changed: string | null = null;
    const result = await applied((call, drive) => {
      if (changed !== null || call.op !== 'write-text') return 'pass';
      const stored = (storedOf(drive) as unknown as Map<string, { meta: DriveFile; content: string | Blob | null }>).get(call.id);
      if (stored?.meta.name !== 'questions.json') return 'pass';
      changed = call.id;
      stored.content = '{"v":1,"questions":[],"alex":"changed"}';
      drive.touch(call.id);
      return 'pass';
    });
    expect(changed, 'fixture reaches a runner JSON content write').not.toBeNull();
    const op = result.manifest.operations.find((operation) => operation.effect.kind === 'write-runner-json' && operation.effect.before.fileId === changed);
    expect(result.chain.at(-1)?.outcomes.find((outcome) => outcome.operationId === op?.operationId))
      .toMatchObject({ state: 'rejected', failure: { code: 'conflict' } });
  });
});
