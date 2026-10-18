/** Run checkpoint and report record validation only; no claim, dispatch or permission authority. */
import type { RunReport } from './types';
import { PHASE_RANK, isRunPhase, type RunPhase } from './run-phases';
import { canonicalRecordJson, hashRecordJson, parseRecordJson, type RecordJsonFailure } from './record-json';
import { isAppendCompletion, type AppendCompletion, isLeftAsWrittenRow, isSavedRow, isUpdatedRow } from './run-manifest';
import { isAnsweredRow } from './questions';

export type Scope = { rootId: string };
export type SeenFile = {
  fileId: string; name: string; parents: string[]; folder: boolean; modifiedTime: string;
};
export type VerifiedContent = {
  encoding: 'utf8' | 'blob'; size: number; sha256: string;
  provenance: 'fake-stored' | 'adapter-read'; observedModifiedTime: string;
};
export type Failure = { code: 'offline' | 'not-found' | 'conflict' | 'auth' | 'unknown'; message: string };
export type EffectEvidence = {
  file: SeenFile; trashed: boolean; content: VerifiedContent | null;
  provenance: 'fake-stored' | 'adapter-read';
};
export type Outcome =
  | { operationId: string; state: 'not-dispatched' }
  | { operationId: string; state: 'before-effect-refused'; failure: Failure }
  | { operationId: string; state: 'possible-effect'; dispatchId: string; fileId?: string }
  | { operationId: string; state: 'applied'; evidence: EffectEvidence }
  | { operationId: string; state: 'rejected'; failure: Failure };
export type ReportRecord = {
  v: 1; kind: 'run-report'; scope: Scope; runId: string; captureId: string;
  manifestHash: string; report: RunReport;
};
export type ReportState = { state: 'not-ready' }
  | { state: 'pending'; reportHash: string; body: ReportRecord }
  | { state: 'published'; reportHash: string };
export type Checkpoint = {
  v: 1; kind: 'run-checkpoint'; scope: Scope; runId: string; manifestHash: string;
  revision: number; previous: string | null; attemptId: string; epoch: number;
  phase: RunPhase; phaseAt: number;
  outcomes: Outcome[]; report: ReportState; retainedPileIds: string[];
  completedAppends?: AppendCompletion[];
  appendBindings?: Array<AppendCompletion & { operationId: string }>;
};
/** Independently supplied by a caller that already holds the verified manifest. */
export type RunExpectation = {
  rootId: string; runId: string; captureId: string; manifestHash: string;
  operationIds: readonly string[];
};
export type ReportExpectation = Omit<RunExpectation, 'operationIds'>;

export type RecordRefusal = {
  ok: false;
  reason: RecordJsonFailure['reason'] | 'expected' | 'shape' | 'scope' | 'binding' | 'outcomes' | 'revision' | 'phase' | 'report';
};
export type CheckpointResult = { ok: true; value: Checkpoint; sha256: string } | RecordRefusal;
export type ReportRecordResult = { ok: true; value: ReportRecord; sha256: string } | RecordRefusal;
export type ChainResult = { ok: true; head: string } | {
  ok: false; reason: 'empty' | 'start' | 'revision' | 'previous' | 'binding' | 'phase' | 'transition' | 'report'; at: number;
};

// Small private primitives; consolidation with sibling record modules is a separate unit.
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** Closed object with every required key and only the listed optional keys. */
function closed(value: unknown, keys: string[], optional: string[] = []): value is Record<string, unknown> {
  if (!record(value) || !keys.every((key) => Object.hasOwn(value, key))) return false;
  return Object.keys(value).every((key) => keys.includes(key) || optional.includes(key));
}
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
const controls = (value: string): boolean => [...value].some((char) => char.charCodeAt(0) <= 0x1f || char.charCodeAt(0) === 0x7f);
const id = (value: unknown): value is string => typeof value === 'string'
  && value.length >= 1 && value.length <= 128 && !/[^A-Za-z0-9_-]/.test(value);
const driveId = (value: unknown): value is string => text(value) && value.length > 0
  && !controls(value) && new TextEncoder().encode(value).byteLength <= 1024;
