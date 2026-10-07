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
import { runTidy, type TidyEnd } from '../src/main';
import type { Admitted } from '../src/spine/admitted';
import type { Effects, Settled } from '../src/spine/run';
import { API, RUN_ID, TICKET, driveV3, fixedDrive, type DriveV3 } from './drive-v3';

const AT = Date.UTC(2026, 9, 7, 9);
const MOVED = 'It was moved, renamed or removed before Bower could get to it.';

/** Effects that count each sending; a move of `refused` is refused before anything is sent. */
class StubEffects implements Effects {
  readonly sent = new Map<string, number>();
  observed = 0;
  refused: string | null = null;

  async apply(op: OperationV2): Promise<Settled> {
    this.sent.set(op.operationId, (this.sent.get(op.operationId) ?? 0) + 1);
    const e = op.effect;
    if (e.kind === 'move' && e.before.fileId === this.refused) return { state: 'rejected', failure: { code: 'conflict', message: MOVED } };
    return { state: 'applied', evidence: evidenceOf(op) };
  }

  async observe(op: OperationV2): Promise<EffectEvidence | null> {
    this.observed++;
    return this.sent.has(op.operationId) ? evidenceOf(op) : null;
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
function tidy(wire: DriveV3, root: string, attempt: number, effects: Effects, writes: Write[] = [], refuse: (call: FencedCall) => boolean = () => false): Promise<TidyEnd> {
  wire.attempt = attempt;
  let ids = 0;
  return runTidy({
    api: API,
    runId: RUN_ID,
    ticket: TICKET,
    attempt,
    fetch: wire.fetch,
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
    // What waits was never sent anything; the report says what was filed and what was set aside.
    expect([...effects.sent.keys()]).toHaveLength(3);
    const view = await stored(wire, root, SYSTEM.lastRun);
    expect(view?.value).toMatchObject({ v: 1, run: { id: RUN_ID, phase: 'done', report: { setAside: [{ name: 'ticket.pdf' }] } } });
    expect((view?.value as { run: { report: { filed: unknown[] } } }).run.report.filed).toHaveLength(2);
  });

  it('last-run.json is written last and read back before done', async () => {
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
    // Read back after it was written, and only then is done reported.
    const readBack = wire.requests.findIndex((r, i) => i > last.at && r.method === 'GET' && r.url.searchParams.get('alt') === 'media' && r.url.pathname.endsWith(`/${view?.file.id ?? ''}`));
    expect(readBack).toBeGreaterThan(last.at);
    const done = wire.statuses.find((s) => s.phase === 'done');
    expect(done?.after).toBeGreaterThan(readBack);
    expect(wire.statuses.filter((s) => s.phase === 'done')).toHaveLength(1);
    const head = (await chainOf(wire, root)).at(-1);
    expect(head).toMatchObject({ phase: 'done', report: { state: 'published' } });
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
    expect(wire.statuses.map((s) => [s.attempt, s.seq, s.phase])).toEqual([[1, 1, 'writing'], [1, 2, 'saving']]);
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
});
