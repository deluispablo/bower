import { describe, expect, it, vi } from 'vitest';
import type { Checkpoint, EffectEvidence } from '../../src/data/contracts/run-checkpoint';
import { hashRecordJson } from '../../src/data/contracts/record-json';
import type { CapturedMember, CapturedPile, OperationV2, ReportContribution, SeenFile } from '../../src/data/contracts/run-manifest';
import type { DriveFile } from '../../src/data/drive/drive-api';
import type { FencedCall } from '../../src/data/drive/fake-drive';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { RunRecords, type RunManifest } from '../../src/data/spine/records';
import { SYSTEM, isRunnerFile } from '../../src/data/vault/layout';
import { B_FAILURE } from '../../src/data/spine/scripted';
import { runTidy, type TidyEnd, type TidyOptions } from '../src/main';
import type { Admitted } from '../src/spine/admitted';
import { driveEffects, type Effects, type ReadBack, type Settled } from '../../src/data/spine/engine';
import { API, RUN_ID, TICKET, driveV3, fixedDrive, type DriveV3 } from './drive-v3';

const AT = Date.UTC(2026, 9, 7, 9);
const MOVED = 'It was moved, renamed or removed before Bower could get to it.';

/** Effects that count each sending; a move of `refused` is refused before anything is sent. */
class StubEffects implements Effects {
  readonly sent = new Map<string, number>();
  observed = 0;
  /** A move of this thing is refused; `all`, every move. */
  refused: string | null = null;
  /** After this many sends, the next one stops on an error nobody caught. */
  breakAfter: number | null = null;

  async apply(op: OperationV2, _head: Checkpoint, _w: unknown, _m: RunManifest, sending: () => Promise<void>): Promise<Settled> {
    const e = op.effect;
    if (e.kind === 'move' && (this.refused === 'all' || e.before.fileId === this.refused)) return { state: 'rejected', failure: { code: 'conflict', message: MOVED } };
    await sending();
    // Operations run together: the break is met at the send, in the order they get there.
    if (this.breakAfter !== null && this.sent.size >= this.breakAfter) throw new Error('The runner stopped');
    this.sent.set(op.operationId, (this.sent.get(op.operationId) ?? 0) + 1);
    return { state: 'applied', evidence: evidenceOf(op) };
  }

  async observe(op: OperationV2): Promise<EffectEvidence | null> {
    this.observed++;
    return this.sent.has(op.operationId) ? evidenceOf(op) : null;
  }

  async readBack(op: OperationV2): Promise<ReadBack> {
    const evidence = await this.observe(op);
    return evidence ? { state: 'landed', evidence } : { state: 'unreadable', why: 'no evidence' };
  }
}

function evidenceOf(op: OperationV2): EffectEvidence {
  const file = { fileId: `file-${op.ordinal}`, name: `Thing ${op.ordinal}`, parents: ['FOLDER_ID'], folder: false, modifiedTime: '2026-10-07T09:00:00.000Z' };
  return { file, trashed: false, content: null, provenance: 'adapter-read' };
}

/** A folder with four things in the inbox, each its own pile, admitted by the Worker's rules, on a pretend Drive v3. */
async function demo(): Promise<{ wire: DriveV3; root: string; admission: AdmissionManifest }> {
  const drive = fixedDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  const inbox = (await drive.createFolder(root, 'Inbox')).id;
  await drive.createFolder(root, 'Projects');
  const sys = (await drive.createFolder(root, '.bower')).id;
  await drive.createFolder(sys, 'changes');
  await drive.createText(sys, 'questions.json', '{ "v": 1, "questions": [] }\n');
  for (const [name, pile] of [['receipt.pdf', 'p-receipt'], ['ticket.pdf', 'p-ticket'], ['scan.pdf', 'p-scan'], ['plan.pdf', 'p-plan']]) {
    await drive.createText(inbox, name ?? '', `%PDF ${name ?? ''}`, { pile: pile ?? '' });
  }
  const admitted = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
  if (admitted.kind !== 'manifest') throw new Error(`nothing admitted: ${admitted.cause}`);
  const wire = driveV3(drive);
  wire.folderId = root;
  wire.manifest = admitted.manifest;
  return { wire, root, admission: admitted.manifest };
}

async function hash(value: unknown): Promise<string> {
  const h = await hashRecordJson(value);
  if (!h.ok) throw new Error(h.reason);
  return h.value;
}

