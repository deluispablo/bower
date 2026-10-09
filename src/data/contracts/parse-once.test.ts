// @vitest-environment node
/**
 * Assumed API, all in ownership-format.ts:
 * createOwnershipContext(parser?: (bytes, {fileId, hash}) => OwnershipResult), context.read(fileId, bytes).
 * A fetched-note argument is {fileId, context}: parseNote(path, raw, fetched), applyChanges(bytes, changes, fetched).
 * runTidy creates the context before planning and supplies it to provider(drive, rootId, context) and effects(drive, context).
 * planScripted's options accept context; driveEffects(drive, context) shares it. FakeWorker hands its context to the service.
 * The optional parser is a dependency injection seam, invoked only on a miss, with the locally computed SHA-256 key.
 * Candidates still call parseOwnership directly, without fetched identity. No production observer/global cache is needed.
 * Standard approach (offline reference): https://en.wikipedia.org/wiki/Memoization ; unit-of-work scoped memo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as ownership from './ownership-format';
import { applyChanges } from './note-edit';
import { parseNote } from './note-format';
import { sha256Sync } from './hashes';
import type { Change } from './run-manifest';
import { FakeDrive } from '../drive/fake-drive';
import { FakeWorker } from '../fake/fake-worker';
import { FakeRunService, CLAIM_MS } from '../fake/fake-run-service';
import { DriveVault } from '../vault/drive-vault';
import { fakeRead } from '../spine/read';
import { planAdmission } from '../spine/plan';
import { planScripted } from '../spine/scripted';
import { scriptedDecisions } from '../demo/script';
import { driveEffects } from '../spine/engine';
import { runTidy } from '../../../runner/src/main';
import { runnerScripted } from '../../../runner/src/provider';
import { API, RUN_ID, TICKET, driveV3 } from '../../../runner/test/drive-v3';

const observed = vi.hoisted(() => ({
  active: false,
  contexts: [] as Array<{
    misses: Array<{ fileId: string; hash: string; bytes: Uint8Array }>;
    reads: Array<{ fileId: string; hash: string }>;
  }>,
  candidates: [] as Uint8Array[],
}));
vi.mock('./ownership-format', async (importOriginal) => {
  const real = await importOriginal<typeof import('./ownership-format')>();
  return {
    ...real,
    parseOwnership: (bytes: Uint8Array) => {
      if (observed.active) observed.candidates.push(new Uint8Array(bytes));
      return real.parseOwnership(bytes);
    },
    createOwnershipContext: () => {
      const log = { misses: [] as Array<{ fileId: string; hash: string; bytes: Uint8Array }>, reads: [] as Array<{ fileId: string; hash: string }> };
      if (observed.active) observed.contexts.push(log);
      const context = real.createOwnershipContext((bytes: Uint8Array, key: { fileId: string; hash: string }) => {
        if (observed.active) log.misses.push({ ...key, bytes: new Uint8Array(bytes) });
        return real.parseOwnership(bytes);
      });
      const read = context.read.bind(context);
      context.read = (fileId: string, bytes: Uint8Array) => {
        if (observed.active) log.reads.push({ fileId, hash: sha256Sync(bytes) });
        return read(fileId, bytes);
      };
      return context;
    },
  };
});

type Context = ReturnType<typeof ownership.createOwnershipContext>;
const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const AT = Date.UTC(2026, 9, 9, 9);
const BEFORE = [
  '---', 'summary: Lease', 'by: bower', '---', '', '## Current state', '- One offer', '',
  'Your words.', '- [ ] Call Alex', '', '## Timeline', '- 2026-10-01 · Started.', '',
  "## Bower's note", 'Compare.', '',
].join('\n');
const WHAT = 'Compared the offers.';
const AFTER = BEFORE.replace('- 2026-10-01 · Started.\n', '- 2026-10-01 · Started.\n- 2026-10-09 · Compared the offers.\n');
const PATHS = ['Projects/Hub A/Hub A.md', 'Projects/Hub B/Hub B.md'];
const UPDATES = PATHS.map((path) => ({ path, what: WHAT }));
const CHANGE: Change = { kind: 'timeline-append', recordIds: [], entries: [{ date: '2026-10-09', text: WHAT, source: null }] };

// Node's native Blob/FormData are needed by the real runner transport; the fake client only needs local storage.
beforeEach(() => {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
  vi.stubGlobal('localStorage', storage);
});

function startObserving(): void {
  observed.contexts.length = 0;
  observed.candidates.length = 0;
  observed.active = true;
}
afterEach(() => {
  observed.active = false;
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function seed() {
  localStorage.clear();
  const drive = new FakeDrive({ clock: () => AT });
  const runs = new FakeRunService({ drive, clock: () => AT, scale: 'instant' });
  const worker = new FakeWorker({ drive, runs, scenario: 'first', rootId: null, updates: UPDATES });
  const rootId = (await worker.createFolder()).id;
  const projects = (await drive.listAll(rootId)).find((f) => f.name === 'Projects');
  if (!projects) throw new Error('No Projects folder');
  const ids: string[] = [];
  for (const name of ['Hub A', 'Hub B']) {
    const folder = await drive.createFolder(projects.id, name);
    ids.push((await drive.createText(folder.id, `${name}.md`, BEFORE)).id);
  }
  const uploader = new DriveVault({ drive, rootId: async () => rootId, runningPiles: () => new Set(), device: 'DEVICE_A' });
  const addPile = async (n: number) => {
    await uploader.addPile({ text: '', items: [
      { name: `paper ${n}.pdf`, kind: 'pdf', origin: 'From this computer', body: new Blob(['%PDF made-up']) },
    ] });
    await uploader.settled();
  };
  await addPile(1);
  return { drive, runs, worker, rootId, ids, addPile };
}

/** Exactly one real parse for every explicit fetched version, with duplicate bytes retaining distinct ids. */
function expectKeys(ids: string[], text: string, repeated: boolean): void {
  const expected = ids.map((fileId) => ({ fileId, hash: sha256Sync(enc(text)) }));
  expect(expected).toHaveLength(2);
  expect(new Set(ids).size).toBe(2);
  expect.soft(observed.contexts, 'one context for this execution attempt').toHaveLength(1);
  const log = observed.contexts[0];
  if (!log) return; // The soft failure above still fails the test; finish checking the entry's bytes and recovery.
  const fetched = log.misses.filter((m) => ids.includes(m.fileId));
  expect(fetched.map(({ fileId, hash }) => ({ fileId, hash })).sort((a, b) => a.fileId.localeCompare(b.fileId)))
    .toEqual([...expected].sort((a, b) => a.fileId.localeCompare(b.fileId)));
  for (const key of expected) {
    expect(log.misses.filter((m) => m.fileId === key.fileId && m.hash === key.hash)).toHaveLength(1);
    expect(fetched.find((m) => m.fileId === key.fileId)?.bytes).toEqual(enc(text));
    if (repeated) expect(log.reads.filter((r) => r.fileId === key.fileId && r.hash === key.hash).length).toBeGreaterThanOrEqual(2);
  }
}

