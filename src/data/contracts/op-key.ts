import { sha256Sync } from './hashes';

// TL-P4-50: hash the JSON tuple [root id, run id, op id] for an unambiguous idempotence key.
export function opKey(rootId: string, runId: string, opId: string): string {
  return sha256Sync(JSON.stringify([rootId, runId, opId])).slice(0, 12);
}