/**
 * The provider stub (the scripted provider comes with its own entry): every pile taken is captured and its thing
 * moved to Projects, filed when the move lands and set aside when it is refused. A pile that waits is not taken.
 */
function provider(wire: DriveV3, root: string): (taken: Admitted) => Promise<RunManifest> {
  return async ({ taken }) => {
    const projects = (await wire.drive.listAll(root)).find((f) => f.folder && f.name === 'Projects');
    if (!projects) throw new Error('no Projects');
    const seen = (f: { fileId: string; name: string; parents: string[]; modifiedTime: string }, folder = false): SeenFile => ({ fileId: f.fileId, name: f.name, parents: f.parents, folder, modifiedTime: f.modifiedTime });
    const piles: CapturedPile[] = [];
    const members: CapturedMember[] = [];
    for (const pile of taken.piles) {
      for (const item of pile.items) {
        const digest = await wire.drive.storedDigest(item.fileId);
        if (!digest) throw new Error('no digest');
        piles.push({ pileId: pile.pileId, source: { kind: 'observed' }, anchor: null, memberKeys: [null], childFileIds: [item.fileId], context: { kind: 'absent' } });
        members.push({ pileId: pile.pileId, memberKey: null, file: seen(item), content: { encoding: 'blob', size: digest.size, sha256: digest.sha256, provenance: 'adapter-read', observedModifiedTime: item.modifiedTime } });
      }
    }
    const scope = { rootId: root };
    const capture = { piles, members, journal: [], places: [{ file: seen({ fileId: projects.id, name: projects.name, parents: projects.parents, modifiedTime: projects.modifiedTime }, true), path: 'Projects' }] };
    const captureId = await hash({ scope, runScope: 'all', capture });
    const operations: OperationV2[] = [];
    const reportPlan: ReportContribution[] = [];
    const empty = { filed: [], created: [], updated: [], setAside: [], questions: [] };
    for (const [ordinal, m] of members.entries()) {
      const effect = { kind: 'move' as const, before: m.file, parent: { fileId: projects.id }, name: m.file.name, properties: {} };
      const operationId = await hash({ runId: RUN_ID, captureId, ordinal, effect });
      operations.push({ operationId, ordinal, dependsOn: [], effect });
      reportPlan.push({ requires: [operationId], when: 'applied', value: { ...empty, filed: [{ name: m.file.name, title: m.file.name, kind: 'pdf', to: 'Projects' }] } });
      reportPlan.push({ requires: [operationId], when: 'rejected', value: { ...empty, setAside: [{ name: m.file.name, why: "It couldn't be filed this time." }] } });
    }
    return { v: 1, kind: 'run-manifest', scope, runId: RUN_ID, requestId: 'request-1', runScope: 'all', allowWeb: false, requestedAt: AT, captureId, capture, operations, reportPlan };
  };
}

interface Write {
  call: FencedCall;
  /** The index of its request among the Drive requests. */
  at: number;
}

/** One runner process for `attempt`, from its entry; `refuse` fails those writes as with no network. */
function tidy(wire: DriveV3, root: string, attempt: number, effects: Effects, writes: Write[] = [], refuse: (call: FencedCall) => boolean = () => false, over: Partial<TidyOptions> = {}): Promise<TidyEnd> {
  wire.attempt = attempt;
  let ids = 0;
  return runTidy({
    api: API,
    runId: RUN_ID,
    ticket: TICKET,
    attempt,
    fetch: wire.fetch,
    pacing: { baseMs: 0 },
    provider: () => provider(wire, root),
    effects: () => effects,
    clock: () => AT + attempt * 1000,
    newId: () => `attempt${attempt}-${++ids}`,
    onDrive: (d) => {
      d.fault = {
        before: (call) => {
          writes.push({ call, at: wire.requests.length });
          return refuse(call) ? 'refuse' : 'pass';
        },
      };
    },
    ...over,
  });
}

async function nameOf(wire: DriveV3, call: FencedCall): Promise<string> {
  return 'name' in call ? call.name : (await wire.drive.get(call.id)).name;
}

async function systemFolder(wire: DriveV3, root: string): Promise<DriveFile> {
  const sys = (await wire.drive.listAll(root)).find((f) => f.folder && f.name === SYSTEM.dir && f.parents[0] === root);
  if (!sys) throw new Error('no .bower');
  return sys;
}

