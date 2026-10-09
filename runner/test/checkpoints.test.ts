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
import { keepFinished } from '../src/spine/retention';
import { runOperations, type Effects, type ReadBack, type RunEnd } from '../../src/data/spine/engine';
import { RunnerToken } from '../src/token';
import { API, RUN_ID, TICKET, driveV3, fixedDrive, type DriveV3 } from './drive-v3';

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

  async apply(op: OperationV2, _head: Checkpoint, _w: unknown, _m: RunManifest, sending: () => Promise<void>): Promise<{ state: 'applied'; evidence: EffectEvidence }> {
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
    // A create whose answer carries no checksum is read back, as before: two Drive requests per checkpoint.
    const before = await cost(false);
    expect(before.readBacks).toBe(before.checkpoints + 1);
    expect(before.requests).toBe(2 * before.checkpoints + 1);
    // Drive's answer carries the stored bytes' checksum: the create, nothing more.
    const after = await cost(true);
    expect(after.checkpoints).toBe(before.checkpoints);
    expect(after.readBacks).toBe(0);
    expect(after.requests).toBe(after.checkpoints);
    console.log(`checkpoint cost: before=${(before.requests / before.ops).toFixed(2)} after=${(after.requests / after.ops).toFixed(2)} Drive requests per operation`);
    expect(after.requests / after.ops).toBeLessThan(before.requests / before.ops);
  });

  it('a checkpoint Drive stored with other bytes than were sent is read back and refused', async () => {
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
    expect(errors.mock.calls.some((c) => String(c[0]).includes('Drive stored other bytes'))).toBe(true);
    // The checkpoint read back from Drive, never taken as written: the chain stops before it, and nothing after it was sent.
    const reads = wire.requests.filter((r) => r.url.searchParams.get('alt') === 'media' && decodeURIComponent(r.url.pathname.split('/').at(-1) ?? '') === changed);
    expect(reads.length).toBeGreaterThan(0);
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
      if (unfinished.has(i)) continue;
      // Finished in a scrambled order, so the newest are told by when they finished, not by their names.
      const last = nextCheckpoint(first, c0.hash, mark, { phase: 'failed', phaseAt: AT + 1000 + ((i * 7) % 25) });
      const c1 = await canonical(last);
      await records.putNew(w, where, checkpointName(1, c1.hash), c1.text);
    }
    const wire = driveV3(drive);
    const token = new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: wire.fetch, now: () => wire.now });
    const adapter = new RunnerDrive({ token, attempt: 1, fetch: wire.fetch });
    const trashed = await keepFinished(new RunRecords(runnerReads(adapter), root), await adapter.batch());

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
});
