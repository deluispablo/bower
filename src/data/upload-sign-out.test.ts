import { IDBFactory } from 'fake-indexeddb';
import fc from 'fast-check';
import { afterEach, expect, it, vi } from 'vitest';
import { FakeDrive } from './drive/fake-drive';
import { marked } from './drive/transport';
import { FakeWorker } from './fake/fake-worker';
import { FakeRunService } from './fake/fake-run-service';
import * as liveExports from './live/index';
import type { LiveSources } from './live/index';
import * as queueExports from './upload-queue';
import type { AddUpload, StorageLike, UploadQueue } from './upload-queue';
import { indexedDbUploadStore, UploadForgottenError, type PendingUpload, type UploadStore } from './upload-store';
import { BowerError } from './types';
import { sha256 } from './vault/hashes';
import { outboxKey } from './vault/journal';
import type { DriveVault } from './vault/drive-vault';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const ACCOUNT_B = 'ACCOUNT_B';
const queues = new Set<UploadQueue>();
const sources = new Set<LiveSources>();

// Namespace imports keep a removed/new export an assertion failure rather than a module-load error.
function requiredExport<T extends object, K extends keyof T>(module: T, name: K): T[K] {
  const value = module[name];
  expect(value, `production export ${String(name)}`).toBeTypeOf('function');
  return value;
}

function barrier() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => { open = resolve; });
  return { promise, open };
}

const outcome = <T>(promise: Promise<T>) => promise.then(
  (value) => ({ value }),
  (error: unknown) => ({ error }),
);

function queue(drive: FakeDrive, store: UploadStore, storage?: StorageLike): UploadQueue {
  const result = requiredExport(queueExports, 'createUploadQueue')({ drive, store, storage, chunkSize: 4, now: () => NOW });
  queues.add(result);
  return result;
}

async function member(parentId: string, n: number): Promise<AddUpload> {
  const body = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, n])], { type: 'application/pdf' });
  return {
    declarationId: 'DECLARATION_A', memberKey: `MEMBER_${n}`, sha256: await sha256(body),
    pileId: 'PILE_A', parentId, name: `Synthetic ${n}.pdf`, body,
    appProperties: { item: `MEMBER_${n}` },
  };
}

async function keptBytes(store: UploadStore, records: PendingUpload[]): Promise<Array<number[] | null>> {
  return Promise.all(records.map(async (record) => {
    const body = await store.body(record);
    return body === null ? null : [...new Uint8Array(await body.arrayBuffer())];
  }));
}

