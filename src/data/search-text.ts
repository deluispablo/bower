/**
 * What search reads in a note and how a hit is shown: every line a person
 * could look for (summary, Current state, body, properties, Timeline, tags
 * as #tag), and the matching line as plain text. Shared by every source.
 */
import type { Note } from './types';

export function searchLines(n: Pick<Note, 'summary' | 'currentState' | 'body' | 'properties' | 'timeline' | 'tags'>): string[] {
  return [
    n.summary,
    ...n.currentState,
    ...n.body.split('\n'),
    ...n.properties.map((p) => `${p.label}: ${p.value}`),
    ...n.timeline.map((t) => `${t.date}: ${t.text}`),
    ...(n.tags.length ? [n.tags.map((t) => `#${t}`).join(' ')] : []),
  ].filter((l) => l.trim());
}

/** A line of markdown as a person reads it: no links' brackets, task boxes, table pipes or list marks. */
export function plainSnippet(line: string): string {
  return line
    .replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_m, target: string, _a, alias: string | undefined) => alias ?? target)
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, '')
    .replace(/^\s*(#{1,6}|[-*+]|\d+[.)])\s+/, '')
    .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
    .replace(/\s*\|\s*/g, ', ')
    .replace(/\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g, (_m, b?: string, i?: string, c?: string) => b ?? i ?? c ?? '')
    .trim()
    .slice(0, 120);
}

/** Where a hit lives, as the result shows it. */
export function placeOf(folder: string): string {
  return folder.replaceAll('/', ' / ') || 'Your Bower folder';
}
