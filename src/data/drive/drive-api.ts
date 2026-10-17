/**
 * The narrow door to Google Drive. Everything the app does with the Bower
 * folder goes through these calls; `DriveHttp` speaks to Google and
 * `FakeDrive` keeps a Drive in memory for tests and the fake stack.
 * Every call rejects with a `BowerError`.
 */
import { BowerError, type ErrorCode } from '../types';
import type { Digest } from '../pile-readiness';
import { marked, UNCONFIRMED_WRITE, type FailureKind } from './transport';

export interface DriveFile {
  id: string;
  name: string;
  folder: boolean;
  parents: string[];
  /** RFC 3339, as Drive writes it. */
  modifiedTime: string;
  createdTime: string;
  size?: number;
  appProperties?: Record<string, string>;
  /** In the Bin: only a read that asks for a file there (`binned`), a listing of the Bin, or the answer to a Bin says so. */
  trashed?: true;
  /** SHA-256 of the content, hex; only from `ResumableDrive.getUploaded`, or a listing that asks for it. */
  sha256?: string;
  /**
   * MD5 of the stored content, hex, as Drive's `md5Checksum` gives it
   * (https://developers.google.com/workspace/drive/api/reference/rest/v3/files); only from a listing that asks for it.
   */
  md5Checksum?: string;
  /**
   * Drive keeps no checksum of its content, so no run can check its bytes without reading them: in the pretend
   * Drive, a big file reloaded with neither its bytes nor its hash. On Google Drive the same is a file listed with no
   * `sha256Checksum` or `size` (Docs Editors files, shortcuts); the P3 listing asks for those fields and sets it.
   */
  unchecked?: true;
}

export interface DrivePatch {
  name?: string;
  addParent?: string;
  removeParent?: string;
  appProperties?: Record<string, string | null>;
}

/** One account-feed entry, including removals with no file metadata. */
export interface DriveChange {
  fileId: string;
  removed: boolean;
  file?: DriveFile;
}

export interface DriveChangePage {
  changes: DriveChange[];
  nextPageToken?: string;
  newStartPageToken?: string;
}

export interface DriveChanges {
  changes: DriveChange[];
  newStartPageToken: string;
}

export interface DriveScope {
  inScopeIds: string[];
  outOfScopeIds: string[];
  needsFullListing: boolean;
}

/** A file in the Bin that carries a `bowerItem` key, with its stored size and SHA-256 when known. */
export interface BinnedItem {
  file: DriveFile;
  size: number | null;
  sha256: string | null;
}

/**
 * A write's still-as-seen fence (`contracts/still-as-seen.ts`), for the transport to run again right before it sends a
 * write to an existing file once more (a rate limit, a refreshed token): resolves while the file is as the caller read
 * it, throws the caller's own refusal otherwise (TL-P4-24 finding 1). Never run before the first send.
 */
export type Fence = () => Promise<void>;

/**
 * How a write to an existing file may be sent again. With `fence`, after an answer that says it did not land, once
 * the fence passes; with none, it is sent once, and that answer fails as `retry` for its caller's next try.
 */
export interface WriteOptions {
  fence?: Fence;
}

