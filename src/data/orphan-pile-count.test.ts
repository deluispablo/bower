import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { IDBFactory } from 'fake-indexeddb';
import type { Declaration } from './contracts/pile-declaration';
import { parsePileDeclaration } from './contracts/pile-declaration';
import type { Disposition } from './contracts/pile-disposition';
import { parsePileDisposition } from './contracts/pile-disposition';
import { isJournalRecord, type JournalRecord } from './contracts/journal-record';
import { canonicalRecordJson, hashRecordJson } from './contracts/record-json';
import { FakeDrive } from './drive/fake-drive';
import type { DriveFile } from './drive/drive-api';
import { declarationRecord, pileRecords } from './pile-readiness';
import { BowerError, type NewPile } from './types';
import { createUploadQueue, type UploadQueue } from './upload-queue';
import { indexedDbUploadStore } from './upload-store';
import { DriveVault } from './vault/drive-vault';
import { PROP, recordStamp } from './vault/layout';

const AT = Date.parse('2026-10-10T12:00:00Z');
const ACCOUNT = 'ACCOUNT_A';
const pages: DriveVault[] = [];
const queues: UploadQueue[] = [];
const releases: Array<() => void> = [];

beforeEach(() => {
  vi.setSystemTime(AT);
  localStorage.clear();
});

