/**
 * The one rule for "Bower wrote this note" (issue #744, spec §6.9
 * R-NOTE-1, D10, T11). The folder list, the note page, the quick look and
 * the counts all ask this function, so they can no longer disagree.
 * `by: bower` is the reliable mark; a note named after its own folder is
 * the folder's page (K-31, #922) unless it says `by: person`; the others
 * are fallbacks for notes written before it (a person's own note that uses `kind:` is a known,
 * accepted false positive, T11).
 */

import type { NoteMeta } from './note-meta.js';

/** What the rule reads of a file besides its frontmatter. */
export interface BowerWrittenFile {
  /** The note's text after the frontmatter, when it has been read. */
  body?: string | undefined;
  /** The note's path from the top of the Bower folder and its file name:
   * a note named after its own folder is that folder's page (K-31). */
  path?: string | undefined;
  name?: string | undefined;
}

/** Whether the frontmatter field `by` names the person (`by: person`, or
 * `by: you`): the one way a note named after its folder stays theirs. */
export function byPerson(fields: Readonly<Record<string, unknown>>): boolean {
  const by = fields.by;
  if (typeof by !== 'string') return false;
  const who = by.trim().toLowerCase();
  return who === 'person' || who === 'you';
}

/** Whether `file` is a note named after the folder it is in
 * (`Moonee Ponds/Moonee Ponds.md`). */
export function isNamedAfterFolder(file: {
  path?: string | undefined;
  name?: string | undefined;
}): boolean {
  if (file.path === undefined) return false;
  const parts = file.path.split('/');
  const name = file.name ?? parts[parts.length - 1] ?? '';
  const folder = parts[parts.length - 2];
  return folder !== undefined && folder !== '' && name === `${folder}.md`;
}

/** A body that opens with the `> [!bower]` callout (legacy notes). */
const BOWER_CALLOUT = /^\s*>\s*\[!bower\]/i;

/** Whether the frontmatter field `by` names Bower. */
function byBower(fields: Readonly<Record<string, unknown>>): boolean {
  const by = fields.by;
  return typeof by === 'string' && by.trim().toLowerCase() === 'bower';
}

/**
 * A note is Bower's when any of these holds: `by: bower`, `type: answer`,
 * a `kind`, an `original`, `bower_origins`, or its body starts with a
 * `[!bower]` callout. `meta` is `undefined` while the frontmatter has not
 * been read; only the body can tell then.
 */
export function isBowerWritten(
  meta: NoteMeta | undefined | null,
  file?: BowerWrittenFile,
): boolean {
  if (meta !== undefined && meta !== null) {
    if (byPerson(meta.fields)) return false;
    if (
      byBower(meta.fields) ||
      // K-31 on real data (#922): a note named after its own folder is the
      // folder's page, Bower's, even when an older rulebook wrote no `by:`.
      (file !== undefined && isNamedAfterFolder(file)) ||
      meta.type === 'answer' ||
      meta.kind !== undefined ||
      meta.original !== undefined ||
      Object.keys(meta.bowerOrigins).length > 0
    ) {
      return true;
    }
  }
  const body = file?.body;
  return body !== undefined && BOWER_CALLOUT.test(body);
}
