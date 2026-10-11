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
import { BowerError, type Note, type Property, type SourceKind, type TimelineEntry, type TypeRow, type TypeTable } from './types';
import { timelineLine, parseTimelineLine } from './timeline-line';
import { ABOUT_REGIONS, fenceAfter, parseOwnership, togglePersonalTask, type ByteSpan, type Fence, type FetchedOwnership } from './ownership-format';
import { NOTE_TEMPLATES, type NoteTemplate } from './note-templates';
import { TASK_LINE } from './tasks';

/** Frontmatter keys that are not properties. */
export const BOWER_KEYS = ['summary', 'status', 'tags', 'by', 'original', 'bower_source', 'bower_state', 'bower_template'] as const;

const LABELS: Record<string, string> = { next: 'Next due' };
const CURRENT = '## Current state';
const TIMELINE = '## Timeline';
const BOWER_NOTE = "## Bower's note";

export type ParsedNote = Omit<Note, 'backlinks'>;
export type NoteFile = Omit<Note, 'backlinks' | 'path' | 'title' | 'links'> & { template?: NoteTemplate };

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
const SCALAR_ESCAPES: Readonly<Record<string, string>> = {
  '0': '\0', a: '\x07', b: '\b', t: '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b',
  ' ': ' ', '"': '"', '/': '/', '\\': '\\', '\t': '\t',
  N: '\u0085', _: '\u00a0', L: '\u2028', P: '\u2029',
};

