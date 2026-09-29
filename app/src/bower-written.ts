/**
 * The one rule for "Bower wrote this note" (issue #744, spec §6.9
 * R-NOTE-1, D10, T11). The folder list, the note page, the quick look and
 * the counts all ask this function, so they can no longer disagree.
 * `by: bower` is the reliable mark; the others are fallbacks for notes
 * written before it (a person's own note that uses `kind:` is a known,
 * accepted false positive, T11).
 */

import type { NoteMeta } from './note-meta.js';

/** What the rule reads of a file besides its frontmatter. */
export interface BowerWrittenFile {
  /** The note's text after the frontmatter, when it has been read. */
  body?: string | undefined;
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
    if (
      byBower(meta.fields) ||
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
