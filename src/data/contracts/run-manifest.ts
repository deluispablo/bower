/** Immutable run manifest validation only; no claim, dispatch, readiness or permission authority. */
import { sha256 } from '../vault/hashes';
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
    path: '.bower/questions.json' | '.bower/requests.json' | '.bower/hashes.json'; text: string; content: Content }
  | { kind: 'bin'; before: SeenFile; capturedChildIds: string[] };
export type Operation = { operationId: string; ordinal: number; dependsOn: string[]; effect: Effect };
export type ReportFiled = { name: string; title: string; kind: FileKind; to: string; note?: string };
export type ReportQuestion = { id: string; text: string; yes: string; no: string; askedAt: number; about?: string };
/** The existing RunReport shape in the stricter closed form used inside new records. */
export type ManifestRunReport = {
  filed: ReportFiled[]; created: { path: string; what: string }[]; updated: { path: string; what: string }[];
  setAside: { name: string; why: string }[]; questions: ReportQuestion[];
  yourChanges?: number; requests?: string[]; rulesWorded?: number;
};
export type ReportContribution = { requires: string[]; when: 'applied' | 'rejected'; value: ManifestRunReport };
export type Manifest = {
  v: 1; kind: 'run-manifest'; scope: Scope; runId: string; requestId: string;
  runScope: 'all' | 'instructions'; allowWeb: boolean; requestedAt: number;
  captureId: string; capture: Capture; operations: Operation[]; reportPlan: ReportContribution[];
};
/**
 * `content`: a captured context, create-text or write-runner-json text whose content is not utf8 with the exact
 * UTF-8 size and raw SHA-256 of that text. Observed-pile keys, member keys and createdBy targets refuse as `shape`.
 */
export type ManifestRefusal = RecordJsonFailure['reason'] | 'shape' | 'scope' | 'content' | 'capture-id' | 'order' | 'operation-id' | 'report';
export type ManifestResult = { ok: true; value: Manifest; sha256: string } | { ok: false; reason: ManifestRefusal };

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
const runnerPaths = ['.bower/questions.json', '.bower/requests.json', '.bower/hashes.json'] as const;

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
      && seenFile(value.before) && verifiedContent(value.beforeContent) && oneOf(value.path, runnerPaths)
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

const rows = (value: unknown, keys: string[], optional: string[] = []): boolean =>
  list(value, (row) => closed(row, keys, optional) && Object.values(row).every(text));
function runReport(value: unknown): value is ManifestRunReport {
  if (!closed(value, ['filed', 'created', 'updated', 'setAside', 'questions'], ['yourChanges', 'requests', 'rulesWorded'])) return false;
  return list(value.filed, (row) => closed(row, ['name', 'title', 'kind', 'to'], ['note']) && text(row.name) && text(row.title)
      && oneOf(row.kind, fileKinds) && text(row.to) && (!Object.hasOwn(row, 'note') || text(row.note)))
    && rows(value.created, ['path', 'what']) && rows(value.updated, ['path', 'what']) && rows(value.setAside, ['name', 'why'])
    && list(value.questions, (row) => closed(row, ['id', 'text', 'yes', 'no', 'askedAt'], ['about'])
      && text(row.id) && text(row.text) && text(row.yes) && text(row.no) && integer(row.askedAt)
      && (!Object.hasOwn(row, 'about') || text(row.about)))
    && (!Object.hasOwn(value, 'yourChanges') || integer(value.yourChanges))
    && (!Object.hasOwn(value, 'requests') || list(value.requests, text))
    && (!Object.hasOwn(value, 'rulesWorded') || integer(value.rulesWorded));
}
function contribution(value: unknown): value is ReportContribution {
  return closed(value, ['requires', 'when', 'value']) && list(value.requires, hash) && value.requires.length > 0
    && unique(value.requires) && oneOf(value.when, ['applied', 'rejected']) && runReport(value.value);
}

function manifest(value: unknown): value is Manifest {
  return closed(value, ['v', 'kind', 'scope', 'runId', 'requestId', 'runScope', 'allowWeb', 'requestedAt', 'captureId', 'capture', 'operations', 'reportPlan'])
    && value.v === 1 && value.kind === 'run-manifest' && closed(value.scope, ['rootId']) && driveId(value.scope.rootId)
    && id(value.runId) && id(value.requestId) && oneOf(value.runScope, ['all', 'instructions'])
    && typeof value.allowWeb === 'boolean' && integer(value.requestedAt) && hash(value.captureId)
    && capture(value.capture) && list(value.operations, operation) && list(value.reportPlan, contribution);
}

/** Raw text content: utf8 with the size and SHA-256 of the exact UTF-8 bytes, not of C(text). */
async function describes(content: Content, text: string): Promise<boolean> {
  const raw = new TextEncoder().encode(text);
  return content.encoding === 'utf8' && content.size === raw.byteLength && content.sha256 === await sha256(new Blob([raw.buffer]));
}
function texts(value: Manifest): { text: string; content: Content }[] {
  const found: { text: string; content: Content }[] = value.capture.piles.flatMap((pile) => pile.context.kind === 'text' ? [pile.context] : []);
  for (const { effect } of value.operations) {
    if (effect.kind === 'create-text' || effect.kind === 'write-runner-json') found.push(effect);
  }
  return found;
}

async function digest(value: unknown): Promise<string> {
  const result = await hashRecordJson(value);
  // Every string and number was validated above, so canonical encoding cannot refuse here.
  if (!result.ok) throw new Error(`Validated manifest could not be hashed: ${result.reason}`);
  return result.value;
}

/** Compare independently supplied scope; a matching root or digest grants no access or dispatch. */
export async function parseRunManifest(bytes: Uint8Array, expectedRootId: string): Promise<ManifestResult> {
  const parsed = parseRecordJson(bytes);
  if (!parsed.ok) return parsed;
  if (!manifest(parsed.value)) return { ok: false, reason: 'shape' };
  const value = parsed.value;
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
  const earlier = new Map<string, Effect['kind']>();
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
