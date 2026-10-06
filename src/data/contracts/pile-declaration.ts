/** Immutable declaration validation only; no readiness or permission authority. */
import type { RecordJsonFailure } from './record-json';

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

/** Compare independently supplied scope; a matching root or digest grants no access. */
export async function parsePileDeclaration(bytes: Uint8Array, expectedRootId: string): Promise<DeclarationResult> {
  void bytes;
  void expectedRootId;
  return { ok: false, reason: 'shape' };
}
