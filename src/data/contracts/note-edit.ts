/**
 * The note-edit contract (TL-P2-20, B.2, ratified): `applyChanges(beforeBytes, changes)` is the one pure author
 * of an `edit-text`'s after-text, shared by the planner, the manifest guard and the adapter. It works on the
 * fetched bytes only, re-parses its own result after every change and refuses unless the bytes the change may
 * not touch are identical (R3-1, R4-3 m-b). Fake-only until the raw-byte adapter (rule 6); nothing here does I/O.
 *
 * Provenance (FSL-1.1-MIT, the owner's original Bower app): the line-ending rule and the "after the section's
 * last non-blank line" splice adapt `app/src/history.ts` `appendHistoryLine`; the literal, regex-free token
 * replacement follows `agent/run.sh` `sheet_relink`, without its path and stem forms (TL-P2-20 never rewrites them).
 */
import { formerNames, linkTarget } from './links';
import { ruleLike } from './rules';
import { displayName, nameOf } from './tree';
import type { ChangeEntry, Rule } from './types';
import { sha256 } from './hashes';
import { dateOk, parseNote, timelineEntries } from './note-format';
import { MOC_REGIONS, createOwnershipContext, fenceAfter, parseOwnership, type MocRegion, type ByteSpan, type Fence, type Layout, type OwnershipFailure, type FetchedOwnership } from './ownership-format';
import { parseTimelineLine, timelineLine, type TimelineMarker } from './timeline-line';
import { parseRules } from './rules-format';
import type { Change, EditEntry, EditText, Rename, RuleAdd, RuleRemove, TimelineConsent, MaintenanceNote } from './run-manifest';
import { isHub } from './hub';
import { BowerError } from './types';

/** Files larger than 1 MiB are never edited (TL-P2-20 rule 6). */
export const EDIT_FILE_LIMIT = 1024 * 1024;

/**
 * `not-bower`: a Timeline line, rule wording or Current state for a note that is not Bower's; `unsupported`: rule
 * wording on a file that is not a legacy-format Rules.md, or a Current state Bower cannot rewrite (none there, or not
 * in its one-line-per-item form); `field`: a change whose fields break the format; `order`: changes not 1+ in the
 * order state-rewrite, link-rewrite, timeline-append, rules-wording; `invariant`: the result failed the re-parse
 * checks; `unchanged`: the result would equal the file as read, so nothing is planned (rule 5); `person-edited`: the
 * Current state is not what Bower last wrote there (its mark says so), so it is the person's now and never rewritten;
 * `state-changed`: the Current state does not read as the change's `previous`.
 */
export type EditRefusal = OwnershipFailure | 'too-large' | 'not-bower' | 'unsupported' | 'field' | 'order' | 'invariant' | 'unchanged'
  | 'person-edited' | 'state-changed' | 'no-timeline' | 'unreadable-timeline';
/** Independently derived bindings accompany fetched bytes during planning and effect recheck. */
export type EditFetched = FetchedOwnership & { consents?: readonly TimelineConsent[]; path?: string; name?: string };
export type EditResult = { ok: true; text: string; bytes: Uint8Array } | { ok: false; reason: EditRefusal };
/** The low-level splice, replaceable only so a test can inject a faulty one (R4-3 m-g). */
export type Authors = { splice: (text: string, at: number, insert: string) => string };

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const ORDER: readonly Change['kind'][] = ['state-rewrite', 'link-rewrite', 'timeline-append', 'rules-wording', 'profile-rewrite', 'moc-rewrite'];
const RULE_LINE = /^- (.*?)(?:\s*<!-- since (\d{4}-\d{2}-\d{2}) -->)?\s*$/;
const WORDS_LINE = /^\s+\*You wrote: "(.*)"\*\s*$/;
const SUMMARY_LINE = /^summary: \d+ rules? Bower follows in every tidy-up\.$/;
const HEADING = /^#{1,6}\s/;

// ---------------------------------------------------------------------------------------------
// Field rules, shared with the manifest guard
// ---------------------------------------------------------------------------------------------

const controls = (value: string): boolean => [...value].some((char) => char.charCodeAt(0) <= 0x1f || char.charCodeAt(0) === 0x7f);

const lineFieldOk = (value: string): boolean => !controls(value) && !value.includes(' · ') && !value.includes('[[') && !value.includes(']]');
/** A display name as a Timeline source: no `]`, `|`, `#`, `^` or line break. */
const displayNameOk = (value: string): boolean => value.length > 0 && !/[\]|#^\r\n]/.test(value);

/** The UTC calendar date of `requestedAt`, `YYYY-MM-DD`; null outside years 0000-9999. */
export function timelineDate(requestedAt: number): string | null {
  if (!Number.isSafeInteger(requestedAt) || requestedAt < 0) return null;
  const at = new Date(requestedAt);
  if (Number.isNaN(at.getTime()) || at.getUTCFullYear() > 9999) return null;
  return at.toISOString().slice(0, 10);
}
/** How a news line starts: what Bower would have written in a Current state it may not rewrite (`stateNewsLine`). */
export const NEWS_LEAD = 'New: ';
/**
 * Every Timeline line cites its source (TL-P4-19 addendum 20): a news line with none is refused. The one home of the
 * rule: `entryOk` gates every writer with it, and the Claude reply's check calls it on the reply's Timeline lines.
 */
export const newsLineCited = (entry: Pick<EditEntry, 'text' | 'source'>): boolean => entry.source !== null || !entry.text.startsWith(NEWS_LEAD);
/**
 * A Timeline line's field rules, strict on write and lenient on read, as a Current state's bounds are (`STATE_READ`):
 * `read` is how a stored manifest is read, so one stored before the uncited refusal still parses (TL-P4-19 addendum
 * 22); a write or a plan (the default) also refuses a news line with no source.
 */
export function entryOk(entry: EditEntry, mode: 'write' | 'read' = 'write'): boolean {
  return dateOk(entry.date) && lineFieldOk(entry.text) && (entry.source === null || displayNameOk(entry.source)) && (mode === 'read' || newsLineCited(entry));
}
/** Display names only: path forms and `.md` forms are never rewritten. */
export function renameOk(rename: Rename): boolean {
  const name = (value: string): boolean => displayNameOk(value) && !/[/\\]/.test(value) && !/\.md$/i.test(value);
  return name(rename.from) && name(rename.to);
}
export function ruleAddOk(add: RuleAdd): boolean {
  return Number.isSafeInteger(add.since) && add.since > 0 && add.text.trim().length > 0 && !controls(add.text) && !controls(add.yourWords);
}
export function ruleRemoveOk(remove: RuleRemove): boolean {
  return remove.text.trim().length > 0 && !controls(remove.text) && (remove.since === undefined || (Number.isSafeInteger(remove.since) && remove.since > 0));
}
/**
 * A Current state's two bounds, in lines and characters per line, one home (TL-P4-14 addenda 20 and 22): strict on
 * write, lenient on read. `STATE_WRITE` is what Bower writes, the method's short state (TL-P4-08): the Claude reply's
 * check and prompt import it. `STATE_READ` is what Bower reads: a person's state (`previous`), what an undo writes
 * back, and every stored manifest, which must still parse.
 */
export const STATE_WRITE = { lines: 8, line: 200 } as const;
export const STATE_READ = { lines: 20, line: 400 } as const;
/** The report's row for a note whose Current state a run brought up to date. */
export const STATE_UPDATED = 'Current state brought up to date.';
/** The report's line on a note kept as one with another (`keep-one-note-merge`), which went to the Bin. */
export const keptLine = (other: string): string => `Kept as one note with ${other}, which went to the Bin.`;
/** Why the other note of a keep stays: the person changed it while the run worked; the next tidy-up carries it all. */
export const KEEP_CHANGED = 'It changed while Bower worked, so both notes stay; the next tidy-up keeps one.';
/** Why the other note of a keep stays: the person moved or renamed it while the run worked (P4-19b). */
export const KEEP_MOVED = 'It was moved or renamed while Bower worked, so both notes stay; the next tidy-up keeps one.';
/** Why the other note of a keep was not binned by Bower: the person put it in the Bin while the run worked (P4-19b). */
export const KEEP_BINNED = 'It went to the Bin while Bower worked, so only the kept note stays.';
/** What a keep's other note says when its Bin was refused, by why the note was not as the run read it. */
export const keepRefused = (reason: 'gone' | 'moved' | 'changed'): string => (reason === 'gone' ? KEEP_BINNED : reason === 'moved' ? KEEP_MOVED : KEEP_CHANGED);
/** Every sentence `keepRefused` gives: a refused keep's report row says the one its refusal carries. */
export const KEEP_REFUSED: readonly string[] = [KEEP_CHANGED, KEEP_MOVED, KEEP_BINNED];
/**
 * A yes to keeping one note whose other note was already in the Bin before Bower's run (c3-pair-ask, TL-P4-19
 * addenda 8 and 9): nothing is merged, and the answer is settled. By the other note's name when it is known.
 */