async function expectOutput(drive: FakeDrive, ids: string[]): Promise<void> {
  // Neither a fetched lookup nor assertion-time parsing contributes to the observation.
  observed.active = false;
  for (const id of ids) expect(await drive.readBytes(id)).toEqual(enc(AFTER));
}

// Separate executions of the exact acceptance name, each using the production entry and real effects.
describe('fake Worker/service parse lifetime', () => {
  it('each unchanged note is parsed at most once per run', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AT);
    const w = await seed();
    const snapshots: Array<Promise<{ snapshot: string; alongside: string }>> = [];
    w.drive.fault = { before: (call) => {
      // Save before either edit is sent, after the manifest/opening are durable. Recovery must parse both A versions.
      if (!snapshots.length && call.op === 'write-text' && w.ids.includes(call.id)) {
        snapshots.push(w.drive.snapshotWith(() => w.runs.toJSON()));
      }
      return 'pass';
    } };
    startObserving();
    const admitted = (await w.worker.process('all')).run;
    await w.runs.settled();
    observed.active = false;
    expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
    await expectOutput(w.drive, w.ids);
    expectKeys(w.ids, BEFORE, true);
    expect(observed.candidates.some((bytes) => sha256Sync(bytes) === sha256Sync(AFTER))).toBe(true);

    await w.addPile(2);
    startObserving();
    const second = (await w.worker.process('all')).run;
    await w.runs.settled();
    observed.active = false;
    expect(second.id).not.toBe(admitted.id);
    expect((await w.worker.status()).run?.phase).toBe('done');
    expectKeys(w.ids, AFTER, false);
    await expectOutput(w.drive, w.ids);

    expect(snapshots).toHaveLength(1);
    const snapshot = await snapshots[0];
    if (!snapshot) throw new Error('No recovery snapshot');
    const drive = FakeDrive.restore(snapshot.snapshot);
    const runs = FakeRunService.restore(snapshot.alongside, { drive, clock: () => AT + CLAIM_MS + 1, scale: 'instant' });
    const worker = new FakeWorker({ drive, runs, rootId: w.rootId, scenario: 'first', fresh: false, updates: UPDATES });
    startObserving();
    await worker.status();
    await runs.settled();
    observed.active = false;
    expect((await worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
    expectKeys(w.ids, BEFORE, false);
    await expectOutput(drive, w.ids);
  });
});

