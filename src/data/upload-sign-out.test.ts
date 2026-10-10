import { IDBFactory } from 'fake-indexeddb';
import fc from 'fast-check';
import { afterEach, expect, it, vi } from 'vitest';
import { FakeDrive } from './drive/fake-drive';
import { FakeWorker } from './fake/fake-worker';
import { FakeRunService } from './fake/fake-run-service';
import * as liveExports from './live/index';
import type { LiveSources } from './live/index';
import * as queueExports from './upload-queue';
import type { AddUpload, UploadQueue } from './upload-queue';
import { indexedDbUploadStore, type PendingUpload, type UploadStore } from './upload-store';
import { BowerError } from './types';
import { sha256 } from './vault/hashes';
import { outboxKey } from './vault/journal';

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

function queue(drive: FakeDrive, store: UploadStore): UploadQueue {
  const result = requiredExport(queueExports, 'createUploadQueue')({ drive, store, chunkSize: 4, now: () => NOW });
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
        add: async (record, body) => {
          if (commitBeforeForget) await store.add(record, body);
          staged.push(record);
          if (staged.length === count) entered.open();
          await release.promise;
          if (!commitBeforeForget) await store.add(record, body);
        },
      };
      const q = queue(drive, delayed);
      await q.start('ACCOUNT_A', 'FOLDER_A');
      const inputs = await Promise.all(Array.from({ length: count }, (_, n) => member(parent, n + 1)));
      const adding = inputs.map((input) => outcome(q.add(input)));
      await entered.promise;
      try {
        // Pin clear-before-late-commit, exactly the preparation's interleaving.
        await q.forgetAccount('ACCOUNT_A');
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
async function twoTabFixture() {
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
  const a = queue(drive, storeA), b = queue(drive, storeB);
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
  vi.spyOn(store, 'add').mockImplementation(async (record, bytes) => {
    records.push(record);
    await add(record, bytes);
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
  // Tab A stages too: even its existing per-instance fence must propagate cleanup failure to sign-out.
  const stage = await delayedStaging(f.storeA, f.inbox);
  const adding = outcome(f.a.add(stage.input));
  await stage.entered.promise;
  const cleared = barrier(), cleaning = barrier(), releaseCleanup = barrier();
  const clear = f.storeA.clear.bind(f.storeA);
  vi.spyOn(f.storeA, 'clear').mockImplementation(async (account, folder) => {
    await clear(account, folder);
    cleared.open();
  });
  const cause = new Error('Synthetic late removal refused');
  const remove = f.storeA.remove.bind(f.storeA);
  vi.spyOn(f.storeA, 'remove').mockImplementation(async (record) => {
    if (record.memberKey !== stage.input.memberKey) return remove(record);
    cleaning.open();
    await releaseCleanup.promise;
    if (removeFails) throw cause;
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
    const retained = await fresh.list(f.account, f.root);
    expect(retained).toHaveLength(1);
    expect(await keptBytes(fresh, stage.records)).toEqual([[...new TextEncoder().encode('Synthetic bytes')]]);
    const endedDuringCleanup = ended;
    releaseCleanup.open();
    const result = await signingOut;
    await adding;
    if (!removeFails) {
      // Positive cleanup control: the same late write is actually removed when remove succeeds.
      expect(result).toEqual({ value: undefined });
      expect(await fresh.list(f.account, f.root)).toEqual([]);
      expect(await keptBytes(fresh, stage.records)).toEqual([null]);
      expect(log.mock.calls.flat()).not.toContain(cause);
      return;
    }
    expect(result, 'a late failed remove belongs to sign-out, not only the stopped add').toMatchObject({
      error: { name: 'BowerError', message: 'Signing out did not finish. Try again.' },
    });
    expect('error' in result && result.error).toBeInstanceOf(BowerError);
    expect(log.mock.calls.flat()).toContain(cause);
    expect(endedDuringStaging, 'sign-out must wait for the outstanding Blob read').toBe(false);
    expect(endedDuringCleanup, 'sign-out must wait for the late remove').toBe(false);
    // The injected refusal really leaves bytes behind; reporting success would be a privacy defect.
    expect(await fresh.list(f.account, f.root)).toHaveLength(1);
    expect(await keptBytes(fresh, stage.records)).toEqual([[...new TextEncoder().encode('Synthetic bytes')]]);
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
