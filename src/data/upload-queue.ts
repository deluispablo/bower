/**
 * The persistent upload queue (TL-P2-07, D02 part 1; journey 9). A pile
 * member on its way to Drive is kept on the device (`upload-store.ts`) with
 * its reserved file id and resumable session, so a reload only pauses it:
 * on the next start the queue asks Drive how much arrived and sends the rest.
 * The bytes are deleted only once Drive confirms the file.
 *
 * - Pending uploads belong to an account and a Bower folder: they resume only
 *   for that same account and folder, and stay through a sign-out (`stop`).
 *   `forgetAccount` (leaving Bower) removes them; `discard` removes one.
 * - Web Locks give one tab the queue of an account and folder. A tab without
 *   the lock sends nothing from it and waits its turn; a tab that loses the
 *   lock stops at once and leaves the files to the other tab.
 * - The queue asks once for persistent storage and checks the room left. A
 *   file it cannot keep (too big, no room, or IndexedDB refused) is sent from
 *   memory with `KEEP_OPEN_TEXT`, one sentence for the person.
 *
 * Adapted from the original Bower app (github.com/deluispablo/bower,
 * app/src/upload-queue.ts, the queue part; FSL-1.1-MIT, owner's copyright).
 */
import { driveError, type DriveFile } from './drive/drive-api';
import { RESUMABLE_CHUNK_BYTES, sendResumable, type ResumableClient } from './drive/resumable-upload';
import { BowerError } from './types';
import { uploadId, type PendingUpload, type UploadStore } from './upload-store';

/** The largest file the queue copies onto the device. */
export const DURABLE_MAX_BYTES = 200 * 1024 * 1024;

/** What a file with no copy on the device says. */
export const KEEP_OPEN_TEXT = "This device couldn't keep a copy. Keep Bower open until everything is sent.";

/** Said when the browser refuses to keep this device's storage for good. */
export const PERSIST_REFUSED_TEXT = 'This browser may clear what Bower keeps here. Keep Bower open until everything is sent.';

/** The store's answer when the device has no IndexedDB at all. */
const isNoStorage = (error: unknown): boolean => typeof error === 'object' && error !== null && 'name' in error && error.name === 'NotSupportedError';

/** Something could not be sent, for a reason the person can only retry. */
export const NOT_SENT_TEXT = "This couldn't be sent. Try again.";

/** The appProperty that says what kind of thing it is (`PROP.kind` in the vault layout). */
const KIND_PROP = 'kind';

/** Bower stopped before sending: a file is chosen again, a link or a note added again. */
export function stoppedText(kind: string | undefined): string {
  return `Bower stopped before sending this. ${kind === 'link' || kind === 'note' ? 'Add' : 'Choose'} it again.`;
}

/** Said once when what this device kept cannot be read. */
export const UNREADABLE_TEXT = "Bower couldn't read what it kept on this device. Choose those files again to send them.";

/** The Web Locks name that gives one tab the queue of an account and folder. */
export function lockName(account: string, folder: string): string {
  return `bower-uploads:${JSON.stringify([account, folder])}`;
}

/** The slice of `navigator.locks` the queue uses. */
export interface LocksLike {
  request: (name: string, options: { ifAvailable?: boolean; signal?: AbortSignal }, callback: (lock: unknown) => Promise<void>) => Promise<void>;
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
  drive: ResumableClient;
  store: UploadStore;
  /** `undefined` where the browser has no Web Locks: this tab runs the queue. */
  locks?: LocksLike;
  storage?: StorageLike;
  /** Wakes the owner when another tab adds a file, and tells the others when one is in. */
  bus?: QueueBus;
  chunkSize?: number;
  now?: () => Date;
}

export type UploadState = 'waiting' | 'uploading' | 'done' | 'failed';

/** `owner`: this tab sends the queue; `other-tab`: another tab does. */
export type QueueRole = 'idle' | 'owner' | 'other-tab';

/** One pile member as the screens see it. */
export interface QueueItem {
  /** Account, folder, declaration, member key and content hash, as one string. */
  id: string;
  declarationId: string;
  memberKey: string;
  sha256: string;
  pileId: string;
  parentId: string;
  name: string;
  size: number;
  /** Bytes Drive holds so far. */
  sent: number;
  /** `false`: no copy on the device, so the tab must stay open. */
  durable: boolean;
  state: UploadState;
  /** `offline` waits for a connection; anything else is `failed`. One sentence for the person. */
  error?: BowerError;
  /** `KEEP_OPEN_TEXT` when the file has no copy on the device. */
  note?: string;
  /** Drive's file once it is in. */
  file?: DriveFile;
  /** The file id reserved for it, once there is one: a lost answer may have made that file. */
  reserved: string | null;
  /** What it carries into Drive (how it was added, its kind, where from). */
  appProperties: Record<string, string>;
  /** ISO time it was added. */
  addedAt: string;
  /** Its bytes are no longer on this device: only choosing the file again can send it. */
  gone?: boolean;
}

