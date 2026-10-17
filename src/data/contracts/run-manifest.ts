/** Immutable run manifest validation only; no claim, dispatch, readiness or permission authority. */
import { isMonthlyLogPath } from './log-format';
import { ABOUT_REGIONS, type AboutRegion, MOC_REGIONS, createOwnershipContext, type MocRegion, parseOwnership } from './ownership-format';
import { sha256 } from './hashes';
import { proposalOk, isAnsweredRow, type AnsweredRow, type ReportQuestion } from './questions';
import { NOTE_TAGS_MAX, readTagList, TAG_LIST_MAX } from './tag-format';
import { dateOk, LINT_EVIDENCE_VERSION, frontValues, parseNote, propertyValue, readTypeTable, scalarList, typeRowOk, typeTableOk } from './note-format';
import { VIEW_LIMITS, computedBy, viewFault } from './view-format';
import { BowerError, type TypeRow, type UpdatedRow } from './types';
import { parseObservations, canRebuildAboutSection, aboutArchivePath, validLearnedBlock, hasVerbatimQuote, consolidationOk } from './observations';
import { applyChanges, changesOrdered, viewsInstalled, mocSnapshot, type MocSnapshot, satisfiedAppendUnchanged, EDIT_FILE_LIMIT, profileTextOk, entryOk, renameOk, ruleAddOk, ruleRemoveOk, stateLinesOk, timelineDate } from './note-edit';
import { hashRecordJson, parseRecordJson, type RecordJsonFailure } from './record-json';
import { TEMPLATE_REGIONS, type TemplateRegion } from './note-templates';
import { displayName } from './tree';

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
/**
 * A set a request's map moves (B12 R26), its members as admitted: what its moves are checked against. `answer`: the yes
 * that applies a held large request's frozen part (B12d R82), the only record that may name its changes.
 */
export type CapturedMap = { recordId: string; members: string[]; answer?: string };
export type Capture = {
  piles: CapturedPile[]; members: CapturedMember[]; journal: CapturedJournal[]; places: { file: SeenFile; path: string }[]; maps?: CapturedMap[];
};
export type Target = { fileId: string } | { createdBy: string };
export type Properties = {
  by?: 'bower'; bowerNew?: '1' | null; asAdded?: string | null; origin?: string | null; kind?: string | null;
  pile?: string | null; bowerItem?: string | null; bowerDeclaration?: string | null; bowerRun?: string | null;
};
export type Effect =
  /** `recordIds`: a map's move names its request, its only authority (B12 R66). */
  | { kind: 'move'; before: SeenFile; parent: Target; name: string; properties: Properties; recordIds?: string[] }
  | { kind: 'create-folder'; parent: Target; name: string; createKey: string }
  | { kind: 'create-text'; parent: Target; name: string; createKey: string; text: string; content: Content;
    purpose: 'generated' | 'runner-json' | 'about-archive' }
  | { kind: 'write-runner-json'; before: SeenFile; beforeContent: VerifiedContent;
    /** One of the runner-writable files the reader is given (`RUNNER_WRITES` in `vault/layout.ts`). */
    path: RunnerWrite; text: string; content: Content;
    /** The type table as read, the very text `beforeContent` describes: the row a formula install replaced (B11e R61). */
    beforeText?: string }
  | { kind: 'write-runner-json'; before: null; beforeContent: null; path: '.bower/type-table.json' | '.bower/tags.json' | '.bower/observations.jsonl';
    parent: Target; createKey: string; text: string; content: Content }
  | { kind: 'bin'; before: SeenFile; capturedChildIds: string[] };
/**
 * The type of a runner-writable file (TL-P4-14 addendum 20): `RUNNER_WRITES` in `vault/layout.ts` is the one list and
 * is typed by it; the contracts cannot import the layout (architecture.test.ts), so the path's type lives here.
 */
export type RunnerWrite = '.bower/questions.json' | '.bower/requests.json' | '.bower/hashes.json' | '.bower/retrieval.json' | '.bower/index.md' | '.bower/hot.md' | '.bower/log.md' | '.bower/type-table.json' | '.bower/tags.json' | '.bower/observations.jsonl';
export type Operation = { operationId: string; ordinal: number; dependsOn: string[]; effect: Effect };
/** One Timeline line: `- <date> · <text>` plus ` · [[<source>]]` when there is a source (TL-P2-20). */
export type EditEntry = { date: string; text: string; source: string | null };
/** Display names: a link to `from` (compared lowercased) is written with `to`. */
export type Rename = { from: string; to: string };
export type RuleAdd = { recordId: string; text: string; yourWords: string; since: number };
/** `since`: the line's `at`, so removals and adds apply as one sequence (TL-P4-27 addendum 4 (1)); a manifest without it keeps removals first. */
export type RuleRemove = { recordId: string; text: string; since?: number };
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
export type StateGrant = { answer: string; mark: string | null };
/** Consent derived from an admitted request, never a semantic reply. */
export type AppendCompletion = { requestId: string; targetFileId: string };
export type TimelineConsent = { requestId: string; targetFileId: string; sourceFileId: string };
export type LeftAsWritten = { name: string; why: string; fileId?: string };
export type Change =
  | { kind: 'about-append'; recordIds: string[]; text: string }
  | { kind: 'about-rewrite'; region: AboutRegion; recordIds: string[]; previous: string; text: string; factIds?: string[]; archive?: string; undoneRunIds?: string[] }
  | { kind: 'template-rewrite'; region: TemplateRegion; recordIds: string[]; previous: string; text: string }
  | { kind: 'profile-rewrite'; recordIds: string[]; previous: string; text: string }
  | { kind: 'moc-rewrite'; region: MocRegion; recordIds: string[]; previous: string; text: string }
  | { kind: 'state-rewrite'; recordIds: string[]; previous: string[]; lines: string[]; adopted?: true; release?: true; granted?: StateGrant; mark?: string }
  | { kind: 'link-rewrite'; recordIds: string[]; renames: Rename[] }
  | { kind: 'timeline-append'; recordIds: string[]; entries: EditEntry[]; consent?: TimelineConsent }
  | { kind: 'rules-wording'; add: RuleAdd[]; remove: RuleRemove[] }
  /** B11 (R40-R44): a Bower map's `bower_views` line, `previous` its last value as read (null when absent), `text` the compact list written. */
  | { kind: 'views-set'; recordIds: string[]; previous: string | null; text: string }
  /**
   * B11 (R51, R56): a Bower note's computed front-matter lines, each `value` the line's text or null to remove every line
   * of that key. Maintain's own edit, derived at write time and never sealed in a manifest (R43), so it names no record.
   */
  | { kind: 'computed-set'; recordIds: []; values: Array<{ key: string; value: string | null }> }
  /**
   * B12 (R10): one front-matter key of a Bower note that a map request sets, `line` the new line without its end (null
   * removes the key); one change per key in an edit, in the order the map gives them.
   */
  | { kind: 'property-set'; recordIds: string[]; key: string; line: string | null };
/**
 * Manifest v2's one new effect: `text` is the whole file after every change, authored by `applyChanges`. `beforeText`
 * (optional, `keep-one-note-merge`): the whole file as read, described by `beforeContent`, so an undo can put it back
 * (`undoEdit`) where the changes alone cannot be taken back (a link rewrite).
 * `createdBy` binds a new About me edit to its template create; `before.fileId` is that create's key until dispatch.
 */
