/**
 * Inert stub of the persistent upload queue, so tests load and fail by their
 * assertions before the queue lands (upload-queue-persistent). Its types and
 * the approved sentences are final; it keeps and sends nothing.
 */
import type { DriveFile } from './drive/drive-api';
import type { ResumableClient } from './drive/resumable-upload';
import type { BowerError } from './types';
import type { UploadStore } from './upload-store';

/** The largest file the queue copies onto the device. */
export const DURABLE_MAX_BYTES = 200 * 1024 * 1024;

/** What a file with no copy on the device says. */
export const KEEP_OPEN_TEXT = "This device couldn't keep a copy. Keep Bower open until everything is sent.";

/** Said when the browser refuses to keep this device's storage for good. */
export const PERSIST_REFUSED_TEXT = 'This browser may clear what Bower keeps here. Keep Bower open until everything is sent.';

/** Something could not be sent, for a reason the person can only retry. */
export const NOT_SENT_TEXT = "This couldn't be sent. Try again.";

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
  return undefined;
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

/** `QuotaExceededError` as browsers throw it from IndexedDB (stub: never). */
export function isQuotaError(_error: unknown): boolean {
  return false;
}

/** A queue that keeps and sends nothing (stub). */
export function createUploadQueue(_deps: UploadQueueDeps): UploadQueue {
  return {
    start: async () => 'idle',
    add: async (input) => ({
      id: '',
      declarationId: input.declarationId,
      memberKey: input.memberKey,
      sha256: input.sha256,
      pileId: input.pileId,
      parentId: input.parentId,
      name: input.name,
      size: input.body.size,
      sent: 0,
      durable: false,
      state: 'waiting',
      reserved: null,
      appProperties: { ...input.appProperties },
      addedAt: '',
    }),
    items: () => [],
    role: () => 'idle',
    subscribe: () => () => undefined,
    hasUnfinished: () => false,
    retry: () => undefined,
    idle: async () => undefined,
    discard: async () => undefined,
    halt: async () => null,
    resume: () => undefined,
    forgetAccount: async () => undefined,
    stop: () => undefined,
    notice: () => null,
    persistence: () => 'unknown',
  };
}