export interface AddUpload {
  declarationId: string;
  memberKey: string;
  /** SHA-256 of `body`, hex, as the declaration records it. */
  sha256: string;
  pileId: string;
  parentId: string;
  name: string;
  body: Blob;
  type?: string;
  appProperties?: Record<string, string>;
}

export interface UploadQueue {
  /** Loads this account's queue for this folder, asks for the lock and sends. */
  start: (account: string, folder: string) => Promise<QueueRole>;
  /** Keeps a member on the device (when it can) and starts sending it; the same member twice is one. */
  add: (input: AddUpload) => Promise<QueueItem>;
  items: () => QueueItem[];
  role: () => QueueRole;
  subscribe: (listener: () => void) => () => void;
  /** Anything not yet in Drive (for `beforeunload`). */
  hasUnfinished: () => boolean;
  /** Tries again the ones that waited for a connection or failed. */
  /** With `'offline'`, only those that waited for a connection (coming back online). */
  retry: (only?: 'offline') => void;
  /** Settles once nothing is being sent. */
  idle: () => Promise<void>;
  /** The person removed this one: stop it, wait for its send to settle, and delete its bytes. */
  discard: (id: string) => Promise<void>;
  /** Holds one back from sending and waits for its send to settle; answers it as it now stands. */
  halt: (id: string) => Promise<QueueItem | null>;
  /** Lets a held-back one be sent again. */
  resume: (id: string) => void;
  /** Leaving Bower: every pending upload of `account`, in every folder, goes. */
  forgetAccount: (account: string) => Promise<void>;
  /** Stops sending and gives the lock back; what is kept on the device stays (sign-out, page gone). */
  stop: () => void;
  /** One sentence for the person about this device's storage, once; `null` when all is well. */
  notice: () => string | null;
  /** Whether the browser agreed to keep this device's storage. */
  persistence: () => 'granted' | 'refused' | 'unknown';
}

interface Entry {
  item: QueueItem;
  record: PendingUpload;
  /** The bytes in memory: the only copy when not durable. */
  body: Blob | null;
  /** Its record may be on the device, so it is removed once Drive has the file. */
  kept: boolean;
  /** Held back from sending while the vault decides what to do with it. */
  halted?: boolean;
}

interface Scope {
  account: string;
  folder: string;
}

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

/** `QuotaExceededError` as browsers throw it from IndexedDB. */
export function isQuotaError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'QuotaExceededError';
}

function itemOf(record: PendingUpload, durable: boolean): QueueItem {
  return {
    id: uploadId(record),
    declarationId: record.declarationId,
    memberKey: record.memberKey,
    sha256: record.sha256,
    pileId: record.pileId,
    parentId: record.parentId,
    name: record.name,
    size: record.size,
    sent: record.confirmed,
    durable,
    state: 'waiting',
    reserved: record.fileId,
    appProperties: { ...record.appProperties },
    addedAt: record.addedAt,
    ...(durable ? {} : { note: KEEP_OPEN_TEXT }),
  };
}

