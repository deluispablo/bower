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
import { parseNote } from './note-format';
import { parseOwnership, type ByteSpan, type OwnershipFailure } from './ownership-format';
import { parseRules } from './rules-format';
import type { Change, EditEntry, EditText, Rename, RuleAdd, RuleRemove } from './run-manifest';

/** Files larger than 1 MiB are never edited (TL-P2-20 rule 6). */
export const EDIT_FILE_LIMIT = 1024 * 1024;

/**
 * `not-bower`: a Timeline line or rule wording for a note that is not Bower's; `unsupported`: rule wording on a
 * file that is not a legacy-format Rules.md; `field`: a change whose fields break the format; `order`: changes not
 * 1+ in the order link-rewrite, timeline-append, rules-wording; `invariant`: the result failed the re-parse checks;
 * `unchanged`: the result would equal the file as read, so nothing is planned (rule 5).
 */
export type EditRefusal = OwnershipFailure | 'too-large' | 'not-bower' | 'unsupported' | 'field' | 'order' | 'invariant' | 'unchanged';
export type EditResult = { ok: true; text: string; bytes: Uint8Array } | { ok: false; reason: EditRefusal };
/** The low-level splice, replaceable only so a test can inject a faulty one (R4-3 m-g). */
export type Authors = { splice: (text: string, at: number, insert: string) => string };
export type ReadBack = 'applied' | 'possible-effect' | 'unresolved';
export type Observed = { fileId: string; name: string; parents: string[]; trashed: boolean; bytes: Uint8Array };

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const ORDER: readonly Change['kind'][] = ['link-rewrite', 'timeline-append', 'rules-wording'];
const TIMELINE_LINE = /^- (.*?) · (.*?)(?: · \[\[([^\]]+)\]\])?$/;
const RULE_LINE = /^- (.*?)(?:\s*<!-- since (\d{4}-\d{2}-\d{2}) -->)?\s*$/;
const WORDS_LINE = /^\s+\*You wrote: "(.*)"\*\s*$/;
const SUMMARY_LINE = /^summary: \d+ rules? Bower follows in every tidy-up\.$/;
const HEADING = /^#{1,6}\s/;

// ---------------------------------------------------------------------------------------------
// Field rules, shared with the manifest guard
// ---------------------------------------------------------------------------------------------

const controls = (value: string): boolean => [...value].some((char) => char.charCodeAt(0) <= 0x1f || char.charCodeAt(0) === 0x7f);
/** `YYYY-MM-DD`, a real calendar date. */
function dateOk(date: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return false;
  const [year, month, day] = match.slice(1, 4).map(Number) as [number, number, number];
  const at = new Date(0);
  at.setUTCFullYear(year, month - 1, day);
  return at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day;
}
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
export function entryOk(entry: EditEntry): boolean {
  return dateOk(entry.date) && lineFieldOk(entry.text) && (entry.source === null || displayNameOk(entry.source));
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
  return remove.text.trim().length > 0 && !controls(remove.text);
}
function fieldsOk(change: Change): boolean {
  switch (change.kind) {
    case 'link-rewrite': return change.renames.length > 0 && change.renames.every(renameOk)
      && new Set(change.renames.map((item) => item.from.toLowerCase())).size === change.renames.length;
    case 'timeline-append': return change.entries.length > 0 && change.entries.every(entryOk);
    case 'rules-wording': return change.add.length + change.remove.length > 0 && change.add.every(ruleAddOk) && change.remove.every(ruleRemoveOk);
  }
}
const ordered = (changes: readonly Change[]): boolean => changes.length > 0
  && changes.every((item, i) => i === 0 || ORDER.indexOf(changes[i - 1]?.kind ?? item.kind) < ORDER.indexOf(item.kind));

/** The renames a run's moves and renames imply, as the resolver's `formerNames` follows them (chains, `taken`). */
export function renamesFor(changes: readonly ChangeEntry[], taken: ReadonlySet<string> = new Set()): Rename[] {
  return [...formerNames(changes, taken)].map(([from, path]) => ({ from, to: displayName(nameOf(path)) }));
}

// ---------------------------------------------------------------------------------------------
// Reading the file as the integrated grammars read it
// ---------------------------------------------------------------------------------------------

interface Line { start: number; end: number; after: number; text: string }
interface Fence { character: string; length: number }

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
/** A CRLF-normalized index as an index of the raw text (the legacy grammar measures normalized text). */
function rawIndex(raw: string, normalized: number): number {
  let at = 0;
  for (let n = 0; n < normalized; n++, at++) if (raw[at] === '\r' && raw[at + 1] === '\n') at++;
  return at;
}

