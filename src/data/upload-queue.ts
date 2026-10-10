/**
 * The persistent upload queue (TL-P2-07, D02 part 1; journey 9). A pile
 * member on its way to Drive is kept on the device (`upload-store.ts`) with
 * its reserved file id and resumable session, so a reload only pauses it:
 * on the next start the queue asks Drive how much arrived and sends the rest.
 * The bytes are deleted once Drive confirms the file, or the person forgets them.
 *
 * - Pending uploads belong to an account and a Bower folder: they resume only
 *   for that same account and folder. Page disposal (`stop`) keeps them;
 *   sign-out, auth expiry and leaving Bower (`forgetAccount`) remove them.
 *   `discard` removes one.
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
import { type DriveFile } from './drive/drive-api';
import { arrivedFile, RESUMABLE_CHUNK_BYTES, sendResumable, type ResumableClient } from './drive/resumable-upload';
import { isOpenElsewhere, OPEN_ELSEWHERE_TEXT } from './session';
import { heldAs, makeOnce } from './spine/write-once';
import { BowerError } from './types';
import { UploadForgottenError, uploadId, type PendingUpload, type UploadStore } from './upload-store';
import { sha256 } from './vault/hashes';

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

/** A kept file whose bytes the browser lost (storage cleared or evicted): only choosing it again sends it. */
export const LOST_TEXT = 'This device no longer has this file. Choose the file again.';

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
interface QueueCompletion {
  /** The account/folder/declaration/member/hash identity, never a file name. */
  id: string;
  fileId: string;
}

export interface QueueBus {
  post: (completion?: QueueCompletion) => void;
  listen: (onMessage: (completion?: QueueCompletion) => void) => void;
}

/** A `BroadcastChannel` bus, or `undefined` where there is none. */
export function broadcastBus(): QueueBus | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined;
  const channel = new BroadcastChannel('bower-uploads');
  return {
    post: (completion) => channel.postMessage(completion ?? 'changed'),
    listen: (onMessage) => {
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const message = event.data;
        const completion = typeof message === 'object' && message !== null
          && 'id' in message && typeof message.id === 'string'
          && 'fileId' in message && typeof message.fileId === 'string'
          ? { id: message.id, fileId: message.fileId } : undefined;
        onMessage(completion);
      };
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
  /** The file id its record keeps, once one was reserved: a lost answer may have made that file. */
  fileId: string | null;
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
  add: (input: AddUpload, version?: number | null) => Promise<QueueItem>;
  /** Starts an enclosing operation's fence; older injected ports never persist uploads. */
  captureForgetVersion?: (account: string) => Promise<number>;
  items: () => QueueItem[];
  role: () => QueueRole;
  subscribe: (listener: () => void) => () => void;
  /** Anything not yet in Drive (for `beforeunload`). */
  hasUnfinished: () => boolean;
  /** Things still on their way from this page; optional on older injected queue ports. */
  pendingCount?: () => number;
  /** Tries again the ones that waited for a connection or failed. */
  /** With `'offline'`, only those that waited for a connection (coming back online). */
  retry: (only?: 'offline', version?: number | null) => void;
  /** Settles once nothing is being sent. */
  idle: () => Promise<void>;
  /** The person removed this one: stop it, wait for its send to settle, and delete its bytes. */
  discard: (id: string) => Promise<void>;
  /** Holds one back from sending and waits for its send to settle; answers it as it now stands. */
  halt: (id: string) => Promise<QueueItem | null>;
  /** Lets a held-back one be sent again. */
  resume: (id: string) => void;
  /** Forgetting this person: every pending upload of `account`, in every folder, goes. */
  forgetAccount: (account: string) => Promise<void>;
  /** Page disposal: stops sending and gives the lock back; what is kept on the device stays. */
  stop: () => void;
  /**
   * This place is blocked (another place is active): stops sending and gives the lock back, like `stop`,
   * but what exists only in this page's memory stays here, paused, and goes when `start` is called again
   * for the same account and folder. What the device keeps is picked up as after a stop.
   */
  pause: () => void;
  /** How many things exist only in this page's memory and are not in Drive yet. */
  onlyHere: () => number;
  /** One sentence for the person about this device's storage, once; `null` when all is well. */
  notice: () => string | null;
  /** Whether the browser agreed to keep this device's storage. */
  persistence: () => 'granted' | 'refused' | 'unknown';
}

