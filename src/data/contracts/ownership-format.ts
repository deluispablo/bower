/** Pure internal raw-byte ownership boundary. No provider or public Sources API. */
import { TASK_LINE } from './tasks';
import { sha256Sync } from './hashes';
import { TEMPLATE_REGIONS, type TemplateRegion } from './note-templates';
export interface ByteSpan { readonly start: number; readonly end: number }
export type MocRegion = 'moc-overview' | 'moc-figures' | 'moc-members';
export type BowerRegion = MocRegion | 'profile' | TemplateRegion;
export type Owner = 'current' | 'personal' | 'timeline' | 'bower-note';
export type OwnershipFailure = 'unsupported-version' | 'damaged-boundary' | 'invalid-encoding';
export interface PersonalTask {
  readonly index: number;
  readonly label: string;
  readonly done: boolean;
  readonly checkboxByte: number;
}
/**
 * Where each part of a note is, in bytes of the file as read, for v2, legacy and plain notes alike. A section runs
 * from its `## ` heading (ATX heading, CommonMark 0.31) to the end of its text: a v2 payload is framed by its markers, a
 * legacy section ends where the next one starts (Current state: after its last `- ` line). `front` is the lines
 * between the `---` fences (YAML front matter), `frontEnd` the first byte after the closing fence. A section the note
 * lacks is null. A note with no frontmatter (plain) is wholly the person's: its one section is its last `## Timeline`,
 * to the end of the note, so a request's sourced line can find it (TL-P4-32 addendum 2 (5)); it has no Current state.
 * A repeated heading is the last one.
 */
export interface Layout {
  readonly front: ByteSpan | null;
  readonly frontEnd: number;
  readonly current: ByteSpan | null;
  readonly timeline: ByteSpan | null;
  readonly bowerNote: ByteSpan | null;
  /** Exact legacy MOC sections; admission remains the ownership author's responsibility. */
  readonly moc?: Readonly<Partial<Record<MocRegion, ByteSpan>>>;
}
export type OwnershipResult =
  | { readonly status: 'invalid'; readonly reason: OwnershipFailure }
  | { readonly status: 'plain' | 'legacy'; readonly personal: ByteSpan; readonly layout: Layout; readonly tasks: readonly PersonalTask[] }
  | { readonly status: 'v2'; readonly personal: ByteSpan; readonly layout: Layout; readonly payloads: Readonly<Record<Owner, ByteSpan> & Partial<Record<BowerRegion, ByteSpan>>>; readonly tasks: readonly PersonalTask[] };
/** A fetched version's ownership table, retained only by its execution attempt. */
export interface OwnershipContext {
  read(fileId: string, bytes: Uint8Array): OwnershipResult;
}
export interface FetchedOwnership { fileId: string; context: OwnershipContext }

/** Memoise the pure parser by file id and exact byte hash, never by name or place. */
export function createOwnershipContext(
  parser: (bytes: Uint8Array, key: { fileId: string; hash: string }) => OwnershipResult = parseOwnership,
): OwnershipContext {
  const files = new Map<string, Map<string, OwnershipResult>>();
  return {
    read(fileId, bytes) {
      const hash = sha256Sync(bytes);
      let versions = files.get(fileId);
      const found = versions?.get(hash);
      if (found) return found;
      const result = parser(bytes, { fileId, hash });
      if (!versions) { versions = new Map(); files.set(fileId, versions); }
      versions.set(hash, result);
      return result;
    },
  };
}

export interface TaskRequest {
  readonly index: number;
  readonly label: string;
  readonly previousDone: boolean;
  readonly done: boolean;
}
export type TaskResult =
  | { readonly kind: 'refused'; readonly reason: OwnershipFailure | 'task-not-found' | 'task-changed' }
  | { readonly kind: 'changed'; readonly bytes: Uint8Array; readonly label: string; readonly done: boolean };

interface Line { start: number; after: number; text: string }
export interface Fence { character: string; length: number }
export const MOC_REGIONS: readonly MocRegion[] = ['moc-overview', 'moc-figures', 'moc-members'];
const OWNERS: readonly Owner[] = ['current', 'personal', 'timeline', 'bower-note'];
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const damaged = (): OwnershipResult => ({ status: 'invalid', reason: 'damaged-boundary' });

