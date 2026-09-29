/**
 * The durable upload queue (spec §6.15b, R-UPL-5 to 9, D20).
 *
 * A file attached in Add is copied into IndexedDB (`uploads` store in
 * `cache.ts`) and sent with Drive's resumable protocol, so switching tab
 * never stops it and closing the app only pauses it: on the next open the
 * queue asks Drive how much arrived (`PUT` with `Content-Range: bytes
 * *\/<size>`) and sends the rest. The copy is deleted only once Drive
 * confirms the file.
 *
 * - The queue is per user; `navigator.locks` gives one tab the queue. A tab
 *   that does not hold the lock uploads nothing from it and waits its turn;
 *   a tab that loses the lock stops at once and leaves the files to the
 *   other tab.
 * - A file over 200 MB, larger than the space the browser offers, or whose
 *   copy fails (`QuotaExceededError`) is uploaded straight from memory and
 *   says "Keep Bower open until this one is in."
 * - Progress comes from XHR `upload.onprogress` on each 8 MiB chunk.
 *
 * The protocol and the queue take their transport, store and locks as
 * dependencies, so they are tested against a fake Drive without a network.
 * `uploadQueue()` wires the real ones; `clearUploadQueue` is the one way to
 * empty it (sign-out, `DELETE /me`, "Forget this device").
 */

import {
  clearUploads,
  deleteUpload,
  loadUploads,
  putUpload,
} from './cache.js';
import type { UploadRecord } from './cache.js';
import {
  DRIVE_BASE,
  RESUMABLE_CHUNK_BYTES,
  getToken,
  invalidateToken,
} from './drive.js';
import { uniqueName } from './upload-names.js';

/** The largest file the queue copies into the device's storage (R-UPL-9). */
export const DURABLE_MAX_BYTES = 200 * 1024 * 1024;

/** A file row's note when it has no durable copy (R-UPL-9). */
export const KEEP_OPEN_TEXT = 'Keep Bower open until this one is in.';

/** Times one file may restart after its session expired, per attempt. */
const MAX_RESTARTS = 2;

/** The Web Locks name that gives one tab the queue of `userId`. */
export function lockName(userId: string): string {
  return `bower-uploads:${userId}`;
}

/** A Drive answer the queue could not use. `status` 0 means no network. */
export class UploadError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'UploadError';
    this.status = status;
  }
}

// --- Protocol ----------------------------------------------------------------

/** The parts of an HTTP answer the protocol reads. */
export interface ResumableResponse {
  status: number;
  header: (name: string) => string | null;
  body: string;
}

/** How the protocol talks to Drive; `xhrTransport()` is the real one. */
export interface ResumableTransport {
  /** `POST` that opens a resumable session. */
  open: (
    url: string,
    headers: Record<string, string>,
    body: string,
  ) => Promise<ResumableResponse>;
  /** `PUT` to a session: a chunk, or `null` to ask its status. */
  put: (
    url: string,
    headers: Record<string, string>,
    body: Blob | null,
    onProgress?: (loaded: number) => void,
    signal?: AbortSignal,
  ) => Promise<ResumableResponse>;
}

/** Where a session stands, from a chunk's or a status query's answer. */
export type SessionStatus =
  | { kind: 'done'; fileId: string }
  | { kind: 'partial'; confirmed: number }
  | { kind: 'expired' };

/** Bytes Drive holds, from a 308's `Range: bytes=0-N` (none: 0). */
export function confirmedFrom(range: string | null): number {
  const match = /bytes=0-(\d+)/.exec(range ?? '');
  return match?.[1] !== undefined ? Number(match[1]) + 1 : 0;
}

function fileIdFrom(body: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = undefined;
  }
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'id' in parsed &&
    typeof parsed.id === 'string'
  ) {
    return parsed.id;
  }
  throw new UploadError(0, 'Unexpected Drive response.');
}

/** 200/201 done, 308 partial, 404/410 expired; anything else throws. */
export function sessionStatus(response: ResumableResponse): SessionStatus {
  const { status } = response;
  if (status === 200 || status === 201) {
    return { kind: 'done', fileId: fileIdFrom(response.body) };
  }
  if (status === 308) {
    return { kind: 'partial', confirmed: confirmedFrom(response.header('Range')) };
  }
  if (status === 404 || status === 410) return { kind: 'expired' };
  throw new UploadError(status, `Drive upload failed (${status}).`);
}