export function createUploadQueue(deps: UploadQueueDeps): UploadQueue {
  const { drive, store, locks, storage, bus } = deps;
  const chunkSize = deps.chunkSize ?? RESUMABLE_CHUNK_BYTES;
  const now = deps.now ?? ((): Date => new Date());

  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let scope: Scope | null = null;
  let role: QueueRole = 'idle';
  /** Bumped by `stop`, so late callbacks of an earlier start do nothing. */
  let generation = 0;
  let pumping: Promise<void> | null = null;
  let sending: { id: string; controller: AbortController; settled: Promise<void> } | null = null;
  let release: (() => void) | null = null;
  let waiting: AbortController | null = null;
  let persistAsked = false;
  /** Discarded here though the device could not delete their record: never brought back this session. */
  const tombstones = new Set<string>();
  let persisted: 'granted' | 'refused' | 'unknown' = 'unknown';
  let told: string | null = null;
  /** Bumped by every `pump` call, so a run that is ending sees a call it would miss. */
  let wakes = 0;

  /** Tells the person once. */
  function tell(text: string): void {
    if (told !== null) return;
    told = text;
    notify();
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  /** Picks up what another tab, or an earlier visit, left on the device. */
  async function refresh(s: Scope, gen: number): Promise<void> {
    const records = await store.list(s.account, s.folder);
    if (gen !== generation) return;
    const ids = new Set<string>();
    for (const record of records) {
      const id = uploadId(record);
      if (tombstones.has(id)) continue;
      ids.add(id);
      const entry = entries.get(id);
      if (!entry) entries.set(id, { item: itemOf(record, true), record, body: null, kept: true });
      else if (entry.item.durable && entry.item.state !== 'uploading') {
        // Another tab may have sent more of it: carry on from where it stands.
        entry.record = record;
        entry.item.sent = record.confirmed;
        entry.item.reserved = record.fileId;
      }
    }
    for (const { item, halted } of entries.values()) {
      // Kept on the device, gone from it, not sent here: another tab finished it.
      // One held back is being removed here: it is not done.
      if (item.durable && item.state === 'waiting' && !halted && !ids.has(item.id)) {
        item.state = 'done';
        item.sent = item.size;
      }
    }
    notify();
  }

  function pick(): Entry | undefined {
    for (const entry of entries.values()) {
      const { item } = entry;
      if (item.state !== 'waiting' || item.error !== undefined || entry.halted) continue;
      // Kept files belong to the tab with the lock; a file only in memory exists only here.
      if (item.durable && role !== 'owner') continue;
      return entry;
    }
    return undefined;
  }

  async function send(entry: Entry, gen: number): Promise<void> {
    const { item, record } = entry;
    const controller = new AbortController();
    let settle = (): void => undefined;
    const settled = new Promise<void>((resolve) => { settle = resolve; });
    sending = { id: item.id, controller, settled };
    /** Its bytes cannot come from this device now (`unreadable`) or ever (`lost`). */
    let gone: false | 'unreadable' | 'lost' = false;
    item.state = 'uploading';
    delete item.error;
    notify();
    /** The device stopped keeping it: carry on from memory and say so. */
    const demote = (error: unknown): void => {
      console.error(error);
      if (!item.durable) return;
      item.durable = false;
      item.note = KEEP_OPEN_TEXT;
      notify();
    };
    /** Bytes to hold in memory after a failed try, because the device copy cannot be trusted. */
    let holdBytes = false;
    /**
     * Never send under a reserved id the device has not kept: a reload would
     * reserve another and make a second file. If it cannot be kept, the kept
     * copy goes and this tab sends from memory; if that fails too, the try fails.
     */
    const keepFileId = async (id: string): Promise<void> => {
      try {
        await store.save({ ...record, fileId: id });
        return;
      } catch (error) {
        console.error(error);
      }
      try {
        await store.remove(record);
      } catch (error) {
        console.error(error);
        holdBytes = true;
        throw new BowerError('unknown', "This device couldn't keep track of this file. Try again.");
      }
      entry.kept = false;
      demote(new Error('The reserved file id could not be kept; sending from memory'));
    };
    const save = async (): Promise<void> => {
      if (!item.durable || gen !== generation) return;
      try {
        await store.save(record);
      } catch (error) {
        // expected: demote logs the details with console.error and tells the person once.
        demote(error);
      }
    };
    try {
      let body = entry.body;
      if (body === null) {
        try {
          body = await store.body(record);
        } catch (error) {
          console.error(error);
          // Not readable now: not sent from here, but what the device kept stays for a later start.
          gone = 'unreadable';
          throw new BowerError('unknown', "This device couldn't read this file back. Choose it again.");
        }
        if (body === null) {
          console.error('A pending upload lost its bytes on this device');
          gone = 'lost';
          throw new BowerError('unknown', 'This device no longer has this file. Choose it again.');
        }
        // Kept in memory while it is sent, so a storage failure on the way does not stop it.
        entry.body = body;
      }
      if (record.fileId === null) {
        // The file's identity is reserved and kept before anything is created.
        const [id] = await drive.generateIds(1);
        if (id === undefined) throw driveError('unknown');
        if (item.durable && gen === generation) await keepFileId(id);
        record.fileId = id;
        item.reserved = id;
      }
      const file = await sendResumable(
        drive,
        { id: record.fileId, parentId: record.parentId, name: record.name, type: record.type, size: record.size, sha256: record.sha256, appProperties: record.appProperties, body, session: record.session },
        {
          onSession: async (session) => {
            record.session = session;
            await save();
          },
          onConfirmed: async (bytes) => {
            record.confirmed = bytes;
            await save();
          },
          onProgress: (sent) => {
            item.sent = sent;
            notify();
          },
          signal: controller.signal,
        },
        chunkSize,
      );
      if (entry.kept) {
        // Drive has it: the bytes go, whichever start this was.
        await store.remove(record).catch((error: unknown) => console.error(error));
        bus?.post();
      }
      item.state = 'done';
      item.file = file;
      item.sent = item.size;
      entry.body = null;
    } catch (error) {
      item.state = 'waiting';
      if (isAbort(error) || controller.signal.aborted) {
        // Stopped, discarded, or the lock went to another tab: it carries on there.
        item.sent = record.confirmed;
      } else if (error instanceof BowerError && error.code === 'offline') {
        item.error = error;
      } else {
        console.error(error);
        item.state = 'failed';
        item.error = error instanceof BowerError ? error : new BowerError('unknown', NOT_SENT_TEXT);
        if (gone) {
          // Nothing to send from here: choosing the file again takes over. Bytes lost for good take their record along.
          item.gone = true;
          if (gone === 'lost' && entry.kept) {
            await store.remove(record).catch((err: unknown) => console.error(err));
            entry.kept = false;
          }
        }
      }
      // A kept file can be read again later; holding its bytes would only use memory.
      if (item.durable && !holdBytes) entry.body = null;
    } finally {
      if (sending?.controller === controller) sending = null;
      settle();
      notify();
    }
  }

  /** Holds an entry back and waits for its send, if any, to settle. */
  async function holdBack(entry: Entry): Promise<void> {
    entry.halted = true;
    const s = sending;
    if (s?.id !== entry.item.id) return;
    s.controller.abort();
    await s.settled;
  }

  /** Asks the queue to look for work; a run that is ending looks once more, so no call is lost. */
  function pump(): Promise<void> {
    wakes += 1;
    if (pumping !== null) return pumping;
    const run = (async (): Promise<void> => {
      for (;;) {
        const seen = wakes;
        const gen = generation;
        const s = scope;
        if (s === null) return;
        if (role === 'owner') {
          try {
            await refresh(s, gen);
          } catch (error) {
            console.error(error);
          }
        }
        // A stop and a new start while this ran: look again under the new start.
        if (gen !== generation) continue;
        const next = pick();
        if (next === undefined) {
          if (seen === wakes) return;
          continue;
        }
        await send(next, gen);
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

  bus?.listen(() => {
    const s = scope;
    if (s === null) return;
    if (role === 'owner') void pump();
    else refresh(s, generation).catch((error: unknown) => console.error(error));
  });

  /** This tab lost the lock: stop the file in flight and wait for a turn. */
  function lose(s: Scope, gen: number): void {
    if (gen !== generation) return;
    role = 'other-tab';
    release = null;
    sending?.controller.abort();
    notify();
    waitForTurn(s, gen);
  }

  function hold(gen: number): Promise<void> {
    return new Promise<void>((resolve) => {
      release = resolve;
      if (gen !== generation) resolve();
    });
  }

  function waitForTurn(s: Scope, gen: number): void {
    if (locks === undefined) return;
    const controller = new AbortController();
    waiting = controller;
    locks
      .request(lockName(s.account, s.folder), { signal: controller.signal }, (lock) => {
        if (lock === null || gen !== generation) return Promise.resolve();
        role = 'owner';
        notify();
        void pump();
        return hold(gen);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        lose(s, gen);
        if (!isAbort(error)) console.error(error);
      });
  }

  async function acquire(s: Scope, gen: number): Promise<QueueRole> {
    if (locks === undefined) return 'owner';
    const got = await new Promise<boolean>((resolve) => {
      locks
        .request(lockName(s.account, s.folder), { ifAvailable: true }, (lock) => {
          if (lock === null) {
            resolve(false);
            return Promise.resolve();
          }
          resolve(true);
          return hold(gen);
        })
        .catch((error: unknown) => {
          // Rejected after it was granted: another tab took it (`steal`).
          resolve(false);
          lose(s, gen);
          if (!isAbort(error)) console.error(error);
        });
    });
    if (!got && gen === generation) waitForTurn(s, gen);
    return got ? 'owner' : 'other-tab';
  }

  function stop(): void {
    generation += 1;
    sending?.controller.abort();
    sending = null;
    release?.();
    release = null;
    waiting?.abort();
    waiting = null;
    entries.clear();
    scope = null;
    role = 'idle';
    notify();
  }

  /** Whether a copy of `size` bytes fits on the device. */
  async function fits(size: number): Promise<boolean> {
    if (size > DURABLE_MAX_BYTES) return false;
    try {
      const estimate = await storage?.estimate?.();
      if (estimate?.quota === undefined || estimate.usage === undefined) return true;
      return estimate.quota - estimate.usage >= size;
    } catch (error) {
      console.error(error);
      return true;
    }
  }

  return {
    async start(account, folder) {
      if (scope?.account === account && scope.folder === folder && role !== 'idle') return role;
      if (scope !== null) stop();
      const s: Scope = { account, folder };
      scope = s;
      const gen = generation;
      told = null;
      const records = await store.list(account, folder).catch((error: unknown) => {
        // What was kept cannot be read: say so once; new files still try to be kept.
        console.error(error);
        tell(isNoStorage(error) ? KEEP_OPEN_TEXT : UNREADABLE_TEXT);
        return [];
      });
      if (gen !== generation) return 'idle';
      for (const record of records) if (!tombstones.has(uploadId(record))) entries.set(uploadId(record), { item: itemOf(record, true), record, body: null, kept: true });
      const got = await acquire(s, gen);
      if (gen !== generation) return 'idle';
      role = role === 'owner' ? role : got;
      notify();
      void pump();
      return role;
    },

    async add(input) {
      const s = scope;
      const gen = generation;
      if (s === null) {
        console.error('An upload was added before the queue started');
        throw new BowerError('unknown', NOT_SENT_TEXT);
      }
      const record: PendingUpload = {
        account: s.account,
        folder: s.folder,
        declarationId: input.declarationId,
        memberKey: input.memberKey,
        sha256: input.sha256,
        pileId: input.pileId,
        parentId: input.parentId,
        name: input.name,
        type: input.type ?? input.body.type,
        size: input.body.size,
        appProperties: { ...input.appProperties },
        fileId: null,
        session: null,
        confirmed: 0,
        addedAt: now().toISOString(),
      };
      const id = uploadId(record);
      const known = entries.get(id);
      if (known) return { ...known.item };
      if (!persistAsked) {
        persistAsked = true;
        void storage?.persist?.().then(
          (granted) => {
            // Refused: the browser may clear what is kept under storage pressure.
            persisted = granted ? 'granted' : 'refused';
            notify();
          },
          (error: unknown) => console.error(error),
        );
      }
      let durable = await fits(record.size);
      if (durable) {
        try {
          await store.add(record, input.body);
        } catch (error) {
          if (!isQuotaError(error)) console.error(error);
          durable = false;
        }
      }
      if (gen !== generation) {
        console.error('The upload queue stopped while a file was added');
        throw new BowerError('unknown', stoppedText(input.appProperties?.[KIND_PROP]));
      }
      const again = entries.get(id);
      if (again) return { ...again.item };
      // Added again on purpose: no longer a discarded one.
      tombstones.delete(id);
      const entry: Entry = { item: itemOf(record, durable), record, body: input.body, kept: durable };
      entries.set(id, entry);
      notify();
      if (durable && role !== 'owner') bus?.post();
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
    hasUnfinished: () => [...entries.values()].some((e) => e.item.state === 'waiting' || e.item.state === 'uploading'),

    retry(only) {
      for (const { item } of entries.values()) {
        if (item.error === undefined || item.gone) continue;
        if (only === 'offline' && item.error.code !== 'offline') continue;
        delete item.error;
        item.state = 'waiting';
      }
      notify();
      void pump();
    },

    async idle() {
      while (pumping !== null) await pumping;
    },

    async discard(id) {
      const entry = entries.get(id);
      if (!entry) return;
      await holdBack(entry);
      // Its record goes while it is held back, so a listing in between cannot bring it back.
      // The person's removal already happened in Drive: a device that cannot forget it says so in the
      // console, and this session keeps it discarded.
      if (entry.kept) {
        await store.remove(entry.record).catch((error: unknown) => {
          console.error(error);
          tombstones.add(id);
        });
      }
      entries.delete(id);
      notify();
      bus?.post();
    },

    async halt(id) {
      const entry = entries.get(id);
      if (!entry) return null;
      await holdBack(entry);
      notify();
      return { ...entry.item };
    },

    resume(id) {
      const entry = entries.get(id);
      if (!entry?.halted) return;
      entry.halted = false;
      notify();
      void pump();
    },

    async forgetAccount(account) {
      if (scope?.account === account) stop();
      await store.clear(account);
    },

    stop,
    notice: () => told,
    persistence: () => persisted,
  };
}
