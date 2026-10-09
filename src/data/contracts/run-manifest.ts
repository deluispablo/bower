/** Immutable run manifest validation only; no claim, dispatch, readiness or permission authority. */
import { sha256 } from './hashes';
import { EDIT_FILE_LIMIT, entryOk, renameOk, ruleAddOk, ruleRemoveOk, stateLinesOk, timelineDate } from './note-edit';
import { hashRecordJson, parseRecordJson, type RecordJsonFailure } from './record-json';

export type Scope = { rootId: string };
export type FileKind = 'note' | 'pdf' | 'image' | 'link' | 'doc' | 'sheet' | 'audio' | 'other';
export type Content = { encoding: 'utf8' | 'blob'; size: number; sha256: string };
export type SeenFile = { fileId: string; name: string; parents: string[]; folder: boolean; modifiedTime: string };
export type VerifiedContent = Content & { provenance: 'fake-stored' | 'adapter-read'; observedModifiedTime: string };
export type DeclarationRef = { declarationId: string; sha256: string };
export type CapturedContext = { kind: 'absent' } | {
  kind: 'text'; memberKey: string | null; file: SeenFile; text: string; content: VerifiedContent;
};
export type CapturedPile = {
  pileId: string;
  source: { kind: 'declared'; ref: DeclarationRef } | { kind: 'observed' };
  anchor: SeenFile | null; memberKeys: (string | null)[]; childFileIds: string[]; context: CapturedContext;
};
export type CapturedMember = { pileId: string; memberKey: string | null; file: SeenFile; content: VerifiedContent };
export type CapturedJournal = { recordId: string; sha256: string; fileIds: string[] };
export type Capture = {
  piles: CapturedPile[]; members: CapturedMember[]; journal: CapturedJournal[]; places: { file: SeenFile; path: string }[];
};
export type Target = { fileId: string } | { createdBy: string };
export type Properties = {
  by?: 'bower'; bowerNew?: '1' | null; asAdded?: string | null; origin?: string | null; kind?: string | null;
  pile?: string | null; bowerItem?: string | null; bowerDeclaration?: string | null;
};
export type Effect =
  | { kind: 'move'; before: SeenFile; parent: Target; name: string; properties: Properties }
  | { kind: 'create-folder'; parent: Target; name: string; createKey: string }
  | { kind: 'create-text'; parent: Target; name: string; createKey: string; text: string; content: Content;
    purpose: 'generated' | 'runner-json' }
  | { kind: 'write-runner-json'; before: SeenFile; beforeContent: VerifiedContent;
    /** One of the runner-writable files the reader is given (`RUNNER_WRITES` in `vault/layout.ts`). */
    path: RunnerWrite; text: string; content: Content }
  | { kind: 'bin'; before: SeenFile; capturedChildIds: string[] };
/**
 * The type of a runner-writable file (TL-P4-14 addendum 20): `RUNNER_WRITES` in `vault/layout.ts` is the one list and
 * is typed by it; the contracts cannot import the layout (architecture.test.ts), so the path's type lives here.
 */
export type RunnerWrite = '.bower/questions.json' | '.bower/requests.json' | '.bower/hashes.json';
export type Operation = { operationId: string; ordinal: number; dependsOn: string[]; effect: Effect };
/** One Timeline line: `- <date> · <text>` plus ` · [[<source>]]` when there is a source (TL-P2-20). */
export type EditEntry = { date: string; text: string; source: string | null };
/** Display names: a link to `from` (compared lowercased) is written with `to`. */
export type Rename = { from: string; to: string };
export type RuleAdd = { recordId: string; text: string; yourWords: string; since: number };
export type RuleRemove = { recordId: string; text: string };
/**
 * The closed change union of manifest v2; an edit holds at most one of each, in this order. `state-rewrite`
 * (TL-P4-08 addendum 1 point 1) replaces the lines of Bower's own `## Current state`, which must read `previous`,
 * with `lines`: the manifest keeps the previous text, so an undo (C13) restores it (`undoChanges`). `adopted`: the section
 * had no mark and a rule let Bower take it over (without it an unmarked section is refused); `release`: an undo of that,
 * which gives the lines back to the person without a mark. `granted` (`state-yes-writes`): the section is one the person
 * edited, and their yes to "Write it" (`answer`, a journal record id, also in `recordIds`) grants this one write over
 * the section still as asked about, still under `mark`, the mark it had; `mark`: an undo of that, which gives the
 * person's lines back under the mark they had, so the section is theirs again.
 */