afterEach(async () => {
  for (const source of sources) source.dispose();
  sources.clear();
  for (const q of queues) { q.stop(); await q.idle(); }
  queues.clear();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

it('upload-sign-out-forget: upload forget cannot be undone by an in-flight device add', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await fc.assert(fc.asyncProperty(
    fc.integer({ min: 2, max: 4 }), fc.boolean(),
    async (count, commitBeforeForget) => {
      const idb = new IDBFactory();
      const store = indexedDbUploadStore(idb);
      const fresh = () => indexedDbUploadStore(idb);
      const drive = new FakeDrive({ clock: () => NOW.getTime(), chunkMultiple: 4 });
      const parent = (await drive.createFolder('root', 'Inbox')).id;
      drive.offline = true;
      // Positive control: actual add/discard/forget delete committed bytes, only for this account.
      const control = queue(drive, store);
      await control.start(ACCOUNT_B, 'FOLDER_B');
      await control.add(await member(parent, 1));
      await control.idle();
      control.stop();
      const other = await fresh().list(ACCOUNT_B, 'FOLDER_B');
      const otherBytes = await keptBytes(fresh(), other);
      expect(other).toHaveLength(1);
      expect(otherBytes[0]).toHaveLength(10);
      await control.start('ACCOUNT_A', 'FOLDER_A');
      const first = await control.add(await member(parent, 1));
      await control.idle();
      const committed = await fresh().list('ACCOUNT_A', 'FOLDER_A');
      expect(committed).toHaveLength(1);
      expect((await keptBytes(fresh(), committed))[0]).toHaveLength(10);
      await control.discard(first.id);
      expect(await fresh().list('ACCOUNT_A', 'FOLDER_A')).toEqual([]);
      expect(await keptBytes(fresh(), committed)).toEqual([null]);
      await control.add(await member(parent, 1));
      await control.idle();
      await control.forgetAccount('ACCOUNT_A');
      expect(await fresh().list('ACCOUNT_A', 'FOLDER_A')).toEqual([]);
      expect(await keptBytes(fresh(), committed)).toEqual([null]);

      const entered = barrier(), release = barrier();
      const staged: PendingUpload[] = [];
      const delayed: UploadStore = {
        ...store,
        add: async (...args) => {
          const [record] = args;
          if (commitBeforeForget) await store.add(...args);
          staged.push(record);
          if (staged.length === count) entered.open();
          await release.promise;
          if (!commitBeforeForget) await store.add(...args);
        },
      };
      const q = queue(drive, delayed);
      await q.start('ACCOUNT_A', 'FOLDER_A');
      const inputs = await Promise.all(Array.from({ length: count }, (_, n) => member(parent, n + 1)));
      const adding = inputs.map((input) => outcome(q.add(input)));
      await entered.promise;
      try {
        // Start forgetting with staging/cleanup outstanding, then let it finish.
        const forgetting = q.forgetAccount('ACCOUNT_A');
        release.open();
        await forgetting;
      } finally { release.open(); }
      const settled = await Promise.all(adding);
      await q.idle();
      expect(settled).toEqual(inputs.map(() => ({ error: expect.any(BowerError) })));
      expect(q.items()).toEqual([]);
      expect(await fresh().list(ACCOUNT_B, 'FOLDER_B')).toEqual(other);
      expect(await keptBytes(fresh(), other)).toEqual(otherBytes);
      expect({
        records: await fresh().list('ACCOUNT_A', 'FOLDER_A'),
        bytes: await keptBytes(fresh(), staged),
      }, 'forget must remove late metadata AND bytes').toEqual({ records: [], bytes: inputs.map(() => null) });
    },
  ), { seed: 53029, numRuns: 12, examples: [[2, true], [2, false]], endOnFailure: true });
});

type Ending = 'accepted sign-out' | 'failed remote sign-out' | 'auth expiry';

async function liveFixture() {
  localStorage.clear();
  sessionStorage.clear();
  const drive = new FakeDrive({ clock: () => NOW.getTime(), chunkMultiple: 4 });
  const rootA = (await drive.createFolder('root', 'Synthetic A')).id;
  const rootB = (await drive.createFolder('root', 'Synthetic B')).id;
  for (const root of [rootA, rootB]) {
    for (const name of ['Inbox', 'Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(root, name);
    const system = await drive.createFolder(root, '.bower');
    await drive.createFolder(system.id, 'changes');
  }
  const inboxes = new Map<string, string>();
  for (const root of [rootA, rootB]) {
    const inbox = (await drive.listAll(root)).find((file) => file.name === 'Inbox')?.id;
    expect(inbox).toBeDefined();
    if (inbox !== undefined) inboxes.set(root, inbox);
  }
  const runs = new FakeRunService({ drive, clock: () => NOW.getTime(), scale: 'instant', sleep: async () => undefined });
  const worker = new FakeWorker({ drive, runs, rootId: rootA, scenario: 'empty', account: 'you@example.com' });
  vi.spyOn(worker, 'me').mockImplementation(async () => ({ user: { name: 'Alex', email: 'you@example.com' }, folderId: rootA }));
  const accountA = await requiredExport(liveExports, 'uploadAccount')('you@example.com');
  const idb = new IDBFactory();
  const store = indexedDbUploadStore(idb);
  const q = queue(drive, store);
  drive.offline = true;
  const records: PendingUpload[] = [];
  for (const [account, root] of [[accountA, rootA], [accountA, rootB], [ACCOUNT_B, rootA]] as const) {
    await q.start(account, root);
    await q.add(await member(inboxes.get(root) ?? '', 1));
    await q.idle();
    records.push(...await store.list(account, root));
    q.stop();
  }
  expect(records).toHaveLength(3);
  expect(await keptBytes(store, records)).toEqual(records.map(() => [1, 2, 3, 4, 5, 6, 7, 8, 9, 1]));
  const makeSource = () => {
    const source = requiredExport(liveExports, 'makeLiveSources')({ drive, worker, uploadQueue: q });
    sources.add(source);
    return source;
  };
  const source = makeSource();
  expect(await source.session.current()).toEqual({ name: 'Alex', email: 'you@example.com' });
  expect(await source.session.rootId()).toBe(rootA);
  // Settle startup flushing before placing a waiting journal line in the device outbox.
  await outcome(source.vault.flushJournal());
  const outbox = '[{"line":{"v":1,"id":"CHANGE_A","device":"DEVICE_A","at":1,"kind":"create","what":"Synthetic note","fileId":"FILE_A"}}]';
  localStorage.setItem(outboxKey(rootA), outbox);
  localStorage.setItem(outboxKey(rootB), outbox);
  // Positive control: ordinary page disposal keeps every account/folder's bytes and journal lines.
  source.dispose();
  for (const record of records) expect(await indexedDbUploadStore(idb).list(record.account, record.folder)).toEqual([record]);
  expect(await keptBytes(indexedDbUploadStore(idb), records)).toEqual(records.map(() => [1, 2, 3, 4, 5, 6, 7, 8, 9, 1]));
  for (const root of [rootA, rootB]) expect(localStorage.getItem(outboxKey(root))).toBe(outbox);
  const active = makeSource();
  expect((await active.session.current())?.email).toBe('you@example.com');
  expect(await active.session.rootId()).toBe(rootA);
  await outcome(active.vault.flushJournal());
  localStorage.setItem('bower:bookmarks', '["SYNTHETIC_NOTE"]');
  sessionStorage.setItem('bower:add-draft', '{"text":"Synthetic draft"}');
  // Hold a real transfer after Drive has received four bytes; every other scope stays pending.
  drive.offline = false;
  const entered = barrier(), release = barrier();
  drive.beforeChunk = async ({ start }) => { if (start === 4) { entered.open(); await release.promise; } };
  await q.start(accountA, rootA);
  await entered.promise;
  expect((await store.list(accountA, rootA))[0]?.confirmed).toBe(4);
  expect(drive.resumableCalls.some((call) => call.op === 'put' && call.start === 0)).toBe(true);
  // Startup may normalize an old stored outbox; the sign-out boundary must preserve its actual bytes.
  for (const root of [rootA, rootB]) expect(localStorage.getItem(outboxKey(root))).toBe(outbox);
  return { drive, worker, store, q, active, idb, records, accountA, rootA, rootB, outbox, release };
}

it.each<Ending>(['accepted sign-out', 'failed remote sign-out', 'auth expiry'])(
  'upload-sign-out-forget: purge every folder and keep journal lines (%s)',
  async (ending) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const f = await liveFixture();
    try {
      if (ending === 'failed remote sign-out') {
        vi.spyOn(f.worker, 'signOut').mockRejectedValueOnce(new BowerError('offline', 'Signing out did not finish. Try again.'));
        await expect(f.active.session.signOut()).rejects.toMatchObject({ code: 'offline' });
      } else if (ending === 'auth expiry') {
        f.drive.failNext('auth');
        await expect(f.active.vault.tree()).rejects.toMatchObject({ code: 'auth' });
      } else await f.active.session.signOut();
      f.release.open();
      await f.q.idle();
      const fresh = indexedDbUploadStore(f.idb);
      for (const root of [f.rootA, f.rootB]) expect(localStorage.getItem(outboxKey(root))).toBe(f.outbox);
      expect(await fresh.list(ACCOUNT_B, f.rootA)).toHaveLength(1);
      expect((await keptBytes(fresh, f.records.slice(2)))[0]).toHaveLength(10);
      const accountRecords = f.records.slice(0, 2);
      expect({
        firstFolder: await fresh.list(f.accountA, f.rootA),
        secondFolder: await fresh.list(f.accountA, f.rootB),
        bytes: await keptBytes(fresh, accountRecords),
      }, 'accepted cleanup must forget only this account in every folder').toEqual({ firstFolder: [], secondFolder: [], bytes: [null, null] });
      expect(localStorage.getItem('bower:bookmarks')).toBeNull();
      expect(sessionStorage.getItem('bower:add-draft')).toBeNull();
      const restarted = queue(f.drive, indexedDbUploadStore(f.idb));
      const before = f.drive.resumableCalls.length;
      for (const root of [f.rootA, f.rootB]) { await restarted.start(f.accountA, root); await restarted.idle(); restarted.stop(); }
      expect(f.drive.resumableCalls).toHaveLength(before);
      // Positive transport control: the other account's retained upload can still arrive once.
      await restarted.start(ACCOUNT_B, f.rootA);
      await restarted.idle();
      expect(restarted.items()).toHaveLength(1);
      expect(restarted.items()[0]?.state).toBe('done');
    } finally { f.release.open(); f.active.dispose(); await f.q.idle(); }
  },
);

it('upload-sign-out-forget: a failed local upload purge reports a BowerError and logs its cause', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const f = await liveFixture();
  const cause = new Error('Synthetic device purge refused');
  const fresh = indexedDbUploadStore(f.idb);
  // Positive control: the unmodified real queue forgets another account and its bytes.
  await f.q.forgetAccount(ACCOUNT_B);
  expect(await fresh.list(ACCOUNT_B, f.rootA)).toEqual([]);
  expect(await keptBytes(fresh, f.records.slice(2))).toEqual([null]);
  const clear = f.store.clear.bind(f.store);
  vi.spyOn(f.store, 'clear').mockImplementation(async (account, folder) => {
    if (account === f.accountA) throw cause;
    await clear(account, folder);
  });
  log.mockClear();
  try {
    const result = await outcome(f.active.session.signOut());
    f.release.open();
    await f.q.idle();
    expect(result, 'failed device purge must not be silent success').toMatchObject({
      error: { name: 'BowerError', message: 'Signing out did not finish. Try again.' },
    });
    expect('error' in result && result.error).toBeInstanceOf(BowerError);
    expect(log.mock.calls.flat()).toContain(cause);
  } finally { f.release.open(); f.active.dispose(); await f.q.idle(); }
});

/** Separate queue instances and IndexedDB connections model the two tabs, without replacing either queue. */
async function twoTabFixture(storageB?: StorageLike) {
  const drive = new FakeDrive({ clock: () => NOW.getTime(), chunkMultiple: 4 });
  const root = (await drive.createFolder('root', 'Synthetic folder')).id;
  for (const name of ['Inbox', 'Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(root, name);
  const system = await drive.createFolder(root, '.bower');
  await drive.createFolder(system.id, 'changes');
  const inbox = (await drive.listAll(root)).find((file) => file.name === 'Inbox')?.id;
  expect(inbox).toBeDefined();
  const runs = new FakeRunService({ drive, clock: () => NOW.getTime(), scale: 'instant', sleep: async () => undefined });
  const worker = new FakeWorker({ drive, runs, rootId: root, scenario: 'empty', account: 'you@example.com' });
  vi.spyOn(worker, 'me').mockImplementation(async () => ({ user: { name: 'Alex', email: 'you@example.com' }, folderId: root }));
  const account = await requiredExport(liveExports, 'uploadAccount')('you@example.com');
  const idb = new IDBFactory();
  const storeA = indexedDbUploadStore(idb), storeB = indexedDbUploadStore(idb);
  const a = queue(drive, storeA), b = queue(drive, storeB, storageB);
  const live = requiredExport(liveExports, 'makeLiveSources')({ drive, worker, uploadQueue: a });
  sources.add(live);
  expect((await live.session.current())?.email).toBe('you@example.com');
  expect(await live.session.rootId()).toBe(root);
  await live.vault.flushJournal();
  drive.offline = true;
  await a.start(account, root);
  await b.start(account, root);
  // Positive control: tab B's already committed bytes are visible to tab A and get purged by its sign-out.
  await b.add(await member(inbox ?? '', 20));
  await b.idle();
  const control = await storeA.list(account, root);
  expect(control).toHaveLength(1);
  expect(await keptBytes(storeA, control)).toEqual([[1, 2, 3, 4, 5, 6, 7, 8, 9, 20]]);
  return { drive, account, root, inbox: inbox ?? '', idb, storeA, storeB, a, b, live, control };
}

async function delayedStaging(store: UploadStore, parent: string) {
  const entered = barrier(), release = barrier();
  const body = new Blob(['Synthetic bytes'], { type: 'application/pdf' });
  const input = { ...await member(parent, 21), body, sha256: await sha256(body) };
  const read = body.arrayBuffer.bind(body);
  vi.spyOn(body, 'arrayBuffer').mockImplementation(async () => {
    entered.open();
    await release.promise;
    return read();
  });
  const records: PendingUpload[] = [];
  const add = store.add.bind(store);
  vi.spyOn(store, 'add').mockImplementation(async (...args) => {
    records.push(args[0]);
    await add(...args);
  });
  return { input, records, entered, release };
}

it.each(['sign-out', 'auth expiry'] as const)(
  'upload-sign-out-forget: fix 1.1: cross-tab staging cannot restore forgotten bytes (%s)',
  async (ending) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const f = await twoTabFixture();
    const stage = await delayedStaging(f.storeB, f.inbox);
    const adding = outcome(f.b.add(stage.input));
    await stage.entered.promise;
    const cleared = barrier();
    const clear = f.storeA.clear.bind(f.storeA);
    vi.spyOn(f.storeA, 'clear').mockImplementation(async (account, folder) => {
      await clear(account, folder);
      cleared.open();
    });
    // Auth expiry takes the existing production watcher route rather than calling a queue helper.
    if (ending === 'auth expiry') { f.drive.offline = false; f.drive.failNext('auth'); }
    const endingResult = ending === 'sign-out' ? outcome(f.live.session.signOut()) : outcome(f.live.vault.tree());
    try {
      await cleared.promise;
      const fresh = indexedDbUploadStore(f.idb);
      expect(await fresh.list(f.account, f.root)).toEqual([]);
      expect(await keptBytes(fresh, f.control)).toEqual([null]);
      // Complete the original Blob read only after the purge transaction has committed.
      f.drive.offline = true;
      stage.release.open();
      const addResult = await adding;
      const result = await endingResult;
      await Promise.all([f.a.idle(), f.b.idle()]);
      if (ending === 'sign-out') expect(result).toEqual({ value: undefined });
      else expect(result).toMatchObject({ error: { code: 'auth' } });
      expect(stage.records).toHaveLength(1);
      expect({
        records: await fresh.list(f.account, f.root),
        bytes: await keptBytes(fresh, stage.records),
      }, 'tab B must not restore metadata or the 15 original bytes after tab A forgets').toEqual({ records: [], bytes: [null] });
      expect(addResult).toMatchObject({ error: expect.any(BowerError) });
    } finally {
      stage.release.open();
      await Promise.all([adding, endingResult]);
    }
  },
);

it.each([false, true])('upload-sign-out-forget: fix 1.2: sign-out waits for staging cleanup and reports a late remove failure (remove fails: %s)', async (removeFails) => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const f = await twoTabFixture();
  // Tab A stages too: sign-out must await staging cleanup even when the purge fails.
  const stage = await delayedStaging(f.storeA, f.inbox);
  const adding = outcome(f.a.add(stage.input));
  await stage.entered.promise;
  const cleared = barrier(), cleaning = barrier(), releaseCleanup = barrier();
  const cause = new Error('Synthetic purge removal refused');
  const clear = f.storeA.clear.bind(f.storeA);
  const control = f.control[0];
  if (!control) throw new Error('The pending control must exist.');
  vi.spyOn(f.storeA, 'clear').mockImplementation(async (account, folder) => {
    // Exercise a purge removal on metadata that existed before sign-out.
    let failure: { cause: unknown } | undefined;
    try { await f.storeA.remove(control); }
    catch (cause) { failure = { cause }; }
    // Finish the account clear too; a removal failure must still be reported.
    await clear(account, folder);
    cleared.open();
    if (failure) throw failure.cause;
  });
  const remove = f.storeA.remove.bind(f.storeA);
  vi.spyOn(f.storeA, 'remove').mockImplementation(async (record) => {
    if (record === f.control[0] && removeFails) throw cause;
    if (record.memberKey !== stage.input.memberKey) return remove(record);
    cleaning.open();
    await releaseCleanup.promise;
    await remove(record);
  });
  let ended = false;
  const signingOut = outcome(f.live.session.signOut()).then((result) => { ended = true; return result; });
  try {
    await cleared.promise;
    const fresh = indexedDbUploadStore(f.idb);
    // Positive control: successful clear really removes tab B's existing metadata and original bytes.
    expect(await fresh.list(f.account, f.root)).toEqual([]);
    expect(await keptBytes(fresh, f.control)).toEqual([null]);
    const endedDuringStaging = ended;
    stage.release.open();
    await cleaning.promise;
    expect(await fresh.list(f.account, f.root)).toEqual([]);
    expect(await keptBytes(fresh, stage.records)).toEqual([null]);
    const addResult = vi.mocked(f.storeA.add).mock.results[0];
    if (!addResult) throw new Error('The staged add must have run.');
    expect(await outcome(addResult.value)).toEqual({
      error: expect.any(UploadForgottenError),
    });
    const endedDuringCleanup = ended;
    releaseCleanup.open();
    const result = await signingOut;
    await adding;
    if (!removeFails) {
      // Positive cleanup control: the refused late write leaves nothing when cleanup succeeds.
      expect(result).toEqual({ value: undefined });
      expect(await fresh.list(f.account, f.root)).toEqual([]);
      expect(await keptBytes(fresh, stage.records)).toEqual([null]);
      expect(log.mock.calls.flat()).not.toContain(cause);
      return;
    }
    expect(result, 'a failed purge removal belongs to sign-out, not only the stopped add').toMatchObject({
      error: { name: 'BowerError', message: 'Signing out did not finish. Try again.' },
    });
    expect('error' in result && result.error).toBeInstanceOf(BowerError);
    expect(log.mock.calls.flat()).toContain(cause);
    expect(endedDuringStaging, 'sign-out must wait for the outstanding Blob read').toBe(false);
    expect(endedDuringCleanup, 'sign-out must wait for the late remove').toBe(false);
    // Even after the purge failure surfaces, the stale write must never restore this account.
    expect(await fresh.list(f.account, f.root)).toEqual([]);
    expect(await keptBytes(fresh, stage.records)).toEqual([null]);
  } finally {
    stage.release.open();
    releaseCleanup.open();
    await Promise.all([adding, signingOut]);
  }
});

it('upload-sign-out-forget: fix 1.3: pendingCount counts waiting and uploading things on this device', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const drive = new FakeDrive({ clock: () => NOW.getTime(), chunkMultiple: 4 });
  const parent = (await drive.createFolder('root', 'Inbox')).id;
  const q = queue(drive, indexedDbUploadStore(new IDBFactory()));
  const count = requiredExport(q, 'pendingCount');
  if (count === undefined) throw new Error('The real upload queue must expose pendingCount.');
  expect(count()).toBe(0);
  await q.start('ACCOUNT_A', 'FOLDER_A');
  const entered = barrier(), release = barrier();
  drive.beforeChunk = async () => { entered.open(); await release.promise; };
  try {
    await q.add(await member(parent, 30));
    await entered.promise;
    expect(q.items().map((item) => item.state)).toEqual(['uploading']);
    expect(count()).toBe(1);
    const waiting = await q.add(await member(parent, 31));
    expect(q.items().map((item) => item.state)).toEqual(['uploading', 'waiting']);
    expect(count()).toBe(2);
    await q.discard(waiting.id);
    expect(count()).toBe(1);
    release.open();
    await q.idle();
    // Positive control: successful uploads stay visible as done but are no longer sending.
    expect(q.items().map((item) => item.state)).toEqual(['done']);
    expect(count()).toBe(0);
    drive.offline = true;
    await q.add(await member(parent, 32));
    await q.idle();
    expect(q.items().map((item) => item.state)).toEqual(['done', 'waiting']);
    expect(count()).toBe(1);
    drive.offline = false;
    drive.failNext('unknown');
    q.retry('offline');
    await q.idle();
    expect(q.items().map((item) => item.state)).toEqual(['done', 'failed']);
    expect(count()).toBe(0);
    q.stop();
    expect(count()).toBe(0);
  } finally { release.open(); await q.idle(); }
});