/** Decode the quoted scalars the one writer emits; preserve unknown legacy escapes. */
function scalarOf(value: string): string {
  if (!/^(["']).*\1$/s.test(value)) return value;
  const inner = value.slice(1, -1);
  if (value[0] === "'") return inner.replace(/''/g, "'");
  return inner.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/g, (escape, code: string) => {
    if (/^[xuU][0-9a-fA-F]+$/.test(code)) {
      const point = Number.parseInt(code.slice(1), 16);
      return point <= 0x10ffff ? String.fromCodePoint(point) : escape;
    }
    // Keep unknown escapes verbatim, as the legacy reader did.
    return SCALAR_ESCAPES[code] ?? escape;
  });
}

/** Flow and collected block lists split only at commas outside quoted items. */
function scalarList(value: string): string[] {
  const text = value.trim().replace(/^\[|\]$/g, '');
  const items: string[] = [];
  let quote = '';
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (quote) {
      if (quote === '"' && character === '\\') i++;
      else if (character === quote) {
        if (quote === "'" && text[i + 1] === "'") i++;
        else quote = '';
      }
    } else if ((character === '"' || character === "'") && !text.slice(start, i).trim()) quote = character;
    else if (character === ',') {
      items.push(text.slice(start, i));
      start = i + 1;
    }
  }
  items.push(text.slice(start));
  return items.map((item) => item.trim()).filter(Boolean).map(scalarOf);
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

type DisplayTask = { region: 'personal'; index: number } | { region: 'bower' };

/** Project display positions back to the fetched region's task identity, never to another region's index. */
function templateProjection(bytes: Uint8Array, ownership: ReturnType<typeof ownershipOf>['ownership'], front: Map<string, string> | null):
  { kind: NoteTemplate; body: string; tasks: DisplayTask[] } | null {
  const template = front?.get('bower_template');
  if (ownership.status !== 'v2' || front?.get('by') !== 'bower' || !template || !Object.hasOwn(NOTE_TEMPLATES, template)) return null;
  const kind = template as NoteTemplate;
  const { layout } = ownership;
  const hidden = kind !== 'source' ? layout.bowerNote : null;
  const content = hidden
    ? decoder.decode(bytes.subarray(layout.frontEnd, hidden.start)) + decoder.decode(bytes.subarray(hidden.end))
    : decoder.decode(bytes.subarray(layout.frontEnd));
  const bySection = new Map<string, DisplayTask[]>();
  const personal = new Map(ownership.tasks.map((task) => [task.checkboxByte, task.index]));
  const sections = templateSections(content, kind, true, (section, line, offset) => {
    const match = TASK_LINE.exec(line);
    if (!match) return;
    let byte = layout.frontEnd + offset + encoder.encode(match[1]).length;
    if (hidden && byte >= hidden.start) byte += hidden.end - hidden.start;
    const index = personal.get(byte);
    const tasks = bySection.get(section) ?? [];
    tasks.push(index === undefined ? { region: 'bower' } : { region: 'personal', index });
    bySection.set(section, tasks);
  });
  const headings = NOTE_TEMPLATES[kind].sections.filter((heading) => heading !== 'Current state' && heading !== 'Timeline');
  const body = [trimLines(sections.get('') ?? ''), ...headings
    .map((heading) => `## ${heading}\n${trimLines(sections.get(heading) ?? '')}`)].filter(Boolean).join('\n\n');
  return { kind, body, tasks: ['', ...headings].flatMap((heading) => bySection.get(heading) ?? []) };
}

/** The properties between the fences: `key: value` lines, and the YAML block lists Obsidian writes for tags. */
function frontOf(block: string): Map<string, string> {
  const front = new Map<string, string>();
  let listKey: string | null = null;
  for (const line of block.split('\n')) {
    // A YAML block list, as Obsidian writes tags: "tags:" then "  - a" lines.
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      const prev = front.get(listKey) ?? '';
      const raw = (item[1] ?? '').trim();
      const value = listKey === 'tags' ? raw : scalarOf(raw);
      front.set(listKey, prev ? `${prev}, ${value}` : value);
      continue;
    }
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    listKey = value ? null : key;
    front.set(key, key === 'tags' ? value : scalarOf(value));
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
  let body = payloadDisplay(bytes, ownership.personal);
  const front = layout.front ? frontOf(payloadDisplay(bytes, layout.front)) : null;
  const sectionOf = (span: ByteSpan | null, heading: string): string | null => (span ? payloadDisplay(bytes, span, heading) : null);
  let current = (sectionOf(layout.current, CURRENT) ?? '').split('\n').filter(Boolean).map((line) => line.startsWith('- ') ? line.slice(2) : line);
  const timeline = sectionOf(layout.timeline, TIMELINE) ?? '';
  // A v2 note with nothing in Bower's note has none; a legacy heading with nothing under it keeps an empty one.
  const note = sectionOf(layout.bowerNote, BOWER_NOTE);
  let bowerNote = ownership.status === 'v2' ? note || null : note;
  const learned = ABOUT_REGIONS.flatMap((region) => {
    const span = ownership.payloads?.[region];
    return span ? [payloadDisplay(bytes, span)] : [];
  });
  if (learned.length) bowerNote = [bowerNote, '## What Bower has learned', ...learned].filter(Boolean).join('\n\n');
  const projection = templateProjection(bytes, ownership, front);
  if (projection) {
    body = projection.body;
    if (projection.kind === 'source') {
      current = [];
      bowerNote = null;
    }
  }
  front?.delete('bower_format');
  if (!front) return retainPersonalSource({ path, title, summary: '', properties: [], tags: [], currentState: [], body, timeline: [],
    ...(bowerNote !== null ? { bowerNote: { text: bowerNote, source: 'notes' as const } } : {}),
    links: linksIn(text), byBower: false }, raw);
  const f = front;
  const properties: Property[] = [];
  for (const [key, value] of f) {
    if ((BOWER_KEYS as readonly string[]).includes(key)) continue;
    const link = /^\[\[([^\]|]+)\]\]$/.exec(value)?.[1];
    properties.push(link ? { key, label: labelOf(key), value: link, link } : { key, label: labelOf(key), value });
  }
  const tags = scalarList(f.get('tags') ?? '');
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
    ...(projection ? { taskRegions: projection.tasks.map((task) => task.region) } : {}),
    timeline: timelineOf(timeline),
    ...(bowerNote !== null ? { bowerNote: { text: bowerNote, source: src } } : {}),
    links: linksIn(text),
    ...(original ? { original } : {}),
    byBower: f.get('by') === 'bower',
  }, raw, f.get('bower_template'));
}

function retainPersonalSource(note: ParsedNote, raw: string, template?: string): ParsedNote {
  if (!note.byBower || template && Object.hasOwn(NOTE_TEMPLATES, template)) personalSources.set(note, { raw, serialized: serializeNote(note) });
  return note;
}