/** What a file is and where it goes. */
export interface UploadTarget {
  name: string;
  parentId: string;
  type: string;
  size: number;
}

/** Opens a resumable session and returns its address. */
export async function openSession(
  transport: ResumableTransport,
  target: UploadTarget,
): Promise<string> {
  const metadata = { name: target.name, parents: [target.parentId] };
  const response = await transport.open(
    `${DRIVE_BASE}/upload/drive/v3/files?uploadType=resumable&fields=id,name`,
    {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': target.type || 'application/octet-stream',
      'X-Upload-Content-Length': String(target.size),
    },
    JSON.stringify(metadata),
  );
  const session = response.header('Location');
  if (response.status !== 200 || session === null) {
    throw new UploadError(response.status, 'Drive did not open an upload.');
  }
  return session;
}

/** Asks a session how much arrived: `PUT` with `bytes *\/<size>`. */
export async function askStatus(
  transport: ResumableTransport,
  session: string,
  size: number,
): Promise<SessionStatus> {
  const response = await transport.put(
    session,
    { 'Content-Range': `bytes */${size}` },
    null,
  );
  return sessionStatus(response);
}

/** What the protocol reports while it sends one file. */
export interface UploadHooks {
  /** A session was opened (first time, or after one expired). */
  onSession: (session: string) => Promise<void>;
  /** Drive confirmed this many bytes. */
  onConfirmed: (bytes: number) => Promise<void>;
  /** Bytes sent so far, including the chunk in flight. */
  onProgress: (sent: number) => void;
  signal?: AbortSignal;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new DOMException('The upload stopped.', 'AbortError');
  }
}

/**
 * Sends `blob` with Drive's resumable protocol and returns the new file's
 * id. With a saved `session` it first asks Drive how much arrived (after a
 * reload); a 308 resumes from the confirmed byte and a 404 or 410 (the
 * session expired) restarts the file on a new session.
 */
export async function sendResumable(
  transport: ResumableTransport,
  target: UploadTarget & {
    blob: Blob;
    session: string | null;
    confirmed: number;
  },
  hooks: UploadHooks,
  chunkSize: number = RESUMABLE_CHUNK_BYTES,
): Promise<string> {
  const { size, blob } = target;
  let session = target.session;
  let offset = 0;
  let restarts = 0;

  async function restart(): Promise<void> {
    if (restarts >= MAX_RESTARTS) {
      throw new UploadError(404, 'The upload keeps expiring.');
    }
    restarts += 1;
    session = await openSession(transport, target);
    offset = 0;
    await hooks.onSession(session);
    await hooks.onConfirmed(0);
  }

  throwIfAborted(hooks.signal);
  if (session === null) {
    session = await openSession(transport, target);
    await hooks.onSession(session);
  } else {
    const status = await askStatus(transport, session, size);
    if (status.kind === 'done') {
      hooks.onProgress(size);
      return status.fileId;
    }
    if (status.kind === 'expired') {
      await restart();
    } else {
      offset = status.confirmed;
      await hooks.onConfirmed(offset);
    }
  }
  hooks.onProgress(offset);

  for (;;) {
    throwIfAborted(hooks.signal);
    const end = Math.min(offset + chunkSize, size);
    const start = offset;
    const range =
      size === 0 ? 'bytes */0' : `bytes ${start}-${end - 1}/${size}`;
    const response = await transport.put(
      session,
      { 'Content-Range': range },
      blob.slice(start, end),
      (loaded) => hooks.onProgress(start + loaded),
      hooks.signal,
    );
    const status = sessionStatus(response);
    if (status.kind === 'done') {
      hooks.onProgress(size);
      return status.fileId;
    }
    if (status.kind === 'expired') {
      await restart();
      hooks.onProgress(0);
      continue;
    }
    if (status.confirmed <= start) {
      throw new UploadError(308, 'Upload made no progress.');
    }
    offset = status.confirmed;
    await hooks.onConfirmed(offset);
  }
}

// --- The real transport --------------------------------------------------------

async function bearer(fresh: boolean): Promise<string> {
  if (fresh) invalidateToken();
  const token = await getToken(fresh ? { fresh: true } : {});
  return `Bearer ${token.accessToken}`;
}

