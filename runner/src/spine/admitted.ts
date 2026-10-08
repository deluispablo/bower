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
import { READ_AHEAD, limiter } from '../../../src/data/spine/read';
import type { Admitted, Deferred } from '../../../src/data/spine/provider';
import type { RunManifest } from '../../../src/data/spine/records';
import { SYSTEM } from '../../../src/data/vault/layout';

export type { Admitted, Deferred };

/** What the runner reads to check an item: its metadata now. */
export interface AdmittedReader {
  get(id: string): Promise<DriveFile>;
}

/** Your rules' note: edited only by `rules-wording` (and a link rewrite), as the manifest contract's `rules-path` rule. */
const RULES_PATH = 'Rules.md';

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

/**
 * Every admitted item is read again together, at most `READ_AHEAD` (8) at a time (Drive v3 allows concurrent reads, within
 * its per-user rate: https://developers.google.com/workspace/drive/api/guides/limits), then judged in the order of the
 * manifest, so the result is the one a read at a time gives.
 */
export async function takeAdmitted(manifest: AdmissionManifest, drive: AdmittedReader): Promise<Admitted> {
  const limit = limiter(READ_AHEAD);
  // One list in the order a read at a time goes through them: each pile's anchor and items, then the journal lines.
  const asked: Array<{ seen: AdmittedFile; version: boolean }> = [];
  for (const pile of manifest.piles) {
    if (pile.anchor) asked.push({ seen: pile.anchor, version: false });
    for (const item of pile.items) asked.push({ seen: item, version: true });
  }
  for (const line of manifest.journal) asked.push({ seen: line, version: true });
  const answers = await Promise.all(asked.map((a) => limit(() => standing(drive, a.seen, a.version))));
  let next = 0;
  const deferred: Deferred[] = [];
  const piles: AdmittedPile[] = [];
  for (const pile of manifest.piles) {
    const moved: Deferred[] = [];
    if (pile.anchor) {
      const why = answers[next++];
      if (why) moved.push({ fileId: pile.anchor.fileId, pileId: pile.pileId, why });
    }
    for (const item of pile.items) {
      const why = answers[next++];
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
    const why = answers[next++];
    if (why) deferred.push({ fileId: line.fileId, pileId: null, why });
    else journal.push(line);
  }
  if (deferred.length) console.error(`${deferred.length} admitted items changed since admission; they wait for the next tidy-up`);
  return { taken: { ...manifest, piles, journal }, deferred };
}

/**
 * Why a plan reaches past what the run took; null when it does not (TL-P4-01 P4-2, the P4-1 review's I2). Checked on
 * every plan the Claude provider hands over, built by the runner from the model's intent, before any write:
 *
 * - a move's subject is a thing, a pile folder or one of your changes the run took; any other move only sets
 *   Bower's "new" mark in place: cleared from last run's things, or set again on a note the plan edits;
 * - a Bin's subject is a pile folder or a pile's note the run took (a pile of words, once its note is written), or a
 *   thing it took that is already saved (`duplicates.ts`, planned by the runner, never named by the model); or the
 *   other note of two the person said yes to keeping as one (`kept`, the paths the checked intent names), as captured;
 * - a runner-JSON write's subject is one of Bower's own files in `.bower`;
 * - a note edit carries only what the runner authors from your changes and its fixed hub list (`applyChanges`): a
 *   Timeline line or a link rewrite on a note, and on `Rules.md` your typed rules (`rules-wording`) or a link
 *   rewrite, never a Timeline line. That is how the rule-wording and hub-line exceptions stay inside the contract:
 *   the model never names them, the runner plans them as the scripted provider does.
 *
 * Creates make new things in places the plan captured, so they take nothing. A plan that breaks any of this is
 * refused whole, before any write.
 */
/** `own` is the id of Bower's own folder (`.bower`) in the run's folder, as the run listed it. */
export function outsideAdmitted(m: RunManifest, took: Admitted, own: string | undefined, kept: ReadonlySet<string> = new Set()): string | null {
  const t = took.taken;
  // A note kept as one with another goes to the Bin only as the run captured it, by the path the intent named.
  const keptOther = (fileId: string): boolean => m.capture.places.some((p) => p.file.fileId === fileId && !p.file.folder && p.path.endsWith('.md') && kept.has(p.path));
  const anchors = new Set(t.piles.flatMap((p) => (p.anchor ? [p.anchor.fileId] : [])));
  const taken = new Set([...anchors, ...t.piles.flatMap((p) => p.items.map((i) => i.fileId)), ...t.journal.map((j) => j.fileId)]);
  const edited = new Set(m.operations.flatMap((o) => (o.effect.kind === 'edit-text' ? [o.effect.before.fileId] : [])));
  const runnerFiles = new Set<string>([SYSTEM.questions, SYSTEM.suggestions, SYSTEM.requests, SYSTEM.lastRun, SYSTEM.hashes]);
  for (const { effect: e } of m.operations) {
    switch (e.kind) {
      case 'move': {
        // Not a thing it took: only Bower's "new" mark, in place, cleared from last run's things or set on a note it edits.
        const inPlace = e.name === e.before.name && 'fileId' in e.parent && sameParents([e.parent.fileId], e.before.parents);
        const mark = Object.keys(e.properties).join() === 'bowerNew' && (e.properties.bowerNew === null || edited.has(e.before.fileId));
        if (!taken.has(e.before.fileId) && !(inPlace && mark)) return 'a move of a thing it was not admitted to take';
        break;
      }
      case 'bin':
        if (!taken.has(e.before.fileId) && !keptOther(e.before.fileId)) return 'a Bin of a thing it was not admitted to take';
        break;
      case 'write-runner-json':
        if (own === undefined || !sameParents([own], e.before.parents) || !runnerFiles.has(`${SYSTEM.dir}/${e.before.name}`)) return "a write to a file that is not Bower's own";
        break;
      case 'edit-text': {
        const kinds = new Set(e.changes.map((c) => c.kind));
        const rules = e.path === RULES_PATH;
        if (rules ? kinds.has('timeline-append') || kinds.has('state-rewrite') : kinds.has('rules-wording')) return 'a note edit outside what the runner authors';
        break;
      }
      case 'create-folder':
      case 'create-text':
        break;
    }
  }
  return null;
}
