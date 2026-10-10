/**
 * Where the upload queue keeps things on their way to Drive: IndexedDB, so
 * a reload or a closed tab does not lose them. Sign-out and auth expiry
 * remove that account's pending bytes and progress. Each one is kept
 * under its account, folder, declaration, member key and content hash, and
 * in two parts: its progress (`pending`, rewritten as Drive confirms bytes)
 * and its bytes (`bytes`, written once, deleted once Drive has the file).
 *
 * Adapted from the original Bower app (github.com/deluispablo/bower,
 * app/src/cache.ts, the upload records; FSL-1.1-MIT, owner's copyright).
 */

/** Account, folder, declaration, member key, content hash. */
export type UploadKey = [account: string, folder: string, declarationId: string, memberKey: string, sha256: string];

/** One thing on its way to Drive, without its bytes. */
export interface PendingUpload {
  /** Who added it: only the same account sees or sends it. */
  account: string;
  /** The Bower folder it belongs to: only that folder sends it. */
  folder: string;
  declarationId: string;
  memberKey: string;
  /** SHA-256 of the bytes, hex. */
  sha256: string;
  pileId: string;
  /** The Drive folder it goes into. */
  parentId: string;
  name: string;
  type: string;
  size: number;
  appProperties: Record<string, string>;
  /** The file id reserved before the first byte is sent; `null` until then. */
  fileId: string | null;
  /** Drive's resumable session address; `null` before one is opened. */
  session: string | null;
  /** Bytes Drive has confirmed. */
  confirmed: number;
  /** ISO time it was added. */
  addedAt: string;
}

export interface UploadStore {
  /** The account's things for this folder, oldest first. */
  list: (account: string, folder: string) => Promise<PendingUpload[]>;
  /** Captures the account fence at the start of an operation that may write uploads. */
  captureForgetVersion: (record: Pick<PendingUpload, 'account'>) => Promise<number>;
  /** Keeps a new one with its bytes, together. Rejects when it cannot (`QuotaExceededError`). */
  add: (record: PendingUpload, body: Blob, version: number) => Promise<void>;
  /** Keeps new progress; a removed one stays removed. */
  save: (record: PendingUpload, version: number) => Promise<void>;
  body: (record: PendingUpload) => Promise<Blob | null>;
  remove: (record: PendingUpload) => Promise<void>;
  /** Removes the account's things in one folder, or in every folder. */
  clear: (account: string, folder?: string) => Promise<void>;
}

/** A different tab forgot the account while its bytes were being staged. */
export class UploadForgottenError extends Error {}

export function uploadKey(r: Pick<PendingUpload, 'account' | 'folder' | 'declarationId' | 'memberKey' | 'sha256'>): UploadKey {
  return [r.account, r.folder, r.declarationId, r.memberKey, r.sha256];
}

/** The key as one string, for the queue and the screens. */
export function uploadId(r: Pick<PendingUpload, 'account' | 'folder' | 'declarationId' | 'memberKey' | 'sha256'>): string {
  return JSON.stringify(uploadKey(r));
}

const DB_NAME = 'bower-uploads';
const DB_VERSION = 1;
const PENDING = 'pending';
const BYTES = 'bytes';
const KEY_PATH = ['account', 'folder', 'declarationId', 'memberKey', 'sha256'];
// A string key cannot collide with a member's array key; no new object store or schema is needed.
const forgetKey = (account: string): string => `forgotten:${account}`;
const forgetVersion = (value: unknown): number => typeof value === 'number' ? value : 0;

interface StoredBytes {
  buffer: ArrayBuffer;
  type: string;
}

/** Both backends refuse every upload write from an earlier account lifetime. */
function assertForgetVersion(current: number, captured: number): void {
  if (current !== captured) throw new UploadForgottenError('The account was forgotten during this upload.');
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new DOMException('The request failed.', 'UnknownError'));
  });
}

function finished(t: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onabort = () => reject(t.error ?? new DOMException('The transaction stopped.', 'AbortError'));
    t.onerror = () => reject(t.error ?? new DOMException('The transaction failed.', 'UnknownError'));
  });
}

