/** Structural disposition validation only; no publication or effect authority. */
import type { Content, Scope } from './pile-declaration';
import type { RecordJsonFailure } from './record-json';

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

/** Expected keys, when supplied, are the independently resolved full non-null set.
 * Matching scope, keys or hashes does not authenticate or confirm any effect. */
export async function parsePileDisposition(
  bytes: Uint8Array, expectedRootId: string, expectedMemberKeys?: readonly string[],
): Promise<DispositionResult> {
  void bytes; void expectedRootId; void expectedMemberKeys;
  return { ok: false, reason: 'shape' };
}