export type EditText = {
  kind: 'edit-text'; before: SeenFile; createdBy?: string; path: string; beforeContent: VerifiedContent;
  changes: Change[]; text: string; content: Content; beforeText?: string;
  /** A views-set edit's type table as the run read it, so the guard checks the installed entries as a write (R43). */
  types?: string;
  /** A property-set edit's tag list as the run read it (B12 R54), so the guard holds its tags to B7's vocabulary. */
  tags?: string;
};
/** Stored lint facts or parser refusal; the version and appendix fields are absent only in older manifests. */
export type LintEvidence = { links: string[]; tags: number; summary: boolean;
  v?: typeof LINT_EVIDENCE_VERSION; status?: string | null; template?: string | null; active?: string[];
  tagList?: string[]; original?: string | null; refused?: 'newer' | 'damaged' | null;
};
export type MaintenanceNote = { path: string; version: string; summary: string; coverage: { kind: 'prefix'; bytes: number }; owner?: 'bower' | 'person'; type?: string | null; incomplete?: boolean; moc?: MocSnapshot; members?: string[]; lint?: LintEvidence | 'unreadable' };
export type MaintenanceDeclaration = { at: string; sources: { path: string; file: SeenFile; text: string; content: VerifiedContent }[];
  unavailable?: { path: string; file: SeenFile }[];
};
/** `health`: the id of Bower's health note (TL-P4-50 Q6), kept in retrieval; a target of kind `health` names it. */
export type Maintain = { kind: 'maintain'; inputs: { folderId: string; account: string; cursor: string; changes: string[]; operationIds: string[]; targets?: { path: string; fileId: string; parentId: string; beforeContent?: VerifiedContent; kind?: string; declaration?: MaintenanceDeclaration }[]; snapshot?: Record<string, MaintenanceNote>; listing?: SeenFile[]; log?: string; health?: string } };
export type EffectV2 = Effect | EditText | Maintain;
export type OperationV2 = { operationId: string; ordinal: number; dependsOn: string[]; effect: EffectV2 };
export type ReportFiled = { name: string; title: string; kind: FileKind; to: string; note?: string; area?: string };
/** The existing RunReport shape in the stricter closed form used inside new records. */
export type ManifestRunReport = {
  filed: ReportFiled[]; created: { path: string; what: string }[]; updated: UpdatedRow[];
  setAside: { name: string; why: string }[]; questions: ReportQuestion[];
  yourChanges?: number; requests?: string[]; rulesWorded?: number;
  /** A thing whose content was already filed, binned (TL-P4-10 addendum 2): its name and the saved file's name. */
  alreadySaved?: { name: string; as: string; notes?: number }[];
  /** Answers that settled with no effect, their subject gone (TL-P4-19 addendum 10): never set aside. */
  answered?: AnsweredRow[];
  leftAsWritten?: LeftAsWritten[];
};
export type ReportContribution = { requires: string[]; when: 'applied' | 'rejected'; value: ManifestRunReport };
export type Manifest = {
  v: 1; kind: 'run-manifest'; scope: Scope; runId: string; requestId: string;
  runScope: 'all' | 'instructions'; allowWeb: boolean; requestedAt: number;
  captureId: string; capture: Capture; operations: Operation[]; reportPlan: ReportContribution[];
  /**
   * A request's bound line already in its note as the run names its source (TL-P4-32 addendum 2 (6)): no edit, and the
   * request's completion is its archive move (`operationId`), in the run's own checkpoint. Earlier runs' completions are
   * read only from their own records (`RunRecords.walk`), never carried in a manifest.
   */
  satisfiedAppends?: SatisfiedAppend[];
  /** Fields of an unaccepted C05 draft: never written, and a manifest carrying either is refused (`manifestOf`). */
  completedAppends?: unknown;
  appendEvidence?: unknown;
};
export type SatisfiedAppend = {
  consent: TimelineConsent; entry: EditEntry; before: SeenFile; path: string;
  text: string; content: VerifiedContent; operationId: string;
  /** Absent in historical rows (author v1); new rows prove satisfaction under B1a's author v2. */
  editContract?: 2;
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
export type EditGuardRule = 'target' | 'one-per-file' | 'rules-path' | 'encoding' | 'size' | 'unchanged' | 'date' | 'record' | 'mark' | 'archive' | 'views' | 'properties';
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
// its contract bound is the opaque-identifier one (lead ruling): DriveId's 1024 UTF-8 bytes.
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
  return closed(value, ['piles', 'members', 'journal', 'places'], ['maps'])
    && (value.maps === undefined || list(value.maps, (m) => closed(m, ['recordId', 'members'], ['answer']) && recordId(m.recordId)
      && (m.answer === undefined || recordId(m.answer)) && list(m.members, driveId) && unique(m.members)) && uniqueBy(value.maps as CapturedMap[], (m) => m.recordId))
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
  const optional = ['by', 'bowerNew', 'asAdded', 'origin', 'kind', 'pile', 'bowerItem', 'bowerDeclaration', 'bowerRun'];
  if (!closed(value, [], optional)) return false;
  const has = (key: string): boolean => Object.hasOwn(value, key);
  return (!has('by') || value.by === 'bower') && (!has('bowerNew') || value.bowerNew === '1' || value.bowerNew === null)
    && ['asAdded', 'origin', 'kind'].every((key) => !has(key) || nullable(text)(value[key]))
    && ['pile', 'bowerItem', 'bowerDeclaration', 'bowerRun'].every((key) => !has(key) || nullable(id)(value[key]));
}
function effect(value: unknown): value is Effect {
  if (!record(value)) return false;
  switch (value.kind) {
    case 'move': return closed(value, ['kind', 'before', 'parent', 'name', 'properties'], ['recordIds'])
      && seenFile(value.before) && target(value.parent) && name(value.name) && properties(value.properties)
      && (value.recordIds === undefined || list(value.recordIds, recordId) && unique(value.recordIds));
    case 'create-folder': return closed(value, ['kind', 'parent', 'name', 'createKey'])
      && target(value.parent) && name(value.name) && id(value.createKey);
    case 'create-text': return closed(value, ['kind', 'parent', 'name', 'createKey', 'text', 'content', 'purpose'])
      && target(value.parent) && name(value.name) && id(value.createKey) && text(value.text) && content(value.content)
      && oneOf(value.purpose, ['generated', 'runner-json', 'about-archive']);
    case 'write-runner-json': return text(value.text) && content(value.content) && (value.before === null
      ? closed(value, ['kind', 'before', 'beforeContent', 'path', 'parent', 'createKey', 'text', 'content'])
        && value.beforeContent === null && oneOf(value.path, ['.bower/type-table.json', '.bower/tags.json', '.bower/observations.jsonl']) && target(value.parent) && id(value.createKey)
      : closed(value, ['kind', 'before', 'beforeContent', 'path', 'text', 'content'], ['beforeText'])
        && seenFile(value.before) && verifiedContent(value.beforeContent) && text(value.path)
        && (!Object.hasOwn(value, 'beforeText') || value.path === '.bower/type-table.json' && text(value.beforeText)));
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
const CHANGE_ORDER: readonly Change['kind'][] = ['state-rewrite', 'link-rewrite', 'views-set', 'property-set', 'timeline-append', 'rules-wording', 'profile-rewrite', 'moc-rewrite', 'template-rewrite', 'about-append', 'about-rewrite'];
const recordIds = (value: unknown): value is string[] => list(value, recordId) && unique(value);
function editEntry(value: unknown): value is EditEntry {
  return closed(value, ['date', 'text', 'source']) && text(value.date) && text(value.text)
    && (value.source === null || text(value.source)) && entryOk(value as EditEntry, 'read');
}
function rename(value: unknown): value is Rename {
  return closed(value, ['from', 'to']) && text(value.from) && text(value.to) && renameOk(value as Rename);
}
function ruleAdd(value: unknown): value is RuleAdd {
  return closed(value, ['recordId', 'text', 'yourWords', 'since']) && recordId(value.recordId) && text(value.text)
    && text(value.yourWords) && integer(value.since) && ruleAddOk(value as RuleAdd);
}
function ruleRemove(value: unknown): value is RuleRemove {
  return closed(value, ['recordId', 'text'], ['since']) && recordId(value.recordId) && text(value.text) && (value.since === undefined || integer(value.since)) && ruleRemoveOk(value as RuleRemove);
}
/** A Current state's mark (`stateMark`): 16 lowercase hex digits. */
const stateMarkText = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{16}$/.test(value);
/** A grant names the answer that gives it, which the change carries in its record ids too, and the mark it saw. */
function stateGrant(value: unknown, ids: readonly string[]): value is StateGrant {
  return closed(value, ['answer', 'mark']) && recordId(value.answer) && ids.includes(value.answer as string) && (value.mark === null || stateMarkText(value.mark));
}
function change(value: unknown): value is Change {
  if (!record(value)) return false;
  switch (value.kind) {
    case 'about-append': return closed(value, ['kind', 'recordIds', 'text']) && recordIds(value.recordIds) && text(value.text);
    case 'about-rewrite': return closed(value, ['kind', 'region', 'recordIds', 'previous', 'text'], ['factIds', 'archive', 'undoneRunIds'])
      && oneOf(value.region, ABOUT_REGIONS) && recordIds(value.recordIds) && text(value.previous) && text(value.text)
      && !value.text.includes('<!-- bower:ownership')
      && (value.factIds === undefined || list(value.factIds, id) && unique(value.factIds))
      && (value.archive === undefined || path(value.archive))
      && (value.undoneRunIds === undefined || list(value.undoneRunIds, id) && unique(value.undoneRunIds));
    case 'template-rewrite': return closed(value, ['kind', 'region', 'recordIds', 'previous', 'text']) && oneOf(value.region, TEMPLATE_REGIONS)
      && recordIds(value.recordIds) && text(value.previous) && text(value.text) && !value.text.includes('<!-- bower:ownership');
    case 'profile-rewrite': return closed(value, ['kind', 'recordIds', 'previous', 'text'])
      && recordIds(value.recordIds) && text(value.previous) && text(value.text) && profileTextOk(value.text);
    case 'moc-rewrite': return closed(value, ['kind', 'region', 'recordIds', 'previous', 'text']) && oneOf(value.region, MOC_REGIONS)
      && recordIds(value.recordIds) && text(value.previous) && text(value.text);
    case 'state-rewrite': return closed(value, ['kind', 'recordIds', 'previous', 'lines'], ['adopted', 'release', 'granted', 'mark']) && recordIds(value.recordIds)
      && (value.adopted === undefined || value.adopted === true) && (value.release === undefined || (value.release === true && value.adopted === undefined))
      && [value.adopted, value.release, value.granted, value.mark].filter((x) => x !== undefined).length <= 1
      && (value.granted === undefined || stateGrant(value.granted, value.recordIds as string[])) && (value.mark === undefined || stateMarkText(value.mark))
      && list(value.previous, text) && list(value.lines, text) && stateLinesOk(value.previous as string[], value.lines as string[]);
    case 'link-rewrite': return closed(value, ['kind', 'recordIds', 'renames']) && recordIds(value.recordIds)
      && list(value.renames, rename) && value.renames.length > 0 && unique((value.renames as Rename[]).map((item) => item.from.toLowerCase()));
    case 'timeline-append': return closed(value, ['kind', 'recordIds', 'entries'], ['consent']) && recordIds(value.recordIds)
      && list(value.entries, editEntry) && value.entries.length > 0
      && (value.consent === undefined || (closed(value.consent, ['requestId', 'targetFileId', 'sourceFileId'])
        && recordId(value.consent.requestId) && driveId(value.consent.targetFileId) && driveId(value.consent.sourceFileId)
        && value.recordIds.length === 1 && value.recordIds[0] === value.consent.requestId
        && value.entries.length === 1 && (value.entries[0] as EditEntry).source !== null));
    case 'rules-wording': return closed(value, ['kind', 'add', 'remove']) && list(value.add, ruleAdd) && list(value.remove, ruleRemove)
      && value.add.length + value.remove.length > 0;
    case 'views-set': return closed(value, ['kind', 'recordIds', 'previous', 'text']) && recordIds(value.recordIds)
      && (value.previous === null || text(value.previous)) && text(value.text);
    case 'property-set': return closed(value, ['kind', 'recordIds', 'key', 'line']) && recordIds(value.recordIds) && text(value.key)
      && (value.line === null || text(value.line));
    default: return false;
  }
}
/** 1+ changes, at most one of each kind, in the order state-rewrite, link-rewrite, timeline-append, rules-wording (R3-7 m4). */
const changeOrder = (c: Change): number => c.kind === 'about-rewrite' ? CHANGE_ORDER.length + MOC_REGIONS.length + TEMPLATE_REGIONS.length + ABOUT_REGIONS.indexOf(c.region)
  : c.kind === 'template-rewrite' ? CHANGE_ORDER.length + MOC_REGIONS.length + TEMPLATE_REGIONS.indexOf(c.region)
  : c.kind === 'moc-rewrite' ? CHANGE_ORDER.length + MOC_REGIONS.indexOf(c.region) : CHANGE_ORDER.indexOf(c.kind);
const canonical = (changes: Change[]): boolean => changesOrdered(changes, changeOrder);
function editText(value: unknown): value is EditText {
  return closed(value, ['kind', 'before', 'path', 'beforeContent', 'changes', 'text', 'content'], ['beforeText', 'createdBy', 'types', 'tags']) && value.kind === 'edit-text'
    && (value.types === undefined || text(value.types)) && (value.tags === undefined || text(value.tags))
    && seenFile(value.before) && (value.createdBy === undefined || hash(value.createdBy))
    && path(value.path) && verifiedContent(value.beforeContent)
    && list(value.changes, change) && canonical(value.changes as Change[]) && text(value.text) && content(value.content)
    && (!Object.hasOwn(value, 'beforeText') || text(value.beforeText));
}
function mocInput(value: unknown): value is MocSnapshot {
  if (!closed(value, ['text', 'regions']) || !text(value.text) || !closed(value.regions, [...MOC_REGIONS])) return false;
  const regions = value.regions;
  if (!MOC_REGIONS.every((r) => text(regions[r]))) return false;
  const parsed = mocSnapshot(value.text);
  return parsed !== null && MOC_REGIONS.every((r) => parsed.regions[r] === regions[r]);
}
function maintain(value: unknown): value is Maintain {
  return closed(value, ['kind', 'inputs']) && value.kind === 'maintain'
    && closed(value.inputs, ['folderId', 'account', 'cursor', 'changes', 'operationIds'], ['targets', 'snapshot', 'listing', 'log', 'health'])
    && (value.inputs.health === undefined || driveId(value.inputs.health))
    && driveId(value.inputs.folderId) && driveId(value.inputs.account) && driveId(value.inputs.cursor)
    && list(value.inputs.changes, driveId) && unique(value.inputs.changes)
    && list(value.inputs.operationIds, hash) && unique(value.inputs.operationIds)
    && (value.inputs.snapshot === undefined || (record(value.inputs.snapshot) && Object.entries(value.inputs.snapshot).every(([key, f]) => driveId(key) && closed(f, ['path', 'version', 'summary', 'coverage'], ['moc', 'mocChecked', 'members', 'owner', 'type', 'incomplete', 'lint']) && (f.lint === undefined || lintEvidenceOk(f.lint)) && path(f.path) && rfc3339(f.version) && text(f.summary) && closed(f.coverage, ['kind', 'bytes']) && f.coverage.kind === 'prefix' && integer(f.coverage.bytes) && (f.incomplete === undefined || f.incomplete === true) && (f.mocChecked === undefined || f.mocChecked === true) && (f.owner === undefined || f.owner === 'bower' || f.owner === 'person') && (f.type === undefined || f.type === null || text(f.type)) && (f.moc === undefined || mocInput(f.moc)) && (f.members === undefined || (f.moc !== undefined && list(f.members, driveId) && unique(f.members))))))
    && (value.inputs.listing === undefined || list(value.inputs.listing, seenFile))
    && (value.inputs.log === undefined || text(value.inputs.log))
    && (value.inputs.targets === undefined || list(value.inputs.targets, (t) => closed(t, ['path', 'fileId', 'parentId'], ['beforeContent', 'kind', 'declaration'])
      && (t.kind === undefined || text(t.kind))
      && (t.declaration === undefined || (text(t.kind) && closed(t.declaration, ['at', 'sources'], ['unavailable']) && rfc3339(t.declaration.at)
        && (t.declaration.unavailable === undefined || t.kind === 'health'
          && list(t.declaration.unavailable, (s) => closed(s, ['path', 'file']) && path(s.path) && seenFile(s.file) && !s.file.folder))
        && list(t.declaration.sources, (s) => closed(s, ['path', 'file', 'text', 'content']) && path(s.path) && seenFile(s.file)
          && !s.file.folder && typeof s.text === 'string' && verifiedContent(s.content) && s.content.observedModifiedTime === s.file.modifiedTime)))
      && path(t.path) && driveId(t.fileId) && driveId(t.parentId) && (t.beforeContent === undefined || verifiedContent(t.beforeContent))));
}
const effectV2 = (value: unknown): value is EffectV2 => effect(value) || editText(value) || maintain(value);
function operationV2(value: unknown): value is OperationV2 {
  return closed(value, ['operationId', 'ordinal', 'dependsOn', 'effect']) && hash(value.operationId) && integer(value.ordinal)
    && list(value.dependsOn, hash) && unique(value.dependsOn) && effectV2(value.effect);
}

const rows = (value: unknown, keys: string[], optional: string[] = []): boolean =>
  list(value, (row) => closed(row, keys, optional) && Object.values(row).every(text));
const hex32 = (value: unknown): value is string => typeof value === 'string' && value.length === 32 && !/[^0-9a-f]/.test(value);
const has = (row: Fields, key: string): boolean => Object.hasOwn(row, key);
/**
 * An updated row, the one validator of it for the manifest and the checkpoint (P4-45d): `op` optional; `line` (an
 * ordinal) only with its op; `lines`, `md5` and `stamp` only with a line, and the line below `lines` (TL-P4-19 addenda
 * 3 to 5). A row from before any of them still reads.
 */
export const isUpdatedRow = (row: unknown): row is UpdatedRow => closed(row, ['path', 'what'], ['op', 'line', 'lines', 'md5', 'stamp'])
  && text(row.path) && text(row.what) && (!has(row, 'op') || hash(row.op)) && (!has(row, 'line') || (has(row, 'op') && integer(row.line)))
  && ['lines', 'md5', 'stamp'].every((k) => !has(row, k) || has(row, 'line'))
  && (!has(row, 'lines') || (integer(row.lines) && (row.line as number) < row.lines))
  && (!has(row, 'md5') || hex32(row.md5)) && (!has(row, 'stamp') || hex32(row.stamp));
/**
 * A thing already saved, the one validator of it for the manifest and the checkpoint: its name and the name it is
 * saved as; `notes` (a pile of words whose lines were in its notes already, c3-pair-ask) a count of at least one. A
 * row from before it still reads.
 */
export const isSavedRow = (row: unknown): row is { name: string; as: string; notes?: number } => closed(row, ['name', 'as'], ['notes'])
  && text(row.name) && text(row.as) && (!has(row, 'notes') || (integer(row.notes) && (row.notes as number) >= 1));
export const isLeftAsWrittenRow = (row: unknown): row is LeftAsWritten => closed(row, ['name', 'why'], ['fileId'])
  && text(row.name) && text(row.why) && (!has(row, 'fileId') || driveId(row.fileId));
function runReport(value: unknown): value is ManifestRunReport {
  if (!closed(value, ['filed', 'created', 'updated', 'setAside', 'questions'], ['yourChanges', 'requests', 'rulesWorded', 'alreadySaved', 'answered', 'leftAsWritten'])) return false;
  return list(value.filed, (row) => closed(row, ['name', 'title', 'kind', 'to'], ['note', 'area']) && text(row.name) && text(row.title)
      && oneOf(row.kind, fileKinds) && text(row.to) && (!Object.hasOwn(row, 'note') || text(row.note)) && (!Object.hasOwn(row, 'area') || text(row.area)))
    && rows(value.created, ['path', 'what']) && list(value.updated, isUpdatedRow) && rows(value.setAside, ['name', 'why'])
    && list(value.questions, (row) => closed(row, ['id', 'text', 'yes', 'no', 'askedAt'], ['about', 'proposal'])
      && (row.proposal === undefined || (proposalOk(row.proposal) && row.id === `q-proposal-${row.proposal.id}`))
      && text(row.id) && text(row.text) && text(row.yes) && text(row.no) && integer(row.askedAt)
      && (!Object.hasOwn(row, 'about') || text(row.about)))
    && (!Object.hasOwn(value, 'leftAsWritten') || list(value.leftAsWritten, isLeftAsWrittenRow))
    && (!Object.hasOwn(value, 'yourChanges') || integer(value.yourChanges))
    && (!Object.hasOwn(value, 'requests') || list(value.requests, text))
    && (!Object.hasOwn(value, 'rulesWorded') || integer(value.rulesWorded))
    && (!Object.hasOwn(value, 'alreadySaved') || (list(value.alreadySaved, isSavedRow) && (value.alreadySaved as unknown[]).length > 0))
    && (!Object.hasOwn(value, 'answered') || (list(value.answered, isAnsweredRow) && (value.answered as unknown[]).length > 0));
}
function contribution(value: unknown): value is ReportContribution {
  return closed(value, ['requires', 'when', 'value']) && list(value.requires, hash) && value.requires.length > 0
    && unique(value.requires) && oneOf(value.when, ['applied', 'rejected']) && runReport(value.value);
}

export const isAppendCompletion = (row: unknown): row is AppendCompletion => closed(row, ['requestId', 'targetFileId'])
  && recordId(row.requestId) && driveId(row.targetFileId);
function manifestOf(value: unknown, v: 1 | 2, item: (value: unknown) => boolean): boolean {
  return closed(value, ['v', 'kind', 'scope', 'runId', 'requestId', 'runScope', 'allowWeb', 'requestedAt', 'captureId', 'capture', 'operations', 'reportPlan'], ['satisfiedAppends'])
    && value.v === v && value.kind === 'run-manifest' && closed(value.scope, ['rootId']) && driveId(value.scope.rootId)
    && id(value.runId) && id(value.requestId) && oneOf(value.runScope, ['all', 'instructions'])
    && typeof value.allowWeb === 'boolean' && integer(value.requestedAt) && hash(value.captureId)
    && (value.satisfiedAppends === undefined || list(value.satisfiedAppends, (r): r is SatisfiedAppend =>
      closed(r, ['consent', 'entry', 'before', 'path', 'text', 'content', 'operationId'], ['editContract'])
      && (r.editContract === undefined || r.editContract === 2)
      && closed(r.consent, ['requestId', 'targetFileId', 'sourceFileId']) && recordId(r.consent.requestId)
      && driveId(r.consent.targetFileId) && driveId(r.consent.sourceFileId) && editEntry(r.entry)
      && seenFile(r.before) && path(r.path) && text(r.text) && verifiedContent(r.content) && hash(r.operationId)))
    && capture(value.capture) && list(value.operations, item) && list(value.reportPlan, contribution);
}
function manifest(value: unknown): value is Manifest {
  return manifestOf(value, 1, operation);
}
/** A v2 manifest without edit-text is refused: the runner writes v1 then. */
function manifestV2(value: unknown): value is ManifestV2 {
  return manifestOf(value, 2, operationV2) && (value as ManifestV2).operations.some((item) => item.effect.kind === 'edit-text' || item.effect.kind === 'maintain');
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
    if ((effect.kind === 'edit-text' || effect.kind === 'write-runner-json' && effect.before !== null) && effect.beforeText !== undefined)
      found.push({ text: effect.beforeText, content: effect.beforeContent });
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
 * Each satisfied append is proved by the manifest itself: its request captured, its archive move the completion, its
 * source filed by this run (the move it waits for) or a captured place, and the line already in the note as read.
 */
async function satisfiedProven(value: Manifest | ManifestV2): Promise<boolean> {
  for (const row of value.satisfiedAppends ?? []) {
    const c = row.consent;
    const place = value.capture.places.find((p) => p.file.fileId === c.targetFileId);
    const journal = value.capture.journal.find((j) => j.recordId === c.requestId);
    const op = value.operations.find((o) => o.operationId === row.operationId);
    const source = value.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === c.sourceFileId
      && value.capture.members.some((m) => m.file.fileId === c.sourceFileId));
    if (!place || place.path !== row.path || !sameSeen(place.file, row.before) || !journal
      || op?.effect.kind !== 'move' || !journal.fileIds.includes(op.effect.before.fileId)
      || (source ? !op.dependsOn.includes(source.operationId) : !value.capture.places.some((p) => p.file.fileId === c.sourceFileId))
      || row.content.observedModifiedTime !== row.before.modifiedTime || !await describes(row.content, row.text)) return false;
    if (!satisfiedAppendUnchanged(new TextEncoder().encode(row.text), { kind: 'timeline-append', recordIds: [c.requestId],
      consent: c, entries: [row.entry] }, { fileId: c.targetFileId, context: createOwnershipContext(), consents: [c], path: row.path, name: row.before.name },
    row.editContract ?? 1)) return false;
  }
  return true;
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
  finalized = true,
): Promise<{ ok: true; value: M; sha256: string } | { ok: false; reason: ManifestRefusal }> {
  if (!guard(parsed)) return { ok: false, reason: 'shape' };
  if (parsed.operations.some(({ effect: e }) => e.kind === 'write-runner-json' && (!writes.includes(e.path)
    || (e.before === null ? targetPath(parsed, e.parent) !== '.bower'
      || parsed.capture.places.some((p) => p.path === e.path)
      : e.path !== `.bower/${e.before.name}` || e.before.folder
    || parsed.capture.places.some((p) => p.file.fileId === e.before.fileId
      && (p.path !== e.path || !sameSeen(p.file, e.before))))))) return { ok: false, reason: 'shape' };
  const value = parsed;
  if (!await aboutArtifactsOk(value, finalized) || !await planningArtifactsOk(value)) return { ok: false, reason: 'shape' };
  if (!driveId(expectedRootId) || expectedRootId !== value.scope.rootId) return { ok: false, reason: 'scope' };
  if (!await satisfiedProven(value)) return { ok: false, reason: 'shape' };
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
  const maintenance = value.operations.filter((o) => o.effect.kind === 'maintain');
  if (maintenance.length > 1) return { ok: false, reason: 'order' };
  for (const op of maintenance) {
    const e = op.effect as Maintain;
    if (e.inputs.folderId !== expectedRootId) return { ok: false, reason: 'scope' };
    if (op.ordinal !== value.operations.length - 1 || e.inputs.operationIds.join() !== value.operations.slice(0, op.ordinal).map((o) => o.operationId).join()) return { ok: false, reason: 'order' };
    if (new Set(e.inputs.targets?.map((t) => t.path)).size !== (e.inputs.targets?.length ?? 0)
      || new Set(e.inputs.targets?.map((t) => t.fileId)).size !== (e.inputs.targets?.length ?? 0)) return { ok: false, reason: 'shape' };
    for (const target of e.inputs.targets ?? []) {
      for (const source of target.declaration?.sources ?? []) {
        if (!await describes(source.content, source.text)) return { ok: false, reason: 'shape' };
      }
      if (target.path === 'About me.md' && maintenanceTargetOk(value, target)) {
        const source = target.declaration?.sources.find((s) => s.path === 'About me.md');
        const before = e.inputs.listing?.find((f) => f.fileId === target.fileId);
        if (before ? before.folder || before.name !== 'About me.md' || before.parents.length !== 1
          || before.parents[0] !== target.parentId || !source || !sameSeen(before, source.file) || !target.beforeContent
          || target.beforeContent.observedModifiedTime !== before.modifiedTime
          || !await describes(target.beforeContent, source.text) : source !== undefined || target.beforeContent !== undefined)
          return { ok: false, reason: 'shape' };
        continue;
      }
      if (target.kind === 'log' || target.kind === 'log-folder') {
        if (!maintenanceTargetOk(value, target)) return { ok: false, reason: 'shape' };
        const before = e.inputs.listing?.find((f) => f.fileId === target.fileId);
        if (target.kind === 'log-folder' ? before !== undefined || target.beforeContent !== undefined
          : before ? !target.beforeContent || target.beforeContent.encoding !== 'utf8'
            || target.beforeContent.observedModifiedTime !== before.modifiedTime
            || !sameSeen(before, value.capture.places.find((p) => p.file.fileId === target.fileId)?.file ?? before)
          : target.beforeContent !== undefined) return { ok: false, reason: 'shape' };
        continue;
      }
      if (target.kind === 'health') {
        // R18 as amended: only the stored health id, directly in the root, never a note the snapshot holds (a person's).
        const before = e.inputs.listing?.find((f) => f.fileId === target.fileId);
        const place = value.capture.places.find((p) => p.file.fileId === target.fileId)?.file;
        if (!maintenanceTargetOk(value, target) || target.fileId !== e.inputs.health || target.parentId !== expectedRootId
          || target.declaration && target.declaration.at !== new Date(value.requestedAt).toISOString()
          || e.inputs.snapshot?.[target.fileId] !== undefined || !place || place.folder || place.parents.join() !== expectedRootId
          || (before ? !sameSeen(before, place) || !target.beforeContent || target.beforeContent.encoding !== 'utf8'
            || target.beforeContent.observedModifiedTime !== before.modifiedTime : target.beforeContent !== undefined))
          return { ok: false, reason: 'shape' };
        continue;
      }
      if ((writes as readonly string[]).includes(target.path)) continue;
      const input = e.inputs.snapshot?.[target.fileId];
      const before = e.inputs.listing?.find((f) => f.fileId === target.fileId);
      if (!input?.moc || !before || before.folder || input.path !== target.path || input.version !== before.modifiedTime
        || before.parents.length !== 1 || before.parents[0] !== target.parentId || !target.beforeContent
        || before.name !== target.path.split('/').at(-1)
        || target.beforeContent.observedModifiedTime !== before.modifiedTime || target.beforeContent.encoding !== 'utf8'
        || !await describes(target.beforeContent, input.moc.text)) return { ok: false, reason: 'shape' };
    }
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

/** Request relocation uses ordinary moves: a temporary recovery pointer, then the physical pending folder. */
export function requestMoveKind(value: { runId: string; capture: Capture; operations: readonly OperationV2[] }, item: OperationV2): 'pointer' | 'pending' | null {
  const e = item.effect;
  if (e.kind !== 'move' || !value.capture.journal.some((j) => j.fileIds.includes(e.before.fileId))) return null;
  if ('fileId' in e.parent && e.parent.fileId === e.before.parents[0] && e.name === e.before.name
    && Object.keys(e.properties).length === 1 && e.properties.bowerRun === value.runId) return 'pointer';
  return targetPath(value, e.parent) === `.bower/changes/pending/${value.runId}` && e.properties.bowerRun === null ? 'pending' : null;
}

/**
 * Whether a record may name a map's change of one note (B12 R66, R82): a request this run completes, and for a move
 * a note of its captured set (`plain`: a property edit needs no capture); or the yes answering a held large request,
 * for a note of its frozen part. A held request that was answered is never its own authority.
 */
function mapCites(maps: readonly CapturedMap[], journal: { has(id: string): boolean }, done: ReadonlySet<string>, id: string, fileId: string, plain: boolean): boolean {
  if (!journal.has(id)) return false;
  const yes = maps.find((m) => m.answer === id);
  if (yes) return done.has(yes.recordId) && yes.members.includes(fileId);
  const own = maps.find((m) => m.recordId === id);
  return own ? own.answer === undefined && done.has(id) && (plain || own.members.includes(fileId)) : plain && done.has(id);
}

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
  // B12 (R26, R28, R62, R66): a map's moves and link fixes, each by the requests whose sets this run captured.
  const maps = capture.maps ?? [];
  const done = requestsDone(value);
  const mapMoves = operations.filter((o): o is OperationV2 & { effect: Extract<EffectV2, { kind: 'move' }> } => o.effect.kind === 'move' && o.effect.recordIds !== undefined);
  // A map's move names its request: an admitted request this run completes, whose set holds the note (R66); or the yes of a held one (R82).
  if (mapMoves.some(({ effect: e }) => !e.recordIds?.length || !e.recordIds.every((id) => mapCites(maps, journal, done, id, e.before.fileId, false)))) return 'record';
  const fixOf = (e: EditText): Extract<Change, { kind: 'link-rewrite' }> | undefined => e.changes.find((c): c is Extract<Change, { kind: 'link-rewrite' }> => c.kind === 'link-rewrite'
    && c.recordIds.some((id) => maps.some((m) => (m.answer ?? m.recordId) === id)));
  for (const item of operations) {
    const e = item.effect;
    if (e.kind !== 'edit-text') continue;
    const fix = fixOf(e);
    // A map's link fix follows only moves of this run, waiting for each (R62): the old and new display names its moves give.
    if (fix && !fix.renames.every((r) => mapMoves.some((mv) => fix.recordIds.some((id) => mv.effect.recordIds?.includes(id))
      && displayName(mv.effect.before.name).toLowerCase() === r.from.toLowerCase() && displayName(mv.effect.name) === r.to && item.dependsOn.includes(mv.operationId)))) return 'record';
    const place = places.get(e.before.fileId);
    const segments = e.path.split('/');
    const prior = edited.get(e.before.fileId);
    // A second edit of one note is only a map's link fix after the note's own edit, from the text that edit wrote (R68).
    const chained = !!prior && !!fix && e.changes.length === 1 && item.dependsOn.includes(prior.operationId) && e.path === prior.effect.path
      && sameSeen(e.before, prior.effect.before) && e.beforeContent.sha256 === prior.effect.content.sha256 && e.beforeContent.size === prior.effect.content.size;
    if (!chained && (edited.has(e.before.fileId) || paths.has(e.path))) return 'one-per-file';
    const create = e.createdBy ? operations.find((op) => op.operationId === e.createdBy) : undefined;
    if (e.createdBy && (!create || create.ordinal >= item.ordinal || !item.dependsOn.includes(e.createdBy)
      || create.effect.kind !== 'create-text' || create.effect.purpose !== 'generated'
      || e.path !== 'About me.md' || create.effect.name !== e.before.name || create.effect.createKey !== e.before.fileId
      || !('fileId' in create.effect.parent) || create.effect.parent.fileId !== value.scope.rootId
      || e.before.parents.join() !== value.scope.rootId || e.before.folder
      || e.before.modifiedTime !== new Date(value.requestedAt).toISOString()
      || e.beforeContent.observedModifiedTime !== e.before.modifiedTime
      || e.beforeText !== create.effect.text || e.beforeContent.sha256 !== create.effect.content.sha256
      || e.beforeContent.size !== create.effect.content.size || places.has(e.before.fileId) || captured.has(e.before.fileId))) return 'target';
    const target = !!create || !e.before.folder && place !== undefined && sameSeen(place.file, e.before) && place.path === e.path
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
      if (entry.kind === 'timeline-append' && entry.consent) {
        const c = entry.consent;
        if (c.targetFileId !== e.before.fileId || !journal.has(c.requestId)) return 'record';
        const source = operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === c.sourceFileId && captured.has(c.sourceFileId));
        if (source ? !item.dependsOn.includes(source.operationId) : !places.has(c.sourceFileId)) return 'record';
      }
      if (!recordsOf(entry).every((id) => journal.has(id))) return 'record';
    }
    if (!prior) edited.set(e.before.fileId, { operationId: item.operationId, effect: e });
    paths.add(e.path);
  }
  const marks = new Map<string, number>();
  for (const item of operations) {
    const e = item.effect;
    if (e.kind !== 'move' && e.kind !== 'bin') continue;
    const target = edited.get(e.before.fileId);
    if (!target) continue;
    // A map's move of an edited note: as read, after each of its edits before it, and before each after it (R26, R68).
    if (e.kind === 'move' && e.recordIds !== undefined) {
      const around = operations.filter((o) => o.effect.kind === 'edit-text' && o.effect.before.fileId === e.before.fileId);
      if (!sameSeen(e.before, target.effect.before) || !around.every((o) => (o.ordinal < item.ordinal ? item.dependsOn.includes(o.operationId)
        : o.dependsOn.includes(item.operationId)))) return 'target';
      continue;
    }
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
      const archives = operations.filter((item) => item.effect.kind === 'move' && files.includes(item.effect.before.fileId)
        && requestMoveKind(value, item) !== 'pointer');
      if (!archives.every((item) => item.dependsOn.includes(target.operationId))) return 'archive';
    }
  }
  return null;
}