export interface DriveApi extends ResumableDrive {
  /** Every file and folder under `rootId`, at any depth, not in the Bin. */
  /** Every file under a root; with `checksums`, each content file's `sha256` and `size` (one Drive keeps none of is `unchecked`). */
  listAll(rootId: string, opts?: { checksums?: boolean }): Promise<DriveFile[]>;
  /** A file as Drive keeps it now; with `checksums`, its content's `md5Checksum` too; with `binned`, even in the Bin. */
  get(id: string, opts?: { checksums?: boolean; binned?: boolean }): Promise<DriveFile>;
  readText(id: string): Promise<string>;
  /** Available undecoded media bytes; each returned array is an independent copy. */
  readBytes(id: string): Promise<Uint8Array>;
  /** First 4,096 UTF-8 bytes, omitting an incomplete trailing character; null for folders and exports. */
  readPrefix(id: string): Promise<string | null>;
  /** Capture before the bootstrap listing; persistence belongs to the caller. */
  getStartPageToken(): Promise<string>;
  /** Drain every My Drive page, preserving order, repeated entries and unrelated changes. */
  listChanges(pageToken: string): Promise<DriveChanges>;
  /** Metadata only, including parents of a folder in the Bin. */
  parents(id: string): Promise<string[]>;
  /** Walk unknown live ids; above 50, report that the caller needs a bounded full listing. */
  resolveScope(rootId: string, unknownIds: readonly string[]): Promise<DriveScope>;
  /** With `id`, reserved by `generateIds`: a file with that id there already rejects `conflict` (Drive's 409). */
  createFolder(parentId: string, name: string, appProperties?: Record<string, string>, id?: string): Promise<DriveFile>;
  createText(parentId: string, name: string, text: string, appProperties?: Record<string, string>, id?: string): Promise<DriveFile>;
  /** Writes only if the file still has `ifModified`; otherwise rejects `conflict`. `appProperties` go in the same request. */
  writeText(id: string, text: string, ifModified: string, appProperties?: Record<string, string>, opts?: WriteOptions): Promise<DriveFile>;
  /** Renames, moves, or sets appProperties (a null value removes one). */
  update(id: string, patch: DrivePatch, opts?: WriteOptions): Promise<DriveFile>;
  /** To Drive's Bin; the app never deletes for good. */
  trash(id: string, appProperties?: Record<string, string>, opts?: WriteOptions): Promise<DriveFile>;
  /** Out of the Bin; with `name`, under that name in the same `files.update` (one write, so one stamp). */
  untrash(id: string, appProperties?: Record<string, string>, name?: string, opts?: WriteOptions): Promise<DriveFile>;
  /**
   * Files under `rootId` whose name or text has every word of `query` (Drive's `fullText contains`: whole words, any
   * order, case-insensitive), at most `SEARCH_MAX_PAGES` pages of `SEARCH_PAGE_SIZE` for each batch of `SEARCH_FOLDERS`
   * folders.
   */
  fullText(rootId: string, query: string): Promise<DriveFile[]>;
  /**
   * A file's size and SHA-256 from its stored content; null when they cannot be checked. `known` is the file's bytes
   * when the caller already holds them: a Drive that has to read the file then does not.
   */
  storedDigest(id: string, known?: Uint8Array): Promise<Digest | null>;
  /**
   * Bin entries under `rootId` whose `bowerItem` is one of `keys`, in one call: Drive's `files.list` with
   * `trashed = true` and an `appProperties has` for each key (https://developers.google.com/workspace/drive/api/guides/search-files).
   * A file in a folder that is itself in the Bin is trashed too (`files.list`, `trashed`), so its place is found by walking
   * up its folders; `beforeGet`, when given, is called before each such `files.get` and may throw to stop the look (the
   * Worker's subrequest grant).
   */
  binnedByItem(rootId: string, keys: readonly string[], beforeGet?: () => void): Promise<BinnedItem[]>;
}

/** `files.list` pageSize (https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list), the largest a page holds. */
export const SEARCH_PAGE_SIZE = 1000;
/** A search reads this many pages for each batch of `SEARCH_FOLDERS` folders; the rest of its hits are not read. */
export const SEARCH_MAX_PAGES = 2;
/** Item keys looked up in one Bin query (`binnedByItem`); each query reads at most `SEARCH_MAX_PAGES` pages. */
export const BIN_KEYS = 20;
export const SEARCH_FOLDERS = 40;

export const PREFIX_BYTES = 4096;

/** Streaming decode holds back an incomplete final UTF-8 character without adding a replacement character. */
export const decodePrefix = (bytes: Uint8Array): string =>
  new TextDecoder().decode(bytes.subarray(0, PREFIX_BYTES), { stream: true });

/** One ancestry walk for scope discovery and Bin lookups; share parent reads and stop cycles. */
export function ancestryLookup(
  inside: ReadonlySet<string>,
  readParents: (id: string) => Promise<string[]>,
  maxDepth = Infinity,
): (id: string) => Promise<boolean> {
  const kept = new Map<string, Promise<string[]>>();
  const below = async (id: string, seen: ReadonlySet<string>): Promise<boolean> => {
    if (inside.has(id)) return true;
    if (seen.size >= maxDepth || seen.has(id)) return false;
    let parents = kept.get(id);
    if (!parents) {
      parents = readParents(id).catch((e: unknown) => {
        // expected: a missing or unshared ancestor cannot establish membership; other failures stop the lookup.
        if (e instanceof BowerError && e.code === 'not-found') return [];
        throw e;
      });
      kept.set(id, parents);
    }
    const path = new Set(seen).add(id);
    return (await Promise.all((await parents).map((p) => below(p, path)))).some(Boolean);
  };
  return (id) => below(id, new Set());
}

export async function resolveDriveScope(
  rootId: string,
  unknownIds: readonly string[],
  readParents: (id: string) => Promise<string[]>,
): Promise<DriveScope> {
  const result: DriveScope = { inScopeIds: [], outOfScopeIds: [], needsFullListing: unknownIds.length > 50 };
  if (result.needsFullListing) return result;
  const below = ancestryLookup(new Set([rootId]), readParents);
  for (const id of unknownIds) (await below(id) ? result.inScopeIds : result.outOfScopeIds).push(id);
  return result;
}

