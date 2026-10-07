/**
 * The spine's shared plan (TL-P3-21, ARCHITECTURE "Reusable deterministic core"): what a tidy-up takes of the
 * inbox, decided once from what Drive holds, over a small read interface, with time and ids handed in. The
 * fake runner and the Worker both call it.
 */
import type { BinnedItem, DriveFile } from '../drive/drive-api';
import type { Digest } from '../pile-readiness';
import type { Admission, AdmissionScope } from './admission';

/** What the plan reads: metadata, Bower's own control files, and stored digests. */
export interface SpineRead {
  /** Every file and folder under `rootId`, not in the Bin. */
  listAll(rootId: string): Promise<DriveFile[]>;
  readBytes(id: string): Promise<Uint8Array>;
  readText(id: string): Promise<string>;
  /** A file's stored size and SHA-256, from metadata; null when Drive keeps none. */
  digest(file: DriveFile): Promise<Digest | null>;
  binnedByItem?(rootId: string, keys: readonly string[]): Promise<BinnedItem[]>;
}

export interface AdmissionOptions {
  scope: AdmissionScope;
  clock: () => number;
  newId: () => string;
}

/** What a run would be admitted to take now, or why there is nothing. */
export async function planAdmission(read: SpineRead, rootId: string, opts: AdmissionOptions): Promise<Admission> {
  void read;
  void rootId;
  void opts;
  throw new Error('not implemented');
}
