/**
 * What a tidy-up is admitted to take, fixed by the Worker when it admits the run (TL-P3-21): the items in the
 * inbox and your changes, each by id with the name, parents and modifiedTime read then, and each pile's
 * declaration. The run takes exactly that set, and what changed since waits for the next run.
 */
import type { DeclarationRef } from '../contracts/run-manifest';

export type AdmissionScope = 'all' | 'instructions';

/** A file as admission read it. */
export interface AdmittedFile {
  fileId: string;
  name: string;
  parents: string[];
  modifiedTime: string;
}

export interface AdmittedPile {
  pileId: string;
  /** The pile's folder; null for a loose thing in the inbox. */
  anchor: AdmittedFile | null;
  declaration: DeclarationRef | null;
  items: AdmittedFile[];
}

export interface AdmissionManifest {
  v: 1;
  id: string;
  rootId: string;
  scope: AdmissionScope;
  /** When it was read (epoch ms). */
  at: number;
  piles: AdmittedPile[];
  /** Your changes the run reads: `.bower/changes` files with a record Bower can read. */
  journal: AdmittedFile[];
}

/** Why there is nothing to admit, worded as the worker contract's 409 `nothing`. */
export const NOTHING = {
  waiting: 'Nothing is waiting in the inbox.',
  new: 'There is nothing new for Bower to read.',
  ready: 'Nothing in the inbox is ready yet.',
} as const;

export type NothingCause = keyof typeof NOTHING;

export type Admission = { kind: 'nothing'; cause: NothingCause } | { kind: 'manifest'; manifest: AdmissionManifest };

/** Whether `value` is an admission manifest, as stored with the run and handed to the runner. */
export function isAdmissionManifest(value: unknown): value is AdmissionManifest {
  void value;
  throw new Error('not implemented');
}