async function stored(wire: DriveV3, root: string, path: string): Promise<{ file: DriveFile; value: unknown } | null> {
  const sys = await systemFolder(wire, root);
  const file = (await wire.drive.listAll(root)).find((f) => !f.folder && f.name === path.slice(SYSTEM.dir.length + 1) && f.parents[0] === sys.id);
  return file ? { file, value: JSON.parse(await wire.drive.readText(file.id)) as unknown } : null;
}

/** The wire's fetch, with every Drive request failing as with no network while `failing()` holds. */
function noDrive(wire: DriveV3, failing: (url: URL, method: string) => boolean): typeof fetch {
  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== API && failing(url, (init.method ?? 'GET').toUpperCase())) throw new TypeError('fetch failed');
    return wire.fetch(input, init);
  };
}

async function chainOf(wire: DriveV3, root: string): Promise<Checkpoint[]> {
  const found = await new RunRecords(wire.drive, root).found(RUN_ID);
  return found.kind === 'run' ? found.chain : [];
}

describe('the report barrier', () => {
  it('every admitted item ends with one disposition', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wire, root, admission } = await demo();
    const item = (id: string) => admission.piles.find((p) => p.pileId === id)?.items[0];
    // One thing changed after admission: its pile waits for the next run.
    const changed = item('p-scan');
    if (!changed) throw new Error('no p-scan');
    wire.drive.touch(changed.fileId);
    // One thing is refused before it moves: it stays in the inbox, set aside.
    const refused = item('p-ticket');
    if (!refused) throw new Error('no p-ticket');
    const effects = new StubEffects();
    effects.refused = refused.fileId;

    const end = await tidy(wire, root, 1, effects);

    expect(end.phase).toBe('done');
    if (end.phase !== 'done') return;
    const admitted = admission.piles.flatMap((p) => p.items.map((i) => i.fileId));
    // Every admitted item exactly once: none left without a disposition, none with two.
    expect(end.dispositions.map((d) => d.fileId).sort()).toEqual([...admitted].sort());
    const of = (fileId: string) => end.dispositions.find((d) => d.fileId === fileId)?.disposition;
    expect(admitted).toHaveLength(4);
    expect(of(changed.fileId)).toBe('waiting');
    expect(of(refused.fileId)).toBe('set-aside');
    expect([of(item('p-receipt')?.fileId ?? ''), of(item('p-plan')?.fileId ?? '')]).toEqual(['filed', 'filed']);
    expect(new Set(end.dispositions.map((d) => d.disposition))).toEqual(new Set(['filed', 'set-aside', 'waiting']));
    // Only what was filed was sent: what waits and what was refused were not; the report says what was filed and what was set aside.
    expect([...effects.sent.keys()]).toHaveLength(2);
    const view = await stored(wire, root, SYSTEM.lastRun);
    expect(view?.value).toMatchObject({ v: 1, run: { id: RUN_ID, phase: 'done', report: { setAside: [{ name: 'ticket.pdf' }] } } });
    expect((view?.value as { run: { report: { filed: unknown[] } } }).run.report.filed).toHaveLength(2);
  });

  it('last-run.json is written last and confirmed by its answer, with no read back, before done', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wire, root } = await demo();
    const writes: Write[] = [];

    const end = await tidy(wire, root, 1, new StubEffects(), writes);

    expect(end.phase).toBe('done');
    const sys = await systemFolder(wire, root);
    const inSystem = async (w: Write): Promise<boolean> => ('parentId' in w.call ? w.call.parentId : (await wire.drive.get(w.call.id)).parents[0]) === sys.id;
    const report: Write[] = [];
    for (const w of writes) if (await inSystem(w)) report.push(w);
    expect(report.length).toBeGreaterThan(0);
    const last = report.at(-1);
    if (!last) throw new Error('no report write');
    expect(await nameOf(wire, last.call)).toBe('last-run.json');
    // Each report file is there in its shape, and the view shows this run done with its report.
    for (const path of [SYSTEM.questions, SYSTEM.suggestions, SYSTEM.requests, SYSTEM.hashes, SYSTEM.lastRun] as const) {
      const file = await stored(wire, root, path);
      expect(file && isRunnerFile(path, file.value)).toBe(true);
    }
    const view = await stored(wire, root, SYSTEM.lastRun);
    expect(view?.value).toMatchObject({ v: 1, run: { id: RUN_ID, phase: 'done', report: { filed: expect.any(Array) } } });
    // Confirmed by its write's answer (its md5Checksum), with no read after it, and only then is done reported.
    const readBack = wire.requests.findIndex((r, i) => i > last.at && r.method === 'GET' && r.url.searchParams.get('alt') === 'media' && r.url.pathname.endsWith(`/${view?.file.id ?? ''}`));
    expect(readBack).toBe(-1);
    const done = wire.statuses.find((s) => s.phase === 'done');
    expect(done?.after).toBeGreaterThan(last.at);
    expect(wire.statuses.filter((s) => s.phase === 'done')).toHaveLength(1);
    const head = (await chainOf(wire, root)).at(-1);
    expect(head).toMatchObject({ phase: 'done', report: { state: 'published' } });
  });

  it('last-run.json whose answer shows other bytes than those sent is not confirmed, and done is never reported', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wire, root } = await demo();
    // Drive stored, by its answer, other bytes than those sent: its md5Checksum is not theirs.
    wire.reshape = (a) => (a.name === 'last-run.json' && typeof a.md5Checksum === 'string' ? { ...a, md5Checksum: '0'.repeat(32) } : a);

    const end = await tidy(wire, root, 1, new StubEffects());

    expect(end.phase).not.toBe('done');
    expect(wire.statuses.filter((s) => s.phase === 'done')).toHaveLength(0);
    expect((await chainOf(wire, root)).at(-1)).toMatchObject({ phase: 'saving' });
  });

  it('a failed report save stays in saving and a redispatch only writes the report', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wire, root } = await demo();
    const before = await stored(wire, root, SYSTEM.lastRun);
    const effects = new StubEffects();
    const isView = (call: FencedCall): boolean => ('name' in call && call.name === 'last-run.json') || ('id' in call && call.id === before?.file.id);

    const first = await tidy(wire, root, 1, effects, [], isView);

    expect(first.phase).toBe('saving');
    expect(wire.statuses.at(-1)).toMatchObject({ attempt: 1, phase: 'saving' });
    const held = (await chainOf(wire, root)).at(-1);
    // Effects done, report pending: the chain says so.
    expect(held?.phase).toBe('saving');
    expect(held?.report.state).toBe('pending');
    expect(held?.outcomes.every((o) => o.state === 'applied' || o.state === 'rejected')).toBe(true);
    expect((await stored(wire, root, SYSTEM.lastRun))?.value).toEqual(before?.value);
    const sent = new Map(effects.sent);
    expect([...sent.values()].every((n) => n === 1)).toBe(true);

    // The redispatch reads that checkpoint, applies no effect and writes only the report, then its last checkpoint.
    const writes: Write[] = [];
    const second = await tidy(wire, root, 2, effects, writes);
    expect(second.phase).toBe('done');
    expect(effects.sent).toEqual(sent);
    expect(effects.observed).toBe(0);
    const names = await Promise.all(writes.map((w) => nameOf(wire, w.call)));
    expect(names).toEqual(['last-run.json', expect.stringMatching(/^checkpoint-\d+-[0-9a-f]{64}\.json$/)]);
    expect((await stored(wire, root, SYSTEM.lastRun))?.value).toMatchObject({ v: 1, run: { id: RUN_ID, phase: 'done' } });
    expect(wire.statuses.at(-1)).toMatchObject({ attempt: 2, phase: 'done' });
  });

  it('main runs token, spine, barrier and status end to end', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wire, root } = await demo();
    const effects = new StubEffects();
    // The first runner finishes, and its `done` report is lost on the way.
    wire.dropDone = 503;
    await expect(tidy(wire, root, 1, effects)).rejects.toMatchObject({ code: 'unknown' });

    expect(wire.tokenCalls).toBeGreaterThan(0);
    expect(wire.statuses.map((s) => [s.attempt, s.seq, s.phase])).toEqual([[1, 1, 'reading'], [1, 2, 'writing'], [1, 3, 'saving']]);
    const chain = await chainOf(wire, root);
    expect(chain.at(-1)).toMatchObject({ phase: 'done', report: { state: 'published' } });
    expect(effects.sent.size).toBe(chain.at(-1)?.outcomes.length);
    expect((await stored(wire, root, SYSTEM.lastRun))?.value).toMatchObject({ v: 1, run: { id: RUN_ID, phase: 'done' } });

    // The next attempt finds this run's report in the folder before any write: it writes nothing and reports done.
    wire.dropDone = null;
    const writes: Write[] = [];
    const sent = new Map(effects.sent);
    const again = await tidy(wire, root, 2, effects, writes);
    expect(again.phase).toBe('done');
    expect(writes).toEqual([]);
    expect(effects.sent).toEqual(sent);
    expect(wire.statuses.at(-1)).toMatchObject({ attempt: 2, seq: 1, phase: 'done' });
  });

  it('a run that changed nothing never says changes were made', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const isView = (call: FencedCall): boolean => 'name' in call && call.name === 'last-run.json';

    // Every move refused before it was sent, and the report cannot be saved: nothing changed, and it says so.
    const refusedAll = await demo();
    const none = new StubEffects();
    none.refused = 'all';
    const nothing = await tidy(refusedAll.wire, refusedAll.root, 1, none, [], isView);
    expect(nothing.phase).toBe('failed');
    expect(refusedAll.wire.statuses.map((s) => s.phase)).toEqual(['reading', 'writing', 'failed']);
    expect(refusedAll.wire.statuses.at(-1)?.failure).toBe(B_FAILURE);

    // An error nobody caught before any effect: the same.
    const early = await demo();
    const broke = await tidy(early.wire, early.root, 1, new StubEffects(), [], () => false, {
      provider: () => async () => {
        throw new Error('The plan could not be made');
      },
    });
    expect(broke.phase).toBe('failed');
    expect(early.wire.statuses.map((s) => s.phase)).toEqual(['reading', 'writing', 'failed']);
    expect(early.wire.statuses.at(-1)?.failure).toBe(B_FAILURE);

    // After an applied effect, an error nobody caught leaves the run saving, never "nothing changed".
    const late = await demo();
    const some = new StubEffects();
    some.breakAfter = 1;
    const stopped = await tidy(late.wire, late.root, 1, some, []);
    expect(stopped.phase).toBe('saving');
    expect(late.wire.statuses.map((s) => s.phase)).toEqual(['reading', 'writing', 'saving']);

    // A run that changed something says `saving` only once "effects done, report pending" is in its chain.
    const whole = await demo();
    const writes: Write[] = [];
    expect((await tidy(whole.wire, whole.root, 1, new StubEffects(), writes)).phase).toBe('done');
    const pending = (await chainOf(whole.wire, whole.root)).find((c) => c.report.state === 'pending');
    if (!pending) throw new Error('no pending report in the chain');
    const committed: Write[] = [];
    for (const w of writes) if ((await nameOf(whole.wire, w.call)).startsWith(`checkpoint-${pending.revision}-`)) committed.push(w);
    expect(committed).toHaveLength(1);
    const saving = whole.wire.statuses.find((s) => s.phase === 'saving');
    expect(saving?.after).toBeGreaterThan(committed[0]?.at ?? Infinity);
  });

  it('a restarted runner that cannot read its folder never says nothing changed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Attempt 1 applies two effects, then stops in saving.
    const { wire, root } = await demo();
    const effects = new StubEffects();
    effects.breakAfter = 2;
    expect((await tidy(wire, root, 1, effects)).phase).toBe('saving');
    expect(effects.sent.size).toBe(2);
    expect(wire.statuses.map((s) => s.phase)).toEqual(['reading', 'writing', 'saving']);
    const sent = new Map(effects.sent);

    // The same attempt runs again, and Drive fails on its first read (whether the report landed): the job fails, visibly.
    const again = await tidy(wire, root, 1, effects, [], () => false, { fetch: noDrive(wire, () => true) }).catch((e: unknown) => e);
    expect(wire.statuses.filter((s) => s.phase === 'failed')).toEqual([]);
    expect(again).toBeInstanceOf(Error);

    // Attempt 2 reads the report, then cannot read its chain: the same.
    let reported = false;
    const afterWriting = noDrive(wire, () => reported);
    const watched: typeof fetch = async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.origin === API && url.pathname.endsWith('/status')) reported = true;
      return afterWriting(input, init);
    };
    const next = await tidy(wire, root, 2, effects, [], () => false, { fetch: watched }).catch((e: unknown) => e);
    expect(reported).toBe(true);
    expect(wire.statuses.filter((s) => s.phase === 'failed')).toEqual([]);
    expect(next).toBeInstanceOf(Error);

    expect(wire.statuses.filter((s) => s.phase === 'failed')).toEqual([]);
    expect(wire.statuses.some((s) => s.failure === B_FAILURE)).toBe(false);
    expect(effects.sent).toEqual(sent);
  });

  it('a check that cannot read never counts as a change', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wire, root } = await demo();
    const projects = (await wire.drive.listAll(root)).find((f) => f.folder && f.name === 'Projects');
    if (!projects) throw new Error('no Projects');
    // The real effects, whose fence right before each move into Projects cannot read that folder: nothing is sent and
    // nothing is refused. The attempt stops (left in saving) for recovery; no Google Drive "offline" outside a browser.
    const end = await tidy(wire, root, 1, new StubEffects(), [], () => false, {
      effects: driveEffects,
      fetch: noDrive(wire, (url, method) => method === 'GET' && url.pathname.endsWith(`/files/${projects.id}`)),
    });
    expect(end.phase).toBe('saving');
    const stopped = (await chainOf(wire, root)).at(-1);
    expect(stopped?.outcomes.some((o) => o.state === 'applied' || o.state === 'rejected')).toBe(false);
    expect((await wire.drive.listAll(projects.id)).filter((f) => f.parents[0] === projects.id)).toEqual([]);
    // Recovery: the next attempt, Drive answering, reads each back by its stamp and files them; nothing is lost.
    const again = await tidy(wire, root, 2, new StubEffects(), [], () => false, { effects: driveEffects });
    expect(again.phase).toBe('done');
    expect((await chainOf(wire, root)).at(-1)?.outcomes.map((o) => o.state)).not.toContain('possible-effect');
    expect((await wire.drive.listAll(projects.id)).filter((f) => f.parents[0] === projects.id).length).toBeGreaterThan(0);
  });

  it("a restarted runner's done reaches the Worker", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wire, root } = await demo();
    const effects = new StubEffects();
    // The report lands, then the runner stops before "done" is in its chain.
    let viewWritten = false;
    const stopAfterView = (call: FencedCall): boolean => {
      if ('name' in call && call.name === 'last-run.json') viewWritten = true;
      return viewWritten && 'name' in call && call.name.startsWith('checkpoint-');
    };
    expect((await tidy(wire, root, 1, effects, [], stopAfterView)).phase).toBe('saving');
    expect((await chainOf(wire, root)).at(-1)?.report.state).toBe('pending');
    expect((await stored(wire, root, SYSTEM.lastRun))?.value).toMatchObject({ run: { id: RUN_ID, phase: 'done' } });
    expect(wire.statuses.at(-1)).toMatchObject({ attempt: 1, seq: 3, phase: 'saving' });

    // The same attempt runs again (its seq starts over): it commits done to its chain, then the Worker hears it.
    const sent = new Map(effects.sent);
    const writes: Write[] = [];
    expect((await tidy(wire, root, 1, effects, writes)).phase).toBe('done');
    expect(effects.sent).toEqual(sent);
    const names = await Promise.all(writes.map((w) => nameOf(wire, w.call)));
    expect(names).toEqual([expect.stringMatching(/^checkpoint-\d+-[0-9a-f]{64}\.json$/)]);
    expect((await chainOf(wire, root)).at(-1)).toMatchObject({ phase: 'done', report: { state: 'published' } });
    const done = wire.statuses.at(-1);
    expect(done).toMatchObject({ attempt: 1, seq: 4, phase: 'done' });
    expect(done?.after).toBeGreaterThan(writes[0]?.at ?? Infinity);

    // Run once more, the Worker already holds it done: the run is finished, and nothing more is sent.
    const heard = wire.statuses.length;
    expect((await tidy(wire, root, 1, effects)).phase).toBe('done');
    expect(wire.statuses).toHaveLength(heard);

    // A done the Worker refuses even from its current seq is never swallowed: the job fails, visibly.
    const other = await demo();
    other.wire.refuseDone = true;
    await expect(tidy(other.wire, other.root, 1, new StubEffects())).rejects.toBeInstanceOf(Error);
    expect(other.wire.statuses.map((s) => s.phase)).toEqual(['reading', 'writing', 'saving']);
  });
});