/** ownership/2's fence transition, exactly as `ownership-format.ts` frames payloads. */
function fenceAfter(text: string, open: Fence | null): Fence | null {
  if (open) {
    const close = /^ {0,3}(`+|~+)[ \t]*$/.exec(text);
    return close?.[1]?.[0] === open.character && close[1].length >= open.length ? null : open;
  }
  const begin = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
  const run = begin?.[1];
  if (!run || (run[0] === '`' && begin?.[2]?.includes('`'))) return null;
  return { character: run[0] ?? '', length: run.length };
}

/**
 * The legacy grammar's boundaries (`ownership-format.ts` `legacy`, `note-format.ts` `split`), as raw indices:
 * the frontmatter's end, the `## Current state` block, and the `\n` before `## Timeline` and `## Bower's note`.
 */
interface Legacy { frontEnd: number; current: { start: number; end: number } | null; timeline: number | null; bower: number | null }
function legacyOf(raw: string): Legacy | null {
  const text = raw.replace(/\r\n/g, '\n');
  const close = text.startsWith('---\n') ? text.indexOf('\n---', 3) : -1;
  if (close < 0) return null;
  const lineEnd = text.indexOf('\n', close + 1);
  const frontEnd = lineEnd < 0 ? text.length : lineEnd + 1;
  let start = frontEnd;
  while (text[start] === '\n') start++;
  let current: Legacy['current'] = null;
  if (text.startsWith('## Current state\n', start)) {
    const from = start;
    start += '## Current state\n'.length;
    while (text.startsWith('- ', start)) {
      const end = text.indexOf('\n', start);
      start = end < 0 ? text.length : end + 1;
    }
    current = { start: rawIndex(raw, from), end: rawIndex(raw, start) };
  }
  let end = text.length;
  const bower = text.lastIndexOf("\n## Bower's note\n");
  const hasBower = bower >= start - 1;
  if (hasBower) end = bower;
  const timeline = text.lastIndexOf('\n## Timeline\n', end);
  const hasTimeline = timeline >= start - 1;
  return {
    frontEnd: rawIndex(raw, frontEnd), current,
    timeline: hasTimeline ? rawIndex(raw, timeline) : null, bower: hasBower ? rawIndex(raw, bower) : null,
  };
}
/** Lines 1..n-1 of a frontmatter block opened by `---` and closed by the next line starting with `---`. */
function frontmatterLines(text: string): Line[] {
  const prefix = text.startsWith('\ufeff') ? 1 : 0;
  const lines = linesOf(text, prefix);
  if (lines[0]?.text !== '---') return [];
  const close = lines.findIndex((line, i) => i > 0 && line.text.startsWith('---'));
  return close < 0 ? [] : lines.slice(1, close);
}
function byBower(text: string): boolean {
  try { return parseNote('note.md', text).byBower; }
  catch (error) {
    // expected: an unreadable note is not Bower's; logged here, its cause says why.
    console.error('A note could not be read for an edit:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// timeline-append
// ---------------------------------------------------------------------------------------------

type Step = { text: string; added: EditEntry[]; rules: Pick<Rule, 'text' | 'yourWords' | 'since'>[] | null } | { refused: EditRefusal };
const lineOf = (entry: EditEntry): string => `- ${entry.date} · ${entry.text}${entry.source !== null ? ` · [[${entry.source}]]` : ''}`;

function appendLines(text: string, change: Extract<Change, { kind: 'timeline-append' }>, authors: Authors): Step {
  const bytes = encoder.encode(text);
  const own = parseOwnership(bytes);
  if (own.status === 'invalid') return { refused: own.reason };
  if (own.status === 'plain' || (own.status === 'legacy' && !byBower(text))) return { refused: 'not-bower' };
  const eol = eolOf(text);
  let region = '';
  let at: number;
  let insert: (lines: string[]) => string;
  if (own.status === 'v2') {
    const span = spanOf(bytes, own.payloads.timeline);
    region = text.slice(span.start, span.end);
    at = span.end;
    insert = (lines) => lines.map((line) => line + eol).join('');
  } else {
    const legacy = legacyOf(text);
    if (!legacy) return { refused: 'not-bower' };
    if (legacy.timeline !== null) {
      const sectionEnd = legacy.bower ?? text.length;
      const lines = linesOf(text, legacy.timeline + (text[legacy.timeline] === '\r' ? 2 : 1), sectionEnd);
      region = text.slice(lines[0]?.start ?? sectionEnd, sectionEnd);
      const last = [...lines].reverse().find((line) => line.text.trim());
      at = last?.end ?? sectionEnd;
      insert = (lines) => lines.map((line) => eol + line).join('');
    } else if (legacy.bower !== null) {
      at = legacy.bower;
      insert = (lines) => `${eol}## Timeline${eol}${lines.join(eol)}`;
    } else {
      at = text.length;
      const final = text.endsWith('\n') ? eol : '';
      insert = (lines) => `${eol}## Timeline${eol}${lines.join(eol)}${final}`;
    }
  }
  // R3-3 and m-d: an entry is present when a line has the same text and source, whatever its date.
  const present = linesOf(region).flatMap((line) => {
    const match = TIMELINE_LINE.exec(line.text);
    return match ? [JSON.stringify([match[2] ?? '', match[3] ?? null])] : [];
  });
  const seen = new Set(present);
  const added = change.entries.filter((entry) => {
    const key = JSON.stringify([entry.text, entry.source]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!added.length) return { text, added, rules: null };
  return { text: authors.splice(text, at, insert(added.map(lineOf))), added, rules: null };
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
function values(text: string, renames: ReadonlyMap<string, string>, out: Replacement[]): void {
  for (const line of frontmatterLines(text)) {
    if (/^\s*bower_format\s*:/.test(line.text)) continue;
    const colon = line.text.indexOf(':');
    tokens(text, colon > 0 ? line.start + colon + 1 : line.start, line.end, renames, out);
  }
}

function relink(text: string, change: Extract<Change, { kind: 'link-rewrite' }>): Step {
  const bytes = encoder.encode(text);
  const own = parseOwnership(bytes);
  if (own.status === 'invalid') return { refused: own.reason };
  const renames = new Map(change.renames.map((item) => [item.from.toLowerCase(), item.to]));
  const out: Replacement[] = [];
  if (own.status === 'v2') {
    values(text, renames, out);
    for (const owner of ['current', 'personal', 'timeline', 'bower-note'] as const) {
      const span = spanOf(bytes, own.payloads[owner]);
      fenced(text, span.start, span.end, renames, out);
    }
  } else if (own.status === 'plain') fenced(text, 0, text.length, renames, out);
  else {
    const legacy = legacyOf(text);
    if (!legacy) return { refused: 'invariant' };
    values(text, renames, out);
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

function wordRules(text: string, change: Extract<Change, { kind: 'rules-wording' }>, authors: Authors): Step {
  const own = parseOwnership(encoder.encode(text));
  if (own.status === 'invalid') return { refused: own.reason };
  if (own.status === 'v2') return { refused: 'unsupported' };
  if (own.status === 'plain' || !byBower(text)) return { refused: 'not-bower' };
  const eol = eolOf(text);
  const removed = new Set(change.remove.map((item) => item.text));
  let next = [...removed].reduce(removeRule, text);
  const known: Rule[] = parseRules(next);
  const accepted: RuleAdd[] = [];
  // TL-P2-26: adds are processed in ascending since (stable for equal times), whatever order the change lists them in.
  for (const add of [...change.add].sort((a, b) => a.since - b.since)) {
    if (ruleLike(known, add.text) || (add.yourWords.trim() && ruleLike(known, add.yourWords))) continue;
    known.push({ id: '', text: add.text, ...(add.yourWords ? { yourWords: add.yourWords } : {}), since: add.since });
    accepted.push(add);
  }
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
  try { return parseNote('note.md', text).timeline; }
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
  if (same(slice(before, beforeBytes, a.personal)) !== same(slice(after, afterBytes, b.personal))) return false;
  if (tasksOf(a.tasks, same) !== tasksOf(b.tasks, same)) return false;
  if (a.status === 'v2' && b.status === 'v2') {
    const skeleton = (text: string, bytes: Uint8Array, payloads: Readonly<Record<string, ByteSpan>>): string => {
      let out = '';
      let at = 0;
      for (const owner of ['current', 'personal', 'timeline', 'bower-note']) {
        const span = payloads[owner];
        if (!span) return '';
        const chars = spanOf(bytes, span);
        out += `${text.slice(at, chars.start)}\u0000`;
        at = chars.end;
      }
      return out + text.slice(at);
    };
    if (same(skeleton(before, beforeBytes, a.payloads)) !== same(skeleton(after, afterBytes, b.payloads))) return false;
    for (const owner of ['current', 'personal', 'timeline', 'bower-note'] as const) {
      if (change.kind === 'timeline-append' && owner === 'timeline') continue;
      if (same(slice(before, beforeBytes, a.payloads[owner])) !== same(slice(after, afterBytes, b.payloads[owner]))) return false;
    }
  } else if (a.status === 'legacy') {
    const was = legacyOf(before);
    const now = legacyOf(after);
    if (!was || !now) return false;
    const parts = (text: string, at: Legacy): string[] => [
      text.slice(0, at.frontEnd), at.current ? text.slice(at.current.start, at.current.end) : '',
      at.bower !== null ? text.slice(at.bower) : '',
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

const refuse = (reason: EditRefusal): EditResult => ({ ok: false, reason });

/** `applyChanges` with a replaceable splice; only tests pass anything but the real one. */
export function applyChangesUsing(before: Uint8Array, changes: readonly Change[], authors: Authors): EditResult {
  if (before.byteLength > EDIT_FILE_LIMIT) return refuse('too-large');
  let text: string;
  try { text = decoder.decode(before); }
  catch {
    // expected: fatal UTF-8 validation is the refusal itself (rule 6); nothing is edited.
    return refuse('invalid-encoding');
  }
  const own = parseOwnership(before);
  if (own.status === 'invalid') return refuse(own.reason);
  if (!ordered(changes)) return refuse('order');
  if (!changes.every(fieldsOk)) return refuse('field');
  let current = text;
  for (const change of changes) {
    const step = change.kind === 'link-rewrite' ? relink(current, change)
      : change.kind === 'timeline-append' ? appendLines(current, change, authors) : wordRules(current, change, authors);
    if ('refused' in step) return refuse(step.refused);
    if (step.text !== current && !holds(current, step.text, change, step)) return refuse('invariant');
    current = step.text;
  }
  if (current === text) return refuse('unchanged');
  return { ok: true, text: current, bytes: encoder.encode(current) };
}

/** The one author of an edit's after-text: the bytes after every change in order, or why it is refused. */
export function applyChanges(before: Uint8Array, changes: readonly Change[]): EditResult {
  return applyChangesUsing(before, changes, { splice: (text, at, insert) => text.slice(0, at) + insert + text.slice(at) });
}

// ---------------------------------------------------------------------------------------------
// Adapter decisions (rules 1 and 5) and the saved-link key (R4-3 m-f), all pure
// ---------------------------------------------------------------------------------------------

const digest = (bytes: Uint8Array): Promise<string> => sha256(new Blob([bytes.slice().buffer]));

/** Rule 1: the file as re-read still hashes to `beforeContent`, recomputes to `text`, and `content` describes it. */
export async function recheckEdit(effect: EditText, bytes: Uint8Array): Promise<'ok' | 'conflict'> {
  if (bytes.byteLength !== effect.beforeContent.size || await digest(bytes) !== effect.beforeContent.sha256) return 'conflict';
  const result = applyChanges(bytes, effect.changes);
  if (!result.ok || result.text !== effect.text) return 'conflict';
  const { content } = effect;
  if (content.encoding !== 'utf8' || content.size !== result.bytes.byteLength || content.sha256 !== await digest(result.bytes)) return 'conflict';
  return 'ok';
}

/** Rule 5: after a lost reply, the same file not in the Bin reads as `text` (applied), as before, or as other. */
export async function readBackEdit(effect: EditText, observed: Observed): Promise<ReadBack> {
  const { before } = effect;
  const same = !observed.trashed && observed.fileId === before.fileId && observed.name === before.name
    && observed.parents.length === before.parents.length && observed.parents.every((parent, i) => parent === before.parents[i]);
  if (!same) return 'unresolved';
  const text = encoder.encode(effect.text);
  if (observed.bytes.length === text.length && observed.bytes.every((byte, i) => byte === text[i])) return 'applied';
  if (observed.bytes.byteLength === effect.beforeContent.size && await digest(observed.bytes) === effect.beforeContent.sha256) return 'possible-effect';
  return 'unresolved';
}

/** R3-6 / R4-3 m-f: a saved link's note key, SHA-256 in lowercase hex of the UTF-8 bytes of `<fileId>:saved-link-note`. */
export function savedLinkKey(fileId: string): Promise<string> {
  return digest(encoder.encode(`${fileId}:saved-link-note`));
}

/** Red stub (state-rewrite-change): replaced by the implementation. */
export function stateMark(lines: readonly string[]): string {
  return lines.length ? 'stub' : '';
}
/** Red stub (state-rewrite-change): replaced by the implementation. */
export function undoChanges(changes: readonly Change[]): Change[] {
  return [...changes];
}