/** No partial drain is returned as a completed feed; only the terminal page supplies the new cursor. */
export async function drainChanges(pageToken: string, read: (token: string) => Promise<DriveChangePage>): Promise<DriveChanges> {
  const changes: DriveChange[] = [];
  const seen = new Set<string>();
  for (;;) {
    if (!pageToken || seen.has(pageToken)) throw changesError('Missing or repeated changes page token');
    seen.add(pageToken);
    const page = await read(pageToken);
    changes.push(...page.changes);
    if (page.nextPageToken) {
      pageToken = page.nextPageToken;
    } else {
      if (!page.newStartPageToken) throw changesError('Changes drain has no terminal token');
      return { changes, newStartPageToken: page.newStartPageToken };
    }
  }
}

export function changesError(detail: string): BowerError {
  console.error(detail);
  return new BowerError('unknown', "Bower could not read Drive's changes.");
}

/** What a resumable upload creates: the reserved file id, where it goes and what it is. */
export interface ResumableTarget {
  /** Pre-generated with `generateIds`, kept before the first byte is sent. */
  id: string;
  parentId: string;
  name: string;
  /** The media type; empty sends `application/octet-stream`. */
  type: string;
  size: number;
  /** SHA-256 of the bytes, hex: a file read back must have the same content. */
  sha256?: string;
  appProperties?: Record<string, string>;
}

/** Where a resumable session stands after a chunk or a status question. */
export type SessionStatus =
  | { kind: 'done'; file: DriveFile }
  | { kind: 'partial'; confirmed: number }
  | { kind: 'expired' };

/**
 * Drive's resumable upload with a pre-generated file id (TL-P2-05), so a file
 * whose answer was lost is found again by its id and never created twice.
 * Creating with an id that already exists rejects with `conflict`.
 * Chunks other than the last are a multiple of `RESUMABLE_UNIT` bytes.
 */
export interface ResumableDrive {
  /** Ids reserved for files not created yet (`files.generateIds`). */
  generateIds(count: number, signal?: AbortSignal): Promise<string[]>;
  /** Opens a session that will create `target.id`; answers the session address. */
  openResumable(target: ResumableTarget): Promise<string>;
  /** Sends `chunk`, the bytes from `start` of a file of `size` bytes. */
  putChunk(session: string, start: number, chunk: Blob, size: number, signal?: AbortSignal): Promise<SessionStatus>;
  /** Asks how many bytes of a file of `size` bytes the session holds. */
  sessionStatus(session: string, size: number): Promise<SessionStatus>;
  /** A file with its content's SHA-256, to check one read back under a reserved id. */
  getUploaded(id: string, signal?: AbortSignal): Promise<DriveFile>;
}

/** Drive takes resumable chunks in multiples of 256 KiB, except the last. */
export const RESUMABLE_UNIT = 256 * 1024;

/** One short sentence per failure, the same for every Drive client. */
export const DRIVE_MESSAGES: Record<ErrorCode, string> = {
  auth: 'Sign in again to keep going.',
  offline: "You're offline. Try again when you're back.",
  'not-found': "That isn't in your Bower folder any more.",
  conflict: 'This note changed somewhere else. Open it again to see the new version.',
  unknown: "Google Drive didn't answer. Try again.",
  // A withdrawal refused (write-once's `withdraw`): the dock and the pile's box put "Not undone yet: " or "Not removed yet: " first.
  unreached: 'Bower could not reach Drive to check. Try again when you are back online.',
};

export const driveError = (code: ErrorCode): BowerError => new BowerError(code, DRIVE_MESSAGES[code]);

/** A write answered 5xx: it may have landed, so the sentence never invites a second one. Tell it by `isUnconfirmedWrite`. */
export const UNCONFIRMED_WRITE_MESSAGE = "Bower couldn't confirm that change. Refresh to check.";
export const unconfirmedWriteError = (): BowerError => new BowerError('unknown', UNCONFIRMED_WRITE_MESSAGE, undefined, { cause: UNCONFIRMED_WRITE });

/** Where the person has to act, what is in the way, by Drive's reason (`transport.ts`, kind `wait`). */
export const WAIT_MESSAGES: Readonly<Record<string, string>> = {
  storageQuotaExceeded: 'Your Google Drive is full.',
  dailyLimitExceeded: 'Google Drive is not taking more from Bower today.',
};

