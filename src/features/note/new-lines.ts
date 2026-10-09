import type { UpdatedRow } from '@/data/types';

/**
 * The Timeline lines a tidy-up wrote into a note, by the report's rows (TL-P4-19 addendum 3): each row names the
 * operation that wrote it and its line, counted from the end of the Timeline, where the edit appended it. A row is
 * never matched by its words. A row with no line of its own (a Current state brought up to date, a note kept as one),
 * or from a report before rows named their op, marks none.
 */
export function newLineIndexes(timeline: readonly unknown[], rows: readonly UpdatedRow[]): ReadonlySet<number> {
  const marked = new Set<number>();
  for (const row of rows) {
    if (row.op === undefined || row.line === undefined) continue;
    const at = timeline.length - 1 - row.line;
    if (at >= 0) marked.add(at);
  }
  return marked;
}