describe('runTidy parse lifetime', () => {
  it('each unchanged note is parsed at most once per run', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AT);
    const w = await seed();
    const admitted = await planAdmission(fakeRead(w.drive), w.rootId, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
    if (admitted.kind !== 'manifest') throw new Error('Nothing admitted');
    const initial = await w.drive.snapshot();
    const wire = driveV3(w.drive);
    wire.folderId = w.rootId;
    wire.manifest = admitted.manifest;
    let recoverySnapshot: Promise<{ snapshot: string; alongside: null }> | undefined;
    const tidy = (attempt: number, capture = false) => {
      wire.attempt = attempt;
      return runTidy({
        api: API, runId: RUN_ID, ticket: TICKET, attempt, fetch: wire.fetch, pacing: { baseMs: 0 }, clock: () => AT,
        provider: (drive, rootId, context: Context) => {
          const read = runnerScripted(drive);
          return async ({ taken }) => {
            read.aim(taken.scope);
            return (await planScripted(read, rootId, { scope: taken.scope, allowWeb: false, runId: RUN_ID,
              requestId: taken.id, requestedAt: taken.at, taken, decisions: scriptedDecisions(UPDATES), context })).manifest;
          };
        },
        effects: (drive, context: Context) => driveEffects(drive, context),
        onDrive: (drive) => { if (capture) drive.fault = { before: (call) => {
          if (!recoverySnapshot && call.op === 'write-text' && w.ids.includes(call.id)) recoverySnapshot = wire.drive.snapshotWith(() => null);
          return 'pass';
        } }; },
      });
    };
    startObserving();
    expect((await tidy(1, true)).phase).toBe('done');
    observed.active = false;
    await expectOutput(wire.drive, w.ids);
    expectKeys(w.ids, BEFORE, true);
    expect(observed.candidates.some((bytes) => sha256Sync(bytes) === sha256Sync(AFTER))).toBe(true);

    // A second execution on the same unchanged folder bytes proves no memo survived the first exit.
    wire.drive = FakeDrive.restore(initial);
    startObserving();
    expect((await tidy(2)).phase).toBe('done');
    observed.active = false;
    expectKeys(w.ids, BEFORE, true);
    await expectOutput(wire.drive, w.ids);

    expect(recoverySnapshot).toBeDefined();
    if (!recoverySnapshot) throw new Error('No runner recovery snapshot');
    wire.drive = FakeDrive.restore((await recoverySnapshot).snapshot);
    startObserving();
    expect((await tidy(3)).phase).toBe('done');
    observed.active = false;
    expectKeys(w.ids, BEFORE, false);
    await expectOutput(wire.drive, w.ids);
  });
});