describe('how an attempt ends (TL-P4-16 addendum 4)', () => {
  /** What the Worker heard from `attempt`: a terminal phase, the ended report, or nothing that ends it. */
  const heard = (wire: DriveV3, attempt: number): 'terminal' | 'ended' | 'nothing' => {
    if (wire.statuses.some((s) => s.attempt === attempt && (s.phase === 'done' || s.phase === 'failed'))) return 'terminal';
    return wire.endings.includes(attempt) ? 'ended' : 'nothing';
  };
  /** The wire's fetch, with the status route answering 500 to a report of `phase`, after its retries too. */
  const statusDown = (wire: DriveV3, phase: string): typeof fetch => async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as { phase?: unknown }) : null;
    if (url.origin === API && url.pathname.endsWith('/status') && body?.phase === phase) return new Response(null, { status: 500 });
    return wire.fetch(input, init);
  };

  /** An operation that stops on an error before anything is sent: the chain holds no effect. */
  const stopsFirst = (): Promise<Settled> => Promise.reject(new Error('The runner stopped'));

  it('every runner exit reaches the Worker or is recovered within 60 s', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Each exit, by where it stops; `heard` is what the Worker must have from it before the job ends.
    const exits: { name: string; heard: 'terminal' | 'ended' | 'nothing'; set(wire: DriveV3, effects: StubEffects): Partial<TidyOptions> }[] = [
      { name: 'token route down', heard: 'ended', set: (w) => { w.tokenRefusal = { status: 500, error: 'unknown' }; return {}; } },
      // Actions 37843268864: the first Drive read (whether the report landed) fails; no status had been sent.
      { name: 'Drive read fails in shownDone', heard: 'ended', set: (w) => ({ fetch: noDrive(w, () => true) }) },
      { name: 'an error nobody caught, before any report', heard: 'ended', set: () => ({ onDrive: () => { throw new TypeError('x is not a function'); } }) },
      { name: 'the provider throws', heard: 'ended', set: () => ({ provider: () => { throw new TypeError('provider broke'); } }) },
      { name: 'stops before any effect', heard: 'terminal', set: (_w, e) => { e.apply = stopsFirst; return {}; } },
      { name: 'stops after an effect (left in saving)', heard: 'ended', set: (_w, e) => { e.breakAfter = 1; return {}; } },
      { name: 'failed not taken', heard: 'ended', set: (w, e) => { e.apply = stopsFirst; return { fetch: statusDown(w, 'failed') }; } },
      { name: 'saving not taken', heard: 'ended', set: (w, e) => { e.breakAfter = 1; return { fetch: statusDown(w, 'saving') }; } },
      { name: 'done refused', heard: 'ended', set: (w) => { w.refuseDone = true; return {}; } },
      { name: 'person gone', heard: 'terminal', set: (w) => { w.revoked = true; return {}; } },
      // A newer attempt or a refused ticket owns the run: this one may not report.
      { name: 'stale attempt', heard: 'nothing', set: (w) => { w.tokenRefusal = { status: 409, error: 'stale-attempt' }; return {}; } },
      { name: 'ticket refused', heard: 'nothing', set: (w) => { w.tokenRefusal = { status: 401, error: 'signed-out' }; return {}; } },
    ];
    const seen: Record<string, string> = {};
    for (const exit of exits) {
      const { wire, root } = await demo();
      const effects = new StubEffects();
      const over = exit.set(wire, effects);
      await tidy(wire, root, 1, effects, [], () => false, over).catch((e: unknown) => e);
      seen[exit.name] = heard(wire, 1);
    }
    expect(seen).toEqual(Object.fromEntries(exits.map((e) => [e.name, e.heard])));
  });

  it('a Worker from before the ended report leaves the run to its deadline, and the exit is unchanged', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wire, root } = await demo();
    wire.oldWorker = true;
    const effects = new StubEffects();
    effects.breakAfter = 1;
    expect((await tidy(wire, root, 1, effects)).phase).toBe('saving');
    expect(wire.endings).toEqual([]);
    const unread = await demo();
    unread.wire.oldWorker = true;
    const error = await tidy(unread.wire, unread.root, 1, new StubEffects(), [], () => false, { fetch: noDrive(unread.wire, () => true) }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(unread.wire.statuses).toEqual([]);
  });
});