/** A person's yes that grants one write over a Current state they edited: the answer, and the mark the section had. */
export type StateGrant = { answer: string; mark: string };
export type Change =
  | { kind: 'state-rewrite'; recordIds: string[]; previous: string[]; lines: string[]; adopted?: true; release?: true; granted?: StateGrant; mark?: string }
  | { kind: 'link-rewrite'; recordIds: string[]; renames: Rename[] }
  | { kind: 'timeline-append'; recordIds: string[]; entries: EditEntry[] }
  | { kind: 'rules-wording'; add: RuleAdd[]; remove: RuleRemove[] };
/**
 * Manifest v2's one new effect: `text` is the whole file after every change, authored by `applyChanges`. `beforeText`
 * (optional, `keep-one-note-merge`): the whole file as read, described by `beforeContent`, so an undo can put it back
 * (`undoEdit`) where the changes alone cannot be taken back (a link rewrite).
 */
export type EditText = {
  kind: 'edit-text'; before: SeenFile; path: string; beforeContent: VerifiedContent;
  changes: Change[]; text: string; content: Content; beforeText?: string;
};
export type EffectV2 = Effect | EditText;
export type OperationV2 = { operationId: string; ordinal: number; dependsOn: string[]; effect: EffectV2 };
export type ReportFiled = { name: string; title: string; kind: FileKind; to: string; note?: string; area?: string };
export type ReportQuestion = { id: string; text: string; yes: string; no: string; askedAt: number; about?: string };
/** The existing RunReport shape in the stricter closed form used inside new records. */
export type ManifestRunReport = {
  filed: ReportFiled[]; created: { path: string; what: string }[]; updated: { path: string; what: string }[];
  setAside: { name: string; why: string }[]; questions: ReportQuestion[];
  yourChanges?: number; requests?: string[]; rulesWorded?: number;
  /** A thing whose content was already filed, binned (TL-P4-10 addendum 2): its name and the saved file's name. */
  alreadySaved?: { name: string; as: string }[];
};
export type ReportContribution = { requires: string[]; when: 'applied' | 'rejected'; value: ManifestRunReport };
export type Manifest = {
  v: 1; kind: 'run-manifest'; scope: Scope; runId: string; requestId: string;
  runScope: 'all' | 'instructions'; allowWeb: boolean; requestedAt: number;
  captureId: string; capture: Capture; operations: Operation[]; reportPlan: ReportContribution[];
};
/** v1 plus `edit-text`; a v2 manifest always holds at least one. */
export type ManifestV2 = Omit<Manifest, 'v' | 'operations'> & { v: 2; operations: OperationV2[] };
/**
 * `content`: a captured context, create-text or write-runner-json text whose content is not utf8 with the exact
 * UTF-8 size and raw SHA-256 of that text. Observed-pile keys, member keys and createdBy targets refuse as `shape`.
 */
export type ManifestRefusal = RecordJsonFailure['reason'] | 'shape' | 'scope' | 'content' | 'capture-id' | 'order' | 'operation-id' | 'report';
export type ManifestResult = { ok: true; value: Manifest; sha256: string } | { ok: false; reason: ManifestRefusal };
/** Which TL-P2-20 rule an `edit` refusal broke, for the log; the public reason stays `edit`. */
export type EditGuardRule = 'target' | 'one-per-file' | 'rules-path' | 'encoding' | 'size' | 'unchanged' | 'date' | 'record' | 'mark' | 'archive';
/** `edit`: a v2 edit breaks a TL-P2-20 rule; `version`: a manifest version later than this build reads. */
export type ManifestV2Refusal = ManifestRefusal | 'edit' | 'version';
export type ManifestV2Result = { ok: true; value: Manifest | ManifestV2; sha256: string }
  | { ok: false; reason: Exclude<ManifestV2Refusal, 'edit'> } | { ok: false; reason: 'edit'; rule: EditGuardRule };
/** A v2 manifest's whole size is capped at 8 MiB (TL-P2-20 rule 6). */
export const MANIFEST_V2_LIMIT = 8 * 1024 * 1024;

type Fields = Record<string, unknown>;