/** Boundaries are measured from fetched bytes, never from a rendered view. */
function lines(bytes: Uint8Array, span: ByteSpan): Line[] {
  const out: Line[] = [];
  for (let start = span.start; start < span.end;) {
    let end = start;
    while (end < span.end && bytes[end] !== 10) end++;
    const after = end < span.end ? end + 1 : end;
    const contentEnd = end > start && bytes[end - 1] === 13 && after > end ? end - 1 : end;
    out.push({ start, after, text: decoder.decode(bytes.subarray(start, contentEnd)) });
    start = after;
  }
  return out;
}

/** Both v2 framing and v2 task indexing use this exact fence transition, and so does every reader of a note. */
export function fenceAfter(text: string, open: Fence | null): Fence | null {
  if (open) {
    const close = /^ {0,3}(`+|~+)[ \t]*$/.exec(text);
    return close?.[1]?.[0] === open.character && close[1].length >= open.length ? null : open;
  }
  const begin = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
  const run = begin?.[1];
  if (!run || (run[0] === '`' && begin?.[2]?.includes('`'))) return null;
  return { character: run[0] ?? '', length: run.length };
}

function tasks(bytes: Uint8Array, personal: ByteSpan, v2: boolean): PersonalTask[] {
  const out: PersonalTask[] = [];
  let fence: Fence | null = null;
  let index = 0;
  for (const line of lines(bytes, personal)) {
    if (v2) {
      const previous = fence;
      fence = fenceAfter(line.text, fence);
      if (previous || fence) continue;
    }
    const match = TASK_LINE.exec(line.text);
    if (!match) continue;
    const label = match[4] ?? '';
    // Legacy empty task lines retain their existing index even though not actionable.
    const taskIndex = index;
    if (!v2) index++;
    if (v2 ? !label.trim() : !label) continue;
    if (v2) index++;
    out.push({ index: taskIndex, label, done: match[2] === 'x', checkboxByte: line.start + encoder.encode(match[1]).length });
  }
  return out;
}

/** A plain note's layout: only its last `## Timeline` heading, to the end of the note; nothing else is framed. */
function plainLayout(raw: string): Layout {
  const text = raw.replace(/\r\n/g, '\n');
  const after = text.lastIndexOf('\n## Timeline\n');
  const at = after >= 0 ? after + 1 : text.startsWith('## Timeline\n') ? 0 : -1;
  if (at < 0) return { front: null, frontEnd: 0, current: null, timeline: null, bowerNote: null };
  const byteAt = byteTable(raw, text.length);
  return { front: null, frontEnd: 0, current: null, timeline: { start: byteAt[at] ?? 0, end: byteAt[text.length] ?? 0 }, bowerNote: null };
}

/**
 * One table for the whole note: entry n is the UTF-8 length of the raw text before the n-th character of the text with
 * CRLF read as LF. It replaces re-encoding a prefix for each span, which cost a full pass over the note every time.
 */
function byteTable(raw: string, textLength: number): Uint32Array {
  const table = new Uint32Array(textLength + 1);
  let at = 0;
  let bytes = 0;
  for (let n = 0; n <= textLength; n++) {
    table[n] = bytes;
    if (n === textLength) break;
    if (raw[at] === '\r' && raw[at + 1] === '\n') { bytes++; at++; }
    const code = raw.charCodeAt(at);
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code >= 0xd800 && code < 0xdc00 ? 4 : code >= 0xdc00 && code < 0xe000 ? 0 : 3;
    at++;
  }
  return table;
}

function legacyNote(bytes: Uint8Array, raw: string): OwnershipResult {
  const text = raw.replace(/\r\n/g, '\n');
  const close = text.startsWith('---\n') ? text.indexOf('\n---', 3) : -1;
  if (close < 0) {
    const personal = { start: 0, end: bytes.length };
    return { status: 'plain', personal, layout: plainLayout(raw), tasks: tasks(bytes, personal, false) };
  }
  const lineEnd = text.indexOf('\n', close + 1);
  const frontEnd = lineEnd < 0 ? text.length : lineEnd + 1;
  let start = frontEnd;
  while (text[start] === '\n') start++;
  let current: { start: number; end: number } | null = null;
  if (text.startsWith('## Current state\n', start)) {
    const from = start;
    start += '## Current state\n'.length;
    while (text.startsWith('- ', start)) {
      const end = text.indexOf('\n', start);
      start = end < 0 ? text.length : end + 1;
    }
    current = { start: from, end: start };
  }
  let end = text.length;
  const bower = text.lastIndexOf("\n## Bower's note\n");
  const hasBower = bower >= start - 1;
  if (hasBower) end = bower;
  const timeline = text.lastIndexOf('\n## Timeline\n', end);
  const hasTimeline = timeline >= start - 1;
  if (hasTimeline) end = timeline;
  end = Math.max(start, end);
  // Canonical legacy payload excludes empty separator lines before personal prose.
  while (start < end && text[start] === '\n') start++;
  const byteAt = byteTable(raw, text.length);
  const rawByteAt = (offset: number): number => byteAt[offset] ?? 0;
  const span = (from: number, to: number): ByteSpan => ({ start: rawByteAt(from), end: rawByteAt(to) });
  const personal = span(start, end);
  const headings: Line[] = [];
  let fence: Fence | null = null;
  for (const line of lines(bytes, { start: rawByteAt(frontEnd), end: bytes.length })) {
    const previous = fence;
    fence = fenceAfter(line.text, fence);
    if (!previous && !fence && /^#{1,6}\s/.test(line.text)) headings.push(line);
  }
  const overview = headings.filter((line) => line.text === '## Overview');
  const members = headings.filter((line) => line.text === '## Notes');
  const section = (line: Line): ByteSpan => ({ start: line.start, end: headings.find((next) => next.start > line.start)?.start ?? bytes.length });
  const moc = overview.length === 1 && members.length === 1 && overview[0] && members[0]
    && section(overview[0]).end === members[0].start
    ? { 'moc-overview': section(overview[0]), 'moc-figures': { start: members[0].start, end: members[0].start }, 'moc-members': section(members[0]) } : undefined;
  const layout: Layout = {
    ...(moc ? { moc } : {}),
    front: span(4, close + 1),
    frontEnd: rawByteAt(frontEnd),
    current: current && span(current.start, current.end),
    // A heading follows the line break before it; a section ends where the next heading starts.
    timeline: hasTimeline ? span(timeline + 1, hasBower ? bower + 1 : text.length) : null,
    bowerNote: hasBower ? span(bower + 1, text.length) : null,
  };
  return { status: 'legacy', personal, layout, tasks: tasks(bytes, personal, false) };
}

/** Advisory spans contain only complete regions; they never grant write authority. */
export interface PrefixOwnership { readonly status: 'prefix'; readonly incomplete: boolean; readonly spans: readonly ByteSpan[] }
export function parseOwnership(bytes: Uint8Array): OwnershipResult;
export function parseOwnership(bytes: Uint8Array, mode: 'prefix'): PrefixOwnership;
export function parseOwnership(bytes: Uint8Array, mode?: 'prefix'): OwnershipResult | PrefixOwnership {
  const complete: ByteSpan[] = [];
  const finish = (result: OwnershipResult): OwnershipResult | PrefixOwnership => {
    if (mode !== 'prefix') return result;
    if (result.status === 'invalid') return { status: 'prefix', incomplete: true, spans: complete };
    return { status: 'prefix', incomplete: false, spans: result.status === 'v2'
      ? [...(result.layout.front ? [result.layout.front] : []), ...Object.values(result.payloads)]
      : [{ start: 0, end: bytes.length }] };
  };
  const refuse = (): OwnershipResult | PrefixOwnership => finish(damaged());
  let raw: string;
  try { raw = decoder.decode(bytes); }
  catch {
    // expected: fatal UTF-8 validation exposes a typed refusal, without I/O or replacement decoding.
    return finish({ status: 'invalid', reason: 'invalid-encoding' });
  }
  const prefix = raw.startsWith('\ufeff') ? 3 : 0;
  const sourceLines = lines(bytes, { start: prefix, end: bytes.length });
  const first = sourceLines[0];
  if (first?.text !== '---' || first.after === bytes.length) {
    if (mode === 'prefix' && first?.text === '---') return refuse();
    return finish(legacyNote(bytes, raw));
  }
  // Preserve the old unterminated-frontmatter interpretation. An explicit closed
  // declaration never falls back to legacy merely because its v2 framing is bad.
  const close = sourceLines.findIndex((line, i) => i > 0 && line.text.startsWith('---'));
  if (close < 0) return mode === 'prefix' ? refuse() : legacyNote(bytes, raw);
  if (mode === 'prefix') complete.push({ start: first.after, end: sourceLines[close]?.start ?? first.after });
  const declarations = sourceLines.slice(1, close).filter((line) => /^\s*bower_format\s*:/.test(line.text));
  if (!declarations.length) return finish(legacyNote(bytes, raw));
  if (declarations.length !== 1) return refuse();
  const declaration = declarations[0]?.text ?? '';
  if (declaration !== 'bower_format: ownership/2') {
    return declaration.slice(declaration.indexOf(':') + 1).trim() === 'ownership/2'
      ? refuse() : finish({ status: 'invalid', reason: 'unsupported-version' });
  }
  if (sourceLines[close]?.text !== '---') return refuse();
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 13 && bytes[i + 1] !== 10) return refuse();

  // Creation orders Goal/Next steps before Current state; stored appended regions remain readable.
  const firstRegion = sourceLines.slice(close + 1).find((line) => line.text.startsWith('<!-- bower:ownership/2 begin'));
  const owners: (Owner | BowerRegion)[] = firstRegion?.text === '<!-- bower:ownership/2 begin goal -->'
    ? [...TEMPLATE_REGIONS, ...OWNERS] : [...OWNERS];
  const spans: Partial<Record<Owner | BowerRegion, ByteSpan>> = {};
  let next = 0;
  let active: Owner | BowerRegion | null = null;
  let start = 0;
  let fence: Fence | null = null;
  for (const line of sourceLines.slice(close + 1)) {
    if (active) {
      const previous = fence;
      fence = fenceAfter(line.text, fence);
      if (previous || fence) continue;
      if (line.text === `<!-- bower:ownership/2 end ${active} -->`) {
        spans[active] = { start, end: line.start };
        complete.push({ start, end: line.start });
        active = null; next++;
      } else if (line.text.startsWith('<!-- bower:ownership')) return refuse();
    } else {
      // Extend only at a real boundary, never for marker-shaped text inside a fenced payload.
      if (next === owners.length && next >= OWNERS.length) {
        if (!spans['moc-overview'] && line.text === '<!-- bower:ownership/2 begin moc-overview -->') owners.push(...MOC_REGIONS);
        if (!spans.profile && line.text === '<!-- bower:ownership/2 begin profile -->') owners.push('profile');
        if (!spans.goal && line.text === '<!-- bower:ownership/2 begin goal -->') owners.push(...TEMPLATE_REGIONS);
      }
      const owner = owners[next];
      if (owner && line.text === `<!-- bower:ownership/2 begin ${owner} -->`) {
        active = owner; start = line.after;
      } else if (line.text.trimStart().startsWith('<!-- bower:ownership')) return refuse();
      // Outside bytes are opaque and grant no payload or task authority. Never interpret their Markdown.
    }
  }
  const { current, personal, timeline, 'bower-note': bowerNote } = spans;
  if (active || fence || next !== owners.length || !current || !personal || !timeline || !bowerNote) return refuse();
  const closing = sourceLines[close];
  const layout: Layout = {
    front: { start: first.after, end: closing?.start ?? first.after }, frontEnd: closing?.after ?? first.after,
    current, timeline, bowerNote,
  };
  return finish({ status: 'v2', personal, layout, payloads: { ...spans, current, personal, timeline, 'bower-note': bowerNote }, tasks: tasks(bytes, personal, true) });
}

/** Reparse the supplied source each time; derived/previous spans are no authority. */
export function togglePersonalTask(bytes: Uint8Array, request: TaskRequest): TaskResult {
  const parsed = parseOwnership(bytes);
  if (parsed.status === 'invalid') return { kind: 'refused', reason: parsed.reason };
  const task = Number.isInteger(request.index) && request.index >= 0 ? parsed.tasks.find((t) => t.index === request.index) : undefined;
  if (!task) return { kind: 'refused', reason: 'task-not-found' };
  if (task.label !== request.label || task.done !== request.previousDone) return { kind: 'refused', reason: 'task-changed' };
  // Ordinary byte arrays keep their realm. Subclasses normalize to an independent byte array,
  // even when their slice override returns a shared view (for example Buffer).
  const out: Uint8Array = Object.hasOwn(Object.getPrototypeOf(bytes), 'BYTES_PER_ELEMENT')
    ? Uint8Array.prototype.slice.call(bytes) : new Uint8Array(bytes);
  out[task.checkboxByte] = request.done ? 120 : 32;
  return { kind: 'changed', bytes: out, label: task.label, done: request.done };
}