function xhrPut(
  url: string,
  headers: Record<string, string>,
  body: Blob | null,
  auth: string,
  onProgress: ((loaded: number) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<ResumableResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Authorization', auth);
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }
    if (onProgress !== undefined) {
      xhr.upload.onprogress = (event) => onProgress(event.loaded);
    }
    const onAbort = (): void => xhr.abort();
    signal?.addEventListener('abort', onAbort);
    const done = (): void => signal?.removeEventListener('abort', onAbort);
    xhr.onload = () => {
      done();
      resolve({
        status: xhr.status,
        header: (name) => xhr.getResponseHeader(name),
        body: typeof xhr.responseText === 'string' ? xhr.responseText : '',
      });
    };
    xhr.onerror = () => {
      done();
      reject(new UploadError(0, 'network'));
    };
    xhr.onabort = () => {
      done();
      reject(new DOMException('The upload stopped.', 'AbortError'));
    };
    xhr.send(body);
  });
}

/**
 * The real transport: `fetch` opens a session, `XMLHttpRequest` sends each
 * chunk so `upload.onprogress` reports the bytes in flight. A 401 is retried
 * once with a fresh token, as `drive.ts` does.
 */
export function xhrTransport(): ResumableTransport {
  return {
    async open(url, headers, body) {
      async function once(fresh: boolean): Promise<Response> {
        return fetch(url, {
          method: 'POST',
          headers: { ...headers, Authorization: await bearer(fresh) },
          body,
        });
      }
      let response: Response;
      try {
        response = await once(false);
        if (response.status === 401) response = await once(true);
      } catch {
        throw new UploadError(0, 'network');
      }
      return {
        status: response.status,
        header: (name) => response.headers.get(name),
        body: await response.text(),
      };
    },
    async put(url, headers, body, onProgress, signal) {
      let response = await xhrPut(
        url,
        headers,
        body,
        await bearer(false),
        onProgress,
        signal,
      );
      if (response.status === 401) {
        response = await xhrPut(
          url,
          headers,
          body,
          await bearer(true),
          onProgress,
          signal,
        );
      }
      return response;
    },
  };
}

// --- The queue -------------------------------------------------------------------

/** Where the queue keeps its durable copies; `cacheUploadStore` is the real one. */
export interface UploadStore {
  list: (userId: string) => Promise<UploadRecord[]>;
  /** Throws when the copy cannot be written (`QuotaExceededError`). */
  put: (record: UploadRecord) => Promise<void>;
  remove: (userId: string, id: string) => Promise<void>;
  /** One user's files, or every user's when omitted. */
  clear: (userId?: string) => Promise<void>;
}

export const cacheUploadStore: UploadStore = {
  list: loadUploads,
  put: putUpload,
  remove: deleteUpload,
  clear: clearUploads,
};

/** The slice of `navigator.locks` the queue uses. */
export interface LocksLike {
  request: (
    name: string,
    options: { ifAvailable?: boolean; signal?: AbortSignal },
    callback: (lock: unknown) => Promise<void>,
  ) => Promise<void>;
}

/** The slice of `navigator.storage` the queue uses. */
export interface StorageLike {
  persist?: () => Promise<boolean>;
  estimate?: () => Promise<{ quota?: number; usage?: number }>;
}

/** Tells the other tabs of this device that the queue changed. */
export interface QueueBus {
  post: () => void;
  listen: (onMessage: () => void) => void;
}

/** A `BroadcastChannel` bus, or `undefined` where there is none. */
export function broadcastBus(): QueueBus | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined;
  const channel = new BroadcastChannel('bower-uploads');
  return {
    post: () => channel.postMessage('changed'),
    listen: (onMessage) => {
      channel.onmessage = () => onMessage();
    },
  };
}

export interface UploadQueueDeps {
  store: UploadStore;
  /** Wakes the owner when another tab adds a file, and tells the others
   * when a file is in. */
  bus?: QueueBus;
  transport: ResumableTransport;
  /** `undefined` where the browser has no Web Locks: this tab runs the queue. */
  locks?: LocksLike;
  storage?: StorageLike;
  chunkSize?: number;
  newId?: () => string;
  now?: () => Date;
}

export type UploadState = 'waiting' | 'uploading' | 'done' | 'failed';

/** One file as the UI sees it. */
export interface QueueItem {
  id: string;
  pileId: string;
  parentId: string;
  name: string;
  size: number;
  /** Bytes sent so far. */
  sent: number;
  /** `false`: no copy on the device, so the tab must stay open. */
  durable: boolean;
  state: UploadState;
  /** `'offline'`: waits for a connection; `'failed'`: Drive refused it. */
  error?: 'offline' | 'failed';
  /** Drive's id once the file is in. */
  fileId?: string;
  /** `KEEP_OPEN_TEXT` when the file has no durable copy. */
  note?: string;
}