export const KEEP_ALREADY_BINNED = 'Not merged: the other note was already in the Bin.';
export const keepAlreadyBinned = (other: string | null): string => (other === null ? KEEP_ALREADY_BINNED : `Not merged: ${other} was already in the Bin.`);
/**
 * Current state lines: `lines` each one trimmed line, none only to take back a rewrite of an empty section (TL-P4-10
 * point 4; a model always writes 1+); `previous` as read (one line each, no control character).
 */
export function stateLinesOk(previous: readonly string[], lines: readonly string[]): boolean {
  const one = (line: string): boolean => !controls(line) && line.length <= STATE_READ.line;
  return lines.length <= STATE_READ.lines && previous.length <= STATE_READ.lines
    && lines.every((line) => one(line) && line.trim() === line && line.length > 0) && previous.every(one);
}
/** Profile prose has its own framed region; source extraction and grounding remain the planner's job. */
export function profileTextOk(text: string): boolean {
  return text.trim().length > 0 && text.trim().split(/\s+/).length <= 400 && /\[\[[^\]\r\n]+\]\]/.test(text)
    && !text.includes('<!-- bower:ownership');
}
function fieldsOk(change: Change): boolean {
  switch (change.kind) {
    case 'profile-rewrite': return typeof change.previous === 'string' && typeof change.text === 'string' && profileTextOk(change.text);
    case 'moc-rewrite': return ['moc-overview', 'moc-figures', 'moc-members'].includes(change.region) && typeof change.previous === 'string' && typeof change.text === 'string';
    case 'state-rewrite': return stateLinesOk(change.previous, change.lines);
    case 'link-rewrite': return change.renames.length > 0 && change.renames.every(renameOk)
      && new Set(change.renames.map((item) => item.from.toLowerCase())).size === change.renames.length;
    case 'timeline-append': return change.entries.length > 0 && change.entries.every((entry) => entryOk(entry));
    case 'rules-wording': return change.add.length + change.remove.length > 0 && change.add.every(ruleAddOk) && change.remove.every(ruleRemoveOk);
  }
}
const changeOrder = (c: Change): number => c.kind === 'moc-rewrite' ? ORDER.length + ['moc-overview', 'moc-figures', 'moc-members'].indexOf(c.region) : ORDER.indexOf(c.kind);
const ordered = (changes: readonly Change[]): boolean => changes.length > 0
  && changes.every((item, i) => i === 0 || changeOrder(changes[i - 1] ?? item) < changeOrder(item));

/** The renames a run's moves and renames imply, as the resolver's `formerNames` follows them (chains, `taken`). */
export function renamesFor(changes: readonly ChangeEntry[], taken: ReadonlySet<string> = new Set()): Rename[] {
  // A name a note has again (a move and its move back, TL-P4-27 addendum 4 (2)) renames nothing: links stay as written.
  return [...formerNames(changes, taken)].map(([from, path]) => ({ from, to: displayName(nameOf(path)) })).filter((r) => r.from !== r.to.toLowerCase());
}

// ---------------------------------------------------------------------------------------------
// Reading the file as the integrated grammars read it
// ---------------------------------------------------------------------------------------------

interface Line { start: number; end: number; after: number; text: string }

/** Lines of `text` in [start, end): `end` excludes the line ending (CRLF or LF), `after` includes it. */
function linesOf(text: string, start = 0, end = text.length): Line[] {
  const out: Line[] = [];
  for (let at = start; at < end;) {
    let stop = text.indexOf('\n', at);
    if (stop < 0 || stop >= end) stop = end;
    const after = stop < end ? stop + 1 : stop;
    const contentEnd = stop > at && text[stop - 1] === '\r' && after > stop ? stop - 1 : stop;
    out.push({ start: at, end: contentEnd, after, text: text.slice(at, contentEnd) });
    at = after;
  }
  return out;
}
const eolOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n');
/** A UTF-8 byte offset of `bytes` as a UTF-16 index of its decoded text. */
const charAt = (bytes: Uint8Array, offset: number): number => decoder.decode(bytes.subarray(0, offset)).length;
const spanOf = (bytes: Uint8Array, span: ByteSpan): { start: number; end: number } => ({ start: charAt(bytes, span.start), end: charAt(bytes, span.end) });
/**
 * The sections of a note as `parseOwnership` frames them, as UTF-16 indices of the text: the one parser finds
 * them, this only converts its byte offsets. Null for an unreadable note.
 */