const preWriteSteps = [
  'new add storage.estimate()',
  'reselection Blob.arrayBuffer()',
  'reselection crypto.subtle.digest()',
  'reselection storage.estimate()',
] as const;

it.each(preWriteSteps.flatMap((step) => (['sign-out', 'auth expiry'] as const).map((ending) => ({ step, ending }))))(
  'upload-sign-out-forget: fix 2: $step before $ending',
  async ({ step, ending }) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const entered = barrier(), release = barrier();
    let armed = false;
    const estimate = vi.fn(async () => {
      if (armed && step.includes('storage.estimate()')) {
        entered.open();
        await release.promise;
      }
      return { quota: 1024, usage: 0 };
    });
    const f = await twoTabFixture({ estimate });
    const body = new Blob(['Synthetic bytes'], { type: 'application/pdf' });
    const input = { ...await member(f.inbox, 21), body, sha256: await sha256(body) };
    // Keep the exact identity even if the corrected queue refuses before calling store.add.
    const record: PendingUpload = {
      account: f.account, folder: f.root, declarationId: input.declarationId,
      memberKey: input.memberKey, sha256: input.sha256, pileId: input.pileId,
      parentId: input.parentId, name: input.name, type: body.type, size: body.size,
      appProperties: { ...input.appProperties }, fileId: null, session: null,
      confirmed: 0, addedAt: NOW.toISOString(),
    };
    expect(body.size).toBe(15);
    if (step.startsWith('reselection')) {
      await f.b.add(input);
      await f.b.idle();
      expect(await keptBytes(f.storeA, [record])).toEqual([[...new TextEncoder().encode('Synthetic bytes')]]);
      f.b.stop();
      // An unreadable device copy takes the real queue's chosenAgain path without deleting the record.
      const read = f.storeB.body.bind(f.storeB);
      const unreadable = vi.spyOn(f.storeB, 'body').mockImplementation(async (pending) => {
        if (pending.memberKey === input.memberKey) throw new Error('Synthetic device read refused');
        return read(pending);
      });
      await f.b.start(f.account, f.root);
      await f.b.idle();
      expect(f.b.items().find((item) => item.memberKey === input.memberKey)).toMatchObject({ gone: true, state: 'failed' });
      unreadable.mockRestore();
    }
    if (step === 'reselection Blob.arrayBuffer()') {
      const read = body.arrayBuffer.bind(body);
      vi.spyOn(body, 'arrayBuffer').mockImplementationOnce(async () => {
        entered.open();
        await release.promise;
        return read();
      });
    } else if (step === 'reselection crypto.subtle.digest()') {
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (algorithm, bytes) => {
        entered.open();
        await release.promise;
        return digest(algorithm, bytes);
      });
    }
    const writes = vi.spyOn(f.storeB, 'add');
    armed = true;
    const adding = outcome(f.b.add(input));
    try {
      await entered.promise;
      expect(writes).not.toHaveBeenCalled();
      if (step.includes('storage.estimate()')) expect(estimate).toHaveBeenCalled();
      // Finish production forgetting while tab B is still paused before its first store.add call.
      if (ending === 'auth expiry') { f.drive.offline = false; f.drive.failNext('auth'); }
      const ended = ending === 'sign-out'
        ? await outcome(f.live.session.signOut())
        : await outcome(f.live.vault.tree());
      if (ending === 'sign-out') expect(ended).toEqual({ value: undefined });
      else expect(ended).toMatchObject({ error: { code: 'auth' } });
      const fresh = indexedDbUploadStore(f.idb);
      const afterForget = {
        records: await fresh.list(f.account, f.root),
        bytes: await keptBytes(fresh, [...f.control, record]),
      };
      expect(afterForget).toEqual({ records: [], bytes: [null, null] });
      f.drive.offline = true;
      release.open();
      const added = await adding;
      await Promise.all([f.a.idle(), f.b.idle()]);
      const afterResume = {
        records: await fresh.list(f.account, f.root),
        bytes: await keptBytes(fresh, [...f.control, record]),
      };
      // Restart both real queues and drain their work too: no later resurrection or upload is allowed.
      f.a.stop(); f.b.stop();
      const traffic = f.drive.resumableCalls.length;
      await f.a.start(f.account, f.root);
      await f.b.start(f.account, f.root);
      await Promise.all([f.a.idle(), f.b.idle()]);
      const afterRestart = {
        records: await fresh.list(f.account, f.root),
        bytes: await keptBytes(fresh, [...f.control, record]),
      };
      expect({ afterResume, afterRestart }, 'no account metadata or original bytes may appear after forgetting finishes').toEqual({
        afterResume: { records: [], bytes: [null, null] },
        afterRestart: { records: [], bytes: [null, null] },
      });
      expect(f.drive.resumableCalls).toHaveLength(traffic);
      expect(added).toMatchObject({ error: expect.any(BowerError) });
    } finally {
      release.open();
      await adding;
    }
  },
);