/** `owner`: this tab uploads the queue; `other-tab`: another tab does. */
export type QueueRole = 'idle' | 'owner' | 'other-tab';

export interface AddUpload {
  blob: Blob;
  name: string;
  type?: string;
  pileId: string;
  parentId: string;
}

export interface UploadQueue {
  /** Loads `userId`'s queue from the device, asks for the lock and runs. */
  start: (userId: string) => Promise<QueueRole>;
  /** Copies a file into the queue (when it can) and starts sending it. */
  add: (input: AddUpload) => Promise<QueueItem>;
  items: () => QueueItem[];
  role: () => QueueRole;
  subscribe: (listener: () => void) => () => void;
  /** Any file not yet in Drive (for `beforeunload`, R-UPL-3). */
  hasUnfinished: () => boolean;
  /** Names the queue holds for `parentId`. */
  queuedNames: (parentId: string) => string[];
  /** A name free in both the inbox listing and the queue (R-UPL-6). */
  reserveName: (
    parentId: string,
    preferred: string,
    inboxNames: Iterable<string>,
  ) => string;
  /** Tries again the files that waited for a connection. */
  retry: () => void;
  /** Settles once nothing is being sent (tests, sign-out). */
  idle: () => Promise<void>;
  /** Stops and forgets `userId`'s queue (every user's when omitted). */
  clear: (userId?: string) => Promise<void>;
  /** Stops sending and gives the lock back; the device copies stay. */
  stop: () => void;
}

interface Entry {
  item: QueueItem;
  blob: Blob;
  type: string;
  session: string | null;
  confirmed: number;
  addedAt: string;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** `QuotaExceededError` as browsers throw it from IndexedDB. */
export function isQuotaError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'QuotaExceededError'
  );
}