function record(value: unknown): value is Fields {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** Exactly these required keys plus any of the optional ones; nothing else. */
function closed(value: unknown, keys: string[], optional: string[] = []): value is Fields {
  if (!record(value) || !keys.every((key) => Object.hasOwn(value, key))) return false;
  return Object.keys(value).every((key) => keys.includes(key) || optional.includes(key));
}
const list = (value: unknown, item: (entry: unknown) => boolean): value is unknown[] => Array.isArray(value) && value.every(item);
const unique = (value: unknown[]): boolean => new Set(value).size === value.length;
/** An array of records whose identity (a string picked from each) never repeats. */
const uniqueBy = <T>(value: T[], key: (item: T) => string): boolean => unique(value.map(key));

function text(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
// The ratified mask excludes C0 and DEL; opaque IDs and legacy text retain punctuation and C1.
const controls = (value: string): boolean => [...value].some((char) => char.charCodeAt(0) <= 0x1f || char.charCodeAt(0) === 0x7f);
const id = (value: unknown): value is string => typeof value === 'string'
  && value.length >= 1 && value.length <= 128 && !/[^A-Za-z0-9_-]/.test(value);
const driveId = (value: unknown): value is string => text(value) && value.length > 0
  && !controls(value) && new TextEncoder().encode(value).byteLength <= 1024;
const component = (value: string): boolean => value.length > 0 && value !== '.' && value !== '..' && !controls(value) && !/[/\\]/.test(value);
const name = (value: unknown): value is string => text(value) && component(value);
const path = (value: unknown): value is string => text(value) && value.split('/').every(component);
// CapturedJournal.recordId keeps the existing opaque JournalRecord id rule, not the logical-Id grammar;
// its contract bound is the opaque-identifier one (coordinator ruling): DriveId's 1024 UTF-8 bytes.
const recordId = driveId;

/** Whether a run record can carry this as a file or folder name (contract B's name grammar). */
export function recordableName(value: string): boolean {
  return name(value);
}
/** Whether a run record can carry this as a logical id (a pile id, a member key). */
export function recordableId(value: string): boolean {
  return id(value);
}
/** Whether a run record can carry this as a journal record id (the opaque-identifier rule). */
export function recordableRecordId(value: string): boolean {
  return recordId(value);
}
const integer = (value: unknown): value is number => typeof value === 'number'
  && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const hash = (value: unknown): value is string => typeof value === 'string'
  && value.length === 64 && !/[^0-9a-f]/.test(value);
const nullable = <T>(guard: (value: unknown) => value is T) => (value: unknown): value is T | null => value === null || guard(value);
const oneOf = (value: unknown, options: readonly string[]): boolean => typeof value === 'string' && options.includes(value);

function monthDays(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
/** RFC 3339 date-time (section 5.6); exact spelling, fraction and offset are kept. */
function rfc3339(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const offsetHour = Number(match[8] ?? 0), offsetMinute = Number(match[9] ?? 0);
  if (month < 1 || month > 12 || day < 1 || day > monthDays(year, month)
    || hour > 23 || minute > 59 || second > 60 || offsetHour > 23 || offsetMinute > 59) return false;
  if (second === 60) {
    // A leap second can only be spelled at 23:59:60 UTC on the last day of a month.
    // This format check does not certify that a leap second actually occurred.
    const utc = new Date(0);
    utc.setUTCFullYear(year, month - 1, day);
    const offset = (offsetHour * 60 + offsetMinute) * (match[7] === '-' ? -1 : 1);
    utc.setUTCHours(hour, minute - offset, 59, 0);
    if (utc.getUTCHours() !== 23 || utc.getUTCMinutes() !== 59
      || utc.getUTCDate() !== monthDays(utc.getUTCFullYear(), utc.getUTCMonth() + 1)) return false;
  }
  return true;
}

const fileKinds = ['note', 'pdf', 'image', 'link', 'doc', 'sheet', 'audio', 'other'] as const;

function content(value: unknown): value is Content {
  return closed(value, ['encoding', 'size', 'sha256']) && oneOf(value.encoding, ['utf8', 'blob']) && integer(value.size) && hash(value.sha256);
}
function verifiedContent(value: unknown): value is VerifiedContent {
  return closed(value, ['encoding', 'size', 'sha256', 'provenance', 'observedModifiedTime'])
    && oneOf(value.encoding, ['utf8', 'blob']) && integer(value.size) && hash(value.sha256)
    && oneOf(value.provenance, ['fake-stored', 'adapter-read']) && rfc3339(value.observedModifiedTime);
}
function seenFile(value: unknown): value is SeenFile {
  return closed(value, ['fileId', 'name', 'parents', 'folder', 'modifiedTime'])
    && driveId(value.fileId) && name(value.name) && list(value.parents, driveId) && value.parents.length > 0 && unique(value.parents)
    && typeof value.folder === 'boolean' && rfc3339(value.modifiedTime);
}

function capturedContext(value: unknown): value is CapturedContext {
  if (!record(value)) return false;
  if (value.kind === 'absent') return closed(value, ['kind']);
  return value.kind === 'text' && closed(value, ['kind', 'memberKey', 'file', 'text', 'content'])
    && nullable(id)(value.memberKey) && seenFile(value.file) && text(value.text) && verifiedContent(value.content);
}
function source(value: unknown): value is CapturedPile['source'] {
  if (!record(value)) return false;
  if (value.kind === 'observed') return closed(value, ['kind']);
  return value.kind === 'declared' && closed(value, ['kind', 'ref'])
    && closed(value.ref, ['declarationId', 'sha256']) && id(value.ref.declarationId) && hash(value.ref.sha256);
}
function capturedPile(value: unknown): value is CapturedPile {
  if (!closed(value, ['pileId', 'source', 'anchor', 'memberKeys', 'childFileIds', 'context'])) return false;
  const keys = value.memberKeys;
  return id(value.pileId) && source(value.source) && nullable(seenFile)(value.anchor)
    && list(keys, nullable(id)) && unique(keys.filter((key) => key !== null))
    && list(value.childFileIds, driveId) && unique(value.childFileIds) && capturedContext(value.context);
}
function capturedMember(value: unknown): value is CapturedMember {
  return closed(value, ['pileId', 'memberKey', 'file', 'content'])
    && id(value.pileId) && nullable(id)(value.memberKey) && seenFile(value.file) && verifiedContent(value.content);
}
function capturedJournal(value: unknown): value is CapturedJournal {
  return closed(value, ['recordId', 'sha256', 'fileIds']) && recordId(value.recordId) && hash(value.sha256)
    && list(value.fileIds, driveId) && value.fileIds.length > 0 && unique(value.fileIds);
}
/**
 * Guard 6 membership: an observed pile invents no keys, so it and its members and context carry null keys;
 * a non-null member key is listed by its own captured pile and is carried by at most one captured member of that pile.
 */
function membership(piles: CapturedPile[], members: CapturedMember[]): boolean {
  const byId = new Map(piles.map((pile) => [pile.pileId, pile]));
  const observed = (pile: CapturedPile): boolean => pile.source.kind === 'observed';
  if (piles.some((pile) => observed(pile)
    && (pile.memberKeys.some((key) => key !== null) || (pile.context.kind === 'text' && pile.context.memberKey !== null)))) return false;
  const keyed = members.filter((member) => member.memberKey !== null);
  return uniqueBy(keyed, (member) => JSON.stringify([member.pileId, member.memberKey]))
    && keyed.every((member) => byId.get(member.pileId)?.memberKeys.includes(member.memberKey) === true);
}
function capture(value: unknown): value is Capture {
  return closed(value, ['piles', 'members', 'journal', 'places'])
    && list(value.piles, capturedPile) && list(value.members, capturedMember) && list(value.journal, capturedJournal)
    && list(value.places, (place) => closed(place, ['file', 'path']) && seenFile(place.file) && path(place.path))
    && uniqueBy(value.piles as CapturedPile[], (pile) => pile.pileId)
    && uniqueBy(value.members as CapturedMember[], (member) => member.file.fileId)
    && uniqueBy(value.places as Capture['places'], (place) => place.file.fileId)
    && uniqueBy(value.journal as CapturedJournal[], (entry) => entry.recordId)
    && membership(value.piles as CapturedPile[], value.members as CapturedMember[]);
}

function target(value: unknown): value is Target {
  return (closed(value, ['fileId']) && driveId(value.fileId)) || (closed(value, ['createdBy']) && hash(value.createdBy));
}
function properties(value: unknown): value is Properties {
  const optional = ['by', 'bowerNew', 'asAdded', 'origin', 'kind', 'pile', 'bowerItem', 'bowerDeclaration'];
  if (!closed(value, [], optional)) return false;
  const has = (key: string): boolean => Object.hasOwn(value, key);
  return (!has('by') || value.by === 'bower') && (!has('bowerNew') || value.bowerNew === '1' || value.bowerNew === null)
    && ['asAdded', 'origin', 'kind'].every((key) => !has(key) || nullable(text)(value[key]))
    && ['pile', 'bowerItem', 'bowerDeclaration'].every((key) => !has(key) || nullable(id)(value[key]));
}
function effect(value: unknown): value is Effect {
  if (!record(value)) return false;
  switch (value.kind) {
    case 'move': return closed(value, ['kind', 'before', 'parent', 'name', 'properties'])
      && seenFile(value.before) && target(value.parent) && name(value.name) && properties(value.properties);
    case 'create-folder': return closed(value, ['kind', 'parent', 'name', 'createKey'])
      && target(value.parent) && name(value.name) && id(value.createKey);
    case 'create-text': return closed(value, ['kind', 'parent', 'name', 'createKey', 'text', 'content', 'purpose'])
      && target(value.parent) && name(value.name) && id(value.createKey) && text(value.text) && content(value.content)
      && oneOf(value.purpose, ['generated', 'runner-json']);
    case 'write-runner-json': return closed(value, ['kind', 'before', 'beforeContent', 'path', 'text', 'content'])
      && seenFile(value.before) && verifiedContent(value.beforeContent) && text(value.path)
      && text(value.text) && content(value.content);
    case 'bin': return closed(value, ['kind', 'before', 'capturedChildIds'])
      && seenFile(value.before) && list(value.capturedChildIds, driveId) && unique(value.capturedChildIds);
    default: return false;
  }
}
function operation(value: unknown): value is Operation {
  return closed(value, ['operationId', 'ordinal', 'dependsOn', 'effect']) && hash(value.operationId) && integer(value.ordinal)
    && list(value.dependsOn, hash) && unique(value.dependsOn) && effect(value.effect);
}

// Manifest v2 (TL-P2-20): v1 plus edit-text. Field rules shared with the author live in note-edit.ts.
const CHANGE_ORDER: readonly Change['kind'][] = ['state-rewrite', 'link-rewrite', 'timeline-append', 'rules-wording'];
const recordIds = (value: unknown): value is string[] => list(value, recordId) && unique(value);
function editEntry(value: unknown): value is EditEntry {
  return closed(value, ['date', 'text', 'source']) && text(value.date) && text(value.text)
    && (value.source === null || text(value.source)) && entryOk(value as EditEntry);
}
function rename(value: unknown): value is Rename {
  return closed(value, ['from', 'to']) && text(value.from) && text(value.to) && renameOk(value as Rename);
}
function ruleAdd(value: unknown): value is RuleAdd {
  return closed(value, ['recordId', 'text', 'yourWords', 'since']) && recordId(value.recordId) && text(value.text)
    && text(value.yourWords) && integer(value.since) && ruleAddOk(value as RuleAdd);
}
function ruleRemove(value: unknown): value is RuleRemove {
  return closed(value, ['recordId', 'text']) && recordId(value.recordId) && text(value.text) && ruleRemoveOk(value as RuleRemove);
}
/** A Current state's mark (`stateMark`): 16 lowercase hex digits. */
const stateMarkText = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{16}$/.test(value);
/** A grant names the answer that gives it, which the change carries in its record ids too, and the mark it saw. */
function stateGrant(value: unknown, ids: readonly string[]): value is StateGrant {
  return closed(value, ['answer', 'mark']) && recordId(value.answer) && ids.includes(value.answer as string) && stateMarkText(value.mark);
}
function change(value: unknown): value is Change {
  if (!record(value)) return false;
  switch (value.kind) {
    case 'state-rewrite': return closed(value, ['kind', 'recordIds', 'previous', 'lines'], ['adopted', 'release', 'granted', 'mark']) && recordIds(value.recordIds)
      && (value.adopted === undefined || value.adopted === true) && (value.release === undefined || (value.release === true && value.adopted === undefined))
      && [value.adopted, value.release, value.granted, value.mark].filter((x) => x !== undefined).length <= 1
      && (value.granted === undefined || stateGrant(value.granted, value.recordIds as string[])) && (value.mark === undefined || stateMarkText(value.mark))
      && list(value.previous, text) && list(value.lines, text) && stateLinesOk(value.previous as string[], value.lines as string[]);
    case 'link-rewrite': return closed(value, ['kind', 'recordIds', 'renames']) && recordIds(value.recordIds)
      && list(value.renames, rename) && value.renames.length > 0 && unique((value.renames as Rename[]).map((item) => item.from.toLowerCase()));
    case 'timeline-append': return closed(value, ['kind', 'recordIds', 'entries']) && recordIds(value.recordIds)
      && list(value.entries, editEntry) && value.entries.length > 0;
    case 'rules-wording': return closed(value, ['kind', 'add', 'remove']) && list(value.add, ruleAdd) && list(value.remove, ruleRemove)
      && value.add.length + value.remove.length > 0;
    default: return false;
  }
}
/** 1+ changes, at most one of each kind, in the order state-rewrite, link-rewrite, timeline-append, rules-wording (R3-7 m4). */
const canonical = (changes: Change[]): boolean => changes.length > 0
  && changes.every((item, i) => i === 0 || CHANGE_ORDER.indexOf(changes[i - 1]?.kind ?? item.kind) < CHANGE_ORDER.indexOf(item.kind));
function editText(value: unknown): value is EditText {
  return closed(value, ['kind', 'before', 'path', 'beforeContent', 'changes', 'text', 'content'], ['beforeText']) && value.kind === 'edit-text'
    && seenFile(value.before) && path(value.path) && verifiedContent(value.beforeContent)
    && list(value.changes, change) && canonical(value.changes as Change[]) && text(value.text) && content(value.content)
    && (!Object.hasOwn(value, 'beforeText') || text(value.beforeText));
}
const effectV2 = (value: unknown): value is EffectV2 => effect(value) || editText(value);
function operationV2(value: unknown): value is OperationV2 {
  return closed(value, ['operationId', 'ordinal', 'dependsOn', 'effect']) && hash(value.operationId) && integer(value.ordinal)
    && list(value.dependsOn, hash) && unique(value.dependsOn) && effectV2(value.effect);
}

const rows = (value: unknown, keys: string[], optional: string[] = []): boolean =>
  list(value, (row) => closed(row, keys, optional) && Object.values(row).every(text));
function runReport(value: unknown): value is ManifestRunReport {
  if (!closed(value, ['filed', 'created', 'updated', 'setAside', 'questions'], ['yourChanges', 'requests', 'rulesWorded', 'alreadySaved'])) return false;
  return list(value.filed, (row) => closed(row, ['name', 'title', 'kind', 'to'], ['note', 'area']) && text(row.name) && text(row.title)
      && oneOf(row.kind, fileKinds) && text(row.to) && (!Object.hasOwn(row, 'note') || text(row.note)) && (!Object.hasOwn(row, 'area') || text(row.area)))
    && rows(value.created, ['path', 'what']) && rows(value.updated, ['path', 'what']) && rows(value.setAside, ['name', 'why'])
    && list(value.questions, (row) => closed(row, ['id', 'text', 'yes', 'no', 'askedAt'], ['about'])
      && text(row.id) && text(row.text) && text(row.yes) && text(row.no) && integer(row.askedAt)
      && (!Object.hasOwn(row, 'about') || text(row.about)))
    && (!Object.hasOwn(value, 'yourChanges') || integer(value.yourChanges))
    && (!Object.hasOwn(value, 'requests') || list(value.requests, text))
    && (!Object.hasOwn(value, 'rulesWorded') || integer(value.rulesWorded))
    && (!Object.hasOwn(value, 'alreadySaved') || (rows(value.alreadySaved, ['name', 'as']) && (value.alreadySaved as unknown[]).length > 0));
}
function contribution(value: unknown): value is ReportContribution {
  return closed(value, ['requires', 'when', 'value']) && list(value.requires, hash) && value.requires.length > 0
    && unique(value.requires) && oneOf(value.when, ['applied', 'rejected']) && runReport(value.value);
}

function manifestOf(value: unknown, v: 1 | 2, item: (value: unknown) => boolean): boolean {
  return closed(value, ['v', 'kind', 'scope', 'runId', 'requestId', 'runScope', 'allowWeb', 'requestedAt', 'captureId', 'capture', 'operations', 'reportPlan'])
    && value.v === v && value.kind === 'run-manifest' && closed(value.scope, ['rootId']) && driveId(value.scope.rootId)
    && id(value.runId) && id(value.requestId) && oneOf(value.runScope, ['all', 'instructions'])
    && typeof value.allowWeb === 'boolean' && integer(value.requestedAt) && hash(value.captureId)
    && capture(value.capture) && list(value.operations, item) && list(value.reportPlan, contribution);
}
function manifest(value: unknown): value is Manifest {
  return manifestOf(value, 1, operation);
}
/** A v2 manifest without edit-text is refused: the runner writes v1 then. */
function manifestV2(value: unknown): value is ManifestV2 {
  return manifestOf(value, 2, operationV2) && (value as ManifestV2).operations.some((item) => item.effect.kind === 'edit-text');
}

/** Raw text content: utf8 with the size and SHA-256 of the exact UTF-8 bytes, not of C(text). */
async function describes(content: Content, text: string): Promise<boolean> {
  const raw = new TextEncoder().encode(text);
  return content.encoding === 'utf8' && content.size === raw.byteLength && content.sha256 === await sha256(new Blob([raw]));
}
function texts(value: Manifest | ManifestV2): { text: string; content: Content }[] {
  const found: { text: string; content: Content }[] = value.capture.piles.flatMap((pile) => pile.context.kind === 'text' ? [pile.context] : []);
  for (const { effect } of value.operations) {
    if (effect.kind === 'create-text' || effect.kind === 'write-runner-json' || effect.kind === 'edit-text') found.push(effect);
    // A before-image is the very text `beforeContent` describes.
    if (effect.kind === 'edit-text' && effect.beforeText !== undefined) found.push({ text: effect.beforeText, content: effect.beforeContent });
  }
  return found;
}

async function digest(value: unknown): Promise<string> {
  const result = await hashRecordJson(value);
  // Every string and number was validated above, so canonical encoding cannot refuse here.
  if (!result.ok) throw new Error(`Validated manifest could not be hashed: ${result.reason}`);
  return result.value;
}

/**
 * Compare independently supplied scope; a matching root or digest grants no access or dispatch. `writes` is the list of
 * Bower's files a `write-runner-json` may name (`RUNNER_WRITES` in `vault/layout.ts`); any other path is refused as `shape`.
 */
export async function parseRunManifest(bytes: Uint8Array, expectedRootId: string, writes: readonly RunnerWrite[]): Promise<ManifestResult> {
  const parsed = parseRecordJson(bytes);
  if (!parsed.ok) return parsed;
  return admit(parsed.value, expectedRootId, manifest, writes);
}

/** The guards every manifest version shares, in the v1 order; identities are computed as in v1. */
async function admit<M extends Manifest | ManifestV2>(
  parsed: unknown, expectedRootId: string, guard: (value: unknown) => value is M, writes: readonly RunnerWrite[],
): Promise<{ ok: true; value: M; sha256: string } | { ok: false; reason: ManifestRefusal }> {
  if (!guard(parsed)) return { ok: false, reason: 'shape' };
  if (parsed.operations.some(({ effect: e }) => e.kind === 'write-runner-json' && !writes.includes(e.path))) return { ok: false, reason: 'shape' };
  const value = parsed;
  if (!driveId(expectedRootId) || expectedRootId !== value.scope.rootId) return { ok: false, reason: 'scope' };
  for (const item of texts(value)) {
    if (!await describes(item.content, item.text)) return { ok: false, reason: 'content' };
  }
  if (await digest({ scope: value.scope, runScope: value.runScope, capture: value.capture }) !== value.captureId) {
    return { ok: false, reason: 'capture-id' };
  }
  if (value.operations.some((item, index) => item.ordinal !== index)) return { ok: false, reason: 'order' };
  for (const item of value.operations) {
    const expected = await digest({ runId: value.runId, captureId: value.captureId, ordinal: item.ordinal, effect: item.effect });
    if (expected !== item.operationId) return { ok: false, reason: 'operation-id' };
  }
  // Earlier operation ID -> its effect kind; a createdBy parent must be an earlier create-folder.
  const earlier = new Map<string, EffectV2['kind']>();
  for (const item of value.operations) {
    const parent = 'parent' in item.effect ? item.effect.parent : null;
    const createdBy = parent && 'createdBy' in parent ? parent.createdBy : null;
    if (!item.dependsOn.every((dependency) => earlier.has(dependency))
      || (createdBy !== null && !earlier.has(createdBy))) return { ok: false, reason: 'order' };
    if (createdBy !== null && earlier.get(createdBy) !== 'create-folder') return { ok: false, reason: 'shape' };
    earlier.set(item.operationId, item.effect.kind);
  }
  const questions = new Set<string>();
  for (const item of value.reportPlan) {
    if (!item.requires.every((required) => earlier.has(required))) return { ok: false, reason: 'report' };
    for (const question of item.value.questions) {
      if (questions.has(question.id)) return { ok: false, reason: 'report' };
      questions.add(question.id);
    }
  }
  return { ok: true, value, sha256: await digest(value) };
}

const sameSeen = (a: SeenFile, b: SeenFile): boolean => a.fileId === b.fileId && a.name === b.name && a.folder === b.folder
  && a.modifiedTime === b.modifiedTime && a.parents.length === b.parents.length && a.parents.every((parent, i) => parent === b.parents[i]);
const recordsOf = (item: Change): string[] => item.kind === 'rules-wording'
  ? [...item.add, ...item.remove].map((entry) => entry.recordId) : item.recordIds;
const appends = (item: EditText): boolean => item.changes.some((entry) => entry.kind === 'timeline-append');

/**
 * TL-P2-20's rules across a v2 manifest: each target (rule 2, R3-7, ratification 5), one edit per file (rule 3),
 * the size limits (rule 6), records in capture.journal and archives held by every edit naming them (rule 7, R3-4),
 * Timeline dates from requestedAt, and the in-place `bowerNew` move only after an edit with a Timeline line (m3).
 * Returns the first rule broken, null when every rule holds.
 */
function edits(value: ManifestV2): EditGuardRule | null {
  const { capture, operations } = value;
  const journal = new Map(capture.journal.map((entry) => [entry.recordId, entry.fileIds]));
  const places = new Map(capture.places.map((place) => [place.file.fileId, place]));
  const captured = new Set([
    ...capture.members.map((member) => member.file.fileId),
    ...capture.piles.flatMap((pile) => [...pile.childFileIds, ...(pile.anchor ? [pile.anchor.fileId] : []),
      ...(pile.context.kind === 'text' ? [pile.context.file.fileId] : [])]),
  ]);
  const date = timelineDate(value.requestedAt);
  const edited = new Map<string, { operationId: string; effect: EditText }>();
  const paths = new Set<string>();
  for (const item of operations) {
    const e = item.effect;
    if (e.kind !== 'edit-text') continue;
    const place = places.get(e.before.fileId);
    const segments = e.path.split('/');
    if (edited.has(e.before.fileId) || paths.has(e.path)) return 'one-per-file';
    const target = !e.before.folder && place !== undefined && sameSeen(place.file, e.before) && place.path === e.path
      && segments[segments.length - 1] === e.before.name && e.path.endsWith('.md')
      && segments[0] !== '.bower' && segments[0] !== 'Inbox' && !captured.has(e.before.fileId);
    if (!target) return 'target';
    if (e.beforeContent.encoding !== 'utf8') return 'encoding';
    if (e.beforeContent.size > EDIT_FILE_LIMIT) return 'size';
    if (e.content.sha256 === e.beforeContent.sha256) return 'unchanged';
    for (const entry of e.changes) {
      if (entry.kind === 'rules-wording' && e.path !== 'Rules.md') return 'rules-path';
      if (entry.kind === 'state-rewrite' && e.path === 'Rules.md') return 'rules-path';
      if (entry.kind === 'timeline-append' && !entry.entries.every((line) => line.date === date)) return 'date';
      if (!recordsOf(entry).every((id) => journal.has(id))) return 'record';
    }
    edited.set(e.before.fileId, { operationId: item.operationId, effect: e });
    paths.add(e.path);
  }
  const marks = new Map<string, number>();
  for (const item of operations) {
    const e = item.effect;
    if (e.kind !== 'move' && e.kind !== 'bin') continue;
    const target = edited.get(e.before.fileId);
    if (!target) continue;
    // Only an in-place move may touch an edited note; anything else moves or bins the target.
    const inPlace = e.kind === 'move' && sameSeen(e.before, target.effect.before) && e.before.parents.length === 1
      && 'fileId' in e.parent && e.parent.fileId === e.before.parents[0] && e.name === e.before.name;
    if (!inPlace) return 'target';
    const mark = Object.keys(e.properties).length === 1 && e.properties.bowerNew === '1'
      && item.dependsOn.includes(target.operationId) && appends(target.effect);
    if (!mark) return 'mark';
    marks.set(e.before.fileId, (marks.get(e.before.fileId) ?? 0) + 1);
  }
  for (const [fileId, target] of edited) {
    if ((marks.get(fileId) ?? 0) !== (appends(target.effect) ? 1 : 0)) return 'mark';
    for (const id of target.effect.changes.flatMap(recordsOf)) {
      const files = journal.get(id) ?? [];
      const archives = operations.filter((item) => item.effect.kind === 'move' && files.includes(item.effect.before.fileId));
      if (!archives.every((item) => item.dependsOn.includes(target.operationId))) return 'archive';
    }
  }
  return null;
}

/**
 * Reads v1 exactly as `parseRunManifest` (same path, digests and identities) and v2: v1's guards plus `edit-text`.
 * A later version refuses as `version`, so a build that reads v2 can say it needs a newer Bower (R3-7 m9).
 */
export async function parseRunManifestV2(bytes: Uint8Array, expectedRootId: string, writes: readonly RunnerWrite[]): Promise<ManifestV2Result> {
  const parsed = parseRecordJson(bytes);
  if (!parsed.ok) return parsed;
  const v = record(parsed.value) ? parsed.value.v : undefined;
  if (v === 1) return parseRunManifest(bytes, expectedRootId, writes);
  if (integer(v) && v > 2) return { ok: false, reason: 'version' };
  if (v === 2 && bytes.byteLength > MANIFEST_V2_LIMIT) return { ok: false, reason: 'edit', rule: 'size' };
  const admitted = await admit(parsed.value, expectedRootId, manifestV2, writes);
  if (!admitted.ok) return admitted;
  const broken = edits(admitted.value);
  return broken === null ? admitted : { ok: false, reason: 'edit', rule: broken };
}
