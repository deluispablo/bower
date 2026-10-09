import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Checkpoint, EffectEvidence } from '../../src/data/contracts/run-checkpoint';
import { hashRecordJson } from '../../src/data/contracts/record-json';
import type { OperationV2 } from '../../src/data/contracts/run-manifest';
import { driveError, type DriveFile } from '../../src/data/drive/drive-api';
import { RunRecords, canonical, checkpointName, firstCheckpoint, manifestName, nextCheckpoint, type RunManifest } from '../../src/data/spine/records';
import { RunnerDrive } from '../src/drive';
import { runnerReads } from '../src/spine/records';
import { endedStamp, keepFinishedAtEnd } from '../src/spine/retention';
import { runOperations, type Effects, type ReadBack, type RunEnd } from '../../src/data/spine/engine';
import { RunnerToken } from '../src/token';
import { API, RUN_ID, TICKET, driveV3, fixedDrive, type DriveV3, type WireRequest } from './drive-v3';
import type { FakeDrive, FaultHook } from '../../src/data/drive/fake-drive';

const AT = Date.UTC(2026, 9, 7, 9);

/** A manifest the fake runner planned on the demo folder (27 operations), kept as it was planned. */
const PLANNED = readFileSync(new URL('./fixtures/planned-manifest.json', import.meta.url), 'utf8');

async function hash(value: unknown): Promise<string> {
  const h = await hashRecordJson(value);
  if (!h.ok) throw new Error(h.reason);
  return h.value;
}

/** The planned manifest for another run and folder: its capture id and operation ids made again, as the planner makes them. */
async function plan(rootId: string, runId: string): Promise<RunManifest> {
  const value = JSON.parse(PLANNED) as RunManifest;
  value.runId = runId;
  value.requestId = `request-${runId}`;
  value.scope = { rootId };
  value.captureId = await hash({ scope: value.scope, runScope: value.runScope, capture: value.capture });
  const renamed = new Map<string, string>();
  const ref = (id: string): string => renamed.get(id) ?? id;
  for (const op of value.operations) {
    op.dependsOn = op.dependsOn.map(ref);
    if ('parent' in op.effect && 'createdBy' in op.effect.parent) op.effect.parent = { createdBy: ref(op.effect.parent.createdBy) };
    const next = await hash({ runId: value.runId, captureId: value.captureId, ordinal: op.ordinal, effect: op.effect });
    renamed.set(op.operationId, next);
    op.operationId = next;
  }
  for (const item of value.reportPlan) item.requires = item.requires.map(ref);
  return value;
}

async function seeded(): Promise<{ wire: DriveV3; root: string; manifest: RunManifest }> {
  const drive = fixedDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  return { wire: driveV3(drive), root, manifest: await plan(root, RUN_ID) };
}

/**
 * Effects that count each sending, and keep what landed as the evidence they find again. Read back, an operation
 * never attempted did not land (no stamp, as real Drive answers); one attempted that shows nothing cannot be told.
 */
class CountedEffects implements Effects {
  readonly sent = new Map<string, number>();
  readonly landed = new Set<string>();
  readonly attempted = new Set<string>();
  /** The operation (by ordinal) whose reply is lost after it lands, once. */
  loseReplyAt: number | null = null;
  /** The operation (by ordinal) whose send is attempted and fails with no answer, nothing landing, once. */
  refuseAt: number | null = null;

  async apply(op: OperationV2, _head: Checkpoint, _w: unknown, _m: RunManifest, sending: () => Promise<unknown>): Promise<{ state: 'applied'; evidence: EffectEvidence }> {
    await sending();
    this.attempted.add(op.operationId);
    if (this.refuseAt === op.ordinal) {
      this.refuseAt = null;
      throw driveError('offline');
    }
    this.sent.set(op.operationId, (this.sent.get(op.operationId) ?? 0) + 1);
    this.landed.add(op.operationId);
    if (this.loseReplyAt === op.ordinal) {
      this.loseReplyAt = null;
      throw driveError('offline');
    }
    return { state: 'applied', evidence: evidenceOf(op) };
  }

  async observe(op: OperationV2): Promise<EffectEvidence | null> {
    return this.landed.has(op.operationId) ? evidenceOf(op) : null;
  }

