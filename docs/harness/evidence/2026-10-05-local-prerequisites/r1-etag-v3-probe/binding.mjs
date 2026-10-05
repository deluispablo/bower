// Adapted stable-read / If-Match pattern: Freed Contributors, MIT (LICENSE-Freed.txt).
// Pinned source 7319c80b9111315ebac2718b46ef39d224eee73c; no Freed runtime/dependencies.
import { createHash } from 'node:crypto';
export const contentHash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = () => { throw new Error('Conditional read binding refused.'); };
function version(value) {
  if (value === undefined) return null;
  if (typeof value === 'number') { if (!Number.isSafeInteger(value) || value < 0) fail(); return String(value); }
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,39})$/.test(value)) fail();
  return value;
}
export function parseValidator(metadata, fileId) {
  if (!metadata || metadata.id !== fileId || typeof metadata.etag !== 'string' || !/^"[\x21\x23-\x7E\x80-\xFF]{1,1022}"$/.test(metadata.etag)) fail();
  return Object.freeze({ id: fileId, etag: metadata.etag, version: version(metadata.version) });
}
function checkedContext(context) {
  if (!context || typeof context.fileId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(context.fileId) || context.fileId === 'root' || typeof context.folderId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(context.folderId) || context.folderId === 'root' || context.account !== 'A' || context.scopeSet !== 'full-drive' || context.strategy !== 'drive-v2-etag-if-match') fail();
  return { fileId: context.fileId, folderId: context.folderId, account: context.account, scopeSet: context.scopeSet, strategy: context.strategy };
}
export function createBinding(before, bytes, after, expected, context) {
  const c=checkedContext(context), first=parseValidator(before,c.fileId), last=parseValidator(after,c.fileId);
  if (first.etag !== last.etag || first.version !== last.version || !Buffer.from(bytes).equals(Buffer.from(expected))) fail();
  return Object.freeze({ ...c, etag:first.etag, version:first.version, contentHash:contentHash(bytes) });
}
export async function readStable({readMetadata,readBytes,expected,context}) {
  // Freed's bounded metadata-before / v3 bytes / metadata-after pattern: one attempt only.
  const before=await readMetadata(); const bytes=await readBytes(); const after=await readMetadata();
  return createBinding(before,bytes,after,expected,context);
}
export function validateBinding(token,context,expected) {
  const c=checkedContext(context);
  if (!token || Object.entries(c).some(([key,value])=>token[key]!==value) || token.contentHash!==contentHash(expected)) fail();
  const parsed=parseValidator({id:token.fileId,etag:token.etag,...(token.version===null?{}:{version:token.version})},c.fileId);
  if (parsed.version!==token.version) fail();
  return token;
}
export function changedValidator(before,after) {
  if (before.etag===after.etag || (before.version===null)!==(after.version===null) || (before.version!==null && BigInt(after.version)<=BigInt(before.version))) fail();
}