/**
 * Reads v1 exactly as `parseRunManifest` (same path, digests and identities) and v2: v1's guards plus `edit-text`.
 * A later version refuses as `version`, so a build that reads v2 can say it needs a newer Bower (R3-7 m9).
 * Before maintenance, `finalized: false` checks the plan without requiring its terminal memory barrier.
 */
export async function parseRunManifestV2(bytes: Uint8Array, expectedRootId: string, writes: readonly RunnerWrite[], finalized = true): Promise<ManifestV2Result> {
  const parsed = parseRecordJson(bytes);
  if (!parsed.ok) return parsed;
  const v = record(parsed.value) ? parsed.value.v : undefined;
  if (v === 1) return finalized ? parseRunManifest(bytes, expectedRootId, writes)
    : admit(parsed.value, expectedRootId, manifest, writes, false);
  if (integer(v) && v > 2) return { ok: false, reason: 'version' };
  if (v === 2 && bytes.byteLength > MANIFEST_V2_LIMIT) return { ok: false, reason: 'edit', rule: 'size' };
  const admitted = await admit(parsed.value, expectedRootId, (value): value is ManifestV2 => finalized ? manifestV2(value) : manifestOf(value, 2, operationV2), writes, finalized);
  if (!admitted.ok) return admitted;
  const broken = edits(admitted.value) ?? (await viewsSetOk(admitted.value) ? null : 'views') ?? (await propertySetOk(admitted.value) ? null : 'properties');
  return broken === null ? admitted : { ok: false, reason: 'edit', rule: broken };
}