interface Entry {
  item: QueueItem;
  record: PendingUpload;
  /** Captured when this add, retry, resume or hydration began; never recaptured by its callbacks. */
  version: Promise<number | null>;
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
    fileId: record.fileId,
    appProperties: { ...record.appProperties },
    addedAt: record.addedAt,
    ...(durable ? {} : { note: KEEP_OPEN_TEXT }),
  };
}

interface StagingUpload {
  account: string;
  done: Promise<void>;
  failure?: { cause: unknown };
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
  /** Account forgets fence adds too, including ones from a previous folder/start. */
  const forgotten = new Map<string, number>();
  const staging = new Set<StagingUpload>();
  let persisted: 'granted' | 'refused' | 'unknown' = 'unknown';
  let told: string | null = null;
  /** Bumped by every `pump` call, so a run that is ending sees a call it would miss. */
  let wakes = 0;
  /** Another place is active: nothing is sent, and what is only in this page's memory waits here. */
  let paused = false;

  /** Tells the person once. */
  function tell(text: string): void {
    if (told !== null) return;
    told = text;
    notify();
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function pendingCount(): number {
    return [...entries.values()].filter((e) => e.item.state === 'waiting' || e.item.state === 'uploading').length;
  }

  /** Track the entire add, including reselection and room checks before the store starts staging. */
  async function stageUpload<T>(account: string, work: (stage: StagingUpload) => Promise<T>): Promise<T> {
    let finish = (): void => undefined;
    const stage: StagingUpload = {
      account, done: new Promise<void>((resolve) => { finish = resolve; }),
    };
    staging.add(stage);
    try { return await work(stage); }
    finally { staging.delete(stage); finish(); }
  }

  /** Storage refusal keeps the established explicit memory fallback, without a versionless write. */
  function capture(account: string): Promise<number | null> {
    return store.captureForgetVersion({ account }).catch((error: unknown) => {
      console.error(error);
      return null;
    });
  }

  /** Forgetting awaits staging and this cleanup even when the store refuses the stale write. */
  async function keepBytes(record: PendingUpload, body: Blob, localVersion: number, version: number, stage: StagingUpload): Promise<void> {
    if ((forgotten.get(record.account) ?? 0) !== localVersion) return;
    let failure: { cause: unknown } | undefined;
    try {
      await store.add(record, body, version);
    } catch (cause) {
      // expected: defer rethrow until the late-write cleanup has finished.
      failure = { cause };
    }
    if ((forgotten.get(record.account) ?? 0) !== localVersion) {
      try { await store.remove(record); }
      catch (cause) { stage.failure = { cause }; throw cause; }
    }
    if (failure) throw failure.cause;
  }

  /** Picks up what another tab, or an earlier visit, left on the device. */
  async function refresh(s: Scope, gen: number): Promise<void> {
    const version = capture(s.account);
    const records = await store.list(s.account, s.folder);
    if (gen !== generation) return;
    const ids = new Set<string>();
    for (const record of records) {
      const id = uploadId(record);
      if (tombstones.has(id)) continue;
      ids.add(id);
      const entry = entries.get(id);
      if (!entry) entries.set(id, { item: itemOf(record, true), record, version, body: null, kept: true });
      else if (entry.item.durable && entry.item.state !== 'uploading') {
        // Another tab may have sent more of it: carry on from where it stands.
        entry.record = record;
        entry.item.sent = record.confirmed;
        entry.item.fileId = record.fileId;
      }
    }
    const finished: Entry[] = [];
    for (const entry of entries.values()) {
      const { item, halted } = entry;
      // Kept on the device, gone from it, not sent here: another tab may have finished it.
      // One held back is being removed here: it is not done.
      if (item.durable && item.state === 'waiting' && !halted && !ids.has(item.id)) {
        finished.push(entry);
      }
    }
    // Its file, where this page knew the reserved id (one a block interrupted here and another tab finished).
    for (const entry of finished) {
      const { item, record } = entry;
      if (record.fileId === null) continue;
      try {
        // It stays on its way until this page knows the arrival, including while read-back waits or fails.
        const file = item.file ?? await drive.getUploaded(record.fileId);
        if (gen !== generation || entries.get(item.id) !== entry) return;
        item.file = file;
        item.sent = item.size;
        item.state = 'done';
        // Publish this arrival before another member's read-back can wait.
        notify();
      } catch (error) {
        console.error(error);
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
    const { item, record, version: captured } = entry;
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
    /** Another place is active: the fence refused a Drive call of this send. */
    let refused = false;
    // The refusal goes back as an abort, so the protocol never mistakes it for Drive's 409 (which it reads back).
    const fenced = new Proxy(drive, {
      get(target, key, receiver) {
        const value: unknown = Reflect.get(target, key, receiver);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]): unknown => {
          const out: unknown = Reflect.apply(value, target, args);
          if (!(out instanceof Promise)) return out;
          return out.catch((error: unknown) => {
            if (!isOpenElsewhere(error)) throw error;
            refused = true;
            throw new DOMException(OPEN_ELSEWHERE_TEXT, 'AbortError');
          });
        };
      },
    });
    /**
     * Never send under a reserved id the device has not kept: a reload would
     * reserve another and make a second file. If it cannot be kept, the kept
     * copy goes and this tab sends from memory; if that fails too, the try fails.
     */
    let version: number | null = null;
    const keepFileId = async (id: string): Promise<void> => {
      try {
        if (version === null) throw new Error('The upload forget version could not be read.');
        await store.save({ ...record, fileId: id }, version);
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
      if (!item.durable || gen !== generation || version === null) return;
      try {
        await store.save(record, version);
      } catch (error) {
        // expected: demote logs the details with console.error and tells the person once.
        demote(error);
      }
    };
    /**
     * Drive refused the create for good under the kept id (write-once lets it go): the device lets it go too, with its
     * session and confirmed bytes, so the next try reserves anew. Nothing was made under it.
     */
    const letFileIdGo = async (): Promise<void> => {
      record.fileId = null;
      record.session = null;
      record.confirmed = 0;
      item.fileId = null;
      await save();
    };
    /** Drive confirmed the file (its id and checksum checked): only now is it sent. */
    const finish = async (file: DriveFile): Promise<void> => {
      if (entry.kept) {
        // Drive has it: the bytes go, whichever start this was.
        await store.remove(record).catch((error: unknown) => console.error(error));
        bus?.post({ id: item.id, fileId: file.id });
      }
      item.state = 'done';
      item.file = file;
      item.sent = item.size;
      entry.body = null;
    };
    try {
      version = await captured;
      if (gen !== generation || controller.signal.aborted) return;
      if (version === null) demote(new Error('The upload forget version could not be read.'));
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
          // Drive may have made it before its reply was lost: then it is sent, and nothing is chosen again.
          const there = record.fileId === null ? null : await arrivedFile(fenced, { id: record.fileId, size: record.size, sha256: record.sha256 }, controller.signal);
          if (there !== null) {
            await finish(there);
            return;
          }
          console.error('A pending upload lost its bytes on this device');
          gone = 'lost';
          throw new BowerError('unknown', LOST_TEXT);
        }
        // Kept in memory while it is sent, so a storage failure on the way does not stop it.
        entry.body = body;
      }
      // The file's identity is reserved through write-once and kept on the device before anything is created.
      const file = await makeOnce(
        // The record is the intent kept with its id (TL-P4-24 addendum 16): its folder, name and bytes never change.
        heldAs(record.fileId, letFileIdGo),
        fenced,
        { parent: record.parentId, name: record.name },
        async (id) => {
          if (record.fileId === null) {
            if (item.durable && gen === generation) await keepFileId(id);
            record.fileId = id;
            item.fileId = id;
          }
          return sendResumable(
            fenced,
            { id, parentId: record.parentId, name: record.name, type: record.type, size: record.size, sha256: record.sha256, appProperties: record.appProperties, body, session: record.session },
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
        },
        undefined,
        controller.signal,
      );
      await finish(file);
    } catch (error) {
      item.state = 'waiting';
      if (refused || isOpenElsewhere(error)) {
        // Another place is active: not a failure. It waits, paused, for Use here (TL-P2-24).
        item.sent = record.confirmed;
        if (gen === generation) pauseNow();
      } else if (isAbort(error) || controller.signal.aborted) {
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
        if (s === null || paused) return;
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

  bus?.listen((completion) => {
    const s = scope;
    if (s === null) return;
    // Keep the reservation before read-back waits or Use here changes the generation.
    // A staged sibling may have been hydrated before its owner reserved this id.
    const entry = completion === undefined ? undefined : entries.get(completion.id);
    if (completion && entry && !tombstones.has(entry.item.id) && entry.record.fileId === null) {
      entry.record.fileId = completion.fileId;
      entry.item.fileId = completion.fileId;
    }
    if (paused) return;
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
    paused = false;
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

  /**
   * Blocked is not closed: stops sending and gives the lock back, but every upload not yet in Drive stays,
   * waiting, so the screens never see it fail. The next start for the same account and folder sends them
   * (what the device keeps is read again; one another tab finished meanwhile shows done).
   */
  function pauseNow(): void {
    if (scope === null) return;
    paused = true;
    generation += 1;
    sending?.controller.abort();
    sending = null;
    release?.();
    release = null;
    waiting?.abort();
    waiting = null;
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

  /**
   * A gone one, chosen again (D02): only the same bytes (size, then SHA-256,
   * which is part of its id) take its place. It keeps its record, so its
   * reserved file id and session: Drive never gets a second file. The bytes
   * are kept on the device again when they can be.
   */
  async function chosenAgain(entry: Entry, record: PendingUpload, body: Blob, gen: number, localVersion: number, version: number | null, stage: StagingUpload): Promise<QueueItem> {
    const { item } = entry;
    if (body.size !== record.size || (await sha256(body)) !== record.sha256) {
      console.error('Bytes chosen again differ from the pending upload');
      throw new BowerError('unknown', NOT_SENT_TEXT);
    }
    let durable = version !== null && await fits(record.size);
    if (durable && version !== null) {
      try {
        await keepBytes(record, body, localVersion, version, stage);
      } catch (error) {
        if (error instanceof UploadForgottenError) {
          console.error(error);
          throw new BowerError('unknown', stoppedText(record.appProperties[KIND_PROP]));
        }
        if (!isQuotaError(error)) console.error(error);
        durable = false;
      }
    }
    if (gen !== generation) {
      console.error('The upload queue stopped while a file was chosen again');
      throw new BowerError('unknown', stoppedText(record.appProperties[KIND_PROP]));
    }
    // Chosen twice at once: the first one already took its place.
    if (entries.get(item.id) !== entry || !item.gone) return { ...item };
    entry.version = Promise.resolve(version);
    entry.body = body;
    entry.kept = entry.kept || durable;
    item.durable = durable;
    if (durable) delete item.note;
    else item.note = KEEP_OPEN_TEXT;
    delete item.gone;
    delete item.error;
    item.state = 'waiting';
    item.sent = record.confirmed;
    notify();
    if (durable && role !== 'owner') bus?.post();
    void pump();
    return { ...item };
  }

  return {
    async start(account, folder) {
      if (scope?.account === account && scope.folder === folder && role !== 'idle') return role;
      const version = capture(account);
      // Paused for this account and folder: what waited only in this page's memory goes now; any other start drops it.
      const resuming = paused && scope?.account === account && scope.folder === folder;
      if (scope !== null && !resuming) stop();
      paused = false;
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
      for (const record of records) if (!tombstones.has(uploadId(record)) && !entries.has(uploadId(record))) entries.set(uploadId(record), { item: itemOf(record, true), record, version, body: null, kept: true });
      const got = await acquire(s, gen);
      if (gen !== generation) return 'idle';
      role = role === 'owner' ? role : got;
      notify();
      void pump();
      return role;
    },

    async add(input, suppliedVersion) {
      const s = scope;
      const gen = generation;
      const localVersion = s === null ? 0 : forgotten.get(s.account) ?? 0;
      if (s === null) {
        console.error('An upload was added before the queue started');
        throw new BowerError('unknown', NOT_SENT_TEXT);
      }
      return stageUpload(s.account, async (stage) => {
        const candidate: PendingUpload = {
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
        const id = uploadId(candidate);
        const known = entries.get(id);
        if (known && !known.item.gone) return { ...known.item };
        // Each admission has its own identity, even when two reselections overlap.
        const record = known ? { ...known.record, appProperties: { ...known.record.appProperties } } : candidate;
        const version = suppliedVersion === undefined ? await capture(record.account) : suppliedVersion;
        // Its bytes are gone from this device: the same file, chosen again, takes their place.
        if (known?.item.gone) return chosenAgain(known, record, input.body, gen, localVersion, version, stage);
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
        let durable = version !== null && await fits(record.size);
        if (durable && version !== null) {
          try {
            await keepBytes(record, input.body, localVersion, version, stage);
          } catch (error) {
            if (error instanceof UploadForgottenError) {
              console.error(error);
              throw new BowerError('unknown', stoppedText(input.appProperties?.[KIND_PROP]));
            }
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
        const entry: Entry = { item: itemOf(record, durable), record, version: Promise.resolve(version), body: input.body, kept: durable };
        entries.set(id, entry);
        notify();
        if (durable && role !== 'owner') bus?.post();
        void pump();
        return { ...entry.item };
      });
    },

    captureForgetVersion: (account) => store.captureForgetVersion({ account }),

    items: () => [...entries.values()].map((e) => ({ ...e.item })),
    role: () => role,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    hasUnfinished: () => pendingCount() > 0,
    pendingCount,

    retry(only, suppliedVersion) {
      const version = suppliedVersion === undefined ? (scope === null ? Promise.resolve(null) : capture(scope.account)) : Promise.resolve(suppliedVersion);
      for (const entry of entries.values()) {
        const { item } = entry;
        if (item.error === undefined || item.gone) continue;
        if (only === 'offline' && item.error.code !== 'offline') continue;
        entry.version = version;
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
      entry.version = capture(entry.record.account);
      entry.halted = false;
      notify();
      void pump();
    },

    async forgetAccount(account) {
      const pending = [...staging].filter((stage) => stage.account === account);
      forgotten.set(account, (forgotten.get(account) ?? 0) + 1);
      if (scope?.account === account) stop();
      const failures: unknown[] = [];
      try {
        await store.clear(account);
      } catch (error) {
        // expected: report and reject below, after every outstanding staging cleanup settles.
        failures.push(error);
      }
      await Promise.all(pending.map((stage) => stage.done));
      for (const stage of pending) if (stage.failure) failures.push(stage.failure.cause);
      if (failures.length > 0) {
        for (const error of failures) console.error(error);
        throw new BowerError('unknown', 'Signing out did not finish. Try again.');
      }
    },

    stop,
    notice: () => told,
    pause: () => pauseNow(),
    onlyHere: () => [...entries.values()].filter((e) => !e.item.durable && e.item.state !== 'done' && !e.item.gone).length,
    persistence: () => persisted,
  };
}
