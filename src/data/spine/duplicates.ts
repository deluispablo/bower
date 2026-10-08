/**
 * Things already saved (TL-P4-10 addendum 2, `duplicate-by-hash`): a thing in the inbox whose stored content equals a
 * file already filed in the folder is not filed again. It goes to the Drive Bin, its report row says "already saved as
 * <name>", and it gets no note and no Timeline line, as the local second brain does with a byte-identical duplicate
 * (TL-P4-08 method). Two things of one run with the same content keep one, and the other goes to the Bin after it.
 *
 * Decided here, from the listing alone, never by the model, which is not shown them: Drive keeps an MD5 of every
 * file's stored bytes (`md5Checksum`, https://developers.google.com/workspace/drive/api/reference/rest/v3/files) and
 * gives it in the listing the run already reads (`fields`), so no file is read for it. Comparing a stored content
 * hash is the usual way to find exact duplicates (as `fdupes` and `rmlint` do once sizes match; Drive's own guide to
 * the field: https://developers.google.com/workspace/drive/api/guides/fields-parameter).
 *
 * Never a duplicate: a file with no `md5Checksum` (a Google Doc, Sheet or Slides file has none), an empty file (every
 * empty file has the same MD5), a saved link (its note is made and reused by its own key), a pile's note, and anything
 * in the Bin (the listing leaves it out). Only a file filed in a folder outside the inbox and Bower's own files counts as saved (not Rules.md
 * or another file at the top of the folder).
 */
import type { Checkpoint } from '../contracts/run-checkpoint';
import type { OperationV2, SeenFile } from '../contracts/run-manifest';
import { EMPTY_MD5 } from '../contracts/hashes';
import type { DriveFile } from '../drive/drive-api';
import { PILE_NOTE } from '../piles';
import { SYSTEM } from '../vault/layout';
import type { VaultIndex } from '../vault/vault-index';
import type { RunManifest } from './records';


/** What a thing is a copy of: a file already filed (by its listing entry), or another thing of the same run. */
export type Duplicate = { of: 'filed'; file: DriveFile } | { of: 'run'; keptId: string };

/** Whether a listed file's content may be compared at all. */
function comparable(f: DriveFile): f is DriveFile & { md5Checksum: string } {
  if (f.folder || !f.md5Checksum || f.md5Checksum === EMPTY_MD5 || f.name === PILE_NOTE) return false;
  return f.appProperties?.kind !== 'link' && !/\.url$/i.test(f.name);
}

const byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The run's things that are copies, by file id. `things` are the file ids the run took; the first of them by when it
 * was added (then by id) is kept when several share content and none is filed. The same listing and things give the
 * same answer, so the provider (which hides them from the model) and the plan (which bins them) agree.
 */
export function duplicatesOf(listing: readonly DriveFile[], ix: VaultIndex, things: Iterable<string>): Map<string, Duplicate> {
  const taken = new Set(things);
  const filed = new Map<string, DriveFile>();
  const saved = listing
    .filter((f) => comparable(f) && !taken.has(f.id))
    .map((f) => ({ f, path: ix.pathOf(f.id) }))
    .filter((x): x is { f: DriveFile & { md5Checksum: string }; path: string } => x.path !== undefined && x.path.includes('/') && !x.path.startsWith('Inbox/') && !x.path.startsWith(`${SYSTEM.dir}/`))
    .sort((a, b) => byCode(a.path, b.path));
  for (const { f } of saved) if (!filed.has(f.md5Checksum)) filed.set(f.md5Checksum, f);
  const run = listing
    .filter((f): f is DriveFile & { md5Checksum: string } => taken.has(f.id) && comparable(f))
    .sort((a, b) => byCode(a.createdTime, b.createdTime) || byCode(a.id, b.id));
  const kept = new Map<string, string>();
  const out = new Map<string, Duplicate>();
  for (const f of run) {
    const there = filed.get(f.md5Checksum);
    if (there) {
      out.set(f.id, { of: 'filed', file: there });
      continue;
    }
    const first = kept.get(f.md5Checksum);
    if (first === undefined) kept.set(f.md5Checksum, f.id);
    else out.set(f.id, { of: 'run', keptId: first });
  }
  return out;
}

/**
 * The file a planned Bin of a thing already saved stands on (review P4-17 I1), as it must be found right before the
 * send: a captured file of the folder by the name its row says it is saved as (its id, name and place as the plan saw
 * them), or the thing of this run it copies, where that thing's applied move put it. Empty for any other operation.
 * The Bin is sent only while one of them is still there, in that place, with the copy's very content.
 */
export function savedTwins(manifest: RunManifest, op: OperationV2, head: Checkpoint): SeenFile[] {
  const e = op.effect;
  if (e.kind !== 'bin') return [];
  const members = new Set(manifest.capture.members.map((m) => m.file.fileId));
  if (!members.has(e.before.fileId)) return [];
  const [after] = op.dependsOn;
  if (after !== undefined) {
    const done = head.outcomes.find((o) => o.operationId === after);
    return done?.state === 'applied' ? [done.evidence.file] : [];
  }
  const as = manifest.reportPlan.find((c) => c.when === 'applied' && c.requires.includes(op.operationId))?.value.alreadySaved?.[0]?.as;
  return manifest.capture.places.flatMap((p) => (!p.file.folder && p.file.name === as && !members.has(p.file.fileId) ? [p.file] : []));
}