/** Two live lifetimes share only Drive and IndexedDB; neither queue nor cleanup is replaced. */
async function livePair() {
  const f = await twoTabFixture();
  f.drive.offline = false;
  f.drive.beforeChunk = async () => { throw new BowerError('offline', 'You are offline.'); };
  const workerB = new FakeWorker({
    drive: f.drive,
    runs: new FakeRunService({ drive: f.drive, clock: () => NOW.getTime(), scale: 'instant', sleep: async () => undefined }),
    rootId: f.root, scenario: 'empty', account: 'you@example.com',
  });
  vi.spyOn(workerB, 'me').mockImplementation(async () => ({ user: { name: 'Alex', email: 'you@example.com' }, folderId: f.root }));
  const liveB = requiredExport(liveExports, 'makeLiveSources')({ drive: f.drive, worker: workerB, uploadQueue: f.b, declarePiles: true });
  sources.add(liveB);
  expect((await liveB.session.current())?.email).toBe('you@example.com');
  expect(await liveB.session.rootId()).toBe(f.root);
  await liveB.vault.tree();
  return { ...f, liveB, vaultB: liveB.vault as DriveVault };
}

async function endAccount(f: Awaited<ReturnType<typeof livePair>>, ending: 'sign-out' | 'auth expiry') {
  if (ending === 'sign-out') await f.live.session.signOut();
  else {
    f.drive.failNext('auth');
    await expect(f.live.vault.tree()).rejects.toMatchObject({ code: 'auth' });
  }
  const fresh = indexedDbUploadStore(f.idb);
  expect(await fresh.list(f.account, f.root)).toEqual([]);
  expect(await keptBytes(fresh, f.control)).toEqual([null]);
  return fresh;
}

