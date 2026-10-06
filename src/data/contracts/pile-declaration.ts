/** Immutable declaration validation only; no readiness or permission authority. */
import { sha256 } from './hashes';
import { hashRecordJson, parseRecordJson, type RecordJsonFailure } from './record-json';

export type Scope = { rootId: string };
export type Content = { encoding: 'utf8' | 'blob'; size: number; sha256: string };
export type ContextDeclaration = { kind: 'absent' } | {
  kind: 'text'; memberKey: string; originalText: string; content: Content;
};
export type Anchor = { kind: 'loose'; inboxId: string } | {
  kind: 'folder'; inboxId: string; name: string; createKey: string;
};
export type Member = {
  memberKey: string; name: string;
  kind: 'note' | 'pdf' | 'image' | 'link' | 'doc' | 'sheet' | 'audio' | 'other';
  origin: string | null; content: Content;
};
export type Declaration = {
  v: 1; kind: 'pile-declaration'; scope: Scope; declarationId: string; pileId: string;
  createdAt: number; anchor: Anchor; members: Member[]; context: ContextDeclaration;
};
export type DeclarationResult = {
  ok: true; value: Declaration; sha256: string;
} | { ok: false; reason: RecordJsonFailure['reason'] | 'shape' | 'scope' | 'content' };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function closed(value: unknown, keys: string[]): value is Record<string, unknown> {
  return record(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
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

const id = (value: unknown): value is string => typeof value === 'string'
  && value.length >= 1 && value.length <= 128 && !/[^A-Za-z0-9_-]/.test(value);
const controls = (value: string): boolean => [...value].some((char) => char.charCodeAt(0) <= 0x1f || char.charCodeAt(0) === 0x7f);
// The ratified mask excludes C0 and DEL; opaque IDs retain punctuation and C1.
const driveId = (value: unknown): value is string => text(value) && value.length > 0
  && !controls(value) && new TextEncoder().encode(value).byteLength <= 1024;
const name = (value: unknown): value is string => text(value) && value.length > 0
  && value !== '.' && value !== '..' && !controls(value) && !/[/\\]/.test(value);
const integer = (value: unknown): value is number => typeof value === 'number'
  && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const hash = (value: unknown): value is string => typeof value === 'string'
  && value.length === 64 && !/[^0-9a-f]/.test(value);

function content(value: unknown): value is Content {
  return closed(value, ['encoding', 'size', 'sha256'])
    && (value.encoding === 'utf8' || value.encoding === 'blob') && integer(value.size) && hash(value.sha256);
}

function anchor(value: unknown): value is Anchor {
  if (!record(value)) return false;
  if (value.kind === 'loose') return closed(value, ['kind', 'inboxId']) && driveId(value.inboxId);
  return value.kind === 'folder' && closed(value, ['kind', 'inboxId', 'name', 'createKey'])
    && driveId(value.inboxId) && name(value.name) && id(value.createKey);
}

function context(value: unknown): value is ContextDeclaration {
  if (!record(value)) return false;
  if (value.kind === 'absent') return closed(value, ['kind']);
  return value.kind === 'text' && closed(value, ['kind', 'memberKey', 'originalText', 'content'])
    && id(value.memberKey) && text(value.originalText) && content(value.content);
}

function member(value: unknown): value is Member {
  return closed(value, ['memberKey', 'name', 'kind', 'origin', 'content'])
    && id(value.memberKey) && name(value.name) && typeof value.kind === 'string'
    && ['note', 'pdf', 'image', 'link', 'doc', 'sheet', 'audio', 'other'].includes(value.kind)
    && (value.origin === null || text(value.origin)) && content(value.content);
}

function declaration(value: unknown): value is Declaration {
  if (!closed(value, ['v', 'kind', 'scope', 'declarationId', 'pileId', 'createdAt', 'anchor', 'members', 'context'])
    || value.v !== 1 || value.kind !== 'pile-declaration'
    || !closed(value.scope, ['rootId']) || !driveId(value.scope.rootId)
    || !id(value.declarationId) || !id(value.pileId) || !integer(value.createdAt)
    || !anchor(value.anchor) || !context(value.context)
    || !Array.isArray(value.members) || !value.members.every(member)) return false;

  const keys = new Set<string>();
  if (value.anchor.kind === 'folder') keys.add(value.anchor.createKey);
  if (value.context.kind === 'text') {
    if (keys.has(value.context.memberKey)) return false;
    keys.add(value.context.memberKey);
  }
  for (const item of value.members) {
    if (keys.has(item.memberKey)) return false;
    keys.add(item.memberKey);
  }
  if (value.anchor.kind === 'loose') return value.members.length === 1 && value.context.kind === 'absent';
  return value.members.length > 0 || (value.context.kind === 'text' && value.context.originalText.length > 0);
}

/** Compare independently supplied scope; a matching root or digest grants no access. */
export async function parsePileDeclaration(bytes: Uint8Array, expectedRootId: string): Promise<DeclarationResult> {
  const parsed = parseRecordJson(bytes);
  if (!parsed.ok) return parsed;
  if (!declaration(parsed.value)) return { ok: false, reason: 'shape' };
  const value = parsed.value;
  if (!driveId(expectedRootId) || expectedRootId !== value.scope.rootId) return { ok: false, reason: 'scope' };
  if (value.context.kind === 'text') {
    const raw = new TextEncoder().encode(value.context.originalText);
    if (value.context.content.encoding !== 'utf8' || value.context.content.size !== raw.byteLength
      || value.context.content.sha256 !== await sha256(new Blob([raw.buffer]))) return { ok: false, reason: 'content' };
  }
  // Member digests describe intent only. No member bytes or I/O are available here.
  const identity = await hashRecordJson(value);
  if (!identity.ok) return identity;
  return { ok: true, value, sha256: identity.value };
}
