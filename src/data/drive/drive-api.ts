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

/** One short sentence per failure, the same for every Drive client. */
export const DRIVE_MESSAGES: Record<ErrorCode, string> = {
  auth: 'Sign in again to keep going.',
  offline: "You're offline. Try again when you're back.",
  'not-found': "That isn't in your Bower folder any more.",
  conflict: 'This note changed somewhere else. Open it again to see the new version.',
  unknown: "Google Drive didn't answer. Try again.",
};

export const driveError = (code: ErrorCode): BowerError => new BowerError(code, DRIVE_MESSAGES[code]);