const syntheticPile = (body: Blob) => ({
  text: 'Synthetic papers',
  items: [{ name: 'Synthetic.pdf', kind: 'pdf' as const, origin: 'From this computer', body }],
});

it.each(['sign-out', 'auth expiry', 'no sign-out'] as const)(
  'upload-sign-out-forget: fix 3: Undo awaits untrash before %s',
  async (ending) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const f = await livePair();
    const body = new Blob(['Synthetic bytes'], { type: 'application/pdf' });
    expect(body.size).toBe(15);
    const pile = await f.vaultB.addPile(syntheticPile(body));
    await f.vaultB.settled();
    await f.b.idle();
    const pending = (await f.storeA.list(f.account, f.root)).filter((r) => r.pileId === pile.id);
    expect(pending).toHaveLength(1);
    expect(await keptBytes(f.storeA, pending)).toEqual([[...new TextEncoder().encode('Synthetic bytes')]]);
    await f.vaultB.trash(pile.path ?? '');
    await f.vaultB.settled();
    expect(await keptBytes(f.storeA, pending)).toEqual([null]);
    const entered = barrier(), release = barrier();
    const untrash = f.drive.untrash.bind(f.drive);
    vi.spyOn(f.drive, 'untrash').mockImplementation(async (...args) => {
      const result = await untrash(...args);
      if (args[0] === pending[0]?.parentId) { entered.open(); await release.promise; }
      return result;
    });
    const undo = outcome(f.vaultB.restore(pile.path ?? ''));
    try {
      await entered.promise;
      const fresh = ending === 'no sign-out' ? indexedDbUploadStore(f.idb) : await endAccount(f, ending);
      if (ending !== 'no sign-out') expect(await keptBytes(fresh, pending)).toEqual([null]);
      release.open();
      await undo;
      await f.vaultB.settled();
      await Promise.all([f.a.idle(), f.b.idle()]);
      if (ending === 'no sign-out') {
        expect(await fresh.list(f.account, f.root)).toHaveLength(2);
        expect(await keptBytes(fresh, pending)).toEqual([[...new TextEncoder().encode('Synthetic bytes')]]);
        expect(f.b.items().find((i) => i.pileId === pile.id)).toMatchObject({ state: 'waiting', durable: true });
      } else {
        expect({ records: await fresh.list(f.account, f.root), bytes: await keptBytes(fresh, [...f.control, ...pending]) },
          'Undo must not re-admit the 15 retained bytes under a newer forget version').toEqual({ records: [], bytes: [null, null] });
      }
    } finally { release.open(); await undo; }
  },
);

