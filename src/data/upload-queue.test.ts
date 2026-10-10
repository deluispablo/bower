/**
 * The persistent upload queue against the pretend Drive and a fake IndexedDB
 * (`fake-indexeddb`). A "device" is a store plus a queue over the same
 * IndexedDB, so making a second one is a reload; stopping the first is the
 * page going away.
 */
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESUMABLE_UNIT } from './drive/drive-api';
import { FakeDrive } from './drive/fake-drive';
import { MAX_RESTARTS } from './drive/resumable-upload';
import { BowerError } from './types';
import { pretendDrive } from './fake/pretend';
import { createUploadQueue, KEEP_OPEN_TEXT, PERSIST_REFUSED_TEXT, UNREADABLE_TEXT, type AddUpload, type LocksLike, type StorageLike, type UploadQueue } from './upload-queue';
import { indexedDbUploadStore, type UploadStore } from './upload-store';
import { sha256 } from './vault/hashes';
import { openElsewhere } from './session';

const ACCOUNT = 'account-a';
const OTHER_ACCOUNT = 'account-b';
const FOLDER = 'FOLDER_ID';
const OTHER_FOLDER = 'OTHER_FOLDER_ID';
const CHUNK = 4;
const BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

interface Env {
  drive: FakeDrive;
  inbox: string;
  idb: IDBFactory;
}

interface Device {
  store: UploadStore;
  queue: UploadQueue;
}

async function setup(): Promise<Env> {
  const drive = new FakeDrive({ chunkMultiple: CHUNK });
  const inbox = (await drive.createFolder('root', 'Inbox')).id;
  return { drive, inbox, idb: new IDBFactory() };
}

/** One page load: a fresh store and queue over the device's IndexedDB. */
function device(env: Env, opts: { locks?: LocksLike; storage?: StorageLike; store?: UploadStore } = {}): Device {
  const store = opts.store ?? indexedDbUploadStore(env.idb);
  const queue = createUploadQueue({ drive: env.drive, store, chunkSize: CHUNK, ...(opts.locks ? { locks: opts.locks } : {}), ...(opts.storage ? { storage: opts.storage } : {}) });
  return { store, queue };
}

async function member(env: Env, n = 1, declarationId = 'decl-1'): Promise<AddUpload> {
  const body = new Blob([BYTES], { type: 'application/pdf' });
  return { declarationId, memberKey: `member-${n}`, sha256: await sha256(body), pileId: 'pile-1', parentId: env.inbox, name: `scan-${n}.pdf`, body, appProperties: { item: `member-${n}` } };
}

/** Stops chunks from `start` on until `open()`, so a test can act mid-transfer. */
function holdAt(env: Env, start: number): { open: () => void } {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  env.drive.beforeChunk = async (call) => {
    if (call.start >= start) await gate;
  };
  return { open: () => release() };
}

const files = (env: Env) => env.drive.listAll(env.inbox);
const ops = (env: Env, from = 0) => env.drive.resumableCalls.slice(from).map((c) => (c.op === 'put' ? `put@${c.start}` : c.op));
const reachedChunk = async (env: Env, start: number): Promise<void> => {
  await vi.waitFor(() => expect(env.drive.resumableCalls.some((c) => c.op === 'put' && c.start === start)).toBe(true));
};