/** The ids of the requests a manifest completes: its requests.json `done` rows (an unreadable file proves none). */
function requestsDone(value: ManifestV2): Set<string> {
  const done = new Set<string>();
  for (const { effect: e } of value.operations) {
    const requests = e.kind === 'write-runner-json' && e.path === '.bower/requests.json'
      || e.kind === 'create-text' && e.name === 'requests.json' && targetPath(value, e.parent) === '.bower';
    if (!requests || !('text' in e)) continue;
    try {
      const file = JSON.parse(e.text) as { done?: Array<{ id?: unknown }> };
      for (const row of file.done ?? []) if (typeof row.id === 'string') done.add(row.id);
    } catch {
      // expected: an unreadable requests file proves no request.
    }
  }
  return done;
}

/**
 * A property-set edit (B12 R22, R54, R57; the views-set pattern): re-authored from the bytes it read, so only its keys'
 * lines change, on a Bower note that is not a Source (the author refuses any other); each key is `tags`, held to B7's
 * vocabulary (the list it read, or this run's tag-list write) and at most three on the note, or a key the note's row
 * declares and no formula computes, its line reading back as a value the property holds; every record it names is a
 * request this run completes, or the yes of a held large request whose frozen part holds the note (R82, `mapCites`).
 */
async function propertySetOk(value: ManifestV2): Promise<boolean> {
  const done = requestsDone(value);
  const journal = new Set(value.capture.journal.map((j) => j.recordId));
  const grown = value.operations.flatMap(({ effect: e }) => (e.kind === 'write-runner-json' && e.path === '.bower/tags.json'
    || e.kind === 'create-text' && e.name === 'tags.json' && targetPath(value, e.parent) === '.bower' ? readTagList(e.text).tags : []));
  for (const { effect: e } of value.operations) {
    if (e.kind !== 'edit-text') continue;
    const sets = e.changes.filter((c): c is Extract<Change, { kind: 'property-set' }> => c.kind === 'property-set');
    if (!sets.length) continue;
    if (e.beforeText === undefined || e.types === undefined || !await describes(e.beforeContent, e.beforeText)
      || sets.some((c) => c.line === null || !c.recordIds.length || !c.recordIds.every((id) => mapCites(value.capture.maps ?? [], journal, done, id, e.before.fileId, true)))) return false;
    const authored = applyChanges(new TextEncoder().encode(e.beforeText), e.changes);
    if (!authored.ok || authored.text !== e.text) return false;
    const type = frontValues(e.beforeText)?.type;
    const row = readTypeTable(e.types).table.rows.find((r) => r.id === type);
    const vocabulary = new Set([...readTagList(e.tags ?? null).tags, ...grown]);
    for (const c of sets) {
      const raw = frontValues(`---\n${c.line ?? ''}\n---\n`)?.[c.key];
      if (c.key === 'tags' ? scalarList(raw ?? '').length > NOTE_TAGS_MAX || scalarList(raw ?? '').some((tag) => !vocabulary.has(tag))
        : !row || !Object.hasOwn(row.properties, c.key) || computedBy(row).has(c.key) || typeof propertyValue(row, c.key, raw) !== 'object') return false;
    }
  }
  return true;
}