export function serializeNote(n: NoteFile): string {
  if (n.template) {
    const property = (key: string): Property | undefined => n.properties.find((p) => p.key === key);
    const related = property('related');
    const relatedText = related?.link ? `[[${related.link}]]` : related?.value ?? '';
    const links = linksIn(relatedText);
    // Creation is strict for every caller; stored notes without template intent retain their legacy path.
    if (!n.byBower || !Object.hasOwn(NOTE_TEMPLATES, n.template) || !validSummary(n.summary)
      || n.tags.length > 3 || n.tags.some((tag) => !validSummary(tag))
      || new Set(n.properties.map((p) => p.key)).size !== n.properties.length
      || n.properties.some((p) => !/^[a-z][a-z0-9_]*$/.test(p.key) || p.key === 'bower_format'
        || (BOWER_KEYS as readonly string[]).includes(p.key))
      || (property('type') !== undefined && property('type')?.value !== n.template)
      || !dateOk(property('created')?.value ?? '') || !dateOk(property('updated')?.value ?? '')
      || !validSummary(property('source')?.link ?? property('source')?.value ?? '')
      || !links.length || links.length > 5 || links.length !== [...relatedText.matchAll(/\[\[([^\]|]+)\]\]/g)].length
      || !/^\[\[[^\]|\r\n]+\]\](?:,\s*\[\[[^\]|\r\n]+\]\])*$/.test(relatedText)
      || (n.status !== undefined && !validSummary(n.status))
      || (n.template === 'source' && !validSummary(n.original ?? ''))) {
      throw new BowerError('unknown', 'Bower could not write this note safely.');
    }
  }
  const front: string[] = [];
  if (n.summary) front.push(`summary: ${summaryScalar(n.summary)}`);
  if (n.status || n.template && n.byBower) front.push(`status: ${summaryScalar(n.status ?? (n.template === 'moc' ? 'evergreen' : 'active'))}`);
  if (n.tags.length || n.template) front.push(`tags: [${n.tags.map((tag) => n.template ? summaryScalar(tag) : oneLine(tag)).join(', ')}]`);
  if (n.byBower) front.push('by: bower');
  if (n.original) front.push(`original: ${summaryScalar(oneLine(n.original))}`);
  if (n.bowerNote) front.push(`bower_source: ${n.bowerNote.source}`);
  for (const p of n.properties) front.push(`${p.key}: ${n.template && n.byBower ? summaryScalar(p.link ? `[[${p.link}]]` : oneLine(p.value)) : p.link ? `[[${p.link}]]` : oneLine(p.value)}`);
  if (n.template && n.byBower) {
    const type = n.properties.find((p) => p.key === 'type');
    if (!type) front.push(`type: ${n.template}`);
    front.push('bower_format: ownership/2', `bower_template: ${n.template}`);
    return ['---', ...front, '---', '', ...templateBody(n, n.template)].join('\n');
  }
  const out = ['---', ...front, '---', ''];
  if (n.currentState.length) out.push(CURRENT, ...n.currentState.map((l) => `- ${oneLine(l)}`), '');
  if (n.body) out.push(n.body, '');
  if (n.timeline.length) out.push(TIMELINE, ...n.timeline.map((t) => timelineLine({ ...t, text: oneLine(t.text) })), '');
  if (n.bowerNote) out.push(BOWER_NOTE, n.bowerNote.text, '');
  const serialized = out.join('\n');
  const source = personalSources.get(n);
  return source?.serialized === serialized ? source.raw : serialized;
}

/** Writer and display reader use the declared sections and the shared fence grammar. */
function templateSections(body: string, template: NoteTemplate, framed = false,
  onLine?: (section: string, line: string, byteOffset: number) => void): Map<string, string> {
  const shape = NOTE_TEMPLATES[template];
  const contents = new Map<string, string>();
  let section = '';
  let fence: Fence | null = null;
  let byteOffset = 0;
  for (const rawLine of body.split('\n')) {
    const offset = byteOffset;
    byteOffset += encoder.encode(rawLine).length + 1;
    const line = framed ? rawLine.replace(/\r$/, '') : rawLine;
    const previous = fence;
    fence = fenceAfter(line, fence);
    if (framed && !previous && !fence && /^<!-- bower:ownership\/2 (?:begin|end) [a-z-]+ -->$/.test(line)) continue;
    const heading = !previous && !fence ? /^## (.+)$/.exec(line)?.[1] : undefined;
    if (heading && (shape.sections as readonly string[]).includes(heading)) section = heading;
    else {
      contents.set(section, `${contents.get(section) ?? ''}${line}\n`);
      onLine?.(section, line, offset);
    }
  }
  return contents;
}

