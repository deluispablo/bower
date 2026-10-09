/**
 * How a note lives as a Markdown file in the Bower folder (spec, "Who owns
 * what in a note"):
 *
 *   ---
 *   summary: one line          status, tags: [a, b], by: bower, original, bower_source, bower_state
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
import { BowerError, type Note, type Property, type SourceKind, type TimelineEntry } from './types';
import { timelineLine, parseTimelineLine } from './timeline-line';
import { parseOwnership, togglePersonalTask, type ByteSpan, type FetchedOwnership } from './ownership-format';

/** Frontmatter keys that are not properties. */
export const BOWER_KEYS = ['summary', 'status', 'tags', 'by', 'original', 'bower_source', 'bower_state'] as const;

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
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** The two refusals of a note Bower will not parse: a format it does not know yet, or a damaged one. */
export const NOTE_REFUSED = { newer: 'This note uses an unsupported format.', damaged: 'This note cannot be read safely.' } as const;

/** Why Bower refused a note, on the refusal's `cause`: the typed marker code tells a refusal by. */
export interface NoteRefusedCause {
  kind: 'note-refused';
  refusal: keyof typeof NOTE_REFUSED;
  /** The ownership check's reason, for the console. */
  reason: string;
}

const refusedCause = (cause: unknown): cause is NoteRefusedCause =>
  typeof cause === 'object' && cause !== null && (cause as { kind?: unknown }).kind === 'note-refused';

/**
 * Which refusal an error is, by its typed `cause` (MDN, Error: cause), or null when it is not a refusal to
 * parse a note (a Drive read failure, say). Its words are never matched.
 */
export function noteRefusal(e: unknown): keyof typeof NOTE_REFUSED | null {
  return e instanceof BowerError && refusedCause(e.cause) ? e.cause.refusal : null;
}

/** A refusal to parse a note, logged by whoever catches it, once. */
function ownershipError(reason: string): BowerError {
  const refusal = reason === 'unsupported-version' ? 'newer' : 'damaged';
  const cause: NoteRefusedCause = { kind: 'note-refused', refusal, reason };
  return new BowerError('unknown', NOTE_REFUSED[refusal], undefined, { cause });
}

function ownershipOf(raw: string, fetched?: FetchedOwnership) {
  // This validates the available string, not the original fetched byte encoding.
  const bytes = encoder.encode(raw);
  const ownership = fetched ? fetched.context.read(fetched.fileId, bytes) : parseOwnership(bytes);
  if (ownership.status === 'invalid') throw ownershipError(ownership.reason);
  // Do not silently replace unpaired surrogates when editing a declared v2 note.
  if (ownership.status === 'v2' && decoder.decode(bytes) !== raw) throw ownershipError('text-cannot-round-trip');
  return { bytes, ownership };
}

/** Display only; these normalized strings never supply mutation offsets. */
function payloadDisplay(bytes: Uint8Array, span: ByteSpan, heading?: string): string {
  const text = trimLines(decoder.decode(bytes.subarray(span.start, span.end)).replace(/\r\n/g, '\n'));
  if (heading && text === heading) return '';
  return heading && text.startsWith(`${heading}\n`) ? trimLines(text.slice(heading.length + 1)) : text;
}

/** The properties between the fences: `key: value` lines, and the YAML block lists Obsidian writes for tags. */
function frontOf(block: string): Map<string, string> {
  const front = new Map<string, string>();
  let listKey: string | null = null;
  const unquote = (v: string): string => (/^(["']).*\1$/.test(v) ? v.slice(1, -1) : v);
  for (const line of block.split('\n')) {
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
  return front;
}

/** The bullets of a Timeline block, each read by the one Timeline-line pattern. */
function timelineOf(block: string): TimelineEntry[] {
  return block
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => {
      const m = parseTimelineLine(l);
      if (!m) return { date: '', text: l.slice(2) };
      return { date: m.date, text: m.text, ...(m.source ? { source: m.source } : {}) };
    });
}

/**
 * The `- ` lines of a note's Timeline section as the one parser frames it (the last `## Timeline` of a legacy note,
 * the framed payload of a v2 one); none for a note without one or that cannot be read.
 */
export function timelineBullets(raw: string, fetched?: FetchedOwnership): string[] {
  const bytes = encoder.encode(raw);
  const own = fetched ? fetched.context.read(fetched.fileId, bytes) : parseOwnership(bytes);
  if (own.status === 'invalid' || !own.layout.timeline) return [];
  return payloadDisplay(bytes, own.layout.timeline, TIMELINE).split('\n').filter((l) => l.startsWith('- '));
}

function linksIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
    const target = (m[1] ?? '').trim();
    if (target && !out.includes(target)) out.push(target);
  }
  return out;
}

export function parseNote(path: string, raw: string, fetched?: FetchedOwnership): ParsedNote {
  const { bytes, ownership } = ownershipOf(raw, fetched);
  const text = raw.replace(/\r\n/g, '\n');
  const title = nameOf(path);
  const { layout } = ownership;
  const body = payloadDisplay(bytes, ownership.personal);
  const front = layout.front ? frontOf(payloadDisplay(bytes, layout.front)) : null;
  const sectionOf = (span: ByteSpan | null, heading: string): string | null => (span ? payloadDisplay(bytes, span, heading) : null);
  const current = (sectionOf(layout.current, CURRENT) ?? '').split('\n').filter(Boolean).map((line) => line.startsWith('- ') ? line.slice(2) : line);
  const timeline = sectionOf(layout.timeline, TIMELINE) ?? '';
  // A v2 note with nothing in Bower's note has none; a legacy heading with nothing under it keeps an empty one.
  const note = sectionOf(layout.bowerNote, BOWER_NOTE);
  const bowerNote = ownership.status === 'v2' ? note || null : note;
  front?.delete('bower_format');
  if (!front) return { path, title, summary: '', properties: [], tags: [], currentState: [], body, timeline: [], links: linksIn(text), byBower: false };
  const f = front;
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
    currentState: current,
    body,
    timeline: timelineOf(timeline),
    ...(bowerNote !== null ? { bowerNote: { text: bowerNote, source: src } } : {}),
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
  if (n.timeline.length) out.push(TIMELINE, ...n.timeline.map((t) => timelineLine({ ...t, text: oneLine(t.text) })), '');
  if (n.bowerNote) out.push(BOWER_NOTE, n.bowerNote.text, '');
  return out.join('\n');
}

/** Ticks or unticks the n-th task of the body; Bower's sections are never touched. */
export function toggleTaskInText(raw: string, index: number): { text: string; label: string; done: boolean } {
  const { bytes, ownership } = ownershipOf(raw);
  const task = ownership.tasks.find((candidate) => candidate.index === index);
  if (!task) throw new BowerError('not-found', 'That line is no longer in the note.');
  const result = togglePersonalTask(bytes, { index, label: task.label, previousDone: task.done, done: !task.done });
  if (result.kind === 'refused') throw ownershipError(result.reason);
  return { text: decoder.decode(result.bytes), label: result.label, done: result.done };
}
