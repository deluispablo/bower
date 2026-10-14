/**
 * The one home of a Timeline line (TL-P4-14 stage 3, `c3-note-sections`): `- <date> · <text>` (or `* `) plus ` · [[<source>]]`
 * when there is a source. Only this file spells the pattern that reads one or the template that writes one; an ESLint
 * rule (scripts/eslint-timeline-line.mjs) keeps it so.
 */
export interface TimelineLineParts { readonly date: string; readonly text: string; readonly source: string | null }
export type TimelineMarker = '- ' | '* ';

const LINE = /^[-*] ([^\r\n]*?) · ([^\r\n]*?)(?: · \[\[([^\]\r\n]+)\]\])?$/;

/** Split off only the one canonical end citation; other links remain in the text. */
export function splitCitation(text: string): { text: string; citation: string } {
  const match = / \(also from \[\[([^[\]|#^\r\n]+)\]\]\)$/.exec(text);
  return match && match[1]?.trim() ? { text: text.slice(0, match.index), citation: match[0] } : { text, citation: '' };
}

/** A marker's plain wording, with at most one additional source link. */
export function markerText(marker: 'contradiction' | 'uncertain' | 'inferred', text: string, alsoFrom?: string | null): string {
  if (marker !== 'contradiction' && marker !== 'uncertain' && marker !== 'inferred') throw new Error('Unknown Timeline marker');
  if (marker === 'contradiction' && !alsoFrom) throw new Error('A contradiction needs another source');
  const citation = alsoFrom == null ? '' : ` (also from [[${alsoFrom.replace(/\.md$/i, '')}]])`;
  if (alsoFrom != null && (!splitCitation(citation).citation || /[\u2028\u2029]/.test(alsoFrom))) throw new Error('Unlinkable Timeline source');
  const words = text.trim();
  return (marker === 'inferred' ? `${words} (inferred)` : `${marker === 'contradiction' ? 'Contradiction' : 'Uncertain'}: ${words}`) + citation;
}

/** The parts of a Timeline line, or null when the bullet is not in the shape Bower writes. */
export function parseTimelineLine(line: string): TimelineLineParts | null {
  const m = LINE.exec(line);
  return m ? { date: m[1] ?? '', text: m[2] ?? '', source: m[3] ?? null } : null;
}

/** One Timeline line, as Bower writes it (no line ending). */
export const timelineLine = (entry: { readonly date: string; readonly text: string; readonly source?: string | null; readonly marker?: TimelineMarker }): string =>
  `${entry.marker ?? '- '}${entry.date} · ${entry.text}${entry.source ? ` · [[${entry.source}]]` : ''}`;