/** Only this serializer writes headings/framing. */
function templateBody(n: NoteFile, template: NoteTemplate): string[] {
  const shape = NOTE_TEMPLATES[template];
  const contents = templateSections(n.body, template);
  const loose = trimLines(contents.get('') ?? '');
  if (loose) contents.set(shape.body, [loose, contents.get(shape.body) ?? ''].filter(Boolean).join('\n'));
  const related = n.properties.find((p) => p.key === 'related');
  const source = n.properties.find((p) => p.key === 'source');
  const linkText = (p: Property | undefined): string => p ? p.link ? `[[${p.link}]]` : p.value : '';
  const fallback: Record<string, string> = {
    Summary: n.summary, Related: linkText(related), Sources: linkText(source),
    'Current state': n.currentState.map((line) => `- ${oneLine(line)}`).join('\n'),
    Timeline: n.timeline.map((entry) => timelineLine({ ...entry, text: oneLine(entry.text) })).join('\n'),
  };
  const render = (heading: string): string => `## ${heading}\n${trimLines(contents.get(heading) ?? fallback[heading] ?? '')}\n`;
  const frame = (owner: string, text: string): string => `<!-- bower:ownership/2 begin ${owner} -->\n${text}<!-- bower:ownership/2 end ${owner} -->\n`;
  const personal = shape.sections.filter((heading) => !['Current state', 'Timeline', 'Goal', 'Next steps', 'Standard to maintain'].includes(heading)).map(render).join('\n');
  const out: string[] = [];
  if (template === 'area') out.push(render('Standard to maintain'));
  if (template === 'project') out.push(frame('goal', render('Goal')), frame('next-steps', render('Next steps')));
  out.push(frame('current', template !== 'source' && template !== 'moc' ? render('Current state') : ''),
    frame('personal', template !== 'source' && template !== 'moc' ? personal : ''),
    frame('timeline', shape.timeline ? render('Timeline') : ''),
    frame('bower-note', template === 'source' ? personal : n.bowerNote ? n.bowerNote.text + '\n' : ''));
  if (template === 'moc') out.push(frame('moc-overview', render('Overview')), frame('moc-figures', ''),
    frame('moc-members', render('Notes')), render('Sources'));
  return out;
}

/** Ticks or unticks the n-th task of the body; Bower's sections are never touched. */
export function toggleTaskInText(raw: string, index: number): { text: string; label: string; done: boolean } {
  const { bytes, ownership } = ownershipOf(raw);
  const front = ownership.layout.front ? frontOf(payloadDisplay(bytes, ownership.layout.front)) : null;
  const projection = templateProjection(bytes, ownership, front);
  const identity = Number.isInteger(index) && index >= 0 ? projection?.tasks[index] : undefined;
  if (identity?.region === 'bower') throw new BowerError('unknown', 'Bower keeps this line unchanged.');
  const personalIndex = projection ? identity?.region === 'personal' ? identity.index : undefined : index;
  const task = ownership.tasks.find((candidate) => candidate.index === personalIndex);
  if (!task) throw new BowerError('not-found', 'That line is no longer in the note.');
  const result = togglePersonalTask(bytes, { index: task.index, label: task.label, previousDone: task.done, done: !task.done });
  if (result.kind === 'refused') throw ownershipError(result.reason);
  return { text: decoder.decode(result.bytes), label: result.label, done: result.done };
}