interface Sections { frontEnd: number; front: Span | null; current: Span | null; timeline: Span | null; bowerNote: Span | null }
interface Span { start: number; end: number }
function sectionsOf(text: string, fetched?: FetchedOwnership): Sections | null {
  const bytes = encoder.encode(text);
  const own = fetched ? fetched.context.read(fetched.fileId, bytes) : parseOwnership(bytes);
  if (own.status === 'invalid') return null;
  const at = (span: ByteSpan | null): Span | null => (span ? spanOf(bytes, span) : null);
  const layout: Layout = own.layout;
  return { frontEnd: charAt(bytes, layout.frontEnd), front: at(layout.front), current: at(layout.current), timeline: at(layout.timeline), bowerNote: at(layout.bowerNote) };
}
/** The lines between a note's `---` fences; none when it has no frontmatter. */
function frontmatterLines(text: string, fetched?: FetchedOwnership): Line[] {
  const front = sectionsOf(text, fetched)?.front;
  return front ? linesOf(text, front.start, front.end) : [];
}
/** Where the line break before a heading that starts at `at` begins (a CRLF is one break). */
const breakBefore = (text: string, at: number): number => (text[at - 2] === '\r' ? at - 2 : at - 1);
function byBower(text: string, fetched?: FetchedOwnership): boolean {
  try { return parseNote('note.md', text, fetched).byBower; }
  catch (error) {
    // expected: an unreadable note is not Bower's; logged here, its cause says why.
    console.error('A note could not be read for an edit:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// timeline-append
// ---------------------------------------------------------------------------------------------

/**
 * A person's Timeline is a list, not a date grammar (CommonMark 0.31.2, list items).
 * Keep original offsets: blanks belong to the list, indented lines to the preceding item's subtree,
 * and the next heading to another section. An empty Timeline retains its existing dash append.
 */
function timelineAppendability(text: string, sections: Sections): 'no-timeline' | 'unreadable-timeline'
  | { at: number; end: number; marker: TimelineMarker } {
  if (!sections.timeline) return 'no-timeline';
  const lines = linesOf(text, sections.timeline.start, sections.timeline.end);
  let at = lines[0]?.end ?? sections.timeline.start;
  let end = sections.timeline.end;
  let marker: TimelineMarker = '- ';
  let item = false;
  for (const line of lines.slice(1)) {
    if (HEADING.test(line.text)) { end = line.start; break; }
    if (!line.text.trim()) continue;
    if (line.text.startsWith('- ') || line.text.startsWith('* ')) {
      marker = line.text.startsWith('* ') ? '* ' : '- ';
      item = true;
    } else if (!item || !/^[ \t]+\S/.test(line.text)) return 'unreadable-timeline';
    at = line.end;
  }
  return { at, end, marker };
}

/**
 * Whether a person's note can take a request's one sourced line, as `applyChanges` decides it: null when it can (or the
 * note is Bower's, which takes lines as before), else why not. A request settles on this without any line proposed.
 */
export function personalTimelineRefusal(bytes: Uint8Array, fetched?: FetchedOwnership): 'no-timeline' | 'unreadable-timeline' | null {
  let text: string;
  try { text = decoder.decode(bytes); }
  catch {
    // expected: a note that is not UTF-8 has no Timeline Bower can read.
    return 'unreadable-timeline';
  }
  const own = fetched ? fetched.context.read(fetched.fileId, bytes) : parseOwnership(bytes);
  if (own.status === 'invalid') return 'unreadable-timeline';
  if (own.status === 'v2' || byBower(text, fetched)) return null;
  const sections = sectionsOf(text, fetched);
  if (!sections) return 'unreadable-timeline';
  const appendable = timelineAppendability(text, sections);
  return typeof appendable === 'string' ? appendable : null;
}

type Step = { text: string; added: EditEntry[]; rules: Pick<Rule, 'text' | 'yourWords' | 'since'>[] | null } | { refused: EditRefusal };

function appendLines(text: string, change: Extract<Change, { kind: 'timeline-append' }>, authors: Authors, fetched?: EditFetched): Step {
  const bytes = encoder.encode(text);
  const own = fetched ? fetched.context.read(fetched.fileId, bytes) : parseOwnership(bytes);
  if (own.status === 'invalid') return { refused: own.reason };
  const personal = own.status !== 'v2' && !byBower(text, fetched);
  if (personal) {
    const c = change.consent;
    if (!c || c.targetFileId !== fetched?.fileId || change.recordIds.length !== 1 || change.recordIds[0] !== c.requestId
      || change.entries.length !== 1 || change.entries[0]?.source === null
      || (fetched.consents && !fetched.consents.some((x) => x.requestId === c.requestId && x.targetFileId === c.targetFileId && x.sourceFileId === c.sourceFileId))) return { refused: 'not-bower' };
  }
  const eol = eolOf(text);
  let marker: TimelineMarker = '- ';
  let region = '';
  let at: number;
  let insert: (lines: string[]) => string;
  if (own.status === 'v2') {
    const span = spanOf(bytes, own.payloads.timeline);
    region = text.slice(span.start, span.end);
    at = span.end;
    insert = (lines) => lines.map((line) => line + eol).join('');
  } else {
    const legacy = sectionsOf(text, fetched);
    if (!legacy) return { refused: 'not-bower' };
    if (personal) {
      const appendable = timelineAppendability(text, legacy);
      if (typeof appendable === 'string') return { refused: appendable };
      at = appendable.at;
      marker = appendable.marker;
      region = text.slice(legacy.timeline?.start, appendable.end);
      insert = (lines) => lines.map((line) => eol + line).join('');
    } else if (legacy.timeline) {
      const sectionEnd = legacy.timeline.end;
      const lines = linesOf(text, legacy.timeline.start, sectionEnd);
      region = text.slice(lines[0]?.start ?? sectionEnd, sectionEnd);
      const last = [...lines].reverse().find((line) => line.text.trim());
      at = last?.end ?? sectionEnd;
      insert = (lines) => lines.map((line) => eol + line).join('');
    } else if (legacy.bowerNote) {
      at = breakBefore(text, legacy.bowerNote.start);
      insert = (lines) => `${eol}## Timeline${eol}${lines.join(eol)}`;
    } else {
      at = text.length;
      const final = text.endsWith('\n') ? eol : '';
      insert = (lines) => `${eol}## Timeline${eol}${lines.join(eol)}${final}`;
    }
  }
  // R3-3 and m-d: an entry is present when a line has the same text and source, whatever its date.
  const present = linesOf(region).flatMap((line) => {
    const match = parseTimelineLine(line.text);
    return match ? [JSON.stringify([match.text, match.source])] : [];
  });
  const seen = new Set(present);
  const added = change.entries.filter((entry) => {
    const key = JSON.stringify([entry.text, entry.source]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!added.length) return { text, added, rules: null };
  return { text: authors.splice(text, at, insert(added.map((entry) => timelineLine({ ...entry, marker })))), added, rules: null };
}

// ---------------------------------------------------------------------------------------------
// state-rewrite (TL-P4-08 addendum 1 point 1, TL-P4-10)
// ---------------------------------------------------------------------------------------------

/**
 * The rule that lets Bower keep up to date the Current states it did not write (TL-P4-10 point 3): the person's yes
 * to `ADOPT_STATES_QUESTION`, as a rule line (C11 words it).
 */
export const ADOPT_STATES_RULE = 'Keep the summaries Bower did not write up to date.';
/** The one question a run asks a folder about Current states Bower did not write (TL-P4-10 point 3), word for word. */
export const ADOPT_STATES_QUESTION = 'Bower found summaries it did not write. May it keep them up to date?';
/** The id of that one question; a yes to it is recorded as `ADOPT_STATES_RULE` (TL-P4-08 addendum 8). */
export const ADOPT_STATES_ID = 'q-adopt-states';
/** The front-matter key that marks what Bower last wrote in a note's Current state. */
export const STATE_KEY = 'bower_state';
/** An authored Timeline line's limit (the Claude intent's), which a line Bower makes from a Current state keeps too. */
export const AUTHORED_LINE_MAX = 200;

/**
 * The mark of a Current state's lines: FNV-1a 64-bit (http://www.isthe.com/chongo/tech/comp/fnv/) of their UTF-8
 * bytes joined by `\n`, as 16 lowercase hex digits. It tells Bower's own text from text edited since; it is no
 * security boundary, and the edit itself is still checked against the bytes and modifiedTime it read.
 */
export function stateMark(lines: readonly string[]): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of encoder.encode(lines.join('\n'))) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * A note's Current state as the integrated grammars frame it: its lines (without `- `), where they are
 * ([start, end) of the raw text, after the heading for legacy, the payload for ownership/2), the line ending to
 * write, and the front matter's mark line and closing line. `missing`: a legacy Bower note (`by: bower`) with no
 * section, where `start` = `end` is where one goes (after the blank lines that follow the front matter).
 */
interface StateSection { lines: string[]; start: number; end: number; open: 'heading' | 'tail' | null; eol: string; mark: Line | null; close: Line; missing: boolean }
function stateSection(text: string, fetched?: FetchedOwnership): StateSection | EditRefusal {
  const bytes = encoder.encode(text);
  const own = fetched ? fetched.context.read(fetched.fileId, bytes) : parseOwnership(bytes);
  if (own.status === 'invalid') return own.reason;
  const sections = sectionsOf(text, fetched);
  const close = sections?.front ? linesOf(text, sections.front.end)[0] : undefined;
  if (!sections?.front || !close) return 'not-bower';
  const marks = linesOf(text, sections.front.start, sections.front.end).filter((line) => line.text.startsWith(`${STATE_KEY}:`));
  if (marks.length > 1) return 'unsupported';
  const eol = eolOf(text);
  let start: number;
  let end: number;
  let open: StateSection['open'] = null;
  if (own.status === 'v2') {
    const span = sections.current;
    if (!span) return 'unsupported';
    start = span.start;
    end = span.end;
  } else {
    const legacy = sections;
    if (!legacy.current) {
      // No section in a Bower note: it goes where the grammar reads one, after the blank lines below the front matter.
      let at = legacy.frontEnd;
      while (text.startsWith('\n', at) || text.startsWith('\r\n', at)) at += text[at] === '\r' ? 2 : 1;
      // A heading with nothing after it, not even a line ending, is not read as a section: never a second one.
      if (text.startsWith('## Current state', at)) return 'unsupported';
      return { lines: [], start: at, end: at, open: null, eol, mark: marks[0] ?? null, close, missing: true };
    }
    const heading = linesOf(text, legacy.current.start, legacy.current.end)[0];
    if (!heading) return 'unsupported';
    start = heading.after;
    end = legacy.current.end;
    // The file can end at the heading or at the last line, with no line ending: the rewrite keeps it that way.
    open = heading.after === heading.end ? 'heading' : end > start && text[end - 1] !== '\n' ? 'tail' : null;
  }
  const lines = linesOf(text, start, end);
  if (!lines.every((line) => line.text.startsWith('- '))) return 'unsupported';
  return { lines: lines.map((line) => line.text.slice(2)), start, end, open, eol, mark: marks[0] ?? null, close, missing: false };
}
const markOf = (section: StateSection): string | null => section.mark?.text.slice(STATE_KEY.length + 1).trim() ?? null;
const sameLines = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((line, i) => line === b[i]);

/**
 * Whose a note's Current state is now (TL-P4-10):
 * - `bower`: its mark is what Bower last wrote there;
 * - `person`: its lines differ from its mark, so the person edited it;
 * - `unmarked`: no mark. It is the person's, and only a rule that says so lets Bower take it over: the planner then
 *   sets `adopted` on the change, and `applyChanges` refuses an unmarked section without it;
 * - `missing`: a Bower note with no section, which Bower may add with its mark.
 * Null when there is none Bower could write (not Bower's note, a form it does not write, not UTF-8).
 */
export type StateOwner = 'bower' | 'person' | 'unmarked' | 'missing';
export function currentStateOf(bytes: Uint8Array, fetched?: FetchedOwnership, personal = false): { owner: StateOwner; lines: string[] } | null {
  let text: string;
  try { text = decoder.decode(bytes); }
  catch {
    // expected: a file that is not UTF-8 has no Current state Bower can read; nothing is planned for it.
    return null;
  }
  if (!personal && !byBower(text, fetched)) return null;
  const section = stateSection(text, fetched);
  if (typeof section === 'string' || (personal && !byBower(text, fetched) && section.missing)) return null;
  const mark = markOf(section);
  const owner: StateOwner = !byBower(text, fetched) ? 'person' : section.missing ? 'missing' : mark === null ? 'unmarked' : mark === stateMark(section.lines) ? 'bower' : 'person';
  return { owner, lines: section.lines };
}

/** The mark a note's Current state carries (what Bower last wrote there), or null when it has none. */
export function stateMarkOf(bytes: Uint8Array, fetched?: FetchedOwnership): string | null {
  try {
    const section = stateSection(decoder.decode(bytes), fetched);
    return typeof section === 'string' || section.missing ? null : markOf(section);
  } catch {
    // expected: a file that is not UTF-8 has no mark to read.
    return null;
  }
}

/**
 * What Bower would have written in a Current state, as one Timeline line within an authored line's limits, naming
 * only what the section does not already hold (`existing`) nor Bower last wrote there (`said`: the lines of the state
 * change whose mark the section carries, read from its run's manifest; none when that change cannot be read, so
 * nothing is left out on a guess): as many whole lines as fit, or the first one cut at a word with an ellipsis. Null
 * when nothing is new, so no line is written.
 */
export function stateNewsLine(lines: readonly string[], existing: readonly string[], said: readonly string[] = []): string | null {
  const lead = NEWS_LEAD;
  const plain = (line: string): string => line.replace(/ · /g, ', ').replace(/\[\[|\]\]/g, '').replace(/;/g, ',').trim().replace(/[.!?]+$/, '');
  const held = new Set(existing.map((line) => plain(line).toLowerCase()));
  // Plain news: the new lines joined by commas, the sentence taking one full stop at its end. A later line starts in
  // lower case (not an acronym), so the sentence reads as one.
  const old = new Set(said);
  const clean = lines.filter((line) => !old.has(line)).map(plain).filter((line) => line && !held.has(line.toLowerCase()))
    .map((line, i) => (i && /^[A-Z][a-z]/.test(line) ? `${line[0]?.toLowerCase() ?? ''}${line.slice(1)}` : line))
    // After the person's own lines, an article opener reads on from "New:"; a name keeps its capital.
    .map((line, i) => (i === 0 && existing.length > 0 && /^(A|An|The) /.test(line) ? `${line[0]?.toLowerCase() ?? ''}${line.slice(1)}` : line));
  if (!clean.length) return null;
  let text = lead;
  for (const [i, line] of clean.entries()) {
    const next = `${text}${i ? ', ' : ''}${line}`;
    if (next.length + 1 > AUTHORED_LINE_MAX) break;
    text = next;
  }
  if (text !== lead) return `${text}.`;
  const room = AUTHORED_LINE_MAX - lead.length - 1;
  const first = clean[0] ?? '';
  const cut = first.slice(0, room).replace(/\s+\S*$/, '');
  return `${lead}${cut || first.slice(0, room)}…`;
}

function rewriteState(text: string, change: Extract<Change, { kind: 'state-rewrite' }>, fetched?: FetchedOwnership): Step | { refused: EditRefusal } {
  const personal = !byBower(text, fetched);
  if (personal && (!change.granted || change.granted.mark !== null || change.recordIds.length !== 1 || change.recordIds[0] !== change.granted.answer)) return { refused: 'not-bower' };
  const section = stateSection(text, fetched);
  if (typeof section === 'string') return { refused: section };
  if (personal && (section.missing || change.lines.length !== section.lines.length
    || section.lines.filter((line, i) => line.trim() !== change.lines[i]?.trim()).length !== 1)) return { refused: 'not-bower' };
  const mark = markOf(section);
  // A section the person edited is written over only by their yes to it (`granted`), under the mark it had when asked.
  if (change.granted && (section.missing || mark !== change.granted.mark)) return { refused: 'person-edited' };
  if (!section.missing && mark !== null && mark !== stateMark(section.lines) && !change.granted) return { refused: 'person-edited' };
  // No mark is the person's: only a rule's grant (`adopted`) lets Bower rewrite it.
  if (!personal && !section.missing && mark === null && !change.adopted) return { refused: 'person-edited' };
  // A release only takes back Bower's own write: a section Bower marked.
  if (change.release && (section.missing || mark === null)) return { refused: 'person-edited' };
  if (!sameLines(section.lines, change.previous)) return { refused: 'state-changed' };
  // The same lines again change nothing, not even the mark (rule 5).
  if (sameLines(change.lines, change.previous)) return { text, added: [], rules: null };
  if (personal) {
    const index = section.lines.findIndex((line, i) => line.trim() !== change.lines[i]?.trim());
    const bullet = linesOf(text, section.start, section.end)[index];
    if (!bullet) return { refused: 'invariant' };
    return { text: text.slice(0, bullet.start) + `- ${change.lines[index]}` + text.slice(bullet.end), added: [], rules: null };
  }
  const { eol } = section;
  const written = change.lines.map((line) => `- ${line}`).join(eol);
  let body: string;
  if (section.missing) {
    // A new section, its heading on a line of its own and a blank line before what follows (as `serializeNote`).
    const lead = section.start > 0 && text[section.start - 1] !== '\n' ? eol : '';
    body = `${lead}## Current state${eol}${written}${eol}${section.start < text.length ? eol : ''}`;
  } else if (!change.lines.length) body = '';
  else body = section.open === 'heading' ? `${eol}${written}` : section.open === 'tail' ? written : `${written}${eol}`;
  // Bower's mark of what it wrote; an undo of a granted write puts back the mark the person's lines had.
  const markLine = `${STATE_KEY}: ${change.mark ?? stateMark(change.lines)}`;
  // Right to left, so earlier offsets hold: the section first, then the mark in the front matter.
  let next = text.slice(0, section.start) + body + text.slice(section.end);
  // Given back to the person: their lines again, with no mark (the section is not Bower's any more).
  if (change.release) return { text: section.mark ? next.slice(0, section.mark.start) + next.slice(section.mark.after) : next, added: [], rules: null };
  next = section.mark
    ? next.slice(0, section.mark.start) + markLine + next.slice(section.mark.end)
    : next.slice(0, section.close.start) + markLine + eol + next.slice(section.close.start);
  return { text: next, added: [], rules: null };
}

/**
 * The text with the Current state's lines and the mark line taken out: what a state rewrite never touches. With
 * `heading`, a legacy section's heading goes too (to compare a note that had none with one that has it now).
 */
function outsideState(text: string, heading = false): string | null {
  const section = stateSection(text);
  if (typeof section === 'string') return null;
  let from = section.start;
  if (heading && !section.missing) {
    const current = sectionsOf(text)?.current;
    if (!current) return null;
    from = current.start;
  }
  const cut = text.slice(0, from) + text.slice(section.end);
  if (!section.mark) return cut;
  return cut.slice(0, section.mark.start) + cut.slice(section.mark.after);
}
function stateHolds(before: string, after: string, change: Extract<Change, { kind: 'state-rewrite' }>): boolean {
  const a = parseOwnership(encoder.encode(before));
  const b = parseOwnership(encoder.encode(after));
  if (a.status === 'invalid' || b.status !== a.status) return false;
  if (change.granted?.mark === null && !byBower(before)) {
    const old = stateSection(before);
    const section = stateSection(after);
    if (typeof old === 'string' || typeof section === 'string' || markOf(section) !== null) return false;
    const index = old.lines.findIndex((line, i) => line.trim() !== change.lines[i]?.trim());
    const was = linesOf(before, old.start, old.end)[index];
    const now = linesOf(after, section.start, section.end)[index];
    return !!was && !!now && now.text === `- ${change.lines[index]}`
      && before.slice(0, was.start) === after.slice(0, now.start)
      && before.slice(was.end) === after.slice(now.end);
  }
  const old = stateSection(before);
  const added = typeof old !== 'string' && old.missing;
  const was = outsideState(before);
  const now = outsideState(after, added);
  if (was === null || now === null) return false;
  if (added) {
    // A section added: the rest reads as before, but for the line endings around the new block.
    const at = old.start - (old.mark ? old.mark.after - old.mark.start : 0);
    const eol = eolOf(before);
    const around = [now, now.slice(0, at) + now.slice(at + eol.length), now.slice(0, at) + now.slice(at + 2 * eol.length)];
    if (!around.includes(was)) return false;
  } else if (now !== was && now.replace(/\r?\n$/, '') !== was) return false; // only a heading that ended the file gains one
  const section = stateSection(after);
  if (typeof section === 'string' || section.missing || !sameLines(section.lines, change.lines) || markOf(section) !== (change.release ? null : (change.mark ?? stateMark(change.lines)))) return false;
  try {
    const read = (text: string): unknown => {
      const note = parseNote('note.md', text);
      return [note.summary, note.properties, note.tags, note.body, note.timeline, note.bowerNote ?? null, note.byBower];
    };
    return JSON.stringify(read(before)) === JSON.stringify(read(after)) && sameLines(parseNote('note.md', after).currentState, change.lines);
  } catch (error) {
    // expected: a result that cannot be read back fails the invariant; logged here, its cause says why.
    console.error('A rewritten Current state could not be read back:', error);
    return false;
  }
}

/**
 * The changes that take an edit back (C13), from what the manifest kept: a state rewrite's lines are replaced by the
 * lines it replaced, none when the section was empty (TL-P4-10 point 4); one a rule adopted is given back without a mark,
 * and one the person's yes granted (`granted`) under the mark it had, so it reads as theirs again. Only a Current state Bower still owns is
 * restored, through `applyChanges` on the bytes as they are then (a person's later edit refuses it as
 * `person-edited`). The other kinds are taken back by later entries.
 */
export function undoChanges(changes: readonly Change[]): Change[] {
  return changes.flatMap((change): Change[] => (change.kind === 'state-rewrite'
    ? [{ kind: 'state-rewrite', recordIds: [], previous: change.lines, lines: change.previous, ...(change.adopted ? { release: true as const } : {}), ...(change.granted?.mark ? { mark: change.granted.mark } : {}) }]
    : []));
}

// ---------------------------------------------------------------------------------------------
// link-rewrite
// ---------------------------------------------------------------------------------------------

/** Inline code spans (a backtick run to the next run of the same length on the line) blanked out, same length. */
function blankCode(line: string): string {
  const out = line.split('');
  for (let i = 0; i < line.length;) {
    if (line[i] !== '`') { i++; continue; }
    let j = i;
    while (line[j] === '`') j++;
    let close = -1;
    for (let k = j; k < line.length;) {
      if (line[k] !== '`') { k++; continue; }
      let m = k;
      while (line[m] === '`') m++;
      if (m - k === j - i) { close = m; break; }
      k = m;
    }
    if (close < 0) { i = j; continue; }
    for (let x = i; x < close; x++) out[x] = '\u0000';
    i = close;
  }
  return out.join('');
}

interface Replacement { at: number; length: number; to: string }
/** Tokens on one line in [start, end): the trimmed target before `|`, `#` or `^` is replaced, nothing else. */
function tokens(text: string, start: number, end: number, renames: ReadonlyMap<string, string>, out: Replacement[]): void {
  const line = blankCode(text.slice(start, end));
  for (const match of line.matchAll(/\[\[([^\]\r\n]*)\]\]/g)) {
    const name = (match[1] ?? '').split('|')[0] ?? '';
    const to = renames.get(linkTarget(name));
    if (to === undefined) continue;
    const head = name.split(/[#^]/)[0] ?? '';
    const lead = head.length - head.trimStart().length;
    out.push({ at: start + match.index + 2 + lead, length: head.trim().length, to });
  }
}
/** Lines of a range, skipping fenced code as ownership/2 defines it. */
function fenced(text: string, start: number, end: number, renames: ReadonlyMap<string, string>, out: Replacement[]): void {
  let fence: Fence | null = null;
  for (const line of linesOf(text, start, end)) {
    const previous = fence;
    fence = fenceAfter(line.text, fence);
    if (previous || fence) continue;
    tokens(text, line.start, line.end, renames, out);
  }
}
/** Frontmatter values: after a key's first `:`, or the whole line (YAML list items); never `bower_format`. */
function values(text: string, renames: ReadonlyMap<string, string>, out: Replacement[], fetched?: FetchedOwnership): void {
  for (const line of frontmatterLines(text, fetched)) {
    if (/^\s*bower_format\s*:/.test(line.text)) continue;
    const colon = line.text.indexOf(':');
    tokens(text, colon > 0 ? line.start + colon + 1 : line.start, line.end, renames, out);
  }
}

function relink(text: string, change: Extract<Change, { kind: 'link-rewrite' }>, fetched?: FetchedOwnership): Step {
  const bytes = encoder.encode(text);
  const own = fetched ? fetched.context.read(fetched.fileId, bytes) : parseOwnership(bytes);
  if (own.status === 'invalid') return { refused: own.reason };
  const renames = new Map(change.renames.map((item) => [item.from.toLowerCase(), item.to]));
  const out: Replacement[] = [];
  if (own.status === 'v2') {
    values(text, renames, out, fetched);
    for (const payload of Object.values(own.payloads)) {
      const span = spanOf(bytes, payload);
      fenced(text, span.start, span.end, renames, out);
    }
  } else if (own.status === 'plain') fenced(text, 0, text.length, renames, out);
  else {
    const legacy = sectionsOf(text, fetched);
    if (!legacy) return { refused: 'invariant' };
    values(text, renames, out, fetched);
    fenced(text, legacy.frontEnd, text.length, renames, out);
  }
  // One simultaneous pass: each target is replaced once, right to left so earlier offsets hold.
  let next = text;
  for (const item of [...out].sort((a, b) => b.at - a.at)) next = next.slice(0, item.at) + item.to + next.slice(item.at + item.length);
  return { text: next, added: [], rules: null };
}

// ---------------------------------------------------------------------------------------------
// rules-wording
// ---------------------------------------------------------------------------------------------

const ruleText = (line: string): string | null => RULE_LINE.exec(line)?.[1] ?? null;
const sinceDate = (since: number): string => new Date(since).toISOString().slice(0, 10);
/** The `## Rules` section as `rules-format.ts` reads it: its heading line and the next heading line, if any. */
function rulesSection(text: string): { heading: Line; lines: Line[]; next: Line | null } | null {
  const lines = linesOf(text);
  const at = lines.findIndex((line) => line.text.trim() === '## Rules');
  const heading = lines[at];
  if (!heading) return null;
  const rest = lines.slice(at + 1);
  const stop = rest.findIndex((line) => HEADING.test(line.text));
  return { heading, lines: stop < 0 ? rest : rest.slice(0, stop), next: stop < 0 ? null : rest[stop] ?? null };
}
/** Deletes every rule with exactly this text, with the "You wrote" lines that belong to it. */
function removeRule(text: string, wording: string): string {
  const section = rulesSection(text);
  if (!section) return text;
  const drop = new Set<Line>();
  let removing = false;
  for (const line of section.lines) {
    const found = ruleText(line.text);
    if (found !== null) removing = found === wording;
    if (removing && (found !== null || WORDS_LINE.test(line.text))) drop.add(line);
  }
  let next = text;
  for (const line of [...drop].reverse()) next = next.slice(0, line.start) + next.slice(line.after);
  return next;
}

/**
 * Your rule lines as Rules.md takes them, the one home for their order (TL-P2-26, TL-P4-27 addendum 4 (1)), used by
 * wordRules, the planner's count and the app's list of rules. Adds and removals apply as one sequence by since (stable,
 * journal ids break equal-time ties): a removal resolves its words to the worded rule and takes out any add before it
 * that it repeats; an add that repeats a rule there is skipped. `removed`: the texts taken out of Rules.md; `accepted`: the adds
 * written, oldest first. No removals, or any removal without since, keeps the old order: removals first, stable adds.
 */
export function ruleSequence(rules: readonly Rule[], add: readonly RuleAdd[], remove: readonly RuleRemove[]): { removed: ReadonlySet<string>; accepted: RuleAdd[] } {
  const removed = new Set<string>();
  let accepted: RuleAdd[] = [];
  const asRule = (a: RuleAdd): Rule => ({ id: '', text: a.text, ...(a.yourWords ? { yourWords: a.yourWords } : {}), since: a.since });
  const inOrder = remove.length > 0 && remove.every((r) => r.since !== undefined);
  // TL-P2-26: adds are processed in ascending since (stable for equal times), whatever order the change lists them in.
  const adds = [...add].sort((a, b) => a.since - b.since).map((a) => ({ add: a, since: a.since }));
  const removes = remove.map((r) => ({ remove: r, since: r.since ?? 0 }));
  const steps: Array<{ add: RuleAdd; since: number } | { remove: RuleRemove; since: number }> = inOrder
    ? [...adds, ...removes].sort((a, b) => a.since - b.since ||
      ('add' in a ? a.add.recordId : a.remove.recordId).localeCompare('add' in b ? b.add.recordId : b.remove.recordId))
    : [...removes, ...adds];
  for (const step of steps) {
    if ('remove' in step) {
      // Resolve the add line's own words through the same rule identity used for additions.
      const worded = inOrder ? ruleLike(rules.filter((r) => !removed.has(r.text)), step.remove.text) : undefined;
      removed.add(worded?.text ?? step.remove.text);
      accepted = accepted.filter((a) => !ruleLike([asRule(a)], step.remove.text));
      continue;
    }
    const known = [...rules.filter((r) => !removed.has(r.text)), ...accepted.map(asRule)];
    if (ruleLike(known, step.add.text) || (step.add.yourWords.trim() && ruleLike(known, step.add.yourWords))) continue;
    accepted.push(step.add);
  }
  return { removed, accepted };
}

function wordRules(text: string, change: Extract<Change, { kind: 'rules-wording' }>, authors: Authors, fetched?: FetchedOwnership): Step {
  const bytes = encoder.encode(text);
  const own = fetched ? fetched.context.read(fetched.fileId, bytes) : parseOwnership(bytes);
  if (own.status === 'invalid') return { refused: own.reason };
  if (own.status === 'v2') return { refused: 'unsupported' };
  if (own.status === 'plain' || !byBower(text, fetched)) return { refused: 'not-bower' };
  const eol = eolOf(text);
  const { removed, accepted } = ruleSequence(parseRules(text), change.add, change.remove);
  let next = [...removed].reduce(removeRule, text);
  // Each new rule goes to the top in turn, so the newest by since ends first.
  const newest = [...accepted].reverse();
  if (newest.length) {
    // Empty words get no "You wrote" line, as serializeRules writes them (review M2).
    const block = newest.map((add) => `- ${add.text} <!-- since ${sinceDate(add.since)} -->${eol}${add.yourWords ? `  *You wrote: "${add.yourWords}"*${eol}` : ''}`).join('');
    const section = rulesSection(next);
    if (!section) next = authors.splice(next, next.length, `${eol}## Rules${eol}${eol}${block}`);
    else {
      const first = section.lines[0];
      const at = first && !first.text.trim() ? first.after : section.heading.after;
      next = authors.splice(next, at, section.heading.after === section.heading.end ? eol + block : block);
    }
  }
  // A summary line in the generated pattern is updated to the new count; any other summary stays.
  const count = parseRules(next).length;
  const summary = frontmatterLines(next).find((line) => SUMMARY_LINE.test(line.text));
  if (summary) next = `${next.slice(0, summary.start)}summary: ${count} ${count === 1 ? 'rule' : 'rules'} Bower follows in every tidy-up.${next.slice(summary.end)}`;
  const kept = parseRules(text).filter((item) => !removed.has(item.text)).map((item) => ({ text: item.text, yourWords: item.yourWords, since: item.since }));
  const rules = [...newest.map((add) => ({ text: add.text, yourWords: add.yourWords || undefined, since: Date.parse(`${sinceDate(add.since)}T00:00:00Z`) })), ...kept];
  return { text: next, added: [], rules };
}

// ---------------------------------------------------------------------------------------------
// The re-parse invariant (R3-1, R4-3 m-b)
// ---------------------------------------------------------------------------------------------

/** Link targets masked, so two texts compare equal when only link targets differ. */
const mask = (text: string): string => text.replace(/\[\[[^\]\r\n|#^]*/g, '[[\u0000');
const tasksOf = (tasks: readonly { index: number; label: string; done: boolean }[], same: (a: string) => string): string =>
  JSON.stringify(tasks.map((task) => [task.index, same(task.label), task.done]));
/** R4-3 m-b: every original character kept, in order. */
function insertionOnly(before: string, after: string): boolean {
  let i = 0;
  for (let j = 0; j < after.length && i < before.length; j++) if (before[i] === after[j]) i++;
  return i === before.length;
}
function timelineOf(text: string): unknown[] | null {
  try { return timelineEntries(text); }
  catch (error) {
    // expected: a result that cannot be read back fails the invariant; logged here, its cause says why.
    console.error('An edited note could not be read back:', error);
    return null;
  }
}
/** For Rules.md: the bytes outside `## Rules` (up to the next heading) are identical, except the summary line. */
function outsideRules(text: string): { before: string; after: string; found: boolean } {
  const section = rulesSection(text);
  const summary = (part: string): string => linesOf(part).map((line) => (SUMMARY_LINE.test(line.text) ? 'summary:\u0000' : line.text) + part.slice(line.end, line.after)).join('');
  if (!section) return { before: summary(text), after: '', found: false };
  return { before: summary(text.slice(0, section.heading.start)), after: section.next ? text.slice(section.next.start) : '', found: true };
}

/**
 * Known limit (TL-P2-26, D): these checks re-parse the result; they do not recompute R3-2's placement
 * independently. A faulty splice whose result is still the original bytes plus insertions, with every protected
 * region and the re-parsed Timeline as expected, is accepted: for example one that drops a blank line inside a
 * legacy Timeline section and re-inserts the line ending around the new entry. The placement itself is pinned
 * by the byte-exact fixtures, not by this invariant.
 */
function holds(before: string, after: string, change: Change, step: Exclude<Step, { refused: EditRefusal }>): boolean {
  const a = parseOwnership(encoder.encode(before));
  const b = parseOwnership(encoder.encode(after));
  if (a.status === 'invalid' || b.status === 'invalid' || b.status !== a.status) return false;
  if (before.startsWith('\ufeff') !== after.startsWith('\ufeff')) return false;
  if (change.kind === 'rules-wording') {
    const was = outsideRules(before);
    const now = outsideRules(after);
    const outside = was.found
      ? now.found && now.before === was.before && now.after === was.after
      : now.found && now.after === '' && now.before.startsWith(was.before) && /^[\r\n]*$/.test(now.before.slice(was.before.length));
    const read = parseRules(after).map((rule) => ({ text: rule.text, yourWords: rule.yourWords, since: rule.since }));
    return outside && JSON.stringify(read) === JSON.stringify(step.rules);
  }
  const links = change.kind === 'link-rewrite';
  const same = (text: string): string => (links ? mask(text) : text);
  const beforeBytes = encoder.encode(before);
  const afterBytes = encoder.encode(after);
  const slice = (text: string, bytes: Uint8Array, span: ByteSpan): string => {
    const at = spanOf(bytes, span);
    return text.slice(at.start, at.end);
  };
  // A plain note is wholly the person's; a request's one line goes in its Timeline, which ends the note: every byte
  // before that section stays, and the section only gains (checked below).
  const plainAppend = a.status === 'plain' && change.kind === 'timeline-append';
  if (plainAppend) {
    const was = sectionsOf(before)?.timeline;
    const now = sectionsOf(after)?.timeline;
    if (!was || !now || before.slice(0, was.start) !== after.slice(0, now.start)) return false;
  } else if (same(slice(before, beforeBytes, a.personal)) !== same(slice(after, afterBytes, b.personal))) return false;
  if (tasksOf(a.tasks, same) !== tasksOf(b.tasks, same)) return false;
  if (a.status === 'v2' && b.status === 'v2') {
    const skeleton = (text: string, bytes: Uint8Array, payloads: Readonly<Record<string, ByteSpan>>): string => {
      let out = '';
      let at = 0;
      for (const span of Object.values(payloads).sort((a, b) => a.start - b.start)) {
        if (!span) return '';
        const chars = spanOf(bytes, span);
        out += `${text.slice(at, chars.start)}\u0000`;
        at = chars.end;
      }
      return out + text.slice(at);
    };
    if (same(skeleton(before, beforeBytes, a.payloads)) !== same(skeleton(after, afterBytes, b.payloads))) return false;
    for (const [owner, payload] of Object.entries(a.payloads)) {
      const afterPayload = (b.payloads as Readonly<Record<string, ByteSpan>>)[owner];
      if (!afterPayload) return false;
      if (change.kind === 'timeline-append' && owner === 'timeline') continue;
      if (same(slice(before, beforeBytes, payload)) !== same(slice(after, afterBytes, afterPayload))) return false;
    }
  } else if (a.status === 'legacy') {
    const was = sectionsOf(before);
    const now = sectionsOf(after);
    if (!was || !now) return false;
    const parts = (text: string, at: Sections): string[] => [
      text.slice(0, at.frontEnd), at.current ? text.slice(at.current.start, at.current.end) : '',
      at.bowerNote ? text.slice(breakBefore(text, at.bowerNote.start)) : '',
    ];
    if (JSON.stringify(parts(before, was).map(same)) !== JSON.stringify(parts(after, now).map(same))) return false;
  }
  if (links) return mask(before) === mask(after);
  if (change.kind !== 'timeline-append' || !insertionOnly(before, after)) return false;
  const previous = timelineOf(before);
  const next = timelineOf(after);
  const added = step.added.map((entry) => ({ date: entry.date, text: entry.text, ...(entry.source !== null ? { source: entry.source } : {}) }));
  return previous !== null && next !== null && JSON.stringify(next) === JSON.stringify([...previous, ...added]);
}

// ---------------------------------------------------------------------------------------------
// The author
// ---------------------------------------------------------------------------------------------

export type MocSnapshot = { text: string; regions: Record<MocRegion, string> };

/** Freeze only regions the existing ownership author can rewrite. Personal maps grant no authority. */
export function mocSnapshot(text: string): MocSnapshot | null {
  const bytes = encoder.encode(text);
  const own = parseOwnership(bytes);
  const note = parseNote('note.md', text);
  if (!note.byBower || !note.properties.some((p) => p.key === 'type' && p.value === 'moc') || (own.status !== 'v2' && own.status !== 'legacy')) return null;
  const regions = {} as Record<MocRegion, string>;
  for (const region of MOC_REGIONS) {
    const span = own.status === 'v2' ? own.payloads[region] : own.layout.moc?.[region];
    if (!span) return null;
    regions[region] = decoder.decode(bytes.subarray(span.start, span.end));
  }
  return { text, regions };
}

/** Add only framing and the format declaration; every legacy byte remains at its original relative position. */
function framedMoc(text: string): string | null {
  const bytes = encoder.encode(text);
  const own = parseOwnership(bytes);
  if (own.status === 'v2') return text;
  if (own.status !== 'legacy' || !mocSnapshot(text)) return null;
  const eol = eolOf(text);
  const marker = (kind: 'begin' | 'end', region: string): string => `<!-- bower:ownership/2 ${kind} ${region} -->${eol}`;
  const inserts = new Map<number, string>();
  const add = (at: number, value: string): void => { inserts.set(at, (inserts.get(at) ?? '') + value); };
  add(own.layout.frontEnd, ['current', 'personal', 'timeline', 'bower-note'].map((owner) => marker('begin', owner) + marker('end', owner)).join(''));
  for (const region of MOC_REGIONS) {
    const span = own.layout.moc?.[region];
    if (!span) return null;
    add(charAt(bytes, span.start), marker('begin', region));
    add(charAt(bytes, span.end), marker('end', region));
  }
  const front = own.layout.front;
  if (!front) return null;
  add(charAt(bytes, front.start), `bower_format: ownership/2${eol}`);
  let out = text;
  for (const [at, insert] of [...inserts].sort(([a], [b]) => b - a)) out = out.slice(0, at) + insert + out.slice(at);
  return parseOwnership(encoder.encode(out)).status === 'v2' ? out : null;
}

type RegionChange = Extract<Change, { kind: 'moc-rewrite' | 'profile-rewrite' }>;
const regionOf = (change: RegionChange): MocRegion | 'profile' => change.kind === 'profile-rewrite' ? 'profile' : change.region;
function rewriteRegion(text: string, change: RegionChange, fetched?: FetchedOwnership): Step {
  const framed = change.kind === 'profile-rewrite' ? text : framedMoc(text);
  if (framed === null) return { refused: 'not-bower' };
  const bytes = encoder.encode(framed);
  const own = framed === text && fetched ? fetched.context.read(fetched.fileId, bytes) : parseOwnership(bytes);
  const note = parseNote('note.md', framed);
  const span = own.status === 'v2' ? own.payloads[regionOf(change)] : undefined;
  if ((change.kind === 'moc-rewrite' && (!note.byBower || !note.properties.some((p) => p.key === 'type' && p.value === 'moc'))) || !span) return { refused: 'not-bower' };
  const at = spanOf(bytes, span);
  if (framed.slice(at.start, at.end) !== change.previous) return { refused: 'person-edited' };
  return { text: framed.slice(0, at.start) + change.text + framed.slice(at.end), added: [], rules: null };
}
function regionHolds(before: string, after: string, change: RegionChange): boolean {
  const framed = change.kind === 'profile-rewrite' ? before : framedMoc(before);
  if (framed === null) return false;
  const aBytes = encoder.encode(framed), bBytes = encoder.encode(after);
  const a = parseOwnership(aBytes), b = parseOwnership(bBytes);
  const aSpan = a.status === 'v2' ? a.payloads[regionOf(change)] : undefined;
  const bSpan = b.status === 'v2' ? b.payloads[regionOf(change)] : undefined;
  if (!aSpan || !bSpan) return false;
  const x = spanOf(aBytes, aSpan), y = spanOf(bBytes, bSpan);
  return framed.slice(0, x.start) === after.slice(0, y.start) && framed.slice(x.end) === after.slice(y.end)
    && after.slice(y.start, y.end) === change.text;
}

const refuse = (reason: EditRefusal): EditResult => ({ ok: false, reason });

/** `applyChanges` with a replaceable splice; only tests pass anything but the real one. */
export function applyChangesUsing(before: Uint8Array, changes: readonly Change[], authors: Authors, fetched?: EditFetched): EditResult {
  return applyAtVersion(before, changes, authors, fetched, 2);
}

/** Version 1 is used only to prove a stored satisfaction; all current edits use version 2. */
function applyAtVersion(before: Uint8Array, changes: readonly Change[], authors: Authors, fetched: EditFetched | undefined, version: 1 | 2): EditResult {
  if (before.byteLength > EDIT_FILE_LIMIT) return refuse('too-large');
  let text: string;
  try { text = decoder.decode(before); }
  catch {
    // expected: fatal UTF-8 validation is the refusal itself (rule 6); nothing is edited.
    return refuse('invalid-encoding');
  }
  const own = fetched ? fetched.context.read(fetched.fileId, before) : parseOwnership(before);
  if (own.status === 'invalid') return refuse(own.reason);
  if (!ordered(changes)) return refuse('order');
  if (!changes.every(fieldsOk)) return refuse('field');
  const note = parseNote(fetched?.path ?? 'note.md', text, fetched);
  const map = isHub(note.path, fetched?.name, note.properties.find((p) => p.key === 'type')?.value);
  if (version === 2 && map && own.status !== 'v2' && !note.byBower && changes.some((c) => c.kind !== 'link-rewrite')) return refuse('not-bower');
  let current = text;
  let source = fetched;
  for (const change of changes) {
    // Intermediate text is generated, even when it carries the source file id.
    const step = change.kind === 'state-rewrite' ? rewriteState(current, change, source)
      : change.kind === 'link-rewrite' ? relink(current, change, source)
        : change.kind === 'timeline-append' ? appendLines(current, change, authors, source) : change.kind === 'moc-rewrite' || change.kind === 'profile-rewrite' ? rewriteRegion(current, change, source) : wordRules(current, change, authors, source);
    source = fetched;
    if ('refused' in step) return refuse(step.refused);
    const kept = change.kind === 'moc-rewrite' || change.kind === 'profile-rewrite' ? regionHolds(current, step.text, change) : change.kind === 'state-rewrite' ? stateHolds(current, step.text, change) : holds(current, step.text, change, step);
    if (step.text !== current && !kept) return refuse('invariant');
    current = step.text;
  }
  if (current === text) return refuse('unchanged');
  return { ok: true, text: current, bytes: encoder.encode(current) };
}

/** The one author of an edit's after-text: the bytes after every change in order, or why it is refused. */
export function applyChanges(before: Uint8Array, changes: readonly Change[], fetched?: EditFetched): EditResult {
  return applyChangesUsing(before, changes, { splice: (text, at, insert) => text.slice(0, at) + insert + text.slice(at) }, fetched);
}

/** Historical satisfaction still proves the full author result is unchanged; it can never grant an edit. */
export function satisfiedAppendUnchanged(before: Uint8Array, change: Extract<Change, { kind: 'timeline-append' }>, fetched: EditFetched, version: 1 | 2): boolean {
  const result = applyAtVersion(before, [change], { splice: (text, at, insert) => text.slice(0, at) + insert + text.slice(at) }, fetched, version);
  return !result.ok && result.reason === 'unchanged';
}

// ---------------------------------------------------------------------------------------------
// Adapter decisions (rules 1 and 5) and the saved-link key (R4-3 m-f), all pure
// ---------------------------------------------------------------------------------------------

const digest = (bytes: Uint8Array): Promise<string> => sha256(new Blob([bytes.slice().buffer]));

/** Rule 1: the file as re-read still hashes to `beforeContent`, recomputes to `text`, and `content` describes it. */
export async function recheckEdit(effect: EditText, bytes: Uint8Array, fetched?: EditFetched): Promise<'ok' | 'conflict'> {
  if (bytes.byteLength !== effect.beforeContent.size || await digest(bytes) !== effect.beforeContent.sha256) return 'conflict';
  const result = applyChanges(bytes, effect.changes, { ...fetched, fileId: effect.before.fileId,
    context: fetched?.context ?? createOwnershipContext(), path: effect.path, name: effect.before.name });
  if (!result.ok || result.text !== effect.text) return 'conflict';
  const { content } = effect;
  if (content.encoding !== 'utf8' || content.size !== result.bytes.byteLength || content.sha256 !== await digest(result.bytes)) return 'conflict';
  return 'ok';
}

/**
 * The undo of one edit (C13, `keep-one-note-merge`) from its before-image: the note's text as the run read it, kept in
 * the manifest as `beforeText` (an undo log's before-image, as ARIES keeps one: Mohan et al., "ARIES", ACM TODS 17(1),
 * 1992, https://dl.acm.org/doi/10.1145/128765.128770). Only a note still as the edit left it is put back; a later edit
 * of the person's refuses it as `person-edited`, and an edit with no before-image as `unsupported`.
 */
export async function undoEdit(effect: EditText, now: Uint8Array): Promise<EditResult> {
  if (effect.beforeText === undefined) return { ok: false, reason: 'unsupported' };
  if (now.byteLength !== effect.content.size || await digest(now) !== effect.content.sha256) return { ok: false, reason: 'person-edited' };
  return { ok: true, text: effect.beforeText, bytes: encoder.encode(effect.beforeText) };
}

/** R3-6 / R4-3 m-f: a saved link's note key, SHA-256 in lowercase hex of the UTF-8 bytes of `<fileId>:saved-link-note`. */
export function savedLinkKey(fileId: string): Promise<string> {
  return digest(encoder.encode(`${fileId}:saved-link-note`));
}

// Shared MOC projection: the runner and settled report use the same exact author inputs.
export type Notes = Record<string, MaintenanceNote>;
/** Prefix metadata selects a map; only its fully parsed snapshot grants edit authority. */
export const isBowerMoc = (note: MaintenanceNote): boolean => note.owner === 'bower' && note.type === 'moc' || note.moc !== undefined;
const folderOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')));
const stem = (path: string): string => path.replace(/\.md$/, '');

/** The same shortest-unambiguous suffix for ordinary index rows and MOC member rows. */
export function noteLinks(files: Notes): Map<string, string> {
  const suffixes = new Map<string, number>();
  for (const f of Object.values(files)) {
    const parts = stem(f.path).split('/');
    for (let i = 0; i < parts.length; i++) {
      const suffix = parts.slice(i).join('/');
      suffixes.set(suffix, (suffixes.get(suffix) ?? 0) + 1);
    }
  }
  return new Map(Object.entries(files).map(([id, f]) => {
    const parts = stem(f.path).split('/');
    for (let n = 1; n <= parts.length; n++) {
      const suffix = parts.slice(-n).join('/');
      if (suffixes.get(suffix) === 1) return [id, suffix];
    }
    return [id, stem(f.path)];
  }));
}

export function mocMembership(files: Notes): Map<string, string[]> {
  const maps = Object.entries(files).filter(([, f]) => isBowerMoc(f));
  const roots = new Map<string, string>();
  const members = new Map<string, string[]>();
  const claimed = new Set<string>();
  for (const [id, f] of maps) {
    const folder = folderOf(f.path);
    if (stem(f.path).split('/').at(-1) === folder.split('/').at(-1)) {
      roots.set(folder, id);
      continue;
    }
    // Existing peer maps encode the ruled split. Resolve each old link once to one stable id.
    const ids = f.members ? f.members.filter((member) => member !== id && files[member] && !isBowerMoc(files[member]))
      : [...(f.moc?.regions['moc-members'] ?? '').matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)]
      .flatMap((match) => {
        const link = match[1] ?? '';
        const matches = Object.entries(files).filter(([other, note]) => other !== id && !isBowerMoc(note)
          && (stem(note.path) === link || stem(note.path).endsWith(`/${link}`)));
        return matches.length === 1 ? [matches[0]?.[0] ?? ''] : [];
      });
    const unique = [...new Set(ids)];
    members.set(id, unique);
    for (const member of unique) claimed.add(member);
  }
  for (const [folder, id] of roots) {
    const ids = Object.entries(files).filter(([other, f]) => {
      if (other === id || claimed.has(other) || !f.path.startsWith(`${folder}/`)) return false;
      // A descendant folder's existing map represents its entire subtree at this level.
      return ![...roots].some(([child]) => child !== folder && child.startsWith(`${folder}/`)
        && f.path.startsWith(`${child}/`) && roots.get(child) !== other);
    }).map(([other]) => other);
    members.set(id, ids);
  }
  for (const [id, ids] of members) members.set(id, ids.sort((a, b) => (files[a]?.path ?? '').localeCompare(files[b]?.path ?? '')));
  return members;
}

export function leafCount(id: string, members: ReadonlyMap<string, string[]>): number {
  const leaves = new Set<string>();
  const visited = new Set<string>();
  const visit = (member: string): void => {
    if (visited.has(member)) return;
    visited.add(member);
    const children = members.get(member);
    if (children) children.forEach(visit);
    else leaves.add(member);
  };
  visit(id);
  return leaves.size;
}

/** All changes go back through note-edit's one author and the ordinary edit-text fence. */
export function mocEdit(id: string, files: Notes, members: ReadonlyMap<string, string[]>): { changes: Change[]; text: string } | null {
  const note = files[id];
  if (!note?.moc) return null;
  const ids = members.get(id) ?? [];
  const links = noteLinks(files);
  const direct = ids.filter((member) => !members.has(member) && folderOf(files[member]?.path ?? '') === folderOf(note.path)).length;
  const regions = {
    'moc-figures': `## Figures\n\n${direct} direct ${direct === 1 ? 'note' : 'notes'}; ${leafCount(id, members)} notes in all.\n`,
    'moc-members': `## Notes\n\n${ids.map((member) => `- [[${links.get(member)}]] — ${files[member]?.summary}\n`).join('')}`,
  };
  const changes: Change[] = (['moc-figures', 'moc-members'] as const).map((region) => ({
    kind: 'moc-rewrite', region, recordIds: [], previous: note.moc?.regions[region] ?? '', text: regions[region],
  }));
  const result = applyChanges(new TextEncoder().encode(note.moc.text), changes);
  if (result.ok) return { changes, text: result.text };
  if (result.reason === 'unchanged') return null;
  throw new BowerError('unknown', 'Bower could not update its map.', undefined, { cause: result.reason });
}