const name = (value: unknown): value is string => text(value) && value.length > 0
  && value !== '.' && value !== '..' && !controls(value) && !/[/\\]/.test(value);
const integer = (value: unknown): value is number => typeof value === 'number'
  && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const hash = (value: unknown): value is string => typeof value === 'string'
  && value.length === 64 && !/[^0-9a-f]/.test(value);
const oneOf = <T extends string>(value: unknown, options: readonly T[]): value is T =>
  typeof value === 'string' && (options as readonly string[]).includes(value);
const unique = (values: readonly unknown[]): boolean => new Set(values).size === values.length;
function list<T>(value: unknown, item: (entry: unknown) => entry is T): value is T[] {
  return Array.isArray(value) && value.every(item);
}
const every = (value: unknown, item: (entry: unknown) => boolean): value is unknown[] => Array.isArray(value) && value.every(item);

/** RFC 3339 date-time on a real calendar day; an observation only, never ordering authority. */
function time(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = match.slice(1).map((part) => Number(part ?? '0'));
  if (year === undefined || month === undefined || day === undefined) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return days !== undefined && day >= 1 && day <= days && (hour ?? 99) <= 23 && (minute ?? 99) <= 59
    && (second ?? 99) <= 60 && (offsetHour ?? 99) <= 23 && (offsetMinute ?? 99) <= 59;
}

const FILE_KINDS = ['note', 'pdf', 'image', 'link', 'doc', 'sheet', 'audio', 'other'] as const;
const PROVENANCE = ['fake-stored', 'adapter-read'] as const;

const scope = (value: unknown): value is Scope => closed(value, ['rootId']) && driveId(value.rootId);
function seenFile(value: unknown): value is SeenFile {
  return closed(value, ['fileId', 'name', 'parents', 'folder', 'modifiedTime'])
    && driveId(value.fileId) && name(value.name) && list(value.parents, driveId)
    && value.parents.length > 0 && unique(value.parents)
    && typeof value.folder === 'boolean' && time(value.modifiedTime);
}
function verifiedContent(value: unknown): value is VerifiedContent {
  return closed(value, ['encoding', 'size', 'sha256', 'provenance', 'observedModifiedTime'])
    && oneOf(value.encoding, ['utf8', 'blob']) && integer(value.size) && hash(value.sha256)
    && oneOf(value.provenance, PROVENANCE) && time(value.observedModifiedTime);
}
function failure(value: unknown): value is Failure {
  return closed(value, ['code', 'message'])
    && oneOf(value.code, ['offline', 'not-found', 'conflict', 'auth', 'unknown'])
    && text(value.message) && value.message.length > 0;
}
function evidence(value: unknown): value is EffectEvidence {
  return closed(value, ['file', 'trashed', 'content', 'provenance'])
    && seenFile(value.file) && typeof value.trashed === 'boolean'
    && (value.content === null || verifiedContent(value.content)) && oneOf(value.provenance, PROVENANCE);
}
function outcome(value: unknown): value is Outcome {
  if (!record(value) || !hash(value.operationId)) return false;
  switch (value.state) {
    case 'not-dispatched': return closed(value, ['operationId', 'state']);
    case 'before-effect-refused':
    case 'rejected': return closed(value, ['operationId', 'state', 'failure']) && failure(value.failure);
    case 'possible-effect': return closed(value, ['operationId', 'state', 'dispatchId'], ['fileId']) && id(value.dispatchId) && (value.fileId === undefined || driveId(value.fileId));
    case 'applied': return closed(value, ['operationId', 'state', 'evidence']) && evidence(value.evidence);
    default: return false;
  }
}