/** Web Locks for tabs that share one device: one holder per name, the rest queue or give up. */
function fakeLocks(): LocksLike {
  const held = new Set<string>();
  const waiting = new Map<string, Array<() => void>>();
  const wake = (name: string): void => {
    const next = waiting.get(name)?.shift();
    if (next) next();
  };
  return {
    async request(name, options, callback) {
      if (held.has(name)) {
        if (options.ifAvailable) return callback(null);
        await new Promise<void>((resolve, reject) => {
          const go = (): void => resolve();
          waiting.set(name, [...(waiting.get(name) ?? []), go]);
          options.signal?.addEventListener('abort', () => {
            waiting.set(name, (waiting.get(name) ?? []).filter((w) => w !== go));
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }
      held.add(name);
      try {
        await callback({ name });
      } finally {
        held.delete(name);
        wake(name);
      }
    },
  };
}

/** A store whose calls named in `failing` reject, as a broken IndexedDB would. */
function brokenStore(env: Env, failing: Partial<Record<keyof UploadStore, boolean>>): UploadStore {
  const real = indexedDbUploadStore(env.idb);
  const broken = (name: string) => () => Promise.reject(new Error(`IndexedDB ${name} failed`));
  return {
    captureForgetVersion: real.captureForgetVersion,
    list: failing.list ? broken('list') : real.list,
    add: failing.add ? broken('add') : real.add,
    save: failing.save ? broken('save') : real.save,
    body: failing.body ? broken('body') : real.body,
    remove: failing.remove ? broken('remove') : real.remove,
    clear: failing.clear ? broken('clear') : real.clear,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  // A test on the pretend Drive leaves nothing of it for the next, even when it fails.
  sessionStorage.clear();
});

describe('uploads survive a reload without a second file', () => {
  it('a reload mid-transfer resumes from the stored offset', async () => {
    const env = await setup();
    const hold = holdAt(env, 4);
    const first = device(env);
    await first.queue.start(ACCOUNT, FOLDER);
    await first.queue.add(await member(env));
    await reachedChunk(env, 4);
    first.queue.stop();
    hold.open();
    await first.queue.idle();
    expect(await files(env)).toHaveLength(0);

    env.drive.beforeChunk = null;
    const reserved = env.drive.resumableCalls.find((c) => c.op === 'open')?.id;
    const from = env.drive.resumableCalls.length;
    const second = device(env);
    await second.queue.start(ACCOUNT, FOLDER);
    expect(second.queue.items().map((i) => i.memberKey)).toEqual(['member-1']);
    await second.queue.idle();

    expect(ops(env, from)).toEqual(['status', 'put@4', 'put@8']);
    const there = await files(env);
    expect(there).toHaveLength(1);
    expect(there[0]?.id).toBe(reserved);
    expect(there[0]?.appProperties).toEqual({ item: 'member-1' });
    expect([...(await env.drive.readBytes(reserved ?? ''))]).toEqual([...BYTES]);
    expect(second.queue.items()[0]).toMatchObject({ state: 'done', sent: 10, file: { id: reserved } });
  });

  it('an expired session restarts within its bound and reuses the reserved file id', async () => {
    const env = await setup();
    const hold = holdAt(env, 4);
    const first = device(env);
    await first.queue.start(ACCOUNT, FOLDER);
    await first.queue.add(await member(env));
    await reachedChunk(env, 4);
    first.queue.stop();
    hold.open();
    await first.queue.idle();
    const reserved = env.drive.resumableCalls.find((c) => c.op === 'open')?.id;
    expect(reserved).toBeTruthy();

    env.drive.beforeChunk = null;
    env.drive.expireSessions();
    const from = env.drive.resumableCalls.length;
    const second = device(env);
    await second.queue.start(ACCOUNT, FOLDER);
    await second.queue.idle();

    expect(ops(env, from)).toEqual(['status', 'open', 'put@0', 'put@4', 'put@8']);
    expect(env.drive.resumableCalls.filter((c) => c.op === 'open').map((c) => c.id)).toEqual([reserved, reserved]);
    expect(env.drive.resumableCalls.filter((c) => c.op === 'generateIds')).toHaveLength(1);
    expect((await files(env)).map((f) => f.id)).toEqual([reserved]);
  });

  it('a session that keeps expiring stops after the bound and keeps the bytes', async () => {
    const env = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    env.drive.beforeChunk = () => env.drive.expireSessions();
    const tab = device(env);
    await tab.queue.start(ACCOUNT, FOLDER);
    await tab.queue.add(await member(env));
    await tab.queue.idle();

    expect(env.drive.resumableCalls.filter((c) => c.op === 'open')).toHaveLength(1 + MAX_RESTARTS);
    const item = tab.queue.items()[0];
    expect(item?.state).toBe('failed');
    expect(item?.error).toBeInstanceOf(BowerError);
    expect(item?.error?.message).toBe('Google Drive kept stopping this upload. Try again.');
    expect(await files(env)).toHaveLength(0);
    const kept = await tab.store.list(ACCOUNT, FOLDER);
    expect(kept).toHaveLength(1);
    const record = kept.find((record) => record.memberKey === 'member-1');
    expect(record && (await tab.store.body(record))).toBeInstanceOf(Blob);
  });

  it('a reply lost after the file was made is confirmed by asking the session, one file', async () => {
    const env = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    env.drive.beforeChunk = (call) => {
      if (call.start === 8) env.drive.loseNextReply();
    };
    const tab = device(env);
    await tab.queue.start(ACCOUNT, FOLDER);
    await tab.queue.add(await member(env));
    await tab.queue.idle();
    expect(await files(env)).toHaveLength(1);
    expect(tab.queue.items()[0]).toMatchObject({ state: 'waiting', error: { code: 'offline' } });

    env.drive.beforeChunk = null;
    const from = env.drive.resumableCalls.length;
    tab.queue.retry();
    await tab.queue.idle();
    expect(ops(env, from)).toEqual(['status']);
    expect(await files(env)).toHaveLength(1);
    expect(tab.queue.items()[0]?.state).toBe('done');
    expect(await tab.store.list(ACCOUNT, FOLDER)).toEqual([]);
  });

  it('a reply lost, then a reload with the session gone: the reserved id refuses a second file and is read back', async () => {
    const env = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    env.drive.beforeChunk = (call) => {
      if (call.start === 8) env.drive.loseNextReply();
    };
    const first = device(env);
    await first.queue.start(ACCOUNT, FOLDER);
    await first.queue.add(await member(env));
    await first.queue.idle();
    first.queue.stop();
    const made = await files(env);
    expect(made).toHaveLength(1);

    env.drive.beforeChunk = null;
    env.drive.expireSessions();
    const from = env.drive.resumableCalls.length;
    const second = device(env);
    await second.queue.start(ACCOUNT, FOLDER);
    await second.queue.idle();

    expect(ops(env, from)).toEqual(['status', 'open']);
    expect((await files(env)).map((f) => f.id)).toEqual([made[0]?.id]);
    expect(second.queue.items()[0]).toMatchObject({ state: 'done', file: { id: made[0]?.id } });
    expect(await second.store.list(ACCOUNT, FOLDER)).toEqual([]);
  });

  it('a reservation survives an immediate reload', async () => {
    sessionStorage.clear();
    // The reload comes before the pretend Drive's 250 ms save would: that timer never fires.
    const wait = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => (ms === 250 ? wait(() => undefined, 0) : wait(fn, ms))) as typeof setTimeout);
    const { drive } = await pretendDrive('default');
    const inbox = (await drive.createFolder('root', 'Inbox')).id;
    const env: Env = { drive, inbox, idb: new IDBFactory() };
    const bytes = new Uint8Array(RESUMABLE_UNIT + 10).map((_, i) => i % 251);
    const body = new Blob([bytes], { type: 'application/pdf' });
    const tab = (): UploadQueue => createUploadQueue({ drive: env.drive, store: indexedDbUploadStore(env.idb), chunkSize: RESUMABLE_UNIT });
    const hold = holdAt(env, RESUMABLE_UNIT);
    const first = tab();
    await first.start(ACCOUNT, FOLDER);
    await first.add({ ...(await member(env)), body, sha256: await sha256(body) });
    await reachedChunk(env, RESUMABLE_UNIT);
    first.stop();
    hold.open();
    await first.idle();
    const reserved = env.drive.resumableCalls.find((c) => c.op === 'open')?.id;
    expect(reserved).toBeTruthy();

    // Reload: the pretend Drive comes back from what this tab kept, with nothing else changed.
    env.drive = (await pretendDrive('default')).drive;
    const second = tab();
    await second.start(ACCOUNT, FOLDER);
    await second.idle();

    expect(ops(env)).toEqual(['status', `put@${RESUMABLE_UNIT}`]);
    expect((await files(env)).map((f) => f.id)).toEqual([reserved]);
    expect([...(await env.drive.readBytes(reserved ?? ''))]).toEqual([...bytes]);
    expect(second.items()[0]).toMatchObject({ state: 'done', sent: bytes.length, file: { id: reserved } });
  });

  it('keeps the bytes on the device until Drive confirms, then deletes them', async () => {
    const env = await setup();
    const hold = holdAt(env, 4);
    const tab = device(env);
    await tab.queue.start(ACCOUNT, FOLDER);
    await tab.queue.add(await member(env));
    await reachedChunk(env, 4);

    const look = indexedDbUploadStore(env.idb);
    const mid = await look.list(ACCOUNT, FOLDER);
    expect(mid).toHaveLength(1);
    const record = mid.find((record) => record.memberKey === 'member-1');
    expect(record).toMatchObject({ confirmed: 4, declarationId: 'decl-1', memberKey: 'member-1', sha256: await sha256(new Blob([BYTES])) });
    expect(record?.fileId).toBeTruthy();
    const kept = record ? await look.body(record) : null;
    expect(kept && [...new Uint8Array(await kept.arrayBuffer())]).toEqual([...BYTES]);

    hold.open();
    await tab.queue.idle();
    expect(await files(env)).toHaveLength(1);
    expect(await look.list(ACCOUNT, FOLDER)).toEqual([]);
    expect(record && (await look.body(record))).toBeNull();
  });

  it('a failed try keeps the bytes for the next one', async () => {
    const env = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    env.drive.offline = true;
    const tab = device(env);
    await tab.queue.start(ACCOUNT, FOLDER);
    await tab.queue.add(await member(env));
    await tab.queue.idle();
    expect(tab.queue.items()[0]).toMatchObject({ state: 'waiting', error: { code: 'offline' } });
    expect(await tab.store.list(ACCOUNT, FOLDER)).toHaveLength(1);

    env.drive.offline = false;
    tab.queue.retry();
    await tab.queue.idle();
    expect(await files(env)).toHaveLength(1);
    expect(await tab.store.list(ACCOUNT, FOLDER)).toEqual([]);
  });

  it('only one tab uploads; the other takes over from the offset when the first closes', async () => {
    const env = await setup();
    const locks = fakeLocks();
    const hold = holdAt(env, 4);
    const a = device(env, { locks });
    expect(await a.queue.start(ACCOUNT, FOLDER)).toBe('owner');
    await a.queue.add(await member(env));
    await reachedChunk(env, 4);

    const b = device(env, { locks });
    expect(await b.queue.start(ACCOUNT, FOLDER)).toBe('other-tab');
    const before = env.drive.resumableCalls.length;
    await b.queue.idle();
    expect(b.queue.items().map((i) => i.state)).toEqual(['waiting']);
    expect(env.drive.resumableCalls).toHaveLength(before);

    env.drive.beforeChunk = null;
    a.queue.stop();
    hold.open();
    await vi.waitFor(() => expect(b.queue.items()[0]?.state).toBe('done'));
    expect(b.queue.role()).toBe('owner');
    expect(ops(env, before)).toEqual(['status', 'put@4', 'put@8']);
    expect(await files(env)).toHaveLength(1);
  });

  it('a paused page keeps what is only in its memory and sends it once when it starts again', async () => {
    const env = await setup();
    const locks = fakeLocks();
    const full = indexedDbUploadStore(env.idb);
    full.add = () => Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
    const hold = holdAt(env, 4);
    const a = device(env, { locks, store: full });
    expect(await a.queue.start(ACCOUNT, FOLDER)).toBe('owner');
    await a.queue.add(await member(env));
    await reachedChunk(env, 4);
    a.queue.pause();
    env.drive.beforeChunk = null;
    hold.open();
    await a.queue.idle();
    expect(a.queue.items()).toEqual([expect.objectContaining({ state: 'waiting', durable: false, sent: 4 })]);
    expect(a.queue.onlyHere()).toBe(1);
    expect(a.queue.role()).toBe('idle');
    // Another tab gets the lock: it has nothing of this page's to send.
    const b = device(env, { locks });
    expect(await b.queue.start(ACCOUNT, FOLDER)).toBe('owner');
    await b.queue.idle();
    expect(await files(env)).toHaveLength(0);
    b.queue.stop();
    expect(await a.queue.start(ACCOUNT, FOLDER)).toBe('owner');
    await vi.waitFor(() => expect(a.queue.items()[0]?.state).toBe('done'));
    expect(await files(env)).toHaveLength(1);
    expect(a.queue.onlyHere()).toBe(0);
  });

  it('what a paused page kept only in memory is never sent for another account', async () => {
    const env = await setup();
    const full = indexedDbUploadStore(env.idb);
    full.add = () => Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
    const hold = holdAt(env, 0);
    const a = device(env, { store: full });
    await a.queue.start(ACCOUNT, FOLDER);
    await a.queue.add(await member(env));
    await reachedChunk(env, 0);
    a.queue.pause();
    env.drive.beforeChunk = null;
    hold.open();
    await a.queue.idle();
    expect(a.queue.onlyHere()).toBe(1);
    await a.queue.start(OTHER_ACCOUNT, FOLDER);
    await a.queue.idle();
    expect(a.queue.items()).toEqual([]);
    expect(a.queue.onlyHere()).toBe(0);
    expect(await files(env)).toHaveLength(0);
  });

  it('a refusal because Bower is open elsewhere leaves the upload waiting and pauses; the next start sends it once', async () => {
    const env = await setup();
    let refuse = true;
    const drive = new Proxy(env.drive, {
      get(target, key, receiver) {
        const value: unknown = Reflect.get(target, key, receiver);
        if (key === 'openResumable' && refuse)
          return async () => {
            refuse = false;
            throw openElsewhere();
          };
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const queue = createUploadQueue({ drive, store: indexedDbUploadStore(env.idb), chunkSize: CHUNK });
    await queue.start(ACCOUNT, FOLDER);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await queue.add(await member(env));
    await queue.idle();
    expect(queue.items()).toEqual([expect.objectContaining({ state: 'waiting' })]);
    expect(queue.items()[0]?.error).toBeUndefined();
    expect(queue.role()).toBe('idle');
    expect(await files(env)).toHaveLength(0);
    await queue.start(ACCOUNT, FOLDER);
    await vi.waitFor(() => expect(queue.items()[0]?.state).toBe('done'));
    expect(await files(env)).toHaveLength(1);
  });

  it('a paused page keeps what the device keeps too, and sends it once when it starts again', async () => {
    const env = await setup();
    const hold = holdAt(env, 4);
    const a = device(env);
    await a.queue.start(ACCOUNT, FOLDER);
    await a.queue.add(await member(env));
    await reachedChunk(env, 4);
    a.queue.pause();
    env.drive.beforeChunk = null;
    hold.open();
    await a.queue.idle();
    expect(a.queue.items()).toEqual([expect.objectContaining({ state: 'waiting', durable: true, sent: 4 })]);
    expect(a.queue.onlyHere()).toBe(0);
    await a.queue.start(ACCOUNT, FOLDER);
    await vi.waitFor(() => expect(a.queue.items()[0]?.state).toBe('done'));
    expect(a.queue.items()[0]?.file).toBeDefined();
    expect(await files(env)).toHaveLength(1);
  });

  it('a paused page whose kept upload another tab finished sees it done, with its file', async () => {
    const env = await setup();
    const locks = fakeLocks();
    const hold = holdAt(env, 4);
    const a = device(env, { locks });
    await a.queue.start(ACCOUNT, FOLDER);
    await a.queue.add(await member(env));
    await reachedChunk(env, 4);
    a.queue.pause();
    env.drive.beforeChunk = null;
    hold.open();
    await a.queue.idle();
    const b = device(env, { locks });
    expect(await b.queue.start(ACCOUNT, FOLDER)).toBe('owner');
    await vi.waitFor(() => expect(b.queue.items()[0]?.state).toBe('done'));
    b.queue.pause();
    await a.queue.start(ACCOUNT, FOLDER);
    await vi.waitFor(() => expect(a.queue.items()[0]).toMatchObject({ state: 'done', file: expect.objectContaining({ name: 'scan-1.pdf' }) }));
    expect(await files(env)).toHaveLength(1);
  });

  it('a device that cannot keep the bytes says so and sends from memory', async () => {
    const env = await setup();
    const full = indexedDbUploadStore(env.idb);
    full.add = () => Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
    const tab = device(env, { store: full });
    await tab.queue.start(ACCOUNT, FOLDER);
    const item = await tab.queue.add(await member(env));
    expect(item).toMatchObject({ durable: false, note: KEEP_OPEN_TEXT });
    expect(KEEP_OPEN_TEXT).toBe("This device couldn't keep a copy. Keep Bower open until everything is sent.");
    await tab.queue.idle();
    expect(await files(env)).toHaveLength(1);
    expect(tab.queue.items()[0]?.state).toBe('done');
  });

  it('asks to keep storage, and checks the room before keeping a copy', async () => {
    const env = await setup();
    const persist = vi.fn(async () => true);
    const tab = device(env, { storage: { persist, estimate: async () => ({ quota: 100, usage: 95 }) } });
    await tab.queue.start(ACCOUNT, FOLDER);
    const item = await tab.queue.add(await member(env));
    await tab.queue.add(await member(env, 2));
    expect(persist).toHaveBeenCalledTimes(1);
    expect(item).toMatchObject({ durable: false, note: KEEP_OPEN_TEXT });
    expect(await tab.store.list(ACCOUNT, FOLDER)).toEqual([]);
    await tab.queue.idle();
    expect(await files(env)).toHaveLength(2);
  });

  it('another account, or another folder, never sees or sends them', async () => {
    const env = await setup();
    env.drive.offline = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const first = device(env);
    await first.queue.start(ACCOUNT, FOLDER);
    await first.queue.add(await member(env));
    await first.queue.idle();
    first.queue.stop();
    env.drive.offline = false;
    const from = env.drive.resumableCalls.length;

    const other = device(env);
    await other.queue.start(OTHER_ACCOUNT, FOLDER);
    await other.queue.idle();
    expect(other.queue.items()).toEqual([]);
    expect(await other.store.list(OTHER_ACCOUNT, FOLDER)).toEqual([]);
    other.queue.stop();

    const elsewhere = device(env);
    await elsewhere.queue.start(ACCOUNT, OTHER_FOLDER);
    await elsewhere.queue.idle();
    expect(elsewhere.queue.items()).toEqual([]);
    elsewhere.queue.stop();
    expect(env.drive.resumableCalls).toHaveLength(from);
    expect(await files(env)).toHaveLength(0);

    const back = device(env);
    await back.queue.start(ACCOUNT, FOLDER);
    await back.queue.idle();
    expect(await files(env)).toHaveLength(1);
  });

  it('the same thing added twice is kept and sent once', async () => {
    const env = await setup();
    const tab = device(env);
    await tab.queue.start(ACCOUNT, FOLDER);
    const once = await tab.queue.add(await member(env));
    const twice = await tab.queue.add(await member(env));
    expect(twice.id).toBe(once.id);
    await tab.queue.idle();
    expect(tab.queue.items()).toHaveLength(1);
    expect(await files(env)).toHaveLength(1);
  });

  it('discarding one removes its bytes and sends nothing', async () => {
    const env = await setup();
    const hold = holdAt(env, 4);
    const tab = device(env);
    await tab.queue.start(ACCOUNT, FOLDER);
    const item = await tab.queue.add(await member(env));
    await reachedChunk(env, 4);
    const kept = (await tab.store.list(ACCOUNT, FOLDER)).find((record) => record.memberKey === item.memberKey);
    // The chunk on its way settles (aborted) before the discard ends.
    const discarding = tab.queue.discard(item.id);
    hold.open();
    await discarding;
    await tab.queue.idle();
    expect(tab.queue.items()).toEqual([]);
    expect(await tab.store.list(ACCOUNT, FOLDER)).toEqual([]);
    expect(kept && (await tab.store.body(kept))).toBeNull();
    expect(await files(env)).toHaveLength(0);
  });

  it('leaving Bower removes every pending upload of that account, in every folder', async () => {
    const env = await setup();
    env.drive.offline = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const [account, folder] of [[ACCOUNT, FOLDER], [ACCOUNT, OTHER_FOLDER], [OTHER_ACCOUNT, FOLDER]] as const) {
      const tab = device(env);
      await tab.queue.start(account, folder);
      await tab.queue.add(await member(env));
      await tab.queue.idle();
      tab.queue.stop();
    }
    const tab = device(env);
    await tab.queue.start(ACCOUNT, FOLDER);
    await tab.queue.forgetAccount(ACCOUNT);
    expect(tab.queue.items()).toEqual([]);
    expect(tab.queue.role()).toBe('idle');
    expect(await tab.store.list(ACCOUNT, FOLDER)).toEqual([]);
    expect(await tab.store.list(ACCOUNT, OTHER_FOLDER)).toEqual([]);
    expect(await tab.store.list(OTHER_ACCOUNT, FOLDER)).toHaveLength(1);
  });

  it('a storage failure mid-upload keeps sending from memory and says so, not as a Drive refusal', async () => {
    const env = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const tab = device(env, { store: brokenStore(env, { save: true }) });
    await tab.queue.start(ACCOUNT, FOLDER);
    expect(await tab.queue.add(await member(env))).toMatchObject({ durable: true });
    await tab.queue.idle();
    const item = tab.queue.items()[0];
    expect(item).toMatchObject({ state: 'done', durable: false, note: KEEP_OPEN_TEXT });
    expect(item?.error).toBeUndefined();
    expect(await files(env)).toHaveLength(1);
  });

  it('bytes that cannot be read back fail in words about this device, not Drive', async () => {
    const env = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    env.drive.offline = true;
    const first = device(env);
    await first.queue.start(ACCOUNT, FOLDER);
    await first.queue.add(await member(env));
    await first.queue.idle();
    first.queue.stop();
    env.drive.offline = false;

    const second = device(env, { store: brokenStore(env, { body: true }) });
    await second.queue.start(ACCOUNT, FOLDER);
    await second.queue.idle();
    const item = second.queue.items()[0];
    expect(item?.state).toBe('failed');
    expect(item?.error?.message).toBe("This device couldn't read this file back. Choose it again.");
    expect(await files(env)).toHaveLength(0);
    // Not sent from here now, but what the device kept stays: reading it may work after a reload.
    expect(item).toMatchObject({ gone: true });
    const kept = await indexedDbUploadStore(env.idb).list(ACCOUNT, FOLDER);
    expect(kept).toHaveLength(1);
    const record = kept.find((record) => record.memberKey === 'member-1');
    expect(record && (await indexedDbUploadStore(env.idb).body(record))).toBeInstanceOf(Blob);
    second.queue.retry();
    await second.queue.idle();
    expect(second.queue.items()[0]?.state).toBe('failed');
  });

  it('kept uploads that cannot be read at start are told once', async () => {
    const env = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const tab = device(env, { store: brokenStore(env, { list: true }) });
    let told = 0;
    tab.queue.subscribe(() => {
      if (tab.queue.notice()) told++;
    });
    await tab.queue.start(ACCOUNT, FOLDER);
    const notice = tab.queue.notice();
    expect(notice).toBe("Bower couldn't read what it kept on this device. Choose those files again to send them.");
    expect(told).toBeGreaterThan(0);
  });

  it('a restart while the last send is still stopping sends it', async () => {
    const env = await setup();
    const hold = holdAt(env, 4);
    const tab = device(env);
    await tab.queue.start(ACCOUNT, FOLDER);
    await tab.queue.add(await member(env));
    await reachedChunk(env, 4);
    tab.queue.stop();
    env.drive.beforeChunk = null;
    await tab.queue.start(ACCOUNT, FOLDER);
    hold.open();
    await vi.waitFor(async () => expect(await files(env)).toHaveLength(1));
    await vi.waitFor(() => expect(tab.queue.items()[0]?.state).toBe('done'));
  });

  it('remembers when the browser refuses to keep storage', async () => {
    const env = await setup();
    const tab = device(env, { storage: { persist: async () => false } });
    await tab.queue.start(ACCOUNT, FOLDER);
    await tab.queue.add(await member(env));
    await vi.waitFor(() => expect(tab.queue.persistence()).toBe('refused'));
    await tab.queue.idle();
  });

  it('a reserved id the device could not keep is never sent under: a lost reply and a reload still make one file', async () => {
    const env = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = indexedDbUploadStore(env.idb);
    let saves = 0;
    const firstSaveFails: UploadStore = { ...store, save: (...args) => (++saves === 1 ? Promise.reject(new Error('IndexedDB save failed')) : store.save(...args)) };
    env.drive.beforeChunk = (call) => {
      if (call.start === 8) env.drive.loseNextReply();
    };
    const first = device(env, { store: firstSaveFails });
    await first.queue.start(ACCOUNT, FOLDER);
    await first.queue.add(await member(env));
    await first.queue.idle();
    first.queue.stop();
    expect(await files(env)).toHaveLength(1);

    env.drive.beforeChunk = null;
    env.drive.expireSessions();
    const second = device(env);
    await second.queue.start(ACCOUNT, FOLDER);
    await second.queue.idle();
    expect(await files(env)).toHaveLength(1);
  });

  it('when the device can neither keep the reserved id nor let go of the file, the try fails in words about the device', async () => {
    const env = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const tab = device(env, { store: brokenStore(env, { save: true, remove: true }) });
    await tab.queue.start(ACCOUNT, FOLDER);
    await tab.queue.add(await member(env));
    await tab.queue.idle();
    const item = tab.queue.items()[0];
    expect(item?.state).toBe('failed');
    expect(item?.error?.message).toBe("This device couldn't keep track of this file. Try again.");
    expect(env.drive.resumableCalls.filter((c) => c.op === 'open')).toHaveLength(0);
    expect(await files(env)).toHaveLength(0);

    tab.queue.retry();
    await tab.queue.idle();
    expect(tab.queue.items()[0]?.state).toBe('failed');
    expect(await files(env)).toHaveLength(0);
  });

  it('a device with no IndexedDB says once that it cannot keep a copy, and still sends', async () => {
    const env = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const tab = device(env, { store: indexedDbUploadStore(null) });
    await tab.queue.start(ACCOUNT, FOLDER);
    expect(tab.queue.notice()).toBe(KEEP_OPEN_TEXT);
    expect(await tab.queue.add(await member(env))).toMatchObject({ durable: false, note: KEEP_OPEN_TEXT });
    await tab.queue.idle();
    expect(await files(env)).toHaveLength(1);
  });

  it('says why a thing could not be sent in two short sentences: what happened, then what to do', async () => {
    const env = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const idle = device(env);
    await expect(idle.queue.add(await member(env))).rejects.toThrow("This couldn't be sent. Try again.");

    const gone = device(env, { store: { ...indexedDbUploadStore(env.idb), body: async () => null } });
    env.drive.offline = true;
    const first = device(env);
    await first.queue.start(ACCOUNT, FOLDER);
    await first.queue.add(await member(env));
    await first.queue.idle();
    first.queue.stop();
    env.drive.offline = false;
    await gone.queue.start(ACCOUNT, FOLDER);
    await gone.queue.idle();
    expect(gone.queue.items()[0]?.error?.message).toBe('This device no longer has this file. Choose the file again.');
    // Its bytes are gone for good: the record goes too.
    expect(await indexedDbUploadStore(env.idb).list(ACCOUNT, FOLDER)).toEqual([]);
    gone.queue.stop();

    const stopping = device(env);
    await stopping.queue.start(ACCOUNT, OTHER_FOLDER);
    const file = stopping.queue.add({ ...(await member(env, 2)), appProperties: { kind: 'pdf' } });
    stopping.queue.stop();
    await expect(file).rejects.toThrow('Bower stopped before sending this. Choose it again.');
    await stopping.queue.start(ACCOUNT, OTHER_FOLDER);
    const note = stopping.queue.add({ ...(await member(env, 3)), appProperties: { kind: 'note' } });
    stopping.queue.stop();
    await expect(note).rejects.toThrow('Bower stopped before sending this. Add it again.');
  });

  it('the browser refusing to keep storage, and every person-facing sentence, use the approved words', () => {
    expect(PERSIST_REFUSED_TEXT).toBe('This browser may clear what Bower keeps here. Keep Bower open until everything is sent.');
    expect(UNREADABLE_TEXT).toBe("Bower couldn't read what it kept on this device. Choose those files again to send them.");
  });

  it('discarding one that is on its way waits for its send to settle', async () => {
    const env = await setup();
    const hold = holdAt(env, 4);
    const tab = device(env);
    await tab.queue.start(ACCOUNT, FOLDER);
    const item = await tab.queue.add(await member(env));
    await reachedChunk(env, 4);
    let finished = false;
    const discarding = tab.queue.discard(item.id).then(() => { finished = true; });
    await new Promise((r) => setTimeout(r, 50));
    expect(finished).toBe(false);
    hold.open();
    await discarding;
    expect(finished).toBe(true);
    expect(await files(env)).toHaveLength(0);
  });

  it('coming back online retries only what waited for a connection', async () => {
    const env = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    env.drive.beforeChunk = () => env.drive.expireSessions();
    const tab = device(env);
    await tab.queue.start(ACCOUNT, FOLDER);
    await tab.queue.add(await member(env));
    await tab.queue.idle();
    env.drive.beforeChunk = null;
    env.drive.offline = true;
    await tab.queue.add(await member(env, 2));
    await tab.queue.idle();
    expect(tab.queue.items().map((i) => i.state)).toEqual(['failed', 'waiting']);
    env.drive.offline = false;
    tab.queue.retry('offline');
    await tab.queue.idle();
    expect(tab.queue.items().map((i) => i.state)).toEqual(['failed', 'done']);
  });

  it('a discarded one whose record the device could not delete is not brought back by a later listing', async () => {
    const env = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = indexedDbUploadStore(env.idb);
    const stuck: UploadStore = { ...store, remove: () => Promise.reject(new Error('IndexedDB delete failed')) };
    env.drive.offline = true;
    const tab = device(env, { store: stuck });
    await tab.queue.start(ACCOUNT, FOLDER);
    const item = await tab.queue.add(await member(env));
    await tab.queue.idle();
    env.drive.offline = false;
    await tab.queue.discard(item.id);
    expect(await store.list(ACCOUNT, FOLDER)).toHaveLength(1);
    const opens = env.drive.resumableCalls.filter((c) => c.op === 'open').length;
    tab.queue.retry();
    await tab.queue.add(await member(env, 2));
    await tab.queue.idle();
    expect(tab.queue.items().map((i) => i.memberKey)).toEqual(['member-2']);
    expect(env.drive.resumableCalls.filter((c) => c.op === 'open')).toHaveLength(opens + 1);
    expect((await files(env)).map((f) => f.name)).toEqual(['scan-2.pdf']);
  });

  it.each([
    ['lost', { body: async (): Promise<null> => null }],
    ['unreadable', { body: (): Promise<never> => Promise.reject(new Error('IndexedDB body failed')) }],
  ] as const)('a gone one (%s) chosen again with the same bytes is sent once, under the file id reserved for it', async (_label, broken) => {
    const env = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const hold = holdAt(env, 4);
    const first = device(env);
    await first.queue.start(ACCOUNT, FOLDER);
    await first.queue.add(await member(env));
    await reachedChunk(env, 4);
    const reserved = env.drive.resumableCalls.find((c) => c.op === 'open')?.id;
    first.queue.stop();
    hold.open();
    env.drive.beforeChunk = null;

    const store = indexedDbUploadStore(env.idb);
    const second = device(env, { store: { ...store, ...broken } });
    await second.queue.start(ACCOUNT, FOLDER);
    await second.queue.idle();
    expect(second.queue.items()[0]).toMatchObject({ state: 'failed', gone: true });
    const opens = env.drive.resumableCalls.filter((c) => c.op === 'open').length;
    const again = await second.queue.add(await member(env));
    await second.queue.idle();
    expect(second.queue.items()).toHaveLength(1);
    expect(second.queue.items()[0]).toMatchObject({ id: again.id, state: 'done', fileId: reserved });
    expect(second.queue.items()[0]?.gone).toBeUndefined();
    expect((await files(env)).map((f) => f.id)).toEqual([reserved]);
    expect([...(await env.drive.readBytes(reserved ?? ''))]).toEqual([...BYTES]);
    expect(env.drive.resumableCalls.filter((c) => c.op === 'open')).toHaveLength(opens);
    // Drive has it: nothing of it stays on the device.
    expect(await store.list(ACCOUNT, FOLDER)).toEqual([]);
  });

  it('a gone one chosen again with bytes of another size is refused, and stays gone', async () => {
    const env = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    env.drive.offline = true;
    const first = device(env);
    await first.queue.start(ACCOUNT, FOLDER);
    await first.queue.add(await member(env));
    await first.queue.idle();
    first.queue.stop();
    env.drive.offline = false;
    const second = device(env, { store: { ...indexedDbUploadStore(env.idb), body: async () => null } });
    await second.queue.start(ACCOUNT, FOLDER);
    await second.queue.idle();
    const other = { ...(await member(env)), body: new Blob([new Uint8Array([1, 2, 3])]) };
    await expect(second.queue.add(other)).rejects.toMatchObject({ message: "This couldn't be sent. Try again." });
    await second.queue.idle();
    expect(second.queue.items()[0]).toMatchObject({ state: 'failed', gone: true });
    expect(await files(env)).toHaveLength(0);
  });

  it('a gone one chosen again with other bytes of the same size is refused, and stays gone', async () => {
    const env = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    env.drive.offline = true;
    const first = device(env);
    await first.queue.start(ACCOUNT, FOLDER);
    await first.queue.add(await member(env));
    await first.queue.idle();
    first.queue.stop();
    env.drive.offline = false;
    const second = device(env, { store: { ...indexedDbUploadStore(env.idb), body: async () => null } });
    await second.queue.start(ACCOUNT, FOLDER);
    await second.queue.idle();
    const other = { ...(await member(env)), body: new Blob([new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9, 9, 9])]) };
    await expect(second.queue.add(other)).rejects.toMatchObject({ message: "This couldn't be sent. Try again." });
    await second.queue.idle();
    expect(second.queue.items()[0]).toMatchObject({ state: 'failed', gone: true });
    expect(await files(env)).toHaveLength(0);
  });
});