/** The declared projection never removes the note's other properties or grants schema authority. */
export const TECHNICAL_PROPERTIES = ['type', 'status', 'summary', 'tags', 'created', 'updated', 'source', 'related'] as const;
export function tableProperties(note: Pick<ParsedNote, 'properties'>, row: Pick<TypeRow, 'table'>): Property[] {
  return [...new Set(row.table)].filter((key) => !(TECHNICAL_PROPERTIES as readonly string[]).includes(key)).slice(0, 4)
    .flatMap((key) => note.properties.filter((property) => property.key === key));
}
/** `YYYY-MM-DD`, a real calendar date. */
export function dateOk(date: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return false;
  const [year, month, day] = match.slice(1, 4).map(Number) as [number, number, number];
  const at = new Date(0);
  at.setUTCFullYear(year, month - 1, day);
  return at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day;
}
const schemaObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const schemaClosed = (v: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(v).every((k) => keys.includes(k));
const schemaText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 200;
const schemaTexts = (v: unknown): v is string[] => Array.isArray(v) && v.every(schemaText);
const slug = (v: unknown): v is string => typeof v === 'string' && v.length <= 128 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
/** JSON Schema-style closed objects on write; tolerance belongs only to readTypeTable. */
export function typeRowOk(v: unknown): v is TypeRow {
  if (!schemaObject(v) || !schemaClosed(v, ['id', 'match', 'template', 'properties', 'table', 'group_by'])
    || !slug(v.id) || !schemaTexts(v.match) || !v.match.length || !schemaText(v.template)
    || !schemaObject(v.properties) || !schemaTexts(v.table) || v.table.length > 4
    || new Set(v.table).size !== v.table.length) return false;
  const properties = v.properties;
  if (!Object.entries(properties).every(([key, declaration]) => /^[a-z][a-z0-9_]*$/.test(key)
    && schemaObject(declaration) && schemaClosed(declaration, ['type', 'values'])
    && (declaration.type === 'enum' ? schemaTexts(declaration.values) && declaration.values.length > 0
      && declaration.values.length <= 20 && new Set(declaration.values).size === declaration.values.length
      : typeof declaration.type === 'string' && ['text', 'list', 'number', 'money', 'date'].includes(declaration.type) && !Object.hasOwn(declaration, 'values')))) return false;
  if (!v.table.every((key) => Object.hasOwn(properties, key) && !(TECHNICAL_PROPERTIES as readonly string[]).includes(key))) return false;
  if (v.group_by === undefined) return true;
  const group = v.group_by;
  if (!schemaObject(group) || !schemaClosed(group, ['property', 'bucket']) || typeof group.property !== 'string'
    || !Object.hasOwn(properties, group.property)) return false;
  const declaration = properties[group.property] as TypeRow['properties'][string];
  return declaration.type === 'enum' ? group.bucket === undefined : declaration.type === 'date' && group.bucket === 'year';
}
export function typeTableOk(v: unknown): v is TypeTable {
  return schemaObject(v) && schemaClosed(v, ['v', 'rows']) && v.v === 1 && Array.isArray(v.rows)
    && v.rows.every(typeRowOk) && new Set(v.rows.map((row) => row.id)).size === v.rows.length;
}
/** ISO 4217 codes supplied by ICU, plus the ISO fund, metal and testing units ICU omits. */
const currencies = new Set([...Intl.supportedValuesOf('currency'),
  'BOV', 'CHE', 'CHW', 'CLF', 'COU', 'MXV', 'USN', 'UYI', 'UYW', 'XAG', 'XAU', 'XBA', 'XBB', 'XBC', 'XBD', 'XDR', 'XPD', 'XPT', 'XSU', 'XTS', 'XUA', 'XXX']);
export function propertyValuesOk(row: TypeRow, value: unknown): boolean {
  if (!typeRowOk(row) || !schemaObject(value)) return false;
  return Object.entries(value).every(([key, item]) => {
    if (!Object.hasOwn(row.properties, key)) return false;
    const declaration = row.properties[key];
    switch (declaration?.type) {
      case 'text': return typeof item === 'string' && item.length <= 200;
      case 'list': return Array.isArray(item) && item.length <= 10 && item.every((v) => typeof v === 'string' && v.length <= 200);
      case 'enum': return typeof item === 'string' && !!declaration.values?.includes(item);
      case 'number': return typeof item === 'number' && Number.isFinite(item);
      case 'money': return schemaObject(item) && Object.keys(item).length === 2 && schemaClosed(item, ['amount', 'currency'])
        && typeof item.amount === 'number' && Number.isFinite(item.amount) && typeof item.currency === 'string' && currencies.has(item.currency);
      case 'date': return typeof item === 'string' && dateOk(item);
      default: return false;
    }
  });
}
