/** Run checkpoint and report record validation only; no claim, dispatch or permission authority. */
import type { RunReport } from '../types';
import type { RecordJsonFailure } from './record-json';

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
  | { operationId: string; state: 'possible-effect'; dispatchId: string }
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
  phase: 'queued' | 'reading' | 'writing' | 'saving' | 'done' | 'failed'; phaseAt: number;
  outcomes: Outcome[]; report: ReportState; retainedPileIds: string[];
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
  ok: false; reason: 'empty' | 'start' | 'revision' | 'previous' | 'binding' | 'transition'; at: number;
};

// Loadable proof stub: every input is refused until the guards are implemented.
export function parseRunCheckpoint(bytes: Uint8Array, expected: RunExpectation): Promise<CheckpointResult> {
  void bytes; void expected;
  return Promise.resolve({ ok: false, reason: 'shape' });
}

export function parseRunReport(bytes: Uint8Array, expected: ReportExpectation): Promise<ReportRecordResult> {
  void bytes; void expected;
  return Promise.resolve({ ok: false, reason: 'shape' });
}

export function verifyCheckpointChain(chain: readonly Checkpoint[]): Promise<ChainResult> {
  void chain;
  return Promise.resolve({ ok: false, reason: 'empty', at: 0 });
}