function isPending(value: unknown): value is PendingUpload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return ['account', 'folder', 'declarationId', 'memberKey', 'sha256', 'pileId', 'parentId', 'name', 'type', 'addedAt'].every((k) => typeof v[k] === 'string')
    && typeof v.size === 'number' && typeof v.confirmed === 'number'
    && (v.fileId === null || typeof v.fileId === 'string') && (v.session === null || typeof v.session === 'string')
    && typeof v.appProperties === 'object' && v.appProperties !== null;
}

/** `QuotaExceededError`: trying again on a fresh connection will not make room. */
function isQuota(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'name' in e && e.name === 'QuotaExceededError';
}

function isBytes(value: unknown): value is StoredBytes {
  // Not `instanceof`: a buffer back from IndexedDB may come from another realm.
  return typeof value === 'object' && value !== null && 'buffer' in value && Object.prototype.toString.call(value.buffer) === '[object ArrayBuffer]' && 'type' in value && typeof value.type === 'string';
}

/** Whether an IndexedDB key starts with `prefix` (no `IDBKeyRange`: the factory may not be the global one). */
function under(key: IDBValidKey, prefix: string[]): boolean {
  return Array.isArray(key) && prefix.every((part, i) => key[i] === part);
}

/**
 * The store over IndexedDB. With no IndexedDB (`null`, or none on this
 * device) every call rejects, and the queue says it cannot keep a copy.
 */
export function indexedDbUploadStore(factory: IDBFactory | null = typeof indexedDB === 'undefined' ? null : indexedDB, name = DB_NAME): UploadStore {
  let opening: Promise<IDBDatabase> | null = null;

  /** Forgets the connection, so the next call opens a fresh one. */
  function forget(): void {
    const was = opening;
    opening = null;
    // expected: a connection that never opened has nothing to close; its caller reported the failure.
    void was?.then((d) => d.close(), () => undefined);
  }

  function db(): Promise<IDBDatabase> {
    if (factory === null) return Promise.reject(Object.assign(new Error('This device has no IndexedDB.'), { name: 'NotSupportedError' }));
    if (opening !== null) return opening;
    const raw = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(name, DB_VERSION);
      request.onupgradeneeded = () => {
        const d = request.result;
        if (!d.objectStoreNames.contains(PENDING)) d.createObjectStore(PENDING, { keyPath: KEY_PATH });
        if (!d.objectStoreNames.contains(BYTES)) d.createObjectStore(BYTES);
      };
      request.onsuccess = () => {
        const d = request.result;
        // Another tab replacing or deleting the database, or the browser closing
        // the connection: let go, and open again on the next call.
        d.onversionchange = () => {
          d.close();
          if (opening === mine) opening = null;
        };
        d.onclose = () => {
          if (opening === mine) opening = null;
        };
        resolve(d);
      };
      request.onerror = () => reject(request.error ?? new DOMException('IndexedDB did not open.', 'UnknownError'));
      request.onblocked = () => reject(new DOMException('IndexedDB is blocked by another tab.', 'UnknownError'));
    });
    const mine: Promise<IDBDatabase> = raw.catch((e: unknown) => {
      if (opening === mine) opening = null;
      throw e;
    });
    opening = mine;
    return mine;
  }

  /** Runs `op` in one transaction; a failure reopens the connection and tries once more. */
  async function run<T>(mode: IDBTransactionMode, op: (t: IDBTransaction) => Promise<T>): Promise<T> {
    try {
      return await op((await db()).transaction([PENDING, BYTES], mode));
    } catch (e) {
      if (factory === null || isQuota(e) || e instanceof UploadForgottenError) throw e;
      console.error(e);
      forget();
      return op((await db()).transaction([PENDING, BYTES], mode));
    }
  }

  function clearWhere(prefix: string[]): Promise<void> {
    return run('readwrite', async (t) => {
      const account = prefix[0];
      if (prefix.length === 1 && account !== undefined) {
        const bytes = t.objectStore(BYTES);
        const key = forgetKey(account);
        const marker = bytes.get(key);
        marker.onsuccess = () => {
          const version = forgetVersion(marker.result) + 1;
          bytes.put(version, key);
        };
      }
      for (const storeName of [PENDING, BYTES]) {
        const store = t.objectStore(storeName);
        const keys = store.getAllKeys();
        keys.onsuccess = () => {
          for (const key of keys.result) if (under(key, prefix)) store.delete(key);
        };
      }
      await finished(t);
    });
  }

  /** Every upload put checks its caller's fence in the same transaction as the write. */
  function write(record: PendingUpload, version: number, put: (t: IDBTransaction) => void): Promise<void> {
    return run('readwrite', async (t) => {
      let current = 0;
      const marker = t.objectStore(BYTES).get(forgetKey(record.account));
      marker.onsuccess = () => {
        current = forgetVersion(marker.result);
        if (current === version) put(t);
      };
      await finished(t);
      assertForgetVersion(current, version);
    });
  }

  return {
    captureForgetVersion: (record) => run('readonly', async (t) => {
      const [marker] = await Promise.all([
        request<unknown>(t.objectStore(BYTES).get(forgetKey(record.account))), finished(t),
      ]);
      return forgetVersion(marker);
    }),
    list: (account, folder) =>
      run('readwrite', async (t) => {
        const pending = t.objectStore(PENDING);
        const bytes = t.objectStore(BYTES);
        const found: PendingUpload[] = [];
        let malformed = 0;
        const cursor = pending.openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) return;
          if (isPending(c.value)) found.push(c.value);
          else {
            // A record this version cannot use: it and its bytes go, and the console says so.
            malformed++;
            bytes.delete(c.primaryKey);
            c.delete();
          }
          c.continue();
        };
        await finished(t);
        if (malformed) console.error(`Removed ${malformed} unreadable pending upload records`);
        return found.filter((r) => r.account === account && r.folder === folder).sort((a, b) => a.addedAt.localeCompare(b.addedAt));
      }),

    async add(record, body, version) {
      // Read before the write transaction: IndexedDB closes one that waits on other work.
      const stored: StoredBytes = { buffer: await body.arrayBuffer(), type: body.type };
      await write(record, version, (t) => {
        t.objectStore(PENDING).put({ ...record, appProperties: { ...record.appProperties } });
        t.objectStore(BYTES).put(stored, uploadKey(record));
      });
    },

    save: (record, version) => write(record, version, (t) => {
      const store = t.objectStore(PENDING);
      const there = store.count(uploadKey(record));
      there.onsuccess = () => {
        if (there.result > 0) store.put({ ...record, appProperties: { ...record.appProperties } });
      };
    }),

    body: (record) =>
      run('readonly', async (t) => {
        const stored = await request<unknown>(t.objectStore(BYTES).get(uploadKey(record)));
        return isBytes(stored) ? new Blob([stored.buffer], { type: stored.type }) : null;
      }),

    remove: (record) =>
      run('readwrite', async (t) => {
        t.objectStore(PENDING).delete(uploadKey(record));
        t.objectStore(BYTES).delete(uploadKey(record));
        await finished(t);
      }),

    clear: (account, folder) => clearWhere(folder === undefined ? [account] : [account, folder]),
  };
}