// Identical bytes and CRLF are not identities. B changes section sizes so stale A spans cannot satisfy this guard.
describe.each(['fenced', 'external'] as const)('%s write invalidates the fetched version', (writer) => {
  it('a note changed during the run is parsed again', async () => {
    const drive = new FakeDrive({ clock: () => AT });
    const file = await drive.createText('root', 'Lease.md', BEFORE);
    startObserving();
    const context = ownership.createOwnershipContext();
    const fetched = { fileId: file.id, context };
    const a = await drive.readBytes(file.id);
    expect(parseNote('Lease.md', new TextDecoder().decode(a), fetched).timeline).toEqual([{ date: '2026-10-01', text: 'Started.' }]);
    context.read(file.id, await drive.readBytes(file.id));
    const edit = applyChanges(a, [CHANGE], fetched);
    expect(edit).toEqual({ ok: true, text: AFTER, bytes: enc(AFTER) });
    const candidatesBeforeRead = observed.candidates.map((bytes) => sha256Sync(bytes));
    expect(candidatesBeforeRead.filter((hash) => hash === sha256Sync(BEFORE)).length).toBeGreaterThanOrEqual(1);
    expect(candidatesBeforeRead.filter((hash) => hash === sha256Sync(AFTER)).length).toBeGreaterThanOrEqual(1);
    if (writer === 'fenced') {
      // The storage boundary checks the exact name/place and modifiedTime the read saw.
      await drive.fenced((peek) => {
        expect(peek(file.id)?.file).toMatchObject({ name: file.name, parents: file.parents, modifiedTime: file.modifiedTime });
      }).writeText(file.id, AFTER, file.modifiedTime);
    } else await drive.writeText(file.id, AFTER, file.modifiedTime);
    const b = await drive.readBytes(file.id);
    expect(b).toEqual(enc(AFTER));
    const result = parseNote('Lease.md', new TextDecoder().decode(b), fetched);
    const sections = context.read(file.id, await drive.readBytes(file.id));
    // The old version remains reusable too; exact bytes, rather than "latest for id", are the memo authority.
    context.read(file.id, a);
    observed.active = false;
    expect(sections.status).toBe('legacy');
    if (sections.status === 'invalid') throw new Error('B must have valid sections');
    const sectionText = (span: { start: number; end: number } | null): string | null =>
      span ? new TextDecoder().decode(b.subarray(span.start, span.end)) : null;
    expect({ current: sectionText(sections.layout.current), personal: sectionText(sections.personal),
      timeline: sectionText(sections.layout.timeline), bowerNote: sectionText(sections.layout.bowerNote) }).toEqual({
      current: '## Current state\n- One offer\n', personal: 'Your words.\n- [ ] Call Alex\n',
      timeline: '## Timeline\n- 2026-10-01 · Started.\n- 2026-10-09 · Compared the offers.\n\n',
      bowerNote: "## Bower's note\nCompare.\n",
    });
    expect(result).toMatchObject({ summary: 'Lease', currentState: ['One offer'], body: 'Your words.\n- [ ] Call Alex',
      timeline: [{ date: '2026-10-01', text: 'Started.' }, { date: '2026-10-09', text: WHAT }], bowerNote: 'Compare.' });
    expect(observed.contexts).toHaveLength(1);
    expect(observed.contexts[0]?.misses.map(({ fileId, hash }) => ({ fileId, hash }))).toEqual([
      { fileId: file.id, hash: sha256Sync(a) }, { fileId: file.id, hash: sha256Sync(b) },
    ]);
    expect(observed.candidates.map((bytes) => sha256Sync(bytes))).toEqual(candidatesBeforeRead);
    expect(await drive.readBytes(file.id)).toEqual(enc(AFTER));
  });
});
