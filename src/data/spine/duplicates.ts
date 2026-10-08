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
 * in the Bin (the listing leaves it out). Only a file filed outside the inbox and Bower's own files counts as saved.
 */
import type { DriveFile } from '../drive/drive-api';
import { PILE_NOTE } from '../piles';
import { SYSTEM } from '../vault/layout';
import type { VaultIndex } from '../vault/vault-index';

/** The MD5 of no bytes at all: every empty file has it, so it never says two files are the same. */
export const EMPTY_MD5 = 'd41d8cd98f00b204e9800998ecf8427e';

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
    .filter((x): x is { f: DriveFile & { md5Checksum: string }; path: string } => x.path !== undefined && !x.path.startsWith('Inbox/') && !x.path.startsWith(`${SYSTEM.dir}/`))
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