  async readBack(op: OperationV2): Promise<ReadBack> {
    const evidence = await this.observe(op);
    if (evidence) return { state: 'landed', evidence };
    return this.attempted.has(op.operationId) ? { state: 'unreadable', why: 'no evidence' } : { state: 'not-landed' };
  }
}

function evidenceOf(op: OperationV2): EffectEvidence {
  const file = { fileId: `file-${op.ordinal}`, name: `Thing ${op.ordinal}`, parents: ['FOLDER_ID'], folder: false, modifiedTime: '2026-10-07T09:00:00.000Z' };
  return { file, trashed: false, content: null, provenance: 'adapter-read' };
}

interface Started {
  end: Promise<RunEnd>;
  planned: () => number;
}

/** One runner process for `attempt`; `stopAt` ends it at that write batch, as a runner that is killed. */
function start(wire: DriveV3, root: string, manifest: RunManifest, attempt: number, effects: Effects, stopAt: number | null = null): Started {
  wire.attempt = attempt;
  const token = new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: wire.fetch, now: () => wire.now });
  const adapter = new RunnerDrive({ token, attempt, fetch: wire.fetch });
  let batches = 0;
  let planned = 0;
  let ids = 0;
  const end = runOperations({
    rootId: root,
    runId: RUN_ID,
    attempt,
    records: new RunRecords(runnerReads(adapter, RUN_ID), root),
    batch: async () => {
      if (++batches === stopAt) throw new Error('The runner was stopped.');
      return adapter.batch();
    },
    effects,
    plan: async () => {
      planned++;
      return manifest;
    },
    clock: () => AT + attempt,
    newId: () => `attempt${attempt}-${++ids}`,
  });
  return { end, planned: () => planned };
}

async function chainOf(wire: DriveV3, root: string): Promise<Checkpoint[]> {
  const found = await new RunRecords(wire.drive, root).found(RUN_ID);
  return found.kind === 'run' ? found.chain : [];
}

const runFolder = async (wire: DriveV3, root: string): Promise<DriveFile | undefined> => (await wire.drive.listAll(root)).find((f) => f.folder && f.name === RUN_ID);
const writes = (wire: DriveV3): number => wire.requests.filter((r) => r.method !== 'GET').length;
const appliedIn = (c: Checkpoint | undefined): number => c?.outcomes.filter((o) => o.state === 'applied').length ?? 0;

/**
 * Run folders in `.bower/runs` as listed (each with its stamp, if any, made at `created`, else at `at`); then this run (`RUN_ID`) ends at `at`. Gives the
 * names of the folders it put in the Bin, as it said and as Drive holds them.
 */
type Inside = { name: string; folder?: boolean; props?: Record<string, string> };

async function keptAt(
  folders: { name: string; props?: Record<string, string>; created?: number; files?: string[]; inside?: Inside[] }[],
  at: number,
  hook?: (drive: FakeDrive, made: DriveFile[]) => FaultHook,
): Promise<{ binned: string[]; trashed: string[]; requests: WireRequest[]; made: DriveFile[] }> {
  const drive = fixedDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  const sys = (await drive.createFolder(root, '.bower')).id;
  const runs = (await drive.createFolder(sys, 'runs')).id;
  const made: DriveFile[] = [];
  for (const f of folders) {
    const folder = await drive.createFolder(runs, f.name, f.props);
    drive.setTimes(folder.id, f.created ?? at, f.created ?? at);
    made.push(folder);
    for (const name of f.files ?? []) made.push(await drive.createText(folder.id, name, `${name} by Alex`));
    for (const c of f.inside ?? []) made.push(c.folder ? await drive.createFolder(folder.id, c.name, c.props) : await drive.createText(folder.id, c.name, `${c.name} text`, c.props));
  }
  const wire = driveV3(drive);
  const token = new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: wire.fetch, now: () => wire.now });
  const adapter = new RunnerDrive({ token, attempt: 1, fetch: wire.fetch });
  if (hook) adapter.fault = hook(drive, made);
  const ids = await keepFinishedAtEnd(adapter, new RunRecords(runnerReads(adapter, RUN_ID), root), RUN_ID, at);
  const trashed: string[] = [];
  for (const f of made) if ((await drive.evidence(f.id))?.trashed) trashed.push(f.name);
  return { binned: made.filter((f) => ids.includes(f.id)).map((f) => f.name), trashed, requests: wire.requests, made };
}

