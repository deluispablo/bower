/** Immutable run manifest validation only; no claim, dispatch, readiness or permission authority. */
import type { RecordJsonFailure } from './record-json';

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
export type ManifestRefusal = RecordJsonFailure['reason'] | 'shape' | 'scope' | 'capture-id' | 'order' | 'operation-id' | 'report';
export type ManifestResult = { ok: true; value: Manifest; sha256: string } | { ok: false; reason: ManifestRefusal };

/** Stub: refuses every source until the guards are implemented. */
export async function parseRunManifest(bytes: Uint8Array, expectedRootId: string): Promise<ManifestResult> {
  await Promise.resolve([bytes, expectedRootId]);
  return { ok: false, reason: 'shape' };
}
