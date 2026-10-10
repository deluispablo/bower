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
