/**
 * The one home of a Timeline line (TL-P4-14 stage 3, `c3-note-sections`): `- <date> · <text>` (or `* `) plus ` · [[<source>]]`
 * when there is a source. Only this file spells the pattern that reads one or the template that writes one; an ESLint
 * rule (scripts/eslint-timeline-line.mjs) keeps it so.
 */
export interface TimelineLineParts { readonly date: string; readonly text: string; readonly source: string | null }
export type TimelineMarker = '- ' | '* ';

const LINE = /^[-*] (.*?) · (.*?)(?: · \[\[([^\]]+)\]\])?$/;

/** The parts of a Timeline line, or null when the bullet is not in the shape Bower writes. */
export function parseTimelineLine(line: string): TimelineLineParts | null {
  const m = LINE.exec(line);
  return m ? { date: m[1] ?? '', text: m[2] ?? '', source: m[3] ?? null } : null;
}

/** One Timeline line, as Bower writes it (no line ending). */
export const timelineLine = (entry: { readonly date: string; readonly text: string; readonly source?: string | null; readonly marker?: TimelineMarker }): string =>
  `${entry.marker ?? '- '}${entry.date} · ${entry.text}${entry.source ? ` · [[${entry.source}]]` : ''}`;
