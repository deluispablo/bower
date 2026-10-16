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

/**
 * The cells of one table row, the app's one table reader (GFM tables extension): outer pipes dropped, split on
 * unescaped `|`, `\|` read as `|`, each cell trimmed, empty cells kept in place.
 */
export function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** A line of markdown as a person reads it: no links' brackets, task boxes, table pipes or list marks. Search matches this, not the markdown. */
export function plainText(line: string): string {
  const table = /^\s*\|/.test(line);
  if (table) line = tableCells(line).filter(Boolean).join(', ');
  line = line
    .replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_m, target: string, _a, alias: string | undefined) => alias ?? target)
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, '')
    .replace(/^\s*(#{1,6}|[-*+]|\d+[.)])\s+/, '');
  // A table row's pipes are already its cell breaks; any left are literal.
  if (!table) line = line.replace(/^\s*\|\s*|\s*\|\s*$/g, '').replace(/\s*\|\s*/g, ', ');
  return line.replace(/\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g, (_m, b?: string, i?: string, c?: string) => b ?? i ?? c ?? '').trim();
}

/** A matching line, already plain text, short enough to show under a result. */
export function plainSnippet(line: string): string {
  return line.slice(0, 120);
}

/** Where a hit lives, as the result shows it. */
export function placeOf(folder: string): string {
  return folder.replaceAll('/', ' / ') || 'Your Bower folder';
}

/** The web address in a saved link file (`[InternetShortcut]` then `URL=…`), whole; only http and https. */
export function savedLinkUrl(text: string): string | null {
  const url = /^URL=(\S+)/m.exec(text)?.[1];
  return url && /^https?:\/\//i.test(url) ? url : null;
}

/**
 * A saved link's name from its address: the site, then the words of its path
 * ("saved-page.example, article 42"), without the query or the scheme.
 */
export function linkTitle(url: string): string {
  const bare = url.replace(/^https?:\/\//i, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  const [host = '', ...path] = bare.split('/');
  const words = path.join(' ').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return words ? `${host}, ${words}` : host;
}

/** The same address as a person reads it: no scheme. */
export function savedLinkAddress(text: string): string | null {
  return savedLinkUrl(text)?.replace(/^https?:\/\//i, '').replace(/\/$/, '') ?? null;
}
