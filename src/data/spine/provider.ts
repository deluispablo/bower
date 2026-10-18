/**
 * The one provider interface (TL-P3-22 addendum): what a run plans from the admitted set it took. The runner takes
 * exactly what the Worker admitted, each item read again (`runner/src/spine/admitted.ts`); what changed since waits
 * with its whole pile. A provider is handed what is still as admitted and gives the run's manifest, fixed before
 * any effect. The scripted provider (`scripted.ts`) is the fake's planning with no model; a model provider comes in P4.
 */
import type { AdmissionManifest } from './admission';
import type { RunManifest } from './records';

export interface Deferred {
  fileId: string;
  /** The pile it belongs to; null for one of your changes. */
  pileId: string | null;
  /** `pile`: unchanged, but it waits with its pile. `budget`: unchanged, it did not fit this run's estimate (c12-admit). */
  why: 'gone' | 'changed' | 'pile' | 'budget';
}

/** The admitted set a run took. */
export interface Admitted {
  /** The manifest with only what is still as admitted. */
  taken: AdmissionManifest;
  deferred: Deferred[];
  /** Things the estimate left for the next run; absent when none. */
  waiting?: number;
}

/** Plans a new run from what it took. The same folder and admitted set give the same plan. */
export type RunProvider = (took: Admitted) => Promise<RunManifest>;