/**
 * A views-set edit (B11 R43, coordinator ruling 1): re-authored from the bytes it read, so only the `bower_views` line
 * and the run's own link rewrite change, on a Bower map; its new entries pass the write grammar against the type table
 * it read, at most ten in all; every record it names is a request this run completes (its requests.json `done`) or
 * a yes this run archives (R64).
 */
async function viewsSetOk(value: ManifestV2): Promise<boolean> {
  const done = requestsDone(value);
  const journal = new Map(value.capture.journal.map((j) => [j.recordId, j.fileIds]));
  // A yes to a suggested view (B11f, R64) is its own record: an answer this run archives (moves out of the journal).
  const archived = (id: string): boolean => value.operations.some((o) => o.effect.kind === 'move' && (journal.get(id) ?? []).includes(o.effect.before.fileId));
  for (const { effect: e } of value.operations) {
    if (e.kind !== 'edit-text') continue;
    const set = e.changes.find((c): c is Extract<Change, { kind: 'views-set' }> => c.kind === 'views-set');
    if (!set) continue;
    if (e.changes.some((c) => c.kind !== 'views-set' && c.kind !== 'link-rewrite') || e.beforeText === undefined || e.types === undefined
      || !set.recordIds.length || !set.recordIds.every((id) => journal.has(id) && (done.has(id) || archived(id)))
      || !await describes(e.beforeContent, e.beforeText)) return false;
    const authored = applyChanges(new TextEncoder().encode(e.beforeText), e.changes);
    if (!authored.ok || authored.text !== e.text) return false;
    let list: unknown;
    let stored: unknown;
    try { list = JSON.parse(set.text); stored = set.previous === null ? [] : JSON.parse(set.previous); }
    catch {
      // expected: a stored line that is not JSON keeps no entry; the new line must be JSON.
      stored = [];
    }
    if (!Array.isArray(list) || list.length > VIEW_LIMITS.perHome) return false;
    const kept = new Set((Array.isArray(stored) ? stored : []).map((v) => JSON.stringify(v)));
    const table = readTypeTable(e.types).table;
    if (list.some((entry) => !kept.has(JSON.stringify(entry)) && viewFault(entry, table, 'write') !== null)) return false;
  }
  return true;
}


