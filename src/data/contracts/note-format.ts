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

// Retain source bytes for an untouched parsed personal note, outside its display model.
const personalSources = new WeakMap<NoteFile, { raw: string; serialized: string }>();

const labelOf = (key: string): string => {
  const words = key.replace(/_/g, ' ');
  return LABELS[key] ?? words.charAt(0).toUpperCase() + words.slice(1);
};
const oneLine = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim();
const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
const trimLines = (s: string): string => s.replace(/^\n+|\n+$/g, '');
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** TL-P4-42 Q1: the existing bound counts untrimmed JavaScript string units. */
export function validSummary(value: string): boolean {
  return value.length <= 200 && value.trim().length > 0 && !/[\p{Cc}\p{Cs}\u2028\u2029]/u.test(value);
}

// YAML 1.2.2 §§5.7, 7.3.1–7.3.3 and 10.3.2; also quote YAML 1.1 implicit types.
const SUMMARY_ESCAPES: Readonly<Record<string, string>> = {
  '0': '\0', a: '\x07', b: '\b', t: '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b',
  ' ': ' ', '"': '"', '/': '/', '\\': '\\', '\t': '\t',
  N: '\u0085', _: '\u00a0', L: '\u2028', P: '\u2029',
};

/** Decode only summary; other frontmatter retains its existing lenient reader. */
function summaryOf(value: string): string {
  if (!/^(["']).*\1$/s.test(value)) return value;
  const inner = value.slice(1, -1);
  if (value[0] === "'") return inner.replace(/''/g, "'");
  return inner.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/g, (escape, code: string) => {
    if (/^[xuU][0-9a-fA-F]+$/.test(code)) {
      const point = Number.parseInt(code.slice(1), 16);
      return point <= 0x10ffff ? String.fromCodePoint(point) : escape;
    }
    // Keep unknown escapes verbatim, as the legacy reader did.
    return SUMMARY_ESCAPES[code] ?? escape;
  });
}

const SUMMARY_TYPES = [
  /^(?:~|null|true|false|y|yes|n|no|on|off)$/i,
  /^[-+]?(?:[0-9][0-9_]*(?:\.[0-9_]*)?|\.[0-9_]+)(?:[eE][-+]?[0-9]+)?$/,
  /^(?:[-+]?0(?:b[01_]+|o[0-7]+|x[0-9a-fA-F_]+)|[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
  /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+(?:\.[0-9_]*)?$/,
  // Dates are conservatively quoted too, for readers with the timestamp schema.
  /^\d{4}-\d{1,2}-\d{1,2}(?:[Tt]|[ \t]+)\d{1,2}:\d{1,2}:\d{1,2}(?:\.\d+)?(?:[ \t]*(?:Z|[-+][012]?\d(?::\d{2})?))?$/,
  /^\d{4}-\d{1,2}-\d{1,2}$/,
];

/** One physical line, without trimming or folding the summary's text. */
function summaryScalar(value: string): string {
  const quote = value !== value.trim() ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(value) || /:[ \t]|:$|[ \t]#|['"\\]/.test(value) ||
    /[\p{Cc}\p{Cs}\u2028\u2029\ufeff\ufffe\uffff]/u.test(value) || SUMMARY_TYPES.some((type) => type.test(value));
  // JSON escapes are YAML escapes; also escape characters YAML cannot keep literal.
  return quote ? JSON.stringify(value).replace(/[\u007f-\u009f\u2028\u2029\ufeff\ufffe\uffff]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`) : value;
}

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
    front.set(key, key === 'summary' ? summaryOf(value) : unquote(value));
  }
  return front;
}

export type IndexedFront = { summary: string; owner: 'bower' | 'person'; type: string | null };

/** Retrieval only: the closed front matter in the ordinary 4096-byte prefix, not edit authority. */
export function indexedFront(raw: string): IndexedFront {
  const prefix = new TextDecoder().decode(encoder.encode(raw).subarray(0, 4096)).replace(/\r\n/g, '\n');
  const close = prefix.startsWith('---\n') ? prefix.indexOf('\n---', 3) : -1;
  const front = close < 0 ? new Map<string, string>() : frontOf(prefix.slice(4, close));
  return { summary: front.get('summary') || '(no summary)',
    owner: front.get('by') === 'bower' ? 'bower' : 'person', type: front.get('type') ?? null };
}

/** The bullets of a Timeline block, each read by the one Timeline-line pattern. */
function timelineOf(block: string): TimelineEntry[] {
  return block
    .split('\n')
    .filter((l) => l.startsWith('- ') || l.startsWith('* '))
    .map((l) => {
      const m = parseTimelineLine(l);
      if (!m) return { date: '', text: l.slice(2) };
      return { date: m.date, text: m.text, ...(m.source ? { source: m.source } : {}) };
    });
}

/**
 * The `- ` and `* ` lines of a note's Timeline section as the one parser frames it (the last `## Timeline` of a legacy note,
 * the framed payload of a v2 one); none for a note without one or that cannot be read.
 */
export function timelineBullets(raw: string, fetched?: FetchedOwnership): string[] {
  const bytes = encoder.encode(raw);
  const own = fetched ? fetched.context.read(fetched.fileId, bytes) : parseOwnership(bytes);
  // This legacy extraction API reports framed/legacy Timelines, not sections in plain prose.
  if (own.status === 'invalid' || own.status === 'plain' || !own.layout.timeline) return [];
  return payloadDisplay(bytes, own.layout.timeline, TIMELINE).split('\n').filter((l) => l.startsWith('- ') || l.startsWith('* '));
}

/**
 * The entries of a note's Timeline section as the one parser frames it, for every kind of note: a plain note's too,
 * which its display shows as part of its body instead (`parseNote`). The author's re-parse invariant reads this.
 */
export function timelineEntries(raw: string): TimelineEntry[] {
  const { bytes, ownership } = ownershipOf(raw);
  return ownership.layout.timeline ? timelineOf(payloadDisplay(bytes, ownership.layout.timeline, TIMELINE)) : [];
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
  if (!front) return retainPersonalSource({ path, title, summary: '', properties: [], tags: [], currentState: [], body, timeline: [], links: linksIn(text), byBower: false }, raw);
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
  return retainPersonalSource({
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
  }, raw);
}

function retainPersonalSource(note: ParsedNote, raw: string): ParsedNote {
  if (!note.byBower) personalSources.set(note, { raw, serialized: serializeNote(note) });
  return note;
}

export function serializeNote(n: NoteFile): string {
  const front: string[] = [];
  if (n.summary) front.push(`summary: ${summaryScalar(n.summary)}`);
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
  const serialized = out.join('\n');
  const source = personalSources.get(n);
  return source?.serialized === serialized ? source.raw : serialized;
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
