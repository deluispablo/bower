/** Structural disposition validation only; no publication or effect authority. */
import type { Content, Scope } from './pile-declaration';
import { hashRecordJson, parseRecordJson, type RecordJsonFailure } from './record-json';

export type DeclarationRef = { declarationId: string; sha256: string };
export type SeenFile = {
  fileId: string; name: string; parents: string[]; folder: boolean; modifiedTime: string;
};
export type VerifiedContent = Content & {
  provenance: 'fake-stored' | 'adapter-read'; observedModifiedTime: string;
};
export type EffectEvidence = {
  file: SeenFile; trashed: boolean; content: VerifiedContent | null;
  provenance: 'fake-stored' | 'adapter-read';
};
export type Disposition = {
  v: 1; kind: 'pile-disposition'; scope: Scope; pileId: string;
  declaration: DeclarationRef | null; memberKeys: string[];
  action: 'consumed' | 'removed';
  authority: { kind: 'run'; runId: string; reportHash: string }
    | { kind: 'person-bin'; intentId: string };
  operations: { operationId: string; evidence: EffectEvidence }[];
};
export type DispositionResult = {
  ok: true; value: Disposition; sha256: string;
} | { ok: false; reason: RecordJsonFailure['reason'] | 'shape' | 'scope' | 'authority' | 'members' };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function closed(value: unknown, keys: string[]): value is Record<string, unknown> {
  return record(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
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
const driveId = (value: unknown): value is string => text(value) && value.length > 0
  && !controls(value) && new TextEncoder().encode(value).byteLength <= 1024;
const id = (value: unknown): value is string => typeof value === 'string'
  && value.length >= 1 && value.length <= 128 && !/[^A-Za-z0-9_-]/.test(value);
const hash = (value: unknown): value is string => typeof value === 'string'
  && value.length === 64 && !/[^a-f0-9]/.test(value);
const integer = (value: unknown): value is number => typeof value === 'number'
  && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const name = (value: unknown): value is string => text(value) && value.length > 0
  && value !== '.' && value !== '..' && !controls(value) && !/[/\\]/.test(value);
const provenance = (value: unknown): value is EffectEvidence['provenance'] => value === 'fake-stored' || value === 'adapter-read';

function uniqueStrings(value: unknown, valid: (item: unknown) => item is string): value is string[] {
  return Array.isArray(value) && value.every(valid) && new Set(value).size === value.length;
}
function monthDays(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
/** RFC3339 observations retain their exact spelling, fraction and offset. */
function timestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match || match[0] !== value) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6]);
  const offsetHour = Number(match[9] ?? 0), offsetMinute = Number(match[10] ?? 0);
  if (month < 1 || month > 12 || day < 1 || day > monthDays(year, month)
    || hour > 23 || minute > 59 || second > 60 || offsetHour > 23 || offsetMinute > 59) return false;
  if (second === 60) {
    // Leap-second spelling is possible only at the end of a UTC month.
    // This format check does not certify historical/future clock observations.
    const utc = new Date(0);
    utc.setUTCFullYear(year, month - 1, day);
    const offset = (offsetHour * 60 + offsetMinute) * (match[8] === '-' ? -1 : 1);
    utc.setUTCHours(hour, minute - offset, 59, 0);
    if (utc.getUTCHours() !== 23 || utc.getUTCMinutes() !== 59
      || utc.getUTCDate() !== monthDays(utc.getUTCFullYear(), utc.getUTCMonth() + 1)) return false;
  }
  return true;
}
function seenFile(value: unknown): value is SeenFile {
  return closed(value, ['fileId', 'name', 'parents', 'folder', 'modifiedTime'])
    && driveId(value.fileId) && name(value.name) && uniqueStrings(value.parents, driveId)
    && value.parents.length > 0 && typeof value.folder === 'boolean' && timestamp(value.modifiedTime);
}
function verifiedContent(value: unknown): value is VerifiedContent {
  return closed(value, ['encoding', 'size', 'sha256', 'provenance', 'observedModifiedTime'])
    && (value.encoding === 'utf8' || value.encoding === 'blob')
    && integer(value.size) && hash(value.sha256) && provenance(value.provenance)
    && timestamp(value.observedModifiedTime);
}
function evidence(value: unknown): value is EffectEvidence {
  return closed(value, ['file', 'trashed', 'content', 'provenance'])
    && seenFile(value.file) && typeof value.trashed === 'boolean'
    && (value.content === null || verifiedContent(value.content)) && provenance(value.provenance);
}
function declarationRef(value: unknown): value is DeclarationRef {
  return closed(value, ['declarationId', 'sha256']) && id(value.declarationId) && hash(value.sha256);
}
function authority(value: unknown): value is Disposition['authority'] {
  if (!record(value)) return false;
  if (value.kind === 'run') return closed(value, ['kind', 'runId', 'reportHash'])
    && id(value.runId) && hash(value.reportHash);
  return value.kind === 'person-bin' && closed(value, ['kind', 'intentId']) && id(value.intentId);
}
function operation(value: unknown): value is Disposition['operations'][number] {
  return closed(value, ['operationId', 'evidence']) && hash(value.operationId) && evidence(value.evidence);
}
function disposition(value: unknown): value is Disposition {
  return closed(value, ['v', 'kind', 'scope', 'pileId', 'declaration', 'memberKeys', 'action', 'authority', 'operations'])
    && value.v === 1 && value.kind === 'pile-disposition'
    && closed(value.scope, ['rootId']) && driveId(value.scope.rootId) && id(value.pileId)
    && (value.declaration === null || declarationRef(value.declaration)) && uniqueStrings(value.memberKeys, id)
    && (value.action === 'consumed' || value.action === 'removed') && authority(value.authority)
    && Array.isArray(value.operations) && value.operations.length > 0 && value.operations.every(operation)
    && new Set(value.operations.map((item) => item.operationId)).size === value.operations.length;
}

/** Expected keys, when supplied, are the independently resolved full non-null set.
 * Matching scope, keys or hashes does not authenticate or confirm any effect. */
export async function parsePileDisposition(
  bytes: Uint8Array, expectedRootId: string, expectedMemberKeys?: readonly string[],
): Promise<DispositionResult> {
  const parsed = parseRecordJson(bytes);
  if (!parsed.ok) return parsed;
  if (!disposition(parsed.value)) return { ok: false, reason: 'shape' };
  const value = parsed.value;
  if (!driveId(expectedRootId) || expectedRootId !== value.scope.rootId) return { ok: false, reason: 'scope' };
  if ((value.action === 'consumed' && value.authority.kind !== 'run')
    || (value.action === 'removed' && (value.authority.kind !== 'person-bin'
      || value.operations.some((item) => !item.evidence.trashed)))) return { ok: false, reason: 'authority' };
  if (value.declaration === null && value.memberKeys.length > 0) return { ok: false, reason: 'members' };
  if (expectedMemberKeys !== undefined) {
    if (!uniqueStrings(expectedMemberKeys, id) || expectedMemberKeys.length !== value.memberKeys.length)
      return { ok: false, reason: 'members' };
    const expected = new Set(expectedMemberKeys);
    if (!value.memberKeys.every((key) => expected.has(key))) return { ok: false, reason: 'members' };
  }
  // Caller owns declaration/capture resolution, ancestry, authenticated intent,
  // same-run published report and actual current effects. No I/O is done here.
  const identity = await hashRecordJson(value);
  if (!identity.ok) return identity;
  return { ok: true, value, sha256: identity.value };
}