afterEach(async () => {
  for (const queue of queues) queue.stop();
  for (const release of releases) release();
  await Promise.all(queues.map((queue) => queue.idle()));
  for (const page of pages) page.dispose();
  pages.length = queues.length = releases.length = 0;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

interface Fixture {
  drive: FakeDrive;
  root: string;
  inbox: string;
  records: string;
}

async function fixture(): Promise<Fixture> {
  const drive = new FakeDrive({ clock: () => AT, chunkMultiple: 4 });
  const root = (await drive.createFolder('root', 'Bower')).id;
  const inbox = (await drive.createFolder(root, 'Inbox')).id;
  const system = (await drive.createFolder(root, '.bower')).id;
  const records = (await drive.createFolder(system, 'piles')).id;
  return { drive, root, inbox, records };
}

function page(f: Fixture, queue?: UploadQueue): DriveVault {
  const vault = new DriveVault({
    drive: f.drive, rootId: async () => f.root, runningPiles: () => new Set(),
    declarePiles: true, device: 'DEVICE_A',
    ...(queue ? { uploads: { queue, account: async () => ACCOUNT } } : {}),
  });
  pages.push(vault);
  return vault;
}

interface Summary { count: number; complete: boolean }

// The packet rules the semantics, but does not name its new app-local API.
// Keep that provisional seam in one place; its absence is an assertion, never a load error.
async function summary(vault: DriveVault): Promise<Summary> {
  const method: unknown = Reflect.get(vault, 'orphanSummary');
  expect(method, 'VaultSource.orphanSummary must expose the cached count and completeness').toBeTypeOf('function');
  const value: unknown = await (method as () => Promise<unknown>).call(vault);
  expect(value).toEqual({ count: expect.any(Number), complete: expect.any(Boolean) });
  return value as Summary;
}

const input = (n = 2): NewPile => ({
  text: '', items: Array.from({ length: n }, (_, i) => ({
    name: `input-${i}.pdf`, kind: 'pdf' as const, origin: 'From this computer',
    body: new Blob([`%PDF ${i} data`], { type: 'application/pdf' }),
  })),
});

async function declarations(f: Fixture): Promise<DriveFile[]> {
  return pileRecords(await f.drive.listAll(f.root), f.root, 'declaration');
}

async function parsed(f: Fixture, copy: DriveFile): Promise<{ value: Declaration; sha256: string }> {
  const result = await parsePileDeclaration(await f.drive.readBytes(copy.id), f.root);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) throw new Error('The positive declaration control failed.');
  return result;
}

async function writeDeclaration(f: Fixture, value: Declaration): Promise<DriveFile> {
  const record = await declarationRecord(value, value.scope.rootId);
  expect(record).not.toBeNull();
  if (!record) throw new Error('The positive declaration writer control failed.');
  return f.drive.createText(f.records, record.name, record.text, recordStamp(value.pileId, value.anchor.kind));
}

async function failedFolder(f: Fixture, n = 2): Promise<{ copy: DriveFile; value: Declaration; sha256: string }> {
  const before = new Set((await declarations(f)).map((copy) => copy.id));
  const create = f.drive.createFolder.bind(f.drive);
  const fail = vi.spyOn(f.drive, 'createFolder').mockImplementation(async (...args) => {
    // Identify the intended anchor by its parent and declaration role, never its name.
    if (args[0] === f.inbox && args[2]?.[PROP.declaration]) {
      throw new BowerError('offline', 'You are offline.');
    }
    return create(...args);
  });
  try {
    await expect(page(f).addPile(input(n))).rejects.toMatchObject({ code: 'offline' });
  } finally {
    fail.mockRestore();
  }
  const fresh = (await declarations(f)).filter((copy) => !before.has(copy.id));
  expect(fresh).toHaveLength(1);
  const copy = fresh[0];
  if (!copy) throw new Error('The positive committed declaration control failed.');
  const result = await parsed(f, copy);
  expect(result.value.anchor.kind).toBe('folder');
  expect(result.value.members).toHaveLength(n);
  expect((await f.drive.listAll(f.root)).filter((file) => file.appProperties?.[PROP.declaration] === result.value.declarationId)).toEqual([]);
  return { copy, ...result };
}

function barrier(): { entered: Promise<void>; wait: () => Promise<void>; release: () => void } {
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  releases.push(release);
  return { entered, wait: async () => { enter(); await held; }, release };
}

it('orphan-pile-count-data: orphan folder declaration remains countable after anchor creation fails', async () => {
  const f = await fixture();
  // Positive control: a successfully anchored, complete pile is discoverable.
  const uploader = page(f);
  const control = await uploader.addPile({ text: 'Context from Alex', items: [] });
  await uploader.settled();
  const failed = await failedFolder(f);
  const reader = page(f);
  expect((await reader.piles()).map((pile) => pile.id)).toContain(control.id);
  expect((await reader.piles()).map((pile) => pile.id)).not.toContain(failed.value.pileId);
  const before = await f.drive.snapshot();
  const create = vi.spyOn(f.drive, 'createFolder');
  expect(await summary(reader)).toEqual({ count: 1, complete: true });
  expect(create).not.toHaveBeenCalled();
  expect(await f.drive.snapshot()).toBe(before);
});

it('orphan-pile-count-data: fix 1: a failed context-only Add costs the same reads with a small or large change history', async () => {
  const measurements: Array<{ calls: number; archivedReads: number }> = [];
  for (const history of [2, 200]) {
    const f = await fixture();
    const system = (await f.drive.get(f.records)).parents[0];
    if (!system) throw new Error('The positive system folder control failed.');
    const changes = (await f.drive.createFolder(system, 'changes')).id;
    const archive = (await f.drive.createFolder(changes, 'archive')).id;
    const archived = new Set<string>();
    for (let i = 0; i < history; i++) {
      const record: JournalRecord = {
        v: 1, id: `old-change-${i}`, device: 'DEVICE_B', at: AT - i - 1,
        kind: 'request', what: `Asked Bower to tidy shelf ${i}`, text: `Tidy shelf ${i}`,
      };
      expect(isJournalRecord(record)).toBe(true);
      archived.add((await f.drive.createText(archive, `${record.id}.json`, JSON.stringify(record))).id);
    }
    expect((await f.drive.listAll(archive)).filter((file) => !file.folder)).toHaveLength(history);
    const uploader = page(f);
    const create = f.drive.createFolder.bind(f.drive);
    const fail = vi.spyOn(f.drive, 'createFolder').mockImplementation(async (...args) => {
      if (args[0] === f.inbox && args[2]?.[PROP.declaration]) {
        throw new BowerError('offline', 'You are offline.');
      }
      return create(...args);
    });
    try {
      await expect(uploader.addPile({ text: 'Context from Alex', items: [] })).rejects.toMatchObject({ code: 'offline' });
    } finally {
      fail.mockRestore();
      uploader.dispose();
    }
    const copies = await declarations(f);
    expect(copies).toHaveLength(1);
    const copy = copies[0];
    if (!copy) throw new Error('The positive committed context declaration control failed.');
    const declared = await parsed(f, copy);
    expect(declared.value.anchor.kind).toBe('folder');
    expect(declared.value.members).toEqual([]);
    expect(declared.value.context.kind).toBe('text');
    expect((await f.drive.listAll(f.root)).filter((file) => file.appProperties?.[PROP.declaration] === declared.value.declarationId)).toEqual([]);

    const before = await f.drive.snapshot();
    const textReads = vi.spyOn(f.drive, 'readText');
    const byteReads = vi.spyOn(f.drive, 'readBytes');
    const reader = page(f);
    f.drive.calls = 0;
    expect(await reader.piles()).toEqual([]);
    const fullReadCalls = f.drive.calls;
    // No surviving anchor or removal evidence: context-only history remains unknown.
    expect(await summary(reader)).toEqual({ count: 0, complete: false });
    expect(f.drive.calls, 'summary shares the cold full read').toBe(fullReadCalls);
    expect(byteReads.mock.calls.filter(([id]) => id === copy.id)).toHaveLength(1);
    measurements.push({
      calls: fullReadCalls,
      archivedReads: [...textReads.mock.calls, ...byteReads.mock.calls].filter(([id]) => archived.has(id)).length,
    });
    expect(await f.drive.snapshot()).toBe(before);
    reader.dispose();
    textReads.mockRestore();
    byteReads.mockRestore();
  }
  expect(measurements[1]?.calls, `Drive reads with 2 and 200 archived changes: ${measurements.map((m) => m.calls).join(' and ')}`)
    .toBe(measurements[0]?.calls);
  expect(measurements.map((m) => m.archivedReads), 'cold recovery never scans unrelated archived changes').toEqual([0, 0]);
});

// Every cold entry point must stay independent of unrelated archived changes.
for (const first of ['piles', 'orphanSummary'] as const) {
  it.each(['anchored missing context', 'unanchored failed Add', 'normal pile with context'] as const)(
    `orphan-pile-count-data: fix 2: %s through cold ${first}`,
    async (kind) => {
      const measurements: Array<{ calls: number; archivedReads: number }> = [];
      for (const history of [2, 200]) {
        const f = await fixture();
        const system = (await f.drive.get(f.records)).parents[0];
        if (!system) throw new Error('The positive system folder control failed.');
        const changes = (await f.drive.createFolder(system, 'changes')).id;
        const archive = (await f.drive.createFolder(changes, 'archive')).id;
        const archived = new Set<string>();
        for (let i = 0; i < history; i++) {
          const record: JournalRecord = {
            v: 1, id: `old-change-${i}`, device: 'DEVICE_B', at: AT - i - 1,
            kind: 'request', what: `Asked Bower to tidy shelf ${i}`, text: `Tidy shelf ${i}`,
          };
          expect(isJournalRecord(record)).toBe(true);
          archived.add((await f.drive.createText(archive, `${record.id}.json`, JSON.stringify(record))).id);
        }
        expect((await f.drive.listAll(archive)).filter((file) => !file.folder)).toHaveLength(history);

        const uploader = page(f);
        if (kind === 'normal pile with context') {
          await uploader.addPile({ text: 'Context from Alex', items: [] });
          await uploader.settled();
        } else if (kind === 'unanchored failed Add') {
          const create = f.drive.createFolder.bind(f.drive);
          const fail = vi.spyOn(f.drive, 'createFolder').mockImplementation(async (...args) => {
            if (args[0] === f.inbox && args[2]?.[PROP.declaration]) {
              throw new BowerError('offline', 'You are offline.');
            }
            return create(...args);
          });
          try {
            await expect(uploader.addPile({ text: 'Context from Alex', items: [] }))
              .rejects.toMatchObject({ code: 'offline' });
          } finally {
            fail.mockRestore();
          }
        } else {
          // The real Add commits its declaration and anchor, then both writes lose connectivity.
          let anchorId: string | undefined;
          const create = f.drive.createFolder.bind(f.drive);
          const text = f.drive.createText.bind(f.drive);
          const trash = f.drive.trash.bind(f.drive);
          const anchor = vi.spyOn(f.drive, 'createFolder').mockImplementation(async (...args) => {
            const made = await create(...args);
            if (args[0] === f.inbox && args[2]?.[PROP.declaration]) anchorId = made.id;
            return made;
          });
          const context = vi.spyOn(f.drive, 'createText').mockImplementation(async (...args) => {
            if (anchorId && args[0] === anchorId && args[3]?.[PROP.item]) {
              throw new BowerError('offline', 'You are offline.');
            }
            return text(...args);
          });
          const cleanup = vi.spyOn(f.drive, 'trash').mockImplementation(async (...args) => {
            if (anchorId && args[0] === anchorId) throw new BowerError('offline', 'You are offline.');
            return trash(...args);
          });
          const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
          try {
            await expect(uploader.addPile({ text: 'Context from Alex', items: [] }))
              .rejects.toMatchObject({ code: 'offline' });
            expect(anchorId).toBeDefined();
            expect(context.mock.calls.filter(([parent]) => parent === anchorId)).toHaveLength(1);
            expect(cleanup.mock.calls.filter(([id]) => id === anchorId)).toHaveLength(1);
            expect(errors).toHaveBeenCalledTimes(1);
            expect(errors.mock.calls[0]?.[0]).toMatchObject({ code: 'offline' });
          } finally {
            anchor.mockRestore();
            context.mockRestore();
            cleanup.mockRestore();
            errors.mockRestore();
          }
        }
        uploader.dispose();
        const copies = await declarations(f);
        expect(copies).toHaveLength(1);
        const copy = copies[0];
        if (!copy) throw new Error('The positive context declaration control failed.');
        const declared = await parsed(f, copy);
        expect(declared.value.anchor.kind).toBe('folder');
        expect(declared.value.members).toEqual([]);
        expect(declared.value.context.kind).toBe('text');
        const anchors = (await f.drive.listAll(f.root)).filter((file) =>
          file.appProperties?.[PROP.declaration] === declared.value.declarationId);
        if (kind === 'unanchored failed Add') {
          expect(anchors).toEqual([]);
        } else {
          expect(anchors).toHaveLength(1);
          const anchor = anchors[0];
          if (!anchor) throw new Error('The positive surviving anchor control failed.');
          expect(anchor.folder).toBe(true);
          expect(anchor.appProperties?.[PROP.pile]).toBe(declared.value.pileId);
          const kids = await f.drive.listAll(anchor.id);
          if (kind === 'anchored missing context') expect(kids).toEqual([]);
          else {
            expect(kids).toHaveLength(1);
            if (declared.value.context.kind === 'text') {
              expect(kids[0]?.appProperties?.[PROP.item]).toBe(declared.value.context.memberKey);
            }
          }
        }

        const before = await f.drive.snapshot();
        const textReads = vi.spyOn(f.drive, 'readText');
        const byteReads = vi.spyOn(f.drive, 'readBytes');
        const reader = page(f);
        f.drive.calls = 0;
        if (first === 'orphanSummary') {
          expect(await summary(reader)).toEqual({ count: 0, complete: kind !== 'unanchored failed Add' });
        }
        const piles = await reader.piles();
        if (kind === 'unanchored failed Add') expect(piles).toEqual([]);
        else {
          expect(piles).toHaveLength(1);
          expect(piles[0]).toMatchObject({
            id: declared.value.pileId,
            text: kind === 'normal pile with context' ? 'Context from Alex' : '',
          });
          expect(piles[0]?.setAside).toBe(kind === 'anchored missing context' ? 'not-arrived' : undefined);
        }
        const fullReadCalls = f.drive.calls;
        expect(await summary(reader)).toEqual({ count: 0, complete: kind !== 'unanchored failed Add' });
        expect(f.drive.calls, 'summary shares the cold full read').toBe(fullReadCalls);
        expect(byteReads.mock.calls.filter(([id]) => id === copy.id)).toHaveLength(1);
        measurements.push({
          calls: fullReadCalls,
          archivedReads: [...textReads.mock.calls, ...byteReads.mock.calls].filter(([id]) => archived.has(id)).length,
        });
        expect(await f.drive.snapshot()).toBe(before);
        reader.dispose();
        textReads.mockRestore();
        byteReads.mockRestore();
      }
      // Soft assertions report both contract failures after exercising both history sizes.
      expect.soft(measurements.map((m) => m.archivedReads), 'cold recovery never scans unrelated archived changes')
        .toEqual([0, 0]);
      expect.soft(measurements[1]?.calls,
        `Drive reads with 2 and 200 archived changes: ${measurements.map((m) => m.calls).join(' and ')}`)
        .toBe(measurements[0]?.calls);
    },
  );
}

it('orphan-pile-count-data: orphan count merges queued loose work and copied declarations once', async () => {
  const f = await fixture();
  const idb = new IDBFactory();
  const store = indexedDbUploadStore(idb);
  const makeQueue = (): UploadQueue => {
    const queue = createUploadQueue({ drive: f.drive, store: indexedDbUploadStore(idb), chunkSize: 4, now: () => new Date(AT) });
    queues.push(queue);
    return queue;
  };
  const firstHold = barrier();
  f.drive.beforeChunk = firstHold.wait;
  const firstQueue = makeQueue();
  const uploader = page(f, firstQueue);
  const loose = await uploader.addPile(input(1));
  await firstHold.entered;
  const [copy] = await declarations(f);
  expect(copy).toBeDefined();
  if (!copy) throw new Error('The positive saved loose declaration control failed.');
  const declared = await parsed(f, copy);
  expect(declared.value.anchor.kind).toBe('loose');
  await writeDeclaration(f, declared.value);
  const retained = await store.list(ACCOUNT, f.root);
  expect(retained).toHaveLength(1);
  const record = retained[0];
  if (!record) throw new Error('The positive retained upload control failed.');
  expect(await (await store.body(record))?.text()).toBe('%PDF 0 data');
  uploader.dispose();
  firstQueue.stop();
  firstHold.release();
  await firstQueue.idle();

  // Positive control: another declared pile has a real anchor but is incomplete.
  const missing = await failedFolder(f);
  await f.drive.createFolder(f.inbox, missing.value.anchor.kind === 'folder' ? missing.value.anchor.name : 'Control', {
    [PROP.pile]: missing.value.pileId, [PROP.declaration]: missing.value.declarationId,
  });
  const secondHold = barrier();
  f.drive.beforeChunk = secondHold.wait;
  const secondQueue = makeQueue();
  const reader = page(f, secondQueue);
  await secondQueue.start(ACCOUNT, f.root);
  await secondHold.entered;
  const piles = await reader.piles();
  expect(piles.find((pile) => pile.id === missing.value.pileId)).toMatchObject({ setAside: 'not-arrived' });
  expect(piles.filter((pile) => pile.id === loose.id)).toHaveLength(1);
  expect((await declarations(f)).filter((record) => record.appProperties?.[PROP.recordPile] === loose.id)).toHaveLength(2);
  expect(await summary(reader)).toEqual({ count: 1, complete: true });
});

function disposition(f: Fixture, declared: { value: Declaration; sha256: string }): Disposition {
  return {
    v: 1, kind: 'pile-disposition', scope: { rootId: f.root }, pileId: declared.value.pileId,
    declaration: { declarationId: declared.value.declarationId, sha256: declared.sha256 },
    memberKeys: declared.value.members.map((member) => member.memberKey), action: 'consumed',
    authority: { kind: 'run', runId: 'run-control', reportHash: '1'.repeat(64) },
    operations: [{ operationId: '2'.repeat(64), evidence: {
      file: { fileId: 'FILE_ID', name: 'Filed input.pdf', parents: ['FOLDER_ID'], folder: false, modifiedTime: new Date(AT).toISOString() },
      trashed: false, content: null, provenance: 'fake-stored',
    } }],
  };
}

async function writeDisposition(f: Fixture, value: Disposition, stamp = value.pileId): Promise<void> {
  const bytes = canonicalRecordJson(value);
  const hash = await hashRecordJson(value);
  expect(bytes.ok && hash.ok).toBe(true);
  if (!bytes.ok || !hash.ok) throw new Error('The positive disposition writer control failed.');
  expect(await parsePileDisposition(bytes.value, value.scope.rootId)).toMatchObject({ ok: true, value });
  await f.drive.createText(f.records, `disposition-${hash.value}.json`, new TextDecoder().decode(bytes.value), recordStamp(stamp));
}

async function failedLoose(f: Fixture): Promise<{ copy: DriveFile; value: Declaration; sha256: string }> {
  f.drive.beforeChunk = () => { throw new BowerError('offline', 'You are offline.'); };
  const uploader = page(f);
  const pile = await uploader.addPile(input(1));
  await uploader.settled();
  f.drive.beforeChunk = null;
  uploader.dispose();
  const copy = (await declarations(f)).find((record) => record.appProperties?.[PROP.recordPile] === pile.id);
  expect(copy).toBeDefined();
  if (!copy) throw new Error('The positive loose declaration control failed.');
  const result = await parsed(f, copy);
  expect(result.value.anchor.kind).toBe('loose');
  expect((await f.drive.listAll(f.root)).filter((file) => file.appProperties?.[PROP.item] === result.value.members[0]?.memberKey)).toEqual([]);
  return { copy, ...result };
}

it.each(['damaged', 'unrelated', 'mismatched-hash'] as const)(
  'orphan-pile-count-data: v1 limit retires stamped declarations without reading them (%s)',
  async (kind) => {
    const f = await fixture();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unresolved = kind === 'unrelated' ? await failedFolder(f) : await failedLoose(f);
    const consumed = await failedFolder(f);
    await writeDisposition(f, disposition(f, consumed));
    // Positive controls: valid consumed work retires; foreign-root history is excluded.
    const foreign = { ...consumed.value, scope: { rootId: 'OTHER_ROOT' }, pileId: 'foreign-pile', declarationId: 'foreign-declaration' };
    await writeDeclaration(f, foreign);
    await writeDeclaration(f, unresolved.value);
    expect((await declarations(f)).filter((copy) => copy.appProperties?.[PROP.recordPile] === unresolved.value.pileId)).toHaveLength(2);
    if (kind === 'damaged') {
      await f.drive.createText(f.records, `disposition-${'3'.repeat(64)}.json`, '{}', recordStamp(unresolved.value.pileId));
    } else {
      const wrong = disposition(f, unresolved);
      if (kind === 'unrelated') wrong.pileId = 'other-pile';
      else if (wrong.declaration) wrong.declaration.sha256 = '4'.repeat(64);
      await writeDisposition(f, wrong, unresolved.value.pileId);
    }
    const stampedCopies = (await declarations(f)).filter((copy) =>
      copy.appProperties?.[PROP.recordPile] === unresolved.value.pileId
      || copy.appProperties?.[PROP.recordPile] === consumed.value.pileId);
    const reads = vi.spyOn(f.drive, 'readBytes');
    const reader = page(f);
    expect((await reader.piles()).map((pile) => pile.id)).not.toContain(consumed.value.pileId);
    // TL-P4-53 addendum 5: damaged or unrelated disposition evidence is a v1 limit.
    expect(await summary(reader)).toEqual({ count: 0, complete: true });
    for (const copy of stampedCopies) expect(reads).not.toHaveBeenCalledWith(copy.id);
    // A valid consumed disposition keeps the exact-zero retirement control after refresh.
    await writeDisposition(f, disposition(f, unresolved));
    await reader.refresh();
    expect(await summary(reader)).toEqual({ count: 0, complete: true });
    for (const copy of stampedCopies) expect(reads).not.toHaveBeenCalledWith(copy.id);
  },
);

it('orphan-pile-count-data: orphan count reports an unchecked candidate as unknown', async () => {
  const f = await fixture();
  const pending = await failedLoose(f);
  // Positive control: the exact record is readable and valid before the refusal.
  expect((await parsed(f, pending.copy)).value.pileId).toBe(pending.value.pileId);
  const gate = barrier();
  const read = f.drive.readBytes.bind(f.drive);
  let refuse = true;
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(f.drive, 'readBytes').mockImplementation(async (id) => {
    if (id === pending.copy.id && refuse) {
      await gate.wait();
      throw new BowerError('offline', 'You are offline.');
    }
    return read(id);
  });
  const reader = page(f);
  await reader.refresh();
  const full = reader.piles();
  const checking = summary(reader);
  // Attach the rejection handler immediately, so a missing API is no unhandled rejection.
  const result = checking.then((value) => ({ value }), (error: unknown) => ({ error }));
  await gate.entered;
  gate.release();
  await full;
  expect(errors).toHaveBeenCalled();
  const settled = await result;
  if ('error' in settled) throw settled.error;
  expect(settled.value).toEqual({ count: 0, complete: false });
  refuse = false;
  await reader.refresh();
  expect(await summary(reader)).toEqual({ count: 1, complete: true });
});

it('orphan-pile-count-data: summary shares the full-read cache and refresh invalidation', async () => {
  const f = await fixture();
  const pending = await failedFolder(f);
  // Positive control: this is a committed valid declaration, not an empty root.
  expect((await parsed(f, pending.copy)).value.members).toHaveLength(2);
  const lists = vi.spyOn(f.drive, 'listAll');
  const reads = vi.spyOn(f.drive, 'readBytes');
  const reader = page(f);
  await reader.piles();
  expect(await summary(reader)).toEqual({ count: 1, complete: true });
  const firstReads = reads.mock.calls.filter(([id]) => id === pending.copy.id).length;
  expect(firstReads).toBe(1);
  await Promise.all([reader.piles(), summary(reader), summary(reader)]);
  expect(lists).toHaveBeenCalledTimes(1);
  expect(reads.mock.calls.filter(([id]) => id === pending.copy.id)).toHaveLength(1);
  await f.drive.trash(pending.copy.id);
  expect(await summary(reader)).toEqual({ count: 1, complete: true });
  let heard = 0;
  reader.subscribe(() => { heard++; });
  await reader.refresh();
  expect(heard).toBeGreaterThan(0);
  expect(await summary(reader)).toEqual({ count: 0, complete: true });
});

it('orphan-pile-count-data: ambiguous context-only history is unknown and intentional removal is retired', async () => {
  const f = await fixture();
  const uploader = page(f);
  const context = await uploader.addPile({ text: 'Context from Alex', items: [] });
  await uploader.settled();
  const copy = (await declarations(f))[0];
  expect(copy).toBeDefined();
  if (!copy) throw new Error('The positive context declaration control failed.');
  const declared = await parsed(f, copy);
  expect(declared.value.members).toEqual([]);
  expect(declared.value.context.kind).toBe('text');
  expect((await uploader.piles()).map((pile) => pile.id)).toContain(context.id);
  const folder = (await f.drive.listAll(f.root)).find((file) => file.folder && file.appProperties?.[PROP.pile] === context.id);
  expect(folder).toBeDefined();
  if (!folder) throw new Error('The positive anchored context control failed.');
  // Only the declaration survives: neither a live anchor nor a Bin/removal fact exists.
  const gone = new Set([folder.id, ...(await f.drive.listAll(folder.id)).map((file) => file.id)]);
  const snapshot = JSON.parse(await f.drive.snapshot()) as { files: Array<{ meta: { id: string } }> };
  uploader.dispose();
  f.drive = FakeDrive.restore(JSON.stringify({ ...snapshot, files: snapshot.files.filter((file) => !gone.has(file.meta.id)) }), { clock: () => AT, chunkMultiple: 4 });
  expect(await declarations(f)).toHaveLength(1);
  expect((await f.drive.listAll(f.root)).some((file) => file.id === folder.id)).toBe(false);
  // Positive retirement control through Bower's deliberate Remove entry point, in another root.
  const removed = await fixture();
  const remover = page(removed);
  const deliberate = await remover.addPile({ text: 'Context deliberately removed', items: [] });
  await remover.settled();
  await remover.removePile(deliberate.id);
  expect(await declarations(removed)).toEqual([]);
  expect(await remover.piles()).toEqual([]);
  const reader = page(f);
  expect(await summary(reader)).toEqual({ count: 0, complete: false });
  expect(await summary(remover)).toEqual({ count: 0, complete: true });
});

it('orphan-pile-count-data: a matching anchor moved within the root is excluded without recreation', async () => {
  const f = await fixture();
  await f.drive.createFolder(f.root, 'Areas');
  const uploader = page(f);
  const moved = await uploader.addPile({ text: 'Context moved by Alex', items: [] });
  await uploader.settled();
  expect(moved.path).toBeDefined();
  if (!moved.path) throw new Error('The positive folder path control failed.');
  const folder = (await f.drive.listAll(f.root)).find((file) => file.folder && file.appProperties?.[PROP.pile] === moved.id);
  expect(folder).toBeDefined();
  if (!folder) throw new Error('The positive moved identity control failed.');
  await uploader.move(moved.path, 'Areas');
  expect((await f.drive.get(folder.id)).parents).not.toContain(f.inbox);
  await failedFolder(f);
  const reader = page(f);
  expect((await reader.piles()).map((pile) => pile.id)).not.toContain(moved.id);
  const before = await f.drive.snapshot();
  expect(await summary(reader)).toEqual({ count: 1, complete: true });
  expect(await f.drive.snapshot()).toBe(before);
});

it('orphan-pile-count-data: generated orphan counts dedupe declarations and exclude foreign roots', async () => {
  await fc.assert(fc.asyncProperty(
    fc.integer({ min: 1, max: 4 }), fc.integer({ min: 1, max: 4 }), fc.integer({ min: 2, max: 5 }),
    async (count, copies, members) => {
      const f = await fixture();
      for (let i = 0; i < count; i++) {
        const declared = await failedFolder(f, members);
        for (let j = 1; j < copies; j++) await writeDeclaration(f, declared.value);
        await writeDeclaration(f, { ...declared.value, scope: { rootId: 'OTHER_ROOT' }, pileId: `foreign-${i}`, declarationId: `foreign-decl-${i}` });
      }
      // Positive control validates every generated declaration and its copy multiplicity.
      expect((await declarations(f)).filter((record) => !record.appProperties?.[PROP.recordPile]?.startsWith('foreign-'))).toHaveLength(count * copies);
      expect(await summary(page(f))).toEqual({ count, complete: true });
    },
  ), { seed: 531001, numRuns: 12, endOnFailure: true });
});

it('orphan-pile-count-data: generated unreadable or conflicting evidence never becomes a complete zero', async () => {
  await fc.assert(fc.asyncProperty(fc.integer({ min: 1, max: 4 }), fc.boolean(), async (copies, unreadable) => {
    const f = await fixture();
    const known = await failedFolder(f);
    const uncertain = await failedFolder(f);
    for (let i = 1; i < copies; i++) await writeDeclaration(f, known.value);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    if (unreadable) {
      const read = f.drive.readBytes.bind(f.drive);
      vi.spyOn(f.drive, 'readBytes').mockImplementation(async (id) => {
        if (id === uncertain.copy.id) throw new BowerError('offline', 'You are offline.');
        return read(id);
      });
    } else {
      const first = uncertain.value.members[0];
      expect(first).toBeDefined();
      if (!first) throw new Error('The positive member control failed.');
      await writeDeclaration(f, { ...uncertain.value, members: [{ ...first, content: { ...first.content, sha256: '5'.repeat(64) } }, ...uncertain.value.members.slice(1)] });
    }
    expect((await declarations(f)).filter((record) => record.appProperties?.[PROP.recordPile] === known.value.pileId)).toHaveLength(copies);
    expect(await summary(page(f))).toEqual({ count: 1, complete: false });
    expect(errors).toHaveBeenCalled();
  }), { seed: 531002, numRuns: 12, endOnFailure: true });
});