function filed(value: unknown): boolean {
  return closed(value, ['name', 'title', 'kind', 'to'], ['note', 'area'])
    && text(value.name) && text(value.title) && oneOf(value.kind, FILE_KINDS) && text(value.to)
    && (!Object.hasOwn(value, 'note') || text(value.note)) && (!Object.hasOwn(value, 'area') || text(value.area));
}
const pathChange = (value: unknown): boolean => closed(value, ['path', 'what']) && text(value.path) && text(value.what);
const setAside = (value: unknown): boolean => closed(value, ['name', 'why']) && text(value.name) && text(value.why);
function question(value: unknown): boolean {
  return closed(value, ['id', 'text', 'yes', 'no', 'askedAt'], ['about'])
    && text(value.id) && text(value.text) && text(value.yes) && text(value.no) && integer(value.askedAt)
    && (!Object.hasOwn(value, 'about') || text(value.about));
}
/** The existing RunReport shape, closed; optional counts and requests are omitted, never null. */
function runReport(value: unknown): value is RunReport {
  if (!closed(value, ['filed', 'created', 'updated', 'setAside', 'questions'], ['yourChanges', 'requests', 'rulesWorded', 'nothingReady', 'alreadySaved', 'unconfirmed', 'kept', 'answered', 'leftAsWritten', 'waiting'])
    || !every(value.filed, filed) || !every(value.created, pathChange) || !every(value.updated, isUpdatedRow)
    || !every(value.setAside, setAside) || !every(value.questions, question)) return false;
  if (Object.hasOwn(value, 'leftAsWritten') && !list(value.leftAsWritten, isLeftAsWrittenRow)) return false;
  if (Object.hasOwn(value, 'yourChanges') && !integer(value.yourChanges)) return false;
  if (Object.hasOwn(value, 'rulesWorded') && !integer(value.rulesWorded)) return false;
  if (Object.hasOwn(value, 'requests') && !list(value.requests, text)) return false;
  if (Object.hasOwn(value, 'nothingReady') && value.nothingReady !== true) return false;
  if (Object.hasOwn(value, 'waiting') && !(integer(value.waiting) && value.waiting >= 1)) return false;
  if (Object.hasOwn(value, 'alreadySaved') && !(list(value.alreadySaved, isSavedRow) && value.alreadySaved.length > 0)) return false;
  if (Object.hasOwn(value, 'unconfirmed') && !(every(value.unconfirmed, setAside) && value.unconfirmed.length > 0)) return false;
  if (Object.hasOwn(value, 'kept') && !(every(value.kept, setAside) && value.kept.length > 0)) return false;
  if (Object.hasOwn(value, 'answered') && !(list(value.answered, isAnsweredRow) && value.answered.length > 0)) return false;
  // Question IDs are identities; a materialized report never repeats one.
  return unique(value.questions.map((item) => (item as { id: unknown }).id));
}
function reportRecord(value: unknown): value is ReportRecord {
  return closed(value, ['v', 'kind', 'scope', 'runId', 'captureId', 'manifestHash', 'report'])
    && value.v === 1 && value.kind === 'run-report' && scope(value.scope) && id(value.runId)
    && hash(value.captureId) && hash(value.manifestHash) && runReport(value.report);
}
function reportState(value: unknown): value is ReportState {
  if (!record(value)) return false;
  switch (value.state) {
    case 'not-ready': return closed(value, ['state']);
    case 'pending': return closed(value, ['state', 'reportHash', 'body']) && hash(value.reportHash) && reportRecord(value.body);
    case 'published': return closed(value, ['state', 'reportHash']) && hash(value.reportHash);
    default: return false;
  }
}
function checkpoint(value: unknown): value is Checkpoint {
  return closed(value, ['v', 'kind', 'scope', 'runId', 'manifestHash', 'revision', 'previous', 'attemptId',
    'epoch', 'phase', 'phaseAt', 'outcomes', 'report', 'retainedPileIds'], ['completedAppends', 'appendBindings'])
    && value.v === 1 && value.kind === 'run-checkpoint' && scope(value.scope) && id(value.runId)
    && hash(value.manifestHash) && integer(value.revision) && (value.previous === null || hash(value.previous))
    && id(value.attemptId) && integer(value.epoch)
    && isRunPhase(value.phase) && integer(value.phaseAt)
    && list(value.outcomes, outcome) && reportState(value.report)
    && (value.completedAppends === undefined || (list(value.completedAppends, isAppendCompletion)
      && unique((value.completedAppends as AppendCompletion[]).map((r) => JSON.stringify([r.requestId, r.targetFileId])))))
    && (value.appendBindings === undefined || (list(value.appendBindings, (r): r is NonNullable<Checkpoint['appendBindings']>[number] => closed(r, ['requestId', 'targetFileId', 'operationId'])
      && isAppendCompletion({ requestId: r.requestId, targetFileId: r.targetFileId }) && hash(r.operationId))
      && unique((value.appendBindings as NonNullable<Checkpoint['appendBindings']>).map((r) => JSON.stringify([r.operationId, r.requestId, r.targetFileId])))))
    && list(value.retainedPileIds, id) && unique(value.retainedPileIds);
}