describe('runner checkpoints', () => {
  it('a restarted runner resumes after its last checkpoint', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wire, root, manifest } = await seeded();
    const ops = manifest.operations.length;
    expect(ops).toBeGreaterThan(2);
    const effects = new CountedEffects();

    // Batches: the manifest, the first checkpoint, the first effect, the opening right before its send, then one
    // effect per operation. Stopped at the third operation's effect, mid-batch: two operations landed.
    const first = start(wire, root, manifest, 1, effects, 3 + 1 + 2);
    await expect(first.end).rejects.toThrow('The runner was stopped.');
    const before = await chainOf(wire, root);
    expect(before[0]?.phase).toBe('queued');
    expect(before).toHaveLength(2);
    expect(before.at(-1)?.outcomes.every((o) => o.state === 'possible-effect')).toBe(true);
    expect(effects.landed.size).toBe(2);

    // A new attempt reads only its run's folder, never plans again, and goes on after the last checkpoint.
    const folder = await runFolder(wire, root);
    await wire.drive.createText((await wire.drive.createFolder(folder?.parents[0] ?? '', 'run-elsewhere')).id, 'manifest-x.json', '{}');
    const from = wire.requests.length;
    const second = start(wire, root, manifest, 2, effects);
    const end = await second.end;
    expect(end.state).toBe('settled');
    expect(second.planned()).toBe(0);
    const after = await chainOf(wire, root);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length).every((c) => c.epoch === 2)).toBe(true);
    expect(appliedIn(after.at(-1))).toBe(ops);
    expect([...effects.sent.values()]).toEqual(Array.from({ length: ops }, () => 1));
    const readIds = wire.requests.slice(from).filter((r) => r.url.searchParams.get('alt') === 'media').map((r) => decodeURIComponent(r.url.pathname.split('/').at(-1) ?? ''));
    expect(readIds.length).toBeGreaterThan(0);
    for (const id of readIds) expect((await wire.drive.get(id)).parents).toEqual([folder?.id]);
    // Another run's folder is never looked into.
    const elsewhere = (await wire.drive.listAll(root)).find((f) => f.folder && f.name === 'run-elsewhere');
    const listed = wire.requests.slice(from).flatMap((r) => [...(r.url.searchParams.get('q') ?? '').matchAll(/'([^']+)' in parents/g)].map((m) => m[1]));
    expect(elsewhere && listed.includes(elsewhere.id)).toBe(false);

    // A broken chain stops the run as failed, and nothing is written.
    await wire.drive.createText(folder?.id ?? '', checkpointName(after.length, 'f'.repeat(64)), '{}');
    const written = writes(wire);
    const third = await start(wire, root, manifest, 3, effects).end;
    expect(third.state).toBe('failed');
    expect(writes(wire)).toBe(written);
  });

  it('an applied operation is never applied twice', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wire, root, manifest } = await seeded();
    const ops = manifest.operations.length;
    const effects = new CountedEffects();

    // The second operation lands, and its answer is lost.
    effects.loseReplyAt = 1;
    await expect(start(wire, root, manifest, 1, effects).end).rejects.toMatchObject({ code: 'offline' });
    const second = await start(wire, root, manifest, 2, effects).end;
    expect(second.state).toBe('settled');
    expect([...effects.sent.values()]).toEqual(Array.from({ length: ops }, () => 1));

    // A runner on a run whose operations are all settled sends nothing and writes nothing.
    const length = (await chainOf(wire, root)).length;
    const written = writes(wire);
    expect((await start(wire, root, manifest, 3, effects).end).state).toBe('settled');
    expect(writes(wire)).toBe(written);
    expect(await chainOf(wire, root)).toHaveLength(length);
    expect([...effects.sent.values()]).toEqual(Array.from({ length: ops }, () => 1));

    // An operation that may have been sent and cannot be read back (these effects cannot tell one that did not land)
    // is never sent again: the run stops there.
    const other = await seeded();
    const unsure = new CountedEffects();
    unsure.refuseAt = 0;
    await expect(start(other.wire, other.root, other.manifest, 1, unsure).end).rejects.toMatchObject({ code: 'offline' });
    const head = (await chainOf(other.wire, other.root)).at(-1);
    expect(head?.outcomes[0]?.state).toBe('possible-effect');
    await expect(start(other.wire, other.root, other.manifest, 2, unsure).end).rejects.toMatchObject({ code: 'unknown' });
    expect(unsure.sent.size).toBe(0);
    expect((await chainOf(other.wire, other.root)).at(-1)).toEqual(head);
  });

  it('checkpoints cost fewer Drive round trips per operation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    /**
     * One run with effects that touch no Drive, so every Drive request after checkpoint 0 lands is a checkpoint's:
     * its create and, when the create's answer cannot confirm its bytes, a read-back. The folder the run made for its
     * records is not read before each create (the run holds it, `drive-calls-cut`).
     */
    const cost = async (checksums: boolean): Promise<{ requests: number; checkpoints: number; ops: number; readBacks: number }> => {
      const { wire, root, manifest } = await seeded();
      wire.checksums = checksums;
      const token = new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: wire.fetch, now: () => wire.now });
      const adapter = new RunnerDrive({ token, attempt: 1, fetch: wire.fetch });
      let from = -1;
      adapter.fault = {
        applied: (call) => {
          if (from < 0 && call.op === 'create-text' && call.name.startsWith('checkpoint-0-')) from = wire.requests.length;
        },
      };
      let ids = 0;
      const end = await runOperations({
        rootId: root,
        runId: RUN_ID,
        attempt: 1,
        records: new RunRecords(runnerReads(adapter, RUN_ID), root),
        batch: () => adapter.batch(),
        fenced: () => adapter.fencedWrites(),
        effects: new CountedEffects(),
        plan: async () => manifest,
        clock: () => AT,
        newId: () => `attempt1-${++ids}`,
      });
      expect(end.state).toBe('settled');
      const chain = await chainOf(wire, root);
      const written = new Set((await wire.drive.listAll(root)).filter((f) => f.name.startsWith('checkpoint-')).map((f) => f.id));
      const readBacks = wire.requests.filter((r) => r.url.searchParams.get('alt') === 'media' && written.has(decodeURIComponent(r.url.pathname.split('/').at(-1) ?? ''))).length;
      return { requests: wire.requests.length - from, checkpoints: chain.length - 1, ops: manifest.operations.length, readBacks };
    };
    // Drive's answer carries the stored bytes' checksum: the create, nothing more (two requests per checkpoint before).
    const after = await cost(true);
    expect(after.checkpoints).toBeGreaterThan(0);
    expect(after.readBacks).toBe(0);
    expect(after.requests).toBe(after.checkpoints);
  });

  it('a checkpoint Drive stored with other bytes than were sent is refused from its answer', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wire, root, manifest } = await seeded();
    // Drive answers the second checkpoint's create with 200, but what it stored (and its checksums) are other bytes.
    const send = wire.fetch;
    let changed = '';
    wire.fetch = async (input, init) => {
      const res = await send(input, init);
      if ((init?.method ?? 'GET') !== 'POST' || changed) return res;
      const body = (await res.clone().json().catch(() => null)) as { id?: string; name?: string } | null;
      if (!body?.id || !body.name?.startsWith('checkpoint-1-')) return res;
      const stored = (await wire.drive.listAll(root)).find((f) => f.id === body.id);
      if (!stored) return res;
      const other = '{"not":"the checkpoint"}';
      await wire.drive.writeText(stored.id, other, stored.modifiedTime);
      changed = stored.id;
      const bytes = new TextEncoder().encode(other);
      return Response.json({ ...body, md5Checksum: createHash('md5').update(bytes).digest('hex'), sha256Checksum: createHash('sha256').update(bytes).digest('hex') });
    };
    const effects = new CountedEffects();

    await expect(start(wire, root, manifest, 1, effects).end).rejects.toMatchObject({ code: 'unknown' });

    expect(changed).not.toBe('');
    expect(errors.mock.calls.some((c) => String(c[0]).includes('Drive did not confirm the bytes'))).toBe(true);
    // The checkpoint never taken as written, from its answer alone: the chain stops before it, and nothing after it was sent.
    expect(effects.sent.size).toBeLessThanOrEqual(1);
  });

  it('only the last 20 finished run folders are kept', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const drive = fixedDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    const records = new RunRecords(drive, root);
    const w = drive.fenced(() => {});
    const unfinished = new Set([3, 7]);
    for (let i = 0; i < 25; i++) {
      const manifest = await plan(root, `run-${String(i).padStart(2, '0')}`);
      const m = await canonical(manifest);
      const where = { runId: manifest.runId };
      await records.put(w, where, manifestName(m.hash), m.text);
      const mark = { attemptId: `attempt-${i}`, epoch: 1 };
      const first = firstCheckpoint(manifest, m.hash, mark, AT + i);
      const c0 = await canonical(first);
      await records.put(w, where, checkpointName(0, c0.hash), c0.text);
      // Still going, made within the last 24 h: no stamp, so never counted nor let go of.
      if (unfinished.has(i)) {
        const going = (await drive.listAll(root)).find((f) => f.folder && f.name === manifest.runId);
        drive.setTimes(going?.id ?? '', AT + i, AT + i);
        continue;
      }
      // Finished in a scrambled order, so the newest are told by when they finished, not by their names.
      const endedAt = AT + 1000 + ((i * 7) % 25);
      const last = nextCheckpoint(first, c0.hash, mark, { phase: 'failed', phaseAt: endedAt });
      const c1 = await canonical(last);
      await records.putNew(w, where, checkpointName(1, c1.hash), c1.text);
      const folder = (await drive.listAll(root)).find((f) => f.folder && f.name === manifest.runId);
      await drive.update(folder?.id ?? '', { appProperties: endedStamp(manifest.runId, endedAt) });
    }
    const wire = driveV3(drive);
    const token = new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: wire.fetch, now: () => wire.now });
    const adapter = new RunnerDrive({ token, attempt: 1, fetch: wire.fetch });
    // 23 ended and this run: 4 beyond the newest 20, of which the oldest 3 go this time.
    const trashed = await keepFinishedAtEnd(adapter, new RunRecords(runnerReads(adapter, RUN_ID), root), RUN_ID, AT + 5000);

    const folders = (await drive.listAll(root)).filter((f) => f.folder && f.name.startsWith('run-'));
    const finishedAt = (i: number): number => (i * 7) % 25;
    const finished = Array.from({ length: 25 }, (_, i) => i).filter((i) => !unfinished.has(i));
    const oldest = [...finished].sort((a, b) => finishedAt(a) - finishedAt(b)).slice(0, 3).map((i) => `run-${String(i).padStart(2, '0')}`);
    expect(trashed.length).toBe(3);
    // In the Bin, never deleted: Drive still has them.
    for (const id of trashed) expect((await drive.evidence(id))?.trashed).toBe(true);
    const binned = await Promise.all(trashed.map(async (id) => (await drive.evidence(id))?.file.name));
    expect(binned.sort()).toEqual(oldest.sort());
    expect(folders.map((f) => f.name).sort()).toEqual(Array.from({ length: 25 }, (_, i) => `run-${String(i).padStart(2, '0')}`).filter((n) => !oldest.includes(n)).sort());
    expect(writes(wire)).toBe(3);
  });

  it('an old redispatch never bins one of the 20 newest', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // 20 other runs ended after this one: a redispatch of this older run is not the newest, so all 20 are the newest.
    const others = Array.from({ length: 20 }, (_, i) => ({ name: `run-${String(i).padStart(2, '0')}`, props: endedStamp(`run-${String(i).padStart(2, '0')}`, AT + 100 + i) }));
    const { binned, trashed } = await keptAt([...others, { name: RUN_ID }], AT);
    expect(binned).toEqual([]);
    expect(trashed).toEqual([]);
  });

  it('stamped duplicates of one run id count once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // 19 other runs, the newest of them in two folders, and this run: 20 runs, so nothing goes to the Bin.
    const others = Array.from({ length: 19 }, (_, i) => ({ name: `run-${String(i).padStart(2, '0')}`, props: endedStamp(`run-${String(i).padStart(2, '0')}`, AT + 100 + i) }));
    const twin = { name: 'run-18', props: endedStamp('run-18', AT + 118) };
    const { binned, trashed } = await keptAt([...others, twin, { name: RUN_ID }], AT + 5000);
    expect(binned).toEqual([]);
    expect(trashed).toEqual([]);
  });

  it('an unstamped or wrongly stamped oldest folder is never counted nor binned', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The two oldest folders: one with no stamp made as this run ends (it may be a run still going), one whose stamp
    // names another run. 20 stamped runs and this run follow.
    const unstamped = { name: 'run-a' };
    const wrong = { name: 'run-b', props: endedStamp('run-c', AT) };
    const others = Array.from({ length: 20 }, (_, i) => ({ name: `run-${String(i).padStart(2, '0')}`, props: endedStamp(`run-${String(i).padStart(2, '0')}`, AT + 100 + i) }));
    const { binned, trashed } = await keptAt([unstamped, wrong, ...others, { name: RUN_ID }], AT + 5000);
    // 21 runs counted: only run-00, the oldest stamped one, goes; the other two are kept.
    expect(binned).toEqual(['run-00']);
    expect(trashed).toEqual(['run-00']);
  });

  it('a marked run folder two days old beyond 20 is binned', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // A run that carries Bower's mark from its create but never stamped its end (failed by the stale deadline, gone,
    // or ended elsewhere), made two days ago, then 19 stamped runs and this run: 21 ended runs, so the oldest goes.
    const marked = { name: 'run-old', props: { bowerRun: 'run-old' }, created: AT - 2 * 24 * 3_600_000 };
    const others = Array.from({ length: 19 }, (_, i) => ({ name: `run-${String(i).padStart(2, '0')}`, props: endedStamp(`run-${String(i).padStart(2, '0')}`, AT + 100 + i) }));
    const { binned, trashed } = await keptAt([marked, ...others, { name: RUN_ID }], AT + 5000);
    expect(binned).toEqual(['run-old']);
    expect(trashed).toEqual(['run-old']);
  });

  it('a folder the person made in .bower/runs is never binned', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // P4-38c: a folder Alex made there two days ago, with a note in it and no mark of Bower's, then 20 stamped runs
    // and this run. Only the oldest stamped run goes; Alex's folder and its note stay where they are, whatever their age.
    const person = { name: 'Alex notes', created: AT - 2 * 24 * 3_600_000, files: ['Ideas.md'] };
    const others = Array.from({ length: 20 }, (_, i) => ({ name: `run-${String(i).padStart(2, '0')}`, props: endedStamp(`run-${String(i).padStart(2, '0')}`, AT + 100 + i) }));
    const { binned, trashed } = await keptAt([person, ...others, { name: RUN_ID }], AT + 5000);
    expect(binned).toEqual(['run-00']);
    expect(trashed).toEqual(['run-00']);
  });

  it('an ended stamp with no mark, or a broken one, is never counted', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Two days old: one folder with only the ended stamp (no mark naming it), one marked with an ended stamp that is no
    // time. Neither is counted, so of 20 stamped runs and this run only the oldest stamped one goes.
    const old = AT - 2 * 24 * 3_600_000;
    const unmarked = { name: 'run-x', props: { bowerRunEnded: String(old) }, created: old };
    const broken = { name: 'run-y', props: { bowerRun: 'run-y', bowerRunEnded: 'soon' }, created: old };
    const others = Array.from({ length: 20 }, (_, i) => ({ name: `run-${String(i).padStart(2, '0')}`, props: endedStamp(`run-${String(i).padStart(2, '0')}`, AT + 100 + i) }));
    const { binned, trashed } = await keptAt([unmarked, broken, ...others, { name: RUN_ID }], AT + 5000);
    expect(binned).toEqual(['run-00']);
    expect(trashed).toEqual(['run-00']);
  });

  it('an unstamped run folder an hour old is kept', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // An unstamped folder made an hour before this run ends may be a run still going: it is not counted, so of 20
    // stamped runs and this run only the oldest stamped one goes.
    const young = { name: 'run-young', props: { bowerRun: 'run-young' }, created: AT + 5000 - 3_600_000 };
    const others = Array.from({ length: 20 }, (_, i) => ({ name: `run-${String(i).padStart(2, '0')}`, props: endedStamp(`run-${String(i).padStart(2, '0')}`, AT + 100 + i) }));
    const { binned, trashed } = await keptAt([young, ...others, { name: RUN_ID }], AT + 5000);
    expect(binned).toEqual(['run-00']);
    expect(trashed).toEqual(['run-00']);
  });

  it('a run folder holding a file the person moved in is kept', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    // P4-38d: Alex moved a note into the oldest run's folder. 21 ended runs, so run-00 is the one beyond 20; its own
    // record carries its mark, the note does not, so the folder and the note stay, and the skip is logged.
    const mine = { name: 'manifest-a.json', props: { bowerRun: 'run-00' } };
    const others = Array.from({ length: 20 }, (_, i) => ({ name: `run-${String(i).padStart(2, '0')}`, props: endedStamp(`run-${String(i).padStart(2, '0')}`, AT + 100 + i) }));
    const { binned, trashed } = await keptAt([...others.map((f, i) => (i === 0 ? { ...f, inside: [mine, { name: 'Ideas.md' }] } : f)), { name: RUN_ID }], AT + 5000);
    expect(binned).toEqual([]);
    expect(trashed).toEqual([]);
    expect(logged.mock.calls.some((c) => String(c[0]).includes('kept'))).toBe(true);
  });

  it('a run folder holding a folder the person moved in is kept', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The same with a folder of Alex's (with a note in it) moved into the oldest run's folder.
    const others = Array.from({ length: 20 }, (_, i) => ({ name: `run-${String(i).padStart(2, '0')}`, props: endedStamp(`run-${String(i).padStart(2, '0')}`, AT + 100 + i) }));
    const moved: Inside[] = [{ name: 'manifest-a.json', props: { bowerRun: 'run-00' } }, { name: 'Trips', folder: true }];
    const { binned, trashed } = await keptAt([...others.map((f, i) => (i === 0 ? { ...f, inside: moved } : f)), { name: RUN_ID }], AT + 5000);
    expect(binned).toEqual([]);
    expect(trashed).toEqual([]);
  });

  it('a clean marked run folder beyond 20 is binned', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // 22 ended runs: run-00 holds a note of Alex's and is kept; run-01, every record inside marked as its own, goes.
    // The skipped folder still counts among the runs, so none of the 20 newest is reached.
    const others = Array.from({ length: 21 }, (_, i) => ({ name: `run-${String(i).padStart(2, '0')}`, props: endedStamp(`run-${String(i).padStart(2, '0')}`, AT + 100 + i) }));
    const own = (run: string): Inside[] => ['manifest-a.json', 'checkpoint-0-a.json', 'report-a.json', 'dispositions.json'].map((name) => ({ name, props: { bowerRun: run } }));
    const inside = (i: number): Inside[] | undefined => (i === 0 ? [...own('run-00'), { name: 'Ideas.md' }] : i === 1 ? own('run-01') : undefined);
    const { binned, trashed } = await keptAt([...others.map((f, i) => ({ ...f, inside: inside(i) ?? [] })), { name: RUN_ID }], AT + 5000);
    expect(binned).toEqual(['run-01']);
    expect(trashed).toEqual(['run-01']);
  });

  it('a marked run folder renamed at rest is kept', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The oldest run's folder renamed by Alex while no run was going: its mark no longer names it, so it is not counted
    // nor binned; of 20 stamped runs and this run only the oldest stamped one goes.
    const renamed = { name: 'Old trips', props: endedStamp('run-old', AT), created: AT - 2 * 24 * 3_600_000 };
    const others = Array.from({ length: 20 }, (_, i) => ({ name: `run-${String(i).padStart(2, '0')}`, props: endedStamp(`run-${String(i).padStart(2, '0')}`, AT + 100 + i) }));
    const { binned, trashed } = await keptAt([renamed, ...others, { name: RUN_ID }], AT + 5000);
    expect(binned).toEqual(['run-00']);
    expect(trashed).toEqual(['run-00']);
  });

  it('the Bin cap counts folders, duplicates of one run included', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // 24 stamped runs, the oldest in two folders, and this run: at most 3 folders go, oldest first, so the oldest run's
    // two folders and the next run's one; the third run waits for the next run.
    const others = Array.from({ length: 24 }, (_, i) => ({ name: `run-${String(i).padStart(2, '0')}`, props: endedStamp(`run-${String(i).padStart(2, '0')}`, AT + 100 + i) }));
    const twin = { name: 'run-00', props: endedStamp('run-00', AT + 100) };
    const { binned, trashed } = await keptAt([twin, ...others, { name: RUN_ID }], AT + 5000);
    expect(binned).toEqual(['run-00', 'run-00', 'run-01']);
    expect(trashed).toEqual(['run-00', 'run-00', 'run-01']);
  });

  it('each run folder is listed just before its own Bin', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // 23 ended runs and this run: run-00, run-01 and run-02 go. Each is listed, then binned, before the next is listed
    // (P4-38e), so what was moved into one while an earlier one went is seen.
    const others = Array.from({ length: 23 }, (_, i) => ({ name: `run-${String(i).padStart(2, '0')}`, props: endedStamp(`run-${String(i).padStart(2, '0')}`, AT + 100 + i) }));
    const { binned, requests, made } = await keptAt([...others, { name: RUN_ID }], AT + 5000);
    expect(binned).toEqual(['run-00', 'run-01', 'run-02']);
    const name = new Map(made.filter((f) => f.name.startsWith('run-')).map((f) => [f.id, f.name]));
    const steps = requests.flatMap((r) => {
      const inside = /'([^']+)' in parents/.exec(r.url.searchParams.get('q') ?? '')?.[1];
      if (r.method === 'GET' && inside && name.has(inside)) return [`list ${name.get(inside) ?? ''}`];
      const id = decodeURIComponent(r.url.pathname.split('/').at(-1) ?? '');
      return r.method === 'PATCH' && name.has(id) ? [`bin ${name.get(id) ?? ''}`] : [];
    });
    expect(steps).toEqual(['list run-00', 'bin run-00', 'list run-01', 'bin run-01', 'list run-02', 'bin run-02']);
  });

  it('a picked folder that gains an unmarked child before its turn is kept', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // P4-38e: 23 ended runs, so run-00, run-01 and run-02 are picked. Right after run-00 goes to the Bin, Alex moves a
    // note into run-01: run-01 is kept with its note, run-02 still goes.
    const others = Array.from({ length: 23 }, (_, i) => ({ name: `run-${String(i).padStart(2, '0')}`, props: endedStamp(`run-${String(i).padStart(2, '0')}`, AT + 100 + i) }));
    const moved: Promise<DriveFile>[] = [];
    const { binned, trashed } = await keptAt([...others, { name: RUN_ID }], AT + 5000, (drive, made) => ({
      applied: (call) => {
        const first = made.find((f) => f.name === 'run-00');
        const second = made.find((f) => f.name === 'run-01');
        if (call.op === 'trash' && call.id === first?.id && second) moved.push(drive.createText(second.id, 'Ideas.md', 'Ideas by Alex'));
      },
    }));
    expect(moved).toHaveLength(1);
    await Promise.all(moved);
    expect(binned).toEqual(['run-00', 'run-02']);
    expect(trashed).toEqual(['run-00', 'run-02']);
  });

  it('a run folder let go of whose Bin answer was lost is resolved by its stamp', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const drive = fixedDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    const records = new RunRecords(drive, root);
    const w = drive.fenced(() => {});
    for (let i = 0; i < 3; i++) {
      const manifest = await plan(root, `run-${i}`);
      const m = await canonical(manifest);
      const where = { runId: manifest.runId };
      await records.put(w, where, manifestName(m.hash), m.text);
      const mark = { attemptId: `attempt-${i}`, epoch: 1 };
      const first = firstCheckpoint(manifest, m.hash, mark, AT + i);
      const c0 = await canonical(first);
      await records.put(w, where, checkpointName(0, c0.hash), c0.text);
      const last = nextCheckpoint(first, c0.hash, mark, { phase: 'failed', phaseAt: AT + 1000 + i });
      const c1 = await canonical(last);
      await records.putNew(w, where, checkpointName(1, c1.hash), c1.text);
      const folder = (await drive.listAll(root)).find((f) => f.folder && f.name === manifest.runId);
      await drive.update(folder?.id ?? '', { appProperties: endedStamp(manifest.runId, AT + 1000 + i) });
    }
    const wire = driveV3(drive);
    const token = new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: wire.fetch, now: () => wire.now });
    const adapter = new RunnerDrive({ token, attempt: 1, fetch: wire.fetch });
    // The oldest folder goes to the Bin (3 ended and this run, 3 kept) and the answer is lost.
    adapter.fault = { before: (call) => (call.op === 'trash' ? 'lose-reply' : 'pass') };
    const letGo = keepFinishedAtEnd(adapter, new RunRecords(runnerReads(adapter, RUN_ID), root), RUN_ID, AT + 5000, 3);
    await expect(letGo).resolves.toHaveLength(1);
    const [id] = await letGo;
    expect((await drive.evidence(id ?? ''))?.trashed).toBe(true);
    expect((await drive.evidence(id ?? ''))?.file.name).toBe('run-0');
  });
});