/** B4 uses the same effects and confirmed dependency edges; these checks add no dispatch lifecycle. */
async function aboutArtifactsOk(value: Manifest | ManifestV2, finalized: boolean): Promise<boolean> {
  const operations: readonly OperationV2[] = value.operations;
  const ledgerPath = '.bower/observations.jsonl';
  const enc = new TextEncoder();
  const ledgers = new Map<string, ReturnType<typeof parseObservations>>();
  const archives = new Map<string, OperationV2 & { effect: Extract<Effect, { kind: 'create-text' }> }>();
  const consolidationArchives = new Set<string>();
  const namedArchives = new Set<string>();
  let lastLedger: OperationV2 | undefined;
  let lastMemory: OperationV2 | undefined;
  let finalAbout: string | undefined;
  const undoneRunIds: string[] = [];
  const about = value.capture.places.filter((p) => p.path === 'About me.md');
  if (about.length > 1 && operations.some(({ effect: e }) => e.kind === 'write-runner-json' && e.path === ledgerPath
    || e.kind === 'create-text' && (e.purpose === 'about-archive' || `${targetPath(value, e.parent)}/${e.name}` === ledgerPath)
    || e.kind === 'edit-text' && (e.path === 'About me.md' || about.some((p) => p.file.fileId === e.before.fileId)
      || e.changes.some((c) => c.kind === 'about-append' || c.kind === 'about-rewrite')))) return false;
  try {
    for (const op of operations) {
      const e = op.effect;
      if (e.kind === 'maintain') {
        if (e.inputs.targets?.some((t) => !maintenanceTargetOk(value, t))) return false;
        if (lastMemory && !op.dependsOn.includes(lastMemory.operationId)) return false;
      }
      if (e.kind === 'create-text') {
        if (e.name === 'About me.md' && 'fileId' in e.parent && e.parent.fileId === value.scope.rootId) {
          if (about.length || e.purpose !== 'generated'
            || lastLedger && !op.dependsOn.includes(lastLedger.operationId)
            || finalAbout !== undefined || !validLearnedBlock(e.text, undefined, true)) return false;
          finalAbout = e.text;
          lastMemory = op;
          continue;
        }
        const path = `${targetPath(value, e.parent)}/${e.name}`;
        if (path === ledgerPath) {
          if (e.purpose !== 'runner-json') return false;
        } else {
          if (e.purpose !== 'about-archive' && !path.startsWith('.bower/archive/about-me/')) continue;
          if (e.purpose !== 'about-archive' || !aboutArchivePath(path) || archives.has(path)
            || value.capture.places.some((p) => p.path === path)
            || !e.name.endsWith(`-${e.createKey}.md`) || !e.name.startsWith(`${timelineDate(value.requestedAt)}-`)) return false;
          // B4a's archive follows the ledger write it depends on; any other must be B4c's, named by a later consolidation.
          if (!lastLedger || !op.dependsOn.includes(lastLedger.operationId)) consolidationArchives.add(op.operationId);
          archives.set(path, { ...op, effect: e });
          lastMemory = op;
        }
      }
      if (e.kind === 'write-runner-json' && e.path === ledgerPath
        || e.kind === 'create-text' && `${targetPath(value, e.parent)}/${e.name}` === ledgerPath) {
        const bytes = enc.encode(e.text);
        let priorBytes = new Uint8Array();
        if (e.kind === 'write-runner-json' && e.before !== null) {
          const place = value.capture.places.find((p) => p.file.fileId === e.before.fileId);
          if (e.before.folder || e.before.name !== 'observations.jsonl' || place?.path !== ledgerPath
            || !sameSeen(place.file, e.before) || e.beforeContent.observedModifiedTime !== e.before.modifiedTime
            || e.beforeContent.encoding !== 'utf8') return false;
          priorBytes = bytes.slice(0, e.beforeContent.size);
        } else if (lastLedger || value.capture.places.some((p) => p.path === ledgerPath)) return false;
        const prior = parseObservations(priorBytes);
        const priorText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(priorBytes);
        if (e.kind === 'write-runner-json' && e.beforeContent !== null && !await describes(e.beforeContent, priorText)) return false;
        const ledger = parseObservations(bytes);
        if (lastLedger) {
          const prev = lastLedger.effect;
          if (e.kind !== 'write-runner-json' || e.before === null || prev.kind !== 'write-runner-json' && prev.kind !== 'create-text'
            || prev.kind === 'write-runner-json' && prev.before?.fileId !== e.before.fileId
            || prev.text !== priorText || !op.dependsOn.some((dep) => dep === lastMemory?.operationId)) return false;
        }
        const oldIds = new Set(prior.events.map((event) => event.eventId));
        for (const event of ledger.events.filter((event) => !oldIds.has(event.eventId))) {
          if (event.date !== timelineDate(value.requestedAt)
            || event.kind !== 'consolidation' && event.at !== undefined && event.at !== value.requestedAt) return false;
          if (event.kind === 'observation') {
            const origin = event.origin;
            if (origin.runId !== value.runId || origin.captureId !== value.captureId) return false;
            if (origin.kind === 'words') {
              const pile = value.capture.piles.find((p) => p.pileId === origin.pileId);
              if (pile?.context.kind !== 'text' || pile.context.file.fileId !== event.source.fileId
                || pile.context.content.sha256 !== event.source.sha256 || !hasVerbatimQuote(parseNote(pile.context.file.name, pile.context.text).body, event.text)) return false;
            } else if (origin.kind === 'document') {
              return false;
            } else if (!value.capture.journal.some((j) => j.recordId === origin.recordId && j.fileIds.includes(event.source.fileId)
              && j.sha256 === event.source.sha256)) return false;
          } else if (event.kind === 'tombstone') {
            if (event.runId !== value.runId || !prior.events.some((old) => old.kind === 'observation'
              && old.factId === event.factId && old.source.fileId === event.sourceId)) return false;
          } else if (event.kind === 'ended') {
            // The person's words of this capture: the whole note as captured, its body holding the quote (R38).
            const pile = value.capture.piles.find((p) => p.context.kind === 'text' && p.context.file.fileId === event.source.fileId);
            if (event.runId !== value.runId || !prior.live.some((fact) => fact.factId === event.factId)
              || pile?.context.kind !== 'text' || pile.context.content.sha256 !== event.source.sha256
              || !hasVerbatimQuote(parseNote(pile.context.file.name, pile.context.text).body, event.quote)) return false;
          } else if (event.lines) {
            // B4c (R18): the write's last event, naming the archive it depends on, which holds the section maintain read.
            const [path, archive] = [...archives].find(([, a]) => a.operationId === event.operationId) ?? [];
            const maintain = operations.at(-1)?.effect;
            const declared = maintain?.kind === 'maintain' ? maintain.inputs.targets?.find((t) => t.kind === 'about')
              ?.declaration?.sources.find((s) => s.path === 'About me.md')?.text : undefined;
            const bytes = declared === undefined ? undefined : enc.encode(declared);
            const own = bytes && parseOwnership(bytes);
            const span = own && own.status !== 'invalid' ? own.payloads?.[event.section] : undefined;
            const payload = bytes && span ? new TextDecoder().decode(bytes.subarray(span.start, span.end)) : undefined;
            if (event !== ledger.events.at(-1) || !archive || !consolidationArchives.has(archive.operationId)
              || !op.dependsOn.includes(archive.operationId) || path?.split('/')[3] !== event.section
              || !consolidationOk({ ...ledger, events: ledger.events.slice(0, -1) }, event, value.runId)
              // Before maintenance (finalized: false) there is no declaration yet; the stored manifest is checked again.
              || maintain?.kind === 'maintain' && payload !== archive.effect.text) return false;
            namedArchives.add(archive.operationId);
          } else if (event.successful) {
            const edit = operations.find((o) => o.operationId === event.operationId);
            if (event.runId !== value.runId || !edit || edit.ordinal >= op.ordinal || !op.dependsOn.includes(edit.operationId)
              || edit.effect.kind !== 'edit-text' || !edit.effect.changes.some((c) => c.kind === 'about-rewrite'
                && c.region === event.section && c.archive && c.factIds?.join() === event.factIds.join())) return false;
          }
        }
        ledgers.set(op.operationId, ledger);
        lastLedger = op; lastMemory = op;
      }
      if (e.kind !== 'edit-text' || !(e.path === 'About me.md' || about.some((p) => p.file.fileId === e.before.fileId)
        || e.changes.some((c) => c.kind === 'about-append' || c.kind === 'about-rewrite'))) continue;
      if ((e.createdBy ? about.length !== 0 || finalAbout !== e.beforeText
        : about.length !== 1 || about[0]?.file.fileId !== e.before.fileId) || e.path !== 'About me.md'
        || e.beforeText === undefined || e.beforeContent.observedModifiedTime !== e.before.modifiedTime
        || lastLedger && !op.dependsOn.includes(lastLedger.operationId)) return false;
      const authored = applyChanges(enc.encode(e.beforeText), e.changes);
      if (!authored.ok || authored.text !== e.text) return false;
      finalAbout = e.text;
      const ledger = lastLedger ? ledgers.get(lastLedger.operationId) : parseObservations(new Uint8Array());
      if (!ledger) return false;
      undoneRunIds.push(...e.changes.flatMap((c) => c.kind === 'about-rewrite' ? c.undoneRunIds ?? [] : []));
      if (undoneRunIds.some((runId) => !ledger.events.some((event) =>
        (event.kind === 'observation' ? event.origin.runId : event.runId) === runId))) return false;
      const rebuilt = undoneRunIds.length && lastLedger && (lastLedger.effect.kind === 'write-runner-json' || lastLedger.effect.kind === 'create-text')
        ? parseObservations(enc.encode(lastLedger.effect.text), undoneRunIds) : ledger;
      for (const c of e.changes) {
        if (c.kind !== 'about-rewrite') continue;
        const reason = c.undoneRunIds?.length ? 'undo' : !c.text.startsWith(c.previous) && ledger.tombstones.length > 0
          ? 'forget' : 'consolidate';
        if (!c.factIds) return false;
        const rebuild = canRebuildAboutSection({ ledger: rebuilt, section: c.region, text: c.previous, reason });
        if (!rebuild) {
          if (c.archive || !c.text.startsWith(c.previous)) return false;
          continue;
        }
        if (!c.archive) return false;
        const archive = archives.get(c.archive);
        if (!archive || !op.dependsOn.includes(archive.operationId) || archive.effect.text !== c.previous
          || c.archive.split('/')[3] !== c.region || !c.factIds
          || rebuilt.live.filter((fact) => fact.section === c.region).some((fact) => !c.factIds?.includes(fact.factId))) return false;
        // A frontier is a separate, dependent ledger effect, frozen along with this edit.
        if (reason === 'consolidate' && !operations.some((next) => next.ordinal > op.ordinal && next.effect.kind === 'write-runner-json'
          && next.effect.path === ledgerPath && next.dependsOn.includes(op.operationId)
          && parseObservations(enc.encode(next.effect.text)).events.some((event) => event.kind === 'consolidation'
            && event.successful && event.operationId === op.operationId && event.section === c.region))) return false;
      }
      lastMemory = op;
    }
    if (finalAbout !== undefined) {
      const e = lastLedger?.effect;
      const ledger = parseObservations(enc.encode(e && (e.kind === 'write-runner-json' || e.kind === 'create-text') ? e.text : ''), undoneRunIds);
      if (!validLearnedBlock(finalAbout, ledger)) return false;
    }
  } catch (error) {
    if (!(error instanceof BowerError)) throw error;
    // The ledger parser has already logged the frozen-memory refusal.
    return false;
  }
  for (const [path, archive] of archives) {
    if (consolidationArchives.has(archive.operationId) ? !namedArchives.has(archive.operationId)
      : !operations.some((o) => o.effect.kind === 'edit-text' && o.dependsOn.includes(archive.operationId)
      && o.effect.changes.some((c) => c.kind === 'about-rewrite' && c.archive === path))) return false;
  }
  return !finalized || !lastMemory || operations.at(-1)?.effect.kind === 'maintain';
}