const reportExpectation = (expected: ReportExpectation): boolean => driveId(expected.rootId)
  && id(expected.runId) && hash(expected.captureId) && hash(expected.manifestHash);
/**
 * Guard 12 structure: done needs every outcome applied/rejected and a published report;
 * failed is allowed only when no possibly applied effect remains and no report is pending.
 */
function honestPhase(value: Checkpoint): boolean {
  const states = value.outcomes.map((item) => item.state);
  if (value.phase === 'done') {
    return value.report.state === 'published' && states.every((state) => state === 'applied' || state === 'rejected');
  }
  if (value.phase === 'failed') {
    return value.report.state !== 'pending' && !states.includes('applied') && !states.includes('possible-effect');
  }
  return true;
}
const bound = (value: ReportRecord, expected: ReportExpectation): boolean => value.runId === expected.runId
  && value.captureId === expected.captureId && value.manifestHash === expected.manifestHash;

/** Compare an independently supplied root and manifest binding; a matching digest grants no access. */
export async function parseRunCheckpoint(bytes: Uint8Array, expected: RunExpectation): Promise<CheckpointResult> {
  if (!reportExpectation(expected) || !expected.operationIds.every(hash) || !unique(expected.operationIds)) {
    return { ok: false, reason: 'expected' };
  }
  const parsed = parseRecordJson(bytes);
  if (!parsed.ok) return parsed;
  if (!checkpoint(parsed.value)) return { ok: false, reason: 'shape' };
  const value = parsed.value;
  if (value.scope.rootId !== expected.rootId) return { ok: false, reason: 'scope' };
  if (value.runId !== expected.runId || value.manifestHash !== expected.manifestHash) return { ok: false, reason: 'binding' };
  if (value.outcomes.length !== expected.operationIds.length
    || value.outcomes.some((item, index) => item.operationId !== expected.operationIds[index])) return { ok: false, reason: 'outcomes' };
  if (value.appendBindings?.some((b) => !expected.operationIds.includes(b.operationId))) return { ok: false, reason: 'binding' };
  if ((value.revision === 0) !== (value.previous === null)) return { ok: false, reason: 'revision' };

  if (!honestPhase(value)) return { ok: false, reason: 'phase' };

  if (value.report.state === 'pending') {
    const body = value.report.body;
    if (body.scope.rootId !== expected.rootId || !bound(body, expected)) return { ok: false, reason: 'report' };
    const digest = await hashRecordJson(body);
    if (!digest.ok) return digest;
    if (digest.value !== value.report.reportHash) return { ok: false, reason: 'report' };
  }
  const identity = await hashRecordJson(value);
  if (!identity.ok) return identity;
  return { ok: true, value, sha256: identity.value };
}

/** A report record is bound to exactly one run, capture and manifest under the expected root. */
export async function parseRunReport(bytes: Uint8Array, expected: ReportExpectation): Promise<ReportRecordResult> {
  if (!reportExpectation(expected)) return { ok: false, reason: 'expected' };
  const parsed = parseRecordJson(bytes);
  if (!parsed.ok) return parsed;
  if (!reportRecord(parsed.value)) return { ok: false, reason: 'shape' };
  const value = parsed.value;
  if (value.scope.rootId !== expected.rootId) return { ok: false, reason: 'scope' };
  if (!bound(value, expected)) return { ok: false, reason: 'binding' };
  const identity = await hashRecordJson(value);
  if (!identity.ok) return identity;
  return { ok: true, value, sha256: identity.value };
}