/** A `code` error marked with the kind its answer has in the transport's table; tell it by `failureKind`. */
export const driveFailure = (code: ErrorCode, kind: FailureKind, reasons: readonly string[] = []): BowerError =>
  new BowerError(code, (kind === 'wait' && reasons.map((r) => WAIT_MESSAGES[r]).find((m) => m !== undefined)) || DRIVE_MESSAGES[code], undefined, marked(kind));

/**
 * Every Drive method, read or write, in one place. The lease guard fences the writes (fail closed: a method
 * missing here is a type error) and the live wrapper skips its after-check for them.
 */
export const DRIVE_OPS = {
  listAll: 'read',
  get: 'read',
  readText: 'read',
  readBytes: 'read',
  readPrefix: 'read',
  getStartPageToken: 'read',
  listChanges: 'read',
  parents: 'read',
  resolveScope: 'read',
  fullText: 'read',
  binnedByItem: 'read',
  storedDigest: 'read',
  sessionStatus: 'read',
  getUploaded: 'read',
  generateIds: 'write', // reserves an id the upload keeps: a write, fenced like the rest
  createFolder: 'write',
  createText: 'write',
  writeText: 'write',
  update: 'write',
  trash: 'write',
  untrash: 'write',
  openResumable: 'write',
  putChunk: 'write',
} as const satisfies Record<keyof DriveApi, 'read' | 'write'>;

export const isDriveWrite = (key: PropertyKey): boolean => (DRIVE_OPS as Record<PropertyKey, string>)[key] !== 'read';

/** A method the table knows as a write. An unknown key is not one, but is not a read either (the after-check still runs). */
export const isKnownDriveWrite = (key: PropertyKey): boolean => (DRIVE_OPS as Record<PropertyKey, string>)[key] === 'write';

/** A write through a fence (the runner's, the fake's `fenced`), as the fault hook sees it. */
export type FencedCall =
  | { op: 'create-folder'; parentId: string; name: string; appProperties?: Record<string, string>; reserved?: string }
  | { op: 'create-text'; parentId: string; name: string; text: string; appProperties?: Record<string, string>; reserved?: string }
  | { op: 'update'; id: string; patch: DrivePatch }
  | { op: 'trash'; id: string; appProperties?: Record<string, string> }
  | { op: 'write-text'; id: string; text: string; ifModified: string; appProperties?: Record<string, string> };
/** `refuse`: no effect, as with no network; `lose-reply`: the change lands, then its answer is lost. */
export type FaultAction = 'pass' | 'refuse' | 'lose-reply';
export interface FaultHook {
  before?: (call: FencedCall) => FaultAction;
  /** Told after a fenced write changed the Drive. */
  applied?: (call: FencedCall) => void;
}
/**
 * The writes a run may make, each checked against what it read right before it is sent; the ids its creates carry
 * (`generateIds`) are a write too. A Bin's `appProperties` are a run's stamp on its effect.
 */
export type FencedDrive = Pick<DriveApi, 'generateIds' | 'createFolder' | 'createText' | 'update' | 'trash' | 'writeText'>;
/** What Drive stores for a file now, as evidence of an effect: metadata, Bin state, and the content's size and SHA-256. */
export interface StoredEvidence {
  file: DriveFile;
  trashed: boolean;
  content: { size: number; sha256: string } | null;
}

/**
 * The apply engine's port (`spine/engine.ts`, ports and adapters): what one run's operations read of a Drive besides
 * its fenced writes. `RunnerDrive` adapts Google Drive for the runner; `FakeRunDrive` adapts the pretend Drive for the
 * fake run service. What a write did is read from its own answer (`spine/write-once.ts`).
 */
export interface RunDrive {
  /** Where the evidence it gives comes from, as a checkpoint records it. */
  readonly provenance: 'fake-stored' | 'adapter-read';
  /** A file as it is now for a check, read from Drive; null when it is gone or in the Bin. */
  recheck(id: string): Promise<DriveFile | null>;
  /** What Drive stores for a file now, in the Bin or not; null when it is gone. */
  evidence(id: string): Promise<StoredEvidence | null>;
  readBytes(id: string): Promise<Uint8Array>;
  /** A folder's live children. */
  list(parentId: string): Promise<DriveFile[]>;
  /**
   * What the plan saw of a file an effect changes, as the fence must find it right before the send: its name and place
   * and, with `withTime`, its modifiedTime too (a content write, which carries it).
   */
  expectSeen(seen: { fileId: string; name: string; parents: string[]; folder: boolean; modifiedTime: string }, withTime?: boolean): void;
}