it.each(['sign-out', 'auth expiry'] as const)(
  'upload-sign-out-forget: fix 3: addPile awaits declaration hashing before %s',
  async (ending) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const f = await livePair();
    const entered = barrier(), release = barrier();
    const body = new Blob(['Synthetic bytes'], { type: 'application/pdf' });
    const read = body.arrayBuffer.bind(body);
    vi.spyOn(body, 'arrayBuffer').mockImplementationOnce(async () => { entered.open(); await release.promise; return read(); });
    const writes: PendingUpload[] = [];
    const add = f.storeB.add.bind(f.storeB);
    vi.spyOn(f.storeB, 'add').mockImplementation(async (...args) => { writes.push(args[0]); await add(...args); });
    const adding = outcome(f.vaultB.addPile(syntheticPile(body)));
    try {
      await entered.promise;
      expect(writes).toEqual([]);
      const fresh = await endAccount(f, ending);
      release.open();
      await adding;
      await f.vaultB.settled();
      await f.b.idle();
      expect({ records: await fresh.list(f.account, f.root), bytes: await keptBytes(fresh, [...f.control, ...writes]) },
        'the addPile admission begins before its declaration hashes the Blob').toEqual({ records: [], bytes: [null, ...writes.map(() => null)] });
    } finally { release.open(); await adding; }
  },
);