export function createUploadQueue(deps: UploadQueueDeps): UploadQueue {
  const { store, transport, locks, storage, bus } = deps;
  const chunkSize = deps.chunkSize ?? RESUMABLE_CHUNK_BYTES;
  const newId = deps.newId ?? ((): string => crypto.randomUUID());
  const now = deps.now ?? ((): Date => new Date());

  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let userId: string | null = null;
  let role: QueueRole = 'idle';
  /** Bumped by `stop`, so late callbacks of an earlier start do nothing. */
  let generation = 0;
  let pumping: Promise<void> | null = null;
  let sending: AbortController | null = null;
  let release: (() => void) | null = null;
  let waiting: AbortController | null = null;
  let persistAsked = false;

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function record(entry: Entry, uid: string): UploadRecord {
    const { item } = entry;
    return {
      id: item.id,
      userId: uid,
      pileId: item.pileId,
      parentId: item.parentId,
      name: item.name,
      type: entry.type,
      size: item.size,
      blob: entry.blob,
      session: entry.session,
      confirmed: entry.confirmed,
      addedAt: entry.addedAt,
    };
  }

  function fromRecord(r: UploadRecord): Entry {
    return {
      item: {
        id: r.id,
        pileId: r.pileId,
        parentId: r.parentId,
        name: r.name,
        size: r.size,
        sent: r.confirmed,
        durable: true,
        state: 'waiting',
      },
      blob: r.blob,
      type: r.type,
      session: r.session,
      confirmed: r.confirmed,
      addedAt: r.addedAt,
    };
  }

  /** Picks up files another tab (or an earlier visit) left in the store. */
  async function refresh(uid: string): Promise<void> {
    const records = await store.list(uid);
    if (userId !== uid) return;
    for (const r of records) {
      if (!entries.has(r.id)) entries.set(r.id, fromRecord(r));
    }
  }

  function pick(): Entry | undefined {
    for (const entry of entries.values()) {
      const { item } = entry;
      if (item.state !== 'waiting' || item.error !== undefined) continue;
      // Durable files belong to the tab holding the lock; a file with no
      // copy exists only in this tab, so this tab sends it regardless.
      if (item.durable && role !== 'owner') continue;
      return entry;
    }
    return undefined;
  }

  async function send(entry: Entry, uid: string): Promise<void> {
    const controller = new AbortController();
    sending = controller;
    entry.item.state = 'uploading';
    notify();
    const save = async (): Promise<void> => {
      if (entry.item.durable && userId === uid) {
        await store.put(record(entry, uid));
      }
    };
    try {
      const fileId = await sendResumable(
        transport,
        {
          name: entry.item.name,
          parentId: entry.item.parentId,
          type: entry.type,
          size: entry.item.size,
          blob: entry.blob,
          session: entry.session,
          confirmed: entry.confirmed,
        },
        {
          onSession: async (session) => {
            entry.session = session;
            await save();
          },
          onConfirmed: async (bytes) => {
            entry.confirmed = bytes;
            await save();
          },
          onProgress: (sent) => {
            entry.item.sent = sent;
            notify();
          },
          signal: controller.signal,
        },
        chunkSize,
      );
      if (entry.item.durable) {
        await store.remove(uid, entry.item.id);
        bus?.post();
      }
      entry.item.state = 'done';
      entry.item.fileId = fileId;
      entry.item.sent = entry.item.size;
    } catch (error) {
      entry.item.state = 'waiting';
      if (isAbort(error) || controller.signal.aborted) {
        // Stopped, or the lock went to another tab: it carries on there.
        entry.item.sent = entry.confirmed;
      } else if (error instanceof UploadError && error.status === 0) {
        entry.item.error = 'offline';
      } else {
        entry.item.state = 'failed';
        entry.item.error = 'failed';
        console.error(error);
      }
    } finally {
      if (sending === controller) sending = null;
      notify();
    }
  }

  /** Another tab owns the queue: learn which files it has finished. */
  async function sync(uid: string): Promise<void> {
    const records = await store.list(uid);
    if (userId !== uid || role === 'owner') return;
    const ids = new Set(records.map((r) => r.id));
    for (const { item } of entries.values()) {
      if (item.durable && item.state !== 'done' && !ids.has(item.id)) {
        item.state = 'done';
        item.sent = item.size;
      }
    }
    for (const r of records) {
      if (!entries.has(r.id)) entries.set(r.id, fromRecord(r));
    }
    notify();
  }

  bus?.listen(() => {
    const uid = userId;
    if (uid === null) return;
    if (role === 'owner') {
      void pump();
    } else {
      sync(uid).catch((error: unknown) => console.error(error));
    }
  });

  function pump(): Promise<void> {
    if (pumping !== null) return pumping;
    const gen = generation;
    const run = (async (): Promise<void> => {
      for (;;) {
        const uid = userId;
        if (uid === null || gen !== generation) return;
        if (role === 'owner') await refresh(uid);
        if (gen !== generation) return;
        const next = pick();
        if (next === undefined) return;
        await send(next, uid);
      }
    })();
    pumping = run;
    void run
      .catch((error: unknown) => console.error(error))
      .finally(() => {
        if (pumping === run) pumping = null;
      });
    return run;
  }

  /** This tab lost the lock: stop the file in flight and wait for a turn. */
  function lose(uid: string, gen: number): void {
    if (gen !== generation || userId !== uid) return;
    role = 'other-tab';
    release = null;
    sending?.abort();
    notify();
    waitForTurn(uid, gen);
  }

  function hold(uid: string, gen: number): Promise<void> {
    return new Promise<void>((resolve) => {
      release = resolve;
      if (gen !== generation || userId !== uid) resolve();
    });
  }

  function waitForTurn(uid: string, gen: number): void {
    if (locks === undefined) return;
    const controller = new AbortController();
    waiting = controller;
    locks
      .request(lockName(uid), { signal: controller.signal }, (lock) => {
        if (lock === null || gen !== generation || userId !== uid) {
          return Promise.resolve();
        }
        role = 'owner';
        notify();
        void pump();
        return hold(uid, gen);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        lose(uid, gen);
        if (!isAbort(error)) console.error(error);
      });
  }

  async function acquire(uid: string, gen: number): Promise<QueueRole> {
    if (locks === undefined) return 'owner';
    const got = await new Promise<boolean>((resolve) => {
      locks
        .request(lockName(uid), { ifAvailable: true }, (lock) => {
          if (lock === null) {
            resolve(false);
            return Promise.resolve();
          }
          resolve(true);
          return hold(uid, gen);
        })
        .catch((error: unknown) => {
          // Rejected after it was granted: another tab took it (`steal`).
          resolve(false);
          lose(uid, gen);
          if (!isAbort(error)) console.error(error);
        });
    });
    if (!got && gen === generation) waitForTurn(uid, gen);
    return got ? 'owner' : 'other-tab';
  }

  function stop(): void {
    generation += 1;
    sending?.abort();
    sending = null;
    release?.();
    release = null;
    waiting?.abort();
    waiting = null;
    entries.clear();
    userId = null;
    role = 'idle';
    notify();
  }

  async function fits(size: number): Promise<boolean> {
    if (size > DURABLE_MAX_BYTES) return false;
    try {
      const estimate = await storage?.estimate?.();
      if (estimate?.quota === undefined || estimate.usage === undefined) {
        return true;
      }
      return estimate.quota - estimate.usage >= size;
    } catch (error) {
      console.error(error);
      return true;
    }
  }

  function queuedNames(parentId: string): string[] {
    const names: string[] = [];
    for (const { item } of entries.values()) {
      if (item.parentId === parentId && item.state !== 'failed') {
        names.push(item.name);
      }
    }
    return names;
  }

  return {
    async start(uid) {
      if (userId === uid && role !== 'idle') return role;
      if (userId !== null) stop();
      userId = uid;
      const gen = generation;
      const records = await store.list(uid).catch((error: unknown) => {
        console.error(error);
        return [];
      });
      if (gen !== generation) return 'idle';
      for (const r of records) entries.set(r.id, fromRecord(r));
      const got = await acquire(uid, gen);
      if (gen !== generation) return 'idle';
      role = role === 'owner' ? role : got;
      notify();
      void pump();
      return role;
    },

    async add(input) {
      const uid = userId;
      if (uid === null) throw new Error('The upload queue has not started.');
      if (!persistAsked) {
        persistAsked = true;
        void storage?.persist?.().catch((error: unknown) => {
          console.error(error);
        });
      }
      const size = input.blob.size;
      const entry: Entry = {
        item: {
          id: newId(),
          pileId: input.pileId,
          parentId: input.parentId,
          name: uniqueName(input.name, [], queuedNames(input.parentId)),
          size,
          sent: 0,
          durable: await fits(size),
          state: 'waiting',
        },
        blob: input.blob,
        type: input.type ?? input.blob.type,
        session: null,
        confirmed: 0,
        addedAt: now().toISOString(),
      };
      if (entry.item.durable) {
        try {
          await store.put(record(entry, uid));
        } catch (error) {
          if (!isQuotaError(error)) console.error(error);
          entry.item.durable = false;
        }
      }
      if (!entry.item.durable) entry.item.note = KEEP_OPEN_TEXT;
      if (userId !== uid) throw new Error('The upload queue has stopped.');
      entries.set(entry.item.id, entry);
      notify();
      if (entry.item.durable && role !== 'owner') bus?.post();
      void pump();
      return { ...entry.item };
    },

    items: () => [...entries.values()].map((e) => ({ ...e.item })),
    role: () => role,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    hasUnfinished: () =>
      [...entries.values()].some((e) => e.item.state !== 'done'),
    queuedNames,
    reserveName: (parentId, preferred, inboxNames) =>
      uniqueName(preferred, inboxNames, queuedNames(parentId)),

    retry() {
      for (const { item } of entries.values()) {
        if (item.error === 'offline') delete item.error;
      }
      notify();
      void pump();
    },

    async idle() {
      while (pumping !== null) await pumping;
    },

    async clear(uid) {
      if (uid === undefined || uid === userId) stop();
      await store.clear(uid);
    },

    stop,
  };
}

// --- The app's queue -------------------------------------------------------------

let appQueue: UploadQueue | undefined;

/** The queue the app uses, created once at module level (tabs never stop it). */
export function uploadQueue(): UploadQueue {
  if (appQueue !== undefined) return appQueue;
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const queue = createUploadQueue({
    store: cacheUploadStore,
    transport: xhrTransport(),
    locks: nav?.locks as LocksLike | undefined,
    storage: nav?.storage,
    bus: broadcastBus(),
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => queue.retry());
  }
  appQueue = queue;
  return queue;
}

/**
 * The one way to empty the queue (R-UPL-7): stops it and deletes the device
 * copies of `userId`, or of every user when omitted. Called on sign-out,
 * `DELETE /me` and "Forget this device".
 */
export async function clearUploadQueue(userId?: string): Promise<void> {
  await uploadQueue().clear(userId);
}