/**
 * The store in this page's memory: for tests, and for a browser with no IndexedDB at all.
 * Nothing survives a reload; the queue still resumes, reserves and checks as with the device's store.
 */
export function memoryUploadStore(): UploadStore {
  const held = new Map<string, { record: PendingUpload; body: Blob }>();
  const versions = new Map<string, number>();
  const current = (account: string): number => versions.get(account) ?? 0;
  const mine = (r: PendingUpload, account: string, folder?: string): boolean => r.account === account && (folder === undefined || r.folder === folder);
  return {
    captureForgetVersion: async (record) => current(record.account),
    list: async (account, folder) => [...held.values()].map((h) => ({ ...h.record, appProperties: { ...h.record.appProperties } })).filter((r) => mine(r, account, folder)).sort((a, b) => a.addedAt.localeCompare(b.addedAt)),
    add: async (record, body, version) => { assertForgetVersion(current(record.account), version); held.set(uploadId(record), { record: { ...record, appProperties: { ...record.appProperties } }, body }); },
    save: async (record, version) => { assertForgetVersion(current(record.account), version); const h = held.get(uploadId(record)); if (h) h.record = { ...record, appProperties: { ...record.appProperties } }; },
    body: async (record) => held.get(uploadId(record))?.body ?? null,
    remove: async (record) => { held.delete(uploadId(record)); },
    clear: async (account, folder) => { if (folder === undefined) versions.set(account, current(account) + 1); for (const [k, h] of held) if (mine(h.record, account, folder)) held.delete(k); },
  };
}
