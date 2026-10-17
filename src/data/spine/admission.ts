/**
 * What a tidy-up is admitted to take, fixed by the Worker when it admits the run (TL-P3-21): the items in the
 * inbox and your changes, each by id with the name, parents and modifiedTime read then, and each pile's
 * declaration. The run takes exactly that set, and what changed since waits for the next run.
 */
import type { DeclarationRef } from '../contracts/run-manifest';
import { PILE_NOTE } from '../piles';

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
  /**
   * An answer's run (TL-P4-08 addendum 8): the thing or pile its question is about. `piles` then holds only the pile
   * that holds it. Absent for a press of Tidy up.
   */
  subject?: string;
}

/**
 * The most a press may admit, as UTF-8 JSON: half a Durable Object row's 2 MB
 * (https://developers.cloudflare.com/durable-objects/platform/limits/), leaving room for the run's other columns.
 */
export const ADMISSION_MANIFEST_LIMIT = 1024 * 1024;

/** Why there is nothing to admit, worded as the worker contract's 409 `nothing`. */
export const NOTHING = {
  waiting: 'Nothing is waiting in the inbox.',
  new: 'There is nothing new for Bower to read.',
  ready: 'Nothing in the inbox is ready yet.',
} as const;

export type NothingCause = keyof typeof NOTHING;

export type Admission = { kind: 'nothing'; cause: NothingCause } | { kind: 'manifest'; manifest: AdmissionManifest };

/**
 * The things a run was admitted to take: every admitted file of every pile but a pile folder's notes (its words, not
 * a thing). Your changes are not things. This is the `total` the app shows ("Reading N things").
 */
export function admittedThings(m: AdmissionManifest): number {
  return m.piles.reduce((sum, p) => sum + p.items.filter((i) => !(p.anchor && i.name === PILE_NOTE)).length, 0);
}

/** Whether `value` is an admission manifest, as stored with the run and handed to the runner. */
export function isAdmissionManifest(value: unknown): value is AdmissionManifest {
  if (!object(value)) return false;
  return value.v === 1 && id(value.id) && id(value.rootId) && (value.scope === 'all' || value.scope === 'instructions')
    && typeof value.at === 'number' && Number.isSafeInteger(value.at) && value.at >= 0
    && Array.isArray(value.piles) && value.piles.every(pile) && Array.isArray(value.journal) && value.journal.every(file)
    && (value.subject === undefined || id(value.subject));
}

type JsonObject = Record<string, unknown>;
const object = (v: unknown): v is JsonObject => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const file = (v: unknown): boolean => object(v) && id(v.fileId) && typeof v.name === 'string'
  && Array.isArray(v.parents) && v.parents.every(id) && id(v.modifiedTime);
const declaration = (v: unknown): boolean => v === null || (object(v) && id(v.declarationId) && typeof v.sha256 === 'string' && /^[0-9a-f]{64}$/.test(v.sha256));
const pile = (v: unknown): boolean => object(v) && id(v.pileId) && (v.anchor === null || file(v.anchor)) && declaration(v.declaration)
  && Array.isArray(v.items) && v.items.every(file);