/**
 * The row once a formula is installed (B11e, R44), for the reply check, the plan and the guard alike: the entry replaces
 * the one with its id, or is appended, through the views-set merge (R41), and its outputs are declared with its types.
 * Null when the row already holds it (R42). Here, not in view-format, which note-edit's imports must not reach back to.
 */
export function formulaInstalled(row: TypeRow, definition: { id: string } & Record<string, unknown>): TypeRow | null {
  const stored: unknown = (row as TypeRow & { views?: unknown }).views;
  const views = viewsInstalled(stored === undefined ? null : JSON.stringify(stored), [definition]);
  const outputs = (Array.isArray(definition.outputs) ? definition.outputs : []).filter((o): o is { property: string; type: string } =>
    record(o) && typeof o.property === 'string' && typeof o.type === 'string');
  const declare = outputs.filter((o) => row.properties[o.property]?.type !== o.type);
  if (!views && !declare.length) return null;
  return { ...row, properties: { ...row.properties, ...Object.fromEntries(declare.map((o) => [o.property, { type: o.type }])) },
    ...(views ? { views: JSON.parse(views.text) as unknown[] } : {}) };
}

/**
 * The formulas a type-table write adds or changes (B11e R59, R61, coordinator ruling 2): each is a formula for its own
 * row that passes the write grammar against the row the write replaced, with the earlier ones in place (as the install
 * checks it), and against the row it writes, which declares its outputs under their types; a stored formula valid
 * before the write stays valid on the row written. The replaced row comes only from the before
 * text, which `texts` verifies against `beforeContent`; without it no entry counts as untouched. Untouched entries are
 * read as stored (R21), never as a write.
 */
