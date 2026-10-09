import type { Note, UpdatedRow } from '@/data/types';

/**
 * The Timeline lines a tidy-up wrote into a note, by the report's rows (TL-P4-19 addenda 3 to 5). A row names the
 * operation that wrote it, its line's ordinal among the `lines` that op wrote, and the note as the run left it: its
 * write stamp and its checksum, the two things write-once compares to tell its own write (`holds`, `confirms`). While
 * the note read carries both, nobody has changed it since, so the op's lines are its last `lines` Timeline lines and
 * the ordinal picks one. Once the person edits it the mark is dropped, never moved; the report row stays. A row is
 * never matched by its words; one with no line (a Current state, a note kept as one), or from an older report, marks none.
 */
export function newLineIndexes(note: { timeline: readonly unknown[]; file?: Note['file'] }, rows: readonly UpdatedRow[]): ReadonlySet<number> {
  const marked = new Set<number>();
  for (const row of rows) {
    if (row.line === undefined || row.lines === undefined || row.stamp === undefined || row.md5 === undefined) continue;
    if (note.file?.stamp !== row.stamp || note.file.md5 !== row.md5) continue;
    const at = note.timeline.length - row.lines + row.line;
    if (row.line < row.lines && at >= 0) marked.add(at);
  }
  return marked;
}
