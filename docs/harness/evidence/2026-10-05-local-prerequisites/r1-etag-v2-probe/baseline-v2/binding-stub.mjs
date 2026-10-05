// Loaded neutral stub for assertion-first stable ETag binding tests.
import { createHash } from 'node:crypto';
export const contentHash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function parseValidator(metadata, _fileId) { return metadata; }
export async function readStable({readMetadata,readBytes,expected:_expected,context}) {
  const before=await readMetadata(); const bytes=await readBytes(); await readMetadata();
  return {...context,etag:before.etag,version:before.version??null,contentHash:contentHash(bytes)};
}
export function validateBinding(token,_context,_expected) { return token; }