it.each(['sign-out', 'auth expiry'] as const)(
  'upload-sign-out-forget: fix 3: chooseAgain awaits hashing before %s',
  async (ending) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const f = await livePair();
    const body = new Blob(['Synthetic bytes'], { type: 'application/pdf' });
    const pile = await f.vaultB.addPile(syntheticPile(body));
    await f.vaultB.settled();
    await f.b.idle();
    const pending = (await f.storeA.list(f.account, f.root)).filter((r) => r.pileId === pile.id);
    expect(pending).toHaveLength(1);
    expect(await keptBytes(f.storeA, pending)).toEqual([[...new TextEncoder().encode('Synthetic bytes')]]);
    // Model a reload after this member's device copy was lost; its declaration remains in Drive.
    f.liveB.dispose();
    f.b.stop();
    const retained = pending[0];
    if (!retained) throw new Error('The pending member must exist.');
    await f.storeB.remove(retained);
    const worker = new FakeWorker({ drive: f.drive, runs: new FakeRunService({ drive: f.drive, clock: () => NOW.getTime(), scale: 'instant', sleep: async () => undefined }), rootId: f.root, scenario: 'empty', account: 'you@example.com' });
    vi.spyOn(worker, 'me').mockImplementation(async () => ({ user: { name: 'Alex', email: 'you@example.com' }, folderId: f.root }));
    const tab = requiredExport(liveExports, 'makeLiveSources')({ drive: f.drive, worker, uploadQueue: f.b, declarePiles: true });
    sources.add(tab);
    await tab.session.current(); await tab.session.rootId();
    const vault = tab.vault as DriveVault;
    expect((await vault.piles()).find((p) => p.id === pile.id)?.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: pending[0]?.memberKey, chooseAgain: true })]));
    const entered = barrier(), release = barrier();
    const read = body.arrayBuffer.bind(body);
    vi.spyOn(body, 'arrayBuffer').mockImplementationOnce(async () => { entered.open(); await release.promise; return read(); });
    const choosing = outcome(vault.chooseAgain(pile.id, retained.memberKey, { body }));
    try {
      await entered.promise;
      const fresh = await endAccount(f, ending);
      release.open();
      await choosing;
      await vault.settled();
      await f.b.idle();
      expect({ records: await fresh.list(f.account, f.root), bytes: await keptBytes(fresh, [...f.control, ...pending]) },
        'reselection starts at chooseAgain, before hashing and looking in Drive').toEqual({ records: [], bytes: [null, null] });
    } finally { release.open(); await choosing; }
  },
);