function formulasOk(written: unknown, beforeText: string | null | undefined): boolean {
  const prior = beforeText === undefined ? { v: 1 as const, rows: [] } : readTypeTable(beforeText).table;
  const rows = record(written) && Array.isArray(written.rows) ? written.rows : [];
  return rows.every((row) => {
    if (!typeRowOk(row, true)) return true;
    const old = prior.rows.find((r) => r.id === row.id);
    const kept = new Set(((old as { views?: unknown[] } | undefined)?.views ?? []).map((v) => JSON.stringify(v)));
    let current = old;
    const written = { v: 1 as const, rows: [row] };
    for (const entry of (row as { views?: unknown[] }).views ?? []) {
      // An untouched entry is read as stored on both sides: one that held before the write still holds on the row written.
      if (kept.has(JSON.stringify(entry))) {
        if (old && viewFault(entry, { v: 1, rows: [old] }, 'read') === null && viewFault(entry, written, 'read') !== null) return false;
        continue;
      }
      const table = { ...prior, rows: prior.rows.map((r) => (r.id === row.id && current ? current : r)) };
      if (!record(entry) || entry.kind !== 'formula' || entry.type !== row.id || viewFault(entry, table, 'write') !== null
        || viewFault(entry, written, 'write') !== null
        || !(entry.outputs as Array<{ property: string; type: string }>).every((o) => row.properties[o.property]?.type === o.type)) return false;
      current = current && (formulaInstalled(current, entry as { id: string }) ?? current);
    }
    return true;
  });
}

/** Type tables use the existing write effect; proposals are immutable creates bound to their stored question. */
async function planningArtifactsOk(value: Manifest | ManifestV2): Promise<boolean> {
  const questions = value.reportPlan.flatMap((row) => row.value.questions).filter((q) => q.proposal !== undefined);
  const artifacts = new Map<string, unknown>();
  for (const { effect } of value.operations) {
    if (effect.kind === 'maintain' && effect.inputs.targets?.some((t) => t.path === '.bower/type-table.json' || t.path === '.bower/tags.json' || t.path.startsWith('.bower/proposals/'))) return false;
    if (effect.kind === 'write-runner-json' && effect.path === '.bower/tags.json') {
      const list = readTagList(effect.text);
      if (list.error || list.tags.length > TAG_LIST_MAX) return false;
    }
    if (effect.kind !== 'write-runner-json' && ('path' in effect && effect.path === '.bower/tags.json'
      || 'parent' in effect && 'name' in effect && targetPath(value, effect.parent) === '.bower' && effect.name === 'tags.json')) return false;
    if (effect.kind === 'write-runner-json' && effect.path === '.bower/type-table.json') {
      let table: unknown;
      try { table = JSON.parse(effect.text); }
      catch {
        // expected: a new declaration write must contain readable JSON.
        return false;
      }
      // A stored rewrite can carry skipped rows beside the valid declaration it changes or adds.
      const valid = typeTableOk(table, effect.before !== null) || effect.before !== null && readTypeTable(effect.text).writeAllowed
        && !!table && typeof table === 'object' && 'rows' in table && Array.isArray(table.rows)
        && table.rows.some((row) => typeRowOk(row, true));
      if (!valid || effect.before !== null && (effect.before.folder || effect.before.name !== 'type-table.json')
        || !formulasOk(table, effect.before === null ? null : effect.beforeText)) return false;
    }
    if (effect.kind !== 'create-text') continue;
    const parentPath = targetPath(value, effect.parent);
    if (parentPath === '.bower' && effect.name === 'type-table.json') return false;
    if (parentPath !== '.bower/proposals') continue;
    if (effect.purpose !== 'runner-json') return false;
    let artifact: unknown;
    try { artifact = JSON.parse(effect.text); }
    catch {
      // expected: immutable proposal creates require a readable, closed envelope.
      return false;
    }
    if (!closed(artifact, ['v', 'id', 'payload']) || artifact.v !== 1 || !proposalOk({ id: artifact.id, payload: artifact.payload })
      || effect.name !== `${artifact.id as string}.json` || artifacts.has(artifact.id as string)) return false;
    artifacts.set(artifact.id as string, artifact.payload);
  }
  if (artifacts.size > 2 || new Set(questions.map((q) => q.proposal?.id)).size > 5) return false;
  const payloads = new Set<string>();
  for (const [id, payload] of artifacts) {
    const expected = await hashRecordJson(payload);
    const question = questions.find((q) => q.proposal?.id === id);
    if (!expected.ok || !question || payloads.has(expected.value)) return false;
    payloads.add(expected.value);
    const actual = await hashRecordJson(question.proposal?.payload);
    if (!actual.ok || actual.value !== expected.value) return false;
  }
  return true;
}

/** One rule for stored lint evidence, in a manifest and in retrieval: read evidence or the refusal record; anything else is no evidence (R26). */
export function lintEvidenceOk(value: unknown): value is LintEvidence | 'unreadable' {
  if (value === 'unreadable') return true;
  if (!record(value) || !list(value.links, text) || !integer(value.tags) || typeof value.summary !== 'boolean') return false;
  if (value.v === undefined) return closed(value, ['links', 'tags', 'summary']);
  return value.v === LINT_EVIDENCE_VERSION
    && closed(value, ['v', 'links', 'tags', 'summary', 'status', 'template', 'active', 'tagList', 'original', 'refused'])
    && (value.status === null || text(value.status)) && (value.template === null || text(value.template))
    && list(value.active, (date) => text(date) && dateOk(date)) && list(value.tagList, text)
    && (value.original === null || text(value.original)) && (value.refused === null || value.refused === 'newer' || value.refused === 'damaged');
}

/** Maintenance names must agree with captured identity and cannot alias protected memory. */
export function maintenanceTargetOk(value: { capture: Capture; operations: readonly OperationV2[] }, target: NonNullable<Maintain['inputs']['targets']>[number]): boolean {
  const resolved = targetPath(value, { fileId: target.fileId });
  // The health note is a root note found by its id (TL-P4-50 Q6), whatever its current name.
  if (target.kind === 'health') {
    const inputs = [...target.declaration?.sources ?? [], ...target.declaration?.unavailable ?? []];
    return resolved === target.path && !target.path.includes('/') && target.path.endsWith('.md')
    && target.path !== 'About me.md' && (target.declaration === undefined
      || new Set(inputs.map((s) => s.path)).size === inputs.length
      && inputs.every((source) => {
        const place = value.capture.places.find((p) => p.file.fileId === source.file.fileId);
        return (source.path === '.bower/tags.json' || source.path === '.bower/type-table.json')
          && place?.path === source.path && !source.file.folder && sameSeen(place.file, source.file);
      }));
  }
  if (target.kind === 'log' || isMonthlyLogPath(target.path) || isMonthlyLogPath(resolved ?? '')) {
    const place = value.capture.places.find((p) => p.file.fileId === target.fileId);
    return target.kind === 'log' && resolved === target.path && isMonthlyLogPath(target.path)
      && place?.file.folder === false && place.file.name === target.path.split('/').at(-1)
      && place.file.parents.length === 1 && place.file.parents[0] === target.parentId
      && targetPath(value, { fileId: target.parentId }) === '.bower/log'
      && target.declaration !== undefined && target.declaration.at.slice(0, 7) === target.path.slice(11, 18)
      && new Set(target.declaration.sources.map((source) => source.file.fileId)).size === target.declaration.sources.length
      && target.declaration.sources.every((source) => {
        const captured = value.capture.places.find((p) => p.file.fileId === source.file.fileId);
        return (source.path === '.bower/tags.json' || source.path.startsWith('.bower/changes/') && !source.path.startsWith('.bower/changes/archive/'))
          && captured?.path === source.path && sameSeen(captured.file, source.file);
      });
  }
  if (target.kind === 'log-folder' || resolved === '.bower/log' || target.path === '.bower/log') {
    const place = value.capture.places.find((p) => p.file.fileId === target.fileId);
    return target.kind === 'log-folder' && resolved === '.bower/log' && target.path === resolved
      && place?.file.folder === true && place.file.name === 'log' && place.file.parents.length === 1
      && place.file.parents[0] === target.parentId && targetPath(value, { fileId: target.parentId }) === '.bower';
  }
  if (resolved === 'About me.md' && target.path === resolved) return target.kind === 'about'
    && target.declaration !== undefined
    && new Set(target.declaration.sources.map((s) => s.path)).size === target.declaration.sources.length
    && target.declaration.sources.every((s) => {
      const place = value.capture.places.find((p) => p.file.fileId === s.file.fileId);
      return (s.path === 'About me.md' || s.path === '.bower/observations.jsonl')
        && place?.path === s.path && sameSeen(place.file, s.file);
    });
  return resolved === target.path && ![resolved, target.path].some((path) => path === 'About me.md'
    || path === '.bower/observations.jsonl' || path?.startsWith('.bower/archive/about-me/'));
}

export function targetPath(value: { capture: Capture; operations: readonly OperationV2[] }, target: Target, seen = new Set<string>()): string | null {
  if ('fileId' in target) return value.capture.places.find((p) => p.file.fileId === target.fileId)?.path ?? null;
  if (seen.has(target.createdBy)) return null;
  seen.add(target.createdBy);
  const made = value.operations.find((o) => o.operationId === target.createdBy);
  if (made?.effect.kind !== 'create-folder') return null;
  const parent = targetPath(value, made.effect.parent, seen);
  return parent === null ? null : `${parent}/${made.effect.name}`;
}