function canonical(value: unknown): string {
  const bytes = canonicalRecordJson(value);
  if (!bytes.ok) throw new Error(`Parsed checkpoint is not canonical: ${bytes.reason}`);
  return new TextDecoder().decode(bytes.value);
}
/** Guard 8: applied/rejected are final, a possible effect only resolves, a proven refusal may be retried or refused again. */
function allowed(before: Outcome, after: Outcome): boolean {
  if (canonical(before) === canonical(after)) return true;
  switch (before.state) {
    case 'not-dispatched': return after.state === 'possible-effect' || after.state === 'before-effect-refused';
    case 'possible-effect': return after.state === 'applied' || after.state === 'rejected';
    case 'before-effect-refused': return after.state === 'possible-effect' || after.state === 'rejected'
      || after.state === 'before-effect-refused';
    default: return false;
  }
}
/** Phases never go back and may repeat; failed may follow any non-terminal phase; nothing follows done or failed. */
function forwardPhase(before: Checkpoint['phase'], after: Checkpoint['phase']): boolean {
  if (before === 'done' || before === 'failed') return false;
  return after === 'failed' || PHASE_RANK[after] >= PHASE_RANK[before];
}
/** Report state only advances not-ready → pending → published, keeping one report identity once pending. */
function forwardReport(before: ReportState, after: ReportState): boolean {
  switch (before.state) {
    case 'not-ready': return after.state !== 'published';
    case 'pending': return after.state === 'pending'
      ? canonical(before) === canonical(after)
      : after.state === 'published' && after.reportHash === before.reportHash;
    case 'published': return after.state === 'published' && after.reportHash === before.reportHash;
  }
}
async function digest(value: Checkpoint): Promise<string> {
  const result = await hashRecordJson(value);
  if (!result.ok) throw new Error(`Parsed checkpoint is not canonical: ${result.reason}`);
  return result.value;
}

/**
 * Verifies a complete chain of already parsed checkpoints from revision zero.
 * Each previous digest is recomputed from the prior record; caller digests are not trusted.
 * The chain only moves forward: a resumed attempt continues from the head, never resetting its phase or report.
 */
export async function verifyCheckpointChain(chain: readonly Checkpoint[]): Promise<ChainResult> {
  const first = chain[0];
  if (!first) return { ok: false, reason: 'empty', at: 0 };
  if (first.revision !== 0 || first.previous !== null) return { ok: false, reason: 'start', at: 0 };
  if (!honestPhase(first)) return { ok: false, reason: 'phase', at: 0 };
  let head = await digest(first);
  for (let at = 1; at < chain.length; at++) {
    const before = chain[at - 1];
    const next = chain[at];
    if (!before || !next) throw new Error('Checkpoint chain changed while it was read');
    if (next.revision !== before.revision + 1) return { ok: false, reason: 'revision', at };
    if (next.previous !== head) return { ok: false, reason: 'previous', at };
    if (next.scope.rootId !== first.scope.rootId || next.runId !== first.runId || next.manifestHash !== first.manifestHash
      || next.outcomes.length !== before.outcomes.length
      || next.outcomes.some((item, index) => item.operationId !== before.outcomes[index]?.operationId)) {
      return { ok: false, reason: 'binding', at };
    }
    if (!honestPhase(next)) return { ok: false, reason: 'phase', at };
    if (next.outcomes.some((item, index) => {
      const prior = before.outcomes[index];
      return !prior || !allowed(prior, item);
    })) return { ok: false, reason: 'transition', at };
    if (canonical(before.appendBindings ?? []) !== canonical(next.appendBindings ?? [])) return { ok: false, reason: 'binding', at };
    const key = (r: AppendCompletion): string => JSON.stringify([r.requestId, r.targetFileId]);
    const prior = new Set((before.completedAppends ?? []).map(key));
    const completed = new Set((next.completedAppends ?? []).map(key));
    const expected = new Set([...prior, ...(next.appendBindings ?? []).filter((b) =>
      next.outcomes.some((o) => o.operationId === b.operationId && o.state === 'applied')).map(key)]);
    if (completed.size !== expected.size || [...expected].some((k) => !completed.has(k))) return { ok: false, reason: 'transition', at };
    if (!forwardPhase(before.phase, next.phase)) return { ok: false, reason: 'phase', at };
    if (!forwardReport(before.report, next.report)) return { ok: false, reason: 'report', at };
    head = await digest(next);
  }
  return { ok: true, head };
}