const progressPaths = [
  { path: 'retry reserves a file id', launch: 'retry', write: 'fileId' },
  { path: 'resume after halt keeps a session', launch: 'resume', write: 'session' },
  { path: 'reload resume keeps confirmed progress', launch: 'reload', write: 'confirmed' },
  { path: 'retryPile reserves a file id', launch: 'retryPile', write: 'fileId' },
  { path: 'retry releases a refused file id', launch: 'retry', write: 'reset' },
] as const;

it.each(progressPaths)(
  'upload-sign-out-forget: fix 3: $path across sign-out',
  async ({ launch, write }) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const f = await livePair();
    await f.b.idle();
    const item = f.b.items().find((i) => i.memberKey === f.control[0]?.memberKey);
    expect(item).toMatchObject({ state: 'waiting', durable: true });
    if (!item) throw new Error('The pending control must be in tab B.');
    if (launch === 'resume') { await f.b.halt(item.id); f.b.retry(); await f.b.idle(); }
    if (launch === 'reload') f.b.stop();
    const entered = barrier(), release = barrier();
    const save = f.storeB.save.bind(f.storeB);
    let held = false;
    vi.spyOn(f.storeB, 'save').mockImplementation(async (...args) => {
      const [record] = args;
      const target = write === 'fileId' ? record.fileId !== null
        : write === 'session' ? record.session !== null
        : write === 'reset' ? record.fileId === null : record.confirmed === 4;
      if (target && !held) { held = true; entered.open(); await release.promise; }
      await save(...args);
    });
    f.drive.beforeChunk = async ({ start }) => {
      if (write === 'reset') throw new BowerError('unknown', 'This file could not be sent.', undefined, marked('permanent'));
      if (write !== 'confirmed' || start !== 0) throw new BowerError('offline', 'You are offline.');
    };
    const launched = outcome((async () => {
      if (launch === 'reload') await f.b.start(f.account, f.root);
      else if (launch === 'resume') f.b.resume(item.id);
      else if (launch === 'retryPile') await f.vaultB.retryPile(item.pileId);
      else f.b.retry();
    })());
    try {
      await entered.promise;
      const fresh = await endAccount(f, 'sign-out');
      release.open();
      await launched;
      await f.b.idle();
      expect({ records: await fresh.list(f.account, f.root), bytes: await keptBytes(fresh, f.control) },
        'a delayed progress put must not recreate a forgotten pending upload').toEqual({ records: [], bytes: [null] });
    } finally { release.open(); await launched; await f.b.idle(); }
  },
);

it.each(['new add', 'queue reselection'] as const)(
  'upload-sign-out-forget: fix 3: %s awaits Blob read across sign-out',
  async (path) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const f = await livePair();
    const body = new Blob(['Synthetic bytes'], { type: 'application/pdf' });
    const input = { ...await member(f.inbox, 44), body, sha256: await sha256(body) };
    const pending: PendingUpload = {
      account: f.account, folder: f.root, declarationId: input.declarationId,
      memberKey: input.memberKey, sha256: input.sha256, pileId: input.pileId,
      parentId: input.parentId, name: input.name, type: body.type, size: body.size,
      appProperties: { ...input.appProperties }, fileId: null, session: null,
      confirmed: 0, addedAt: NOW.toISOString(),
    };
    if (path === 'queue reselection') {
      await f.b.add(input); await f.b.idle();
      expect(await keptBytes(f.storeA, [pending])).toEqual([[...new TextEncoder().encode('Synthetic bytes')]]);
      f.b.stop();
      const read = f.storeB.body.bind(f.storeB);
      const unreadable = vi.spyOn(f.storeB, 'body').mockImplementation(async (record) => {
        if (record.memberKey === input.memberKey) throw new Error('Synthetic device read refused');
        return read(record);
      });
      await f.b.start(f.account, f.root); await f.b.idle();
      expect(f.b.items().find((i) => i.memberKey === input.memberKey)).toMatchObject({ gone: true, state: 'failed' });
      unreadable.mockRestore();
    }
    const entered = barrier(), release = barrier();
    const read = body.arrayBuffer.bind(body);
    vi.spyOn(body, 'arrayBuffer').mockImplementationOnce(async () => { entered.open(); await release.promise; return read(); });
    const adding = outcome(f.b.add(input));
    try {
      await entered.promise;
      const fresh = await endAccount(f, 'sign-out');
      expect(await keptBytes(fresh, [pending])).toEqual([null]);
      release.open();
      const added = await adding;
      await f.b.idle();
      expect({ records: await fresh.list(f.account, f.root), bytes: await keptBytes(fresh, [...f.control, pending]) })
        .toEqual({ records: [], bytes: [null, null] });
      expect(added).toMatchObject({ error: expect.any(BowerError) });
    } finally { release.open(); await adding; }
  },
);
