/**
 * The runner takes exactly the set the Worker admitted (TL-P3-21; worker contract: "A run takes the piles in
 * the inbox when it starts"): each admitted item is read again through the runner's adapter, which keeps what
 * it read for the still-as-seen check before each write. An item that changed since admission (its name, its
 * parents or its modifiedTime), or is gone, waits for the next run with its whole pile, so a pile is never
 * taken in part. That is never a failure: the deferred items are listed in the result.
 *
 * A pile folder is compared by name and parents only: its own modifiedTime is not a version of what is in it
 * (as `still-as-seen.ts` treats a create's folder).
 */
import { BowerError } from '../../../src/data/types';
import type { DriveFile } from '../../../src/data/drive/drive-api';
import type { AdmissionManifest, AdmittedFile, AdmittedPile } from '../../../src/data/spine/admission';

/** What the runner reads to check an item: its metadata now. */
export interface AdmittedReader {
  get(id: string): Promise<DriveFile>;
}

export interface Deferred {
  fileId: string;
  /** The pile it belongs to; null for one of your changes. */
  pileId: string | null;
  /** `pile`: unchanged, but it waits with its pile. */
  why: 'gone' | 'changed' | 'pile';
}

export interface Admitted {
  /** The manifest with only what is still as admitted. */
  taken: AdmissionManifest;
  deferred: Deferred[];
}

const sameParents = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((p) => b.includes(p));

/** How a file stands against what admission read: null while it is still so. */
async function standing(drive: AdmittedReader, seen: AdmittedFile, version: boolean): Promise<'gone' | 'changed' | null> {
  let now: DriveFile;
  try {
    now = await drive.get(seen.fileId);
  } catch (e) {
    // Gone, or in the Bin: it waits. Any other failure (signed out, offline) stops the run as before.
    if (e instanceof BowerError && e.code === 'not-found') return 'gone';
    throw e;
  }
  if (now.id !== seen.fileId || now.name !== seen.name || !sameParents(now.parents, seen.parents)) return 'changed';
  return version && now.modifiedTime !== seen.modifiedTime ? 'changed' : null;
}

export async function takeAdmitted(manifest: AdmissionManifest, drive: AdmittedReader): Promise<Admitted> {
  const deferred: Deferred[] = [];
  const piles: AdmittedPile[] = [];
  for (const pile of manifest.piles) {
    const moved: Deferred[] = [];
    if (pile.anchor) {
      const why = await standing(drive, pile.anchor, false);
      if (why) moved.push({ fileId: pile.anchor.fileId, pileId: pile.pileId, why });
    }
    for (const item of pile.items) {
      const why = await standing(drive, item, true);
      if (why) moved.push({ fileId: item.fileId, pileId: pile.pileId, why });
    }
    if (!moved.length) {
      piles.push(pile);
      continue;
    }
    // The pile waits whole: its other items wait with it.
    const named = new Set(moved.map((d) => d.fileId));
    deferred.push(...moved, ...pile.items.filter((i) => !named.has(i.fileId)).map((i) => ({ fileId: i.fileId, pileId: pile.pileId, why: 'pile' as const })));
  }
  const journal: AdmittedFile[] = [];
  for (const line of manifest.journal) {
    const why = await standing(drive, line, true);
    if (why) deferred.push({ fileId: line.fileId, pileId: null, why });
    else journal.push(line);
  }
  if (deferred.length) console.error(`${deferred.length} admitted items changed since admission; they wait for the next tidy-up`);
  return { taken: { ...manifest, piles, journal }, deferred };
}
