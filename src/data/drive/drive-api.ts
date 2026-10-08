/**
 * The narrow door to Google Drive. Everything the app does with the Bower
 * folder goes through these calls; `DriveHttp` speaks to Google and
 * `FakeDrive` keeps a Drive in memory for tests and the fake stack.
 * Every call rejects with a `BowerError`.
 */
import { BowerError, type ErrorCode } from '../types';

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
  /** SHA-256 of the content, hex; only from `ResumableDrive.getUploaded`, or a listing that asks for it. */
  sha256?: string;
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

/** A file in the Bin that carries a `bowerItem` key, with its stored size and SHA-256 when known. */
export interface BinnedItem {
  file: DriveFile;
  size: number | null;
  sha256: string | null;
}

/**
 * Optional, feature-detected: Bin entries under `rootId` whose `bowerItem` is
 * one of `keys`, in one call. The pretend Drive has it; P3 equivalent: one
 * Drive query `trashed = true` with an appProperties OR over the keys,
 * bounded and paginated.
 */
export interface BinLookup {
  binnedByItem(rootId: string, keys: readonly string[]): Promise<BinnedItem[]>;
}

export function hasBinLookup(drive: object): drive is BinLookup {
  return typeof (drive as { binnedByItem?: unknown }).binnedByItem === 'function';
}

export interface DriveApi {
  /** Every file and folder under `rootId`, at any depth, not in the Bin. */
  listAll(rootId: string): Promise<DriveFile[]>;
  get(id: string): Promise<DriveFile>;
  readText(id: string): Promise<string>;
  /** Available undecoded media bytes; each returned array is an independent copy. */
  readBytes(id: string): Promise<Uint8Array>;
  createFolder(parentId: string, name: string, appProperties?: Record<string, string>): Promise<DriveFile>;
  createText(parentId: string, name: string, text: string, appProperties?: Record<string, string>): Promise<DriveFile>;
  upload(parentId: string, name: string, body: Blob, onProgress?: (fraction: number) => void, appProperties?: Record<string, string>): Promise<DriveFile>;
  /** Writes only if the file still has `ifModified`; otherwise rejects `conflict`. */
  writeText(id: string, text: string, ifModified: string): Promise<DriveFile>;
  /** Renames, moves, or sets appProperties (a null value removes one). */
  update(id: string, patch: DrivePatch): Promise<DriveFile>;
  /** To Drive's Bin; the app never deletes for good. */
  trash(id: string): Promise<void>;
  untrash(id: string): Promise<DriveFile>;
  /** Files under `rootId` whose name or text contains `query`. */
  fullText(rootId: string, query: string): Promise<DriveFile[]>;
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
  generateIds(count: number): Promise<string[]>;
  /** Opens a session that will create `target.id`; answers the session address. */
  openResumable(target: ResumableTarget): Promise<string>;
  /** Sends `chunk`, the bytes from `start` of a file of `size` bytes. */
  putChunk(session: string, start: number, chunk: Blob, size: number, signal?: AbortSignal): Promise<SessionStatus>;
  /** Asks how many bytes of a file of `size` bytes the session holds. */
  sessionStatus(session: string, size: number): Promise<SessionStatus>;
  /** A file with its content's SHA-256, to check one read back under a reserved id. */
  getUploaded(id: string): Promise<DriveFile>;
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
};

export const driveError = (code: ErrorCode): BowerError => new BowerError(code, DRIVE_MESSAGES[code]);
