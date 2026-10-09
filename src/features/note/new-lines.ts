/**
 * The Timeline lines a tidy-up wrote into a note, by the report's rows (c3-planner-split): each row is one line its
 * edit appended at the end of the Timeline, so a row marks that one line, the last unclaimed one with its words. An
 * earlier line with the same words is not the row's, and a row with no line of its own (a Current state brought up to
 * date, a note kept as one) marks none.
 */
export function newLineIndexes(timeline: readonly { text: string }[], rows: readonly string[]): ReadonlySet<number> {
  const marked = new Set<number>();
  for (const what of rows) {
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i]?.text !== what || marked.has(i)) continue;
      marked.add(i);
      break;
    }
  }
  return marked;
}
