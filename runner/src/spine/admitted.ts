/**
 * The runner takes exactly the set the Worker admitted (TL-P3-21): each admitted item is read again, and one
 * that changed since admission waits for the next run. That is never a failure.
 */
import type { DriveFile } from '../../../src/data/drive/drive-api';
import type { AdmissionManifest, AdmittedFile } from '../../../src/data/spine/admission';

/** What the runner reads to check an item: its metadata now (the runner's adapter notes what it read). */
export interface AdmittedReader {
  get(id: string): Promise<DriveFile>;
}

export interface Deferred {
  fileId: string;
  pileId: string | null;
  why: 'gone' | 'changed';
}

export interface Admitted {
  /** The manifest with only what is still as admitted. */
  taken: AdmissionManifest;
  deferred: Deferred[];
}

export async function takeAdmitted(manifest: AdmissionManifest, drive: AdmittedReader): Promise<Admitted> {
  void manifest;
  void drive;
  throw new Error('not implemented');
}

export type { AdmittedFile };
