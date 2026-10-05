/**
 * How a note lives as a Markdown file in the Bower folder (spec, "Who owns
 * what in a note"):
 *
 *   ---
 *   summary: one line          status, tags: [a, b], by: bower, original, bower_source
 *   <key>: <value>             one per property, in order; [[X]] links to X
 *   ---
 *   ## Current state           Bower's, read-only in the app
 *   - line
 *
 *   your body, verbatim
 *
 *   ## Timeline                Bower's
 *   - 2 Oct · text · [[source]]
 *
 *   ## Bower's note            Bower's
 *   text
 *
 * A file without frontmatter is a plain note of yours: all of it is body.
 */
import { BowerError, type Note, type Property, type SourceKind, type TimelineEntry } from '../types';
import { TASK_LINE } from '../tasks';

/** Frontmatter keys that are not properties. */
export const BOWER_KEYS = ['summary', 'status', 'tags', 'by', 'original', 'bower_source'] as const;

const LABELS: Record<string, string> = { next: 'Next due' };
const CURRENT = '## Current state';
const TIMELINE = '## Timeline';
const BOWER_NOTE = "## Bower's note";

export type ParsedNote = Omit<Note, 'backlinks'>;
export type NoteFile = Omit<Note, 'backlinks' | 'path' | 'title' | 'links'>;

const labelOf = (key: string): string => {
  const words = key.replace(/_/g, ' ');
  return LABELS[key] ?? words.charAt(0).toUpperCase() + words.slice(1);
};
const oneLine = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim();
const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
const trimLines = (s: string): string => s.replace(/^\n+|\n+$/g, '');

interface Parts {
  front: Map<string, string> | null;
  current: string[];
  /** Where the body starts and ends in the text. */
  bodyStart: number;
  bodyEnd: number;
  timeline: string;
  bowerNote: string | null;
}

function split(raw: string): Parts {
  const text = raw.replace(/\r\n/g, '\n');
  const none: Parts = { front: null, current: [], bodyStart: 0, bodyEnd: text.length, timeline: '', bowerNote: null };
  if (!text.startsWith('---\n')) return none;
  const close = text.indexOf('\n---', 3);
  if (close < 0) return none;
  const lineEnd = text.indexOf('\n', close + 1);
  const fmEnd = lineEnd < 0 ? text.length : lineEnd + 1;
  const front = new Map<string, string>();
  let listKey: string | null = null;
  const unquote = (v: string): string => (/^(["']).*\1$/.test(v) ? v.slice(1, -1) : v);
  for (const line of text.slice(4, close).split('\n')) {
    // A YAML block list, as Obsidian writes tags: "tags:" then "  - a" lines.
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      const prev = front.get(listKey) ?? '';
      front.set(listKey, prev ? `${prev}, ${unquote((item[1] ?? '').trim())}` : unquote((item[1] ?? '').trim()));
      continue;
    }
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    listKey = value ? null : key;
    front.set(key, unquote(value));
  }
  let at = fmEnd;
  while (text[at] === '\n') at++;
  const current: string[] = [];
  if (text.startsWith(`${CURRENT}\n`, at)) {
    at += CURRENT.length + 1;
    while (text.startsWith('- ', at)) {
      const end = text.indexOf('\n', at);
      current.push(text.slice(at + 2, end < 0 ? text.length : end));
      at = end < 0 ? text.length : end + 1;
    }
  }
  const bodyStart = at;
  let bodyEnd = text.length;
  let bowerNote: string | null = null;
  let timeline = '';
  const b = text.lastIndexOf(`\n${BOWER_NOTE}\n`);
  if (b >= bodyStart - 1) {
    bowerNote = trimLines(text.slice(b + BOWER_NOTE.length + 2));
    bodyEnd = b;
  }
  const t = text.lastIndexOf(`\n${TIMELINE}\n`, bodyEnd);
  if (t >= bodyStart - 1) {
    timeline = text.slice(t + TIMELINE.length + 2, bodyEnd);
    bodyEnd = t;
  }
  return { front, current, bodyStart, bodyEnd: Math.max(bodyStart, bodyEnd), timeline, bowerNote };
}

function timelineOf(block: string): TimelineEntry[] {
  return block
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => {
      const m = /^- (.*?) · (.*?)(?: · \[\[([^\]]+)\]\])?$/.exec(l);
      if (!m) return { date: '', text: l.slice(2) };
      return { date: m[1] ?? '', text: m[2] ?? '', ...(m[3] ? { source: m[3] } : {}) };
    });
}

function linksIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
    const target = (m[1] ?? '').trim();
    if (target && !out.includes(target)) out.push(target);
  }
  return out;
}

export function parseNote(path: string, raw: string): ParsedNote {
  const text = raw.replace(/\r\n/g, '\n');
  const p = split(text);
  const title = nameOf(path);
  const body = trimLines(text.slice(p.bodyStart, p.bodyEnd));
  if (!p.front) return { path, title, summary: '', properties: [], tags: [], currentState: [], body, timeline: [], links: linksIn(text), byBower: false };
  const f = p.front;
  const properties: Property[] = [];
  for (const [key, value] of f) {
    if ((BOWER_KEYS as readonly string[]).includes(key)) continue;
    const link = /^\[\[([^\]|]+)\]\]$/.exec(value)?.[1];
    properties.push(link ? { key, label: labelOf(key), value: link, link } : { key, label: labelOf(key), value });
  }
  const tags = (f.get('tags') ?? '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const source = f.get('bower_source');
  const src: SourceKind = source === 'web' || source === 'both' ? source : 'notes';
  const status = f.get('status');
  const original = f.get('original');
  return {
    path,
    title,
    summary: f.get('summary') ?? '',
    properties,
    ...(status ? { status } : {}),
    tags,
    currentState: p.current,
    body,
    timeline: timelineOf(p.timeline),
    ...(p.bowerNote !== null ? { bowerNote: { text: p.bowerNote, source: src } } : {}),
    links: linksIn(text),
    ...(original ? { original } : {}),
    byBower: f.get('by') === 'bower',
  };
}

export function serializeNote(n: NoteFile): string {
  const front: string[] = [];
  if (n.summary) front.push(`summary: ${oneLine(n.summary)}`);
  if (n.status) front.push(`status: ${oneLine(n.status)}`);
  if (n.tags.length) front.push(`tags: [${n.tags.map(oneLine).join(', ')}]`);
  if (n.byBower) front.push('by: bower');
  if (n.original) front.push(`original: ${oneLine(n.original)}`);
  if (n.bowerNote) front.push(`bower_source: ${n.bowerNote.source}`);
  for (const p of n.properties) front.push(`${p.key}: ${p.link ? `[[${p.link}]]` : oneLine(p.value)}`);
  const out = ['---', ...front, '---', ''];
  if (n.currentState.length) out.push(CURRENT, ...n.currentState.map((l) => `- ${oneLine(l)}`), '');
  if (n.body) out.push(n.body, '');
  if (n.timeline.length) out.push(TIMELINE, ...n.timeline.map((t) => `- ${t.date} · ${oneLine(t.text)}${t.source ? ` · [[${t.source}]]` : ''}`), '');
  if (n.bowerNote) out.push(BOWER_NOTE, n.bowerNote.text, '');
  return out.join('\n');
}

/** Ticks or unticks the n-th task of the body; Bower's sections are never touched. */
export function toggleTaskInText(raw: string, index: number): { text: string; label: string; done: boolean } {
  const text = raw.replace(/\r\n/g, '\n');
  const p = split(text);
  let i = -1;
  let at = p.bodyStart;
  for (const line of text.slice(p.bodyStart, p.bodyEnd).split('\n')) {
    const m = TASK_LINE.exec(line);
    if (m && ++i === index) {
      const label = m[4] ?? '';
      if (!label) break;
      const done = m[2] !== 'x';
      const checkbox = at + (m[1]?.length ?? 0);
      // Parser offsets count each CRLF as one character; map only this checkbox back to the original source.
      let rawAt = 0;
      for (let n = 0; n < checkbox; n++, rawAt++) {
        if (raw[rawAt] === '\r' && raw[rawAt + 1] === '\n') rawAt++;
      }
      return { text: raw.slice(0, rawAt) + (done ? 'x' : ' ') + raw.slice(rawAt + 1), label, done };
    }
    at += line.length + 1;
  }
  throw new BowerError('not-found', 'That line is no longer in the note.');
}
