/**
 * The runner's checkpointed operations (TL-P3-21 points 2 and 3). Stub: the behaviour comes in the next commit.
 */
import type { FencedDrive } from '../../../src/data/drive/fake-drive';
import type { Checkpoint, EffectEvidence, Failure } from '../../../src/data/contracts/run-checkpoint';
import type { OperationV2 } from '../../../src/data/contracts/run-manifest';
import type { RunManifest, RunRecords } from '../../../src/data/spine/records';

export type Settled = { state: 'applied'; evidence: EffectEvidence } | { state: 'rejected'; failure: Failure };

export interface Effects {
  apply(op: OperationV2, head: Checkpoint, w: FencedDrive): Promise<Settled>;
  observe(op: OperationV2, head: Checkpoint): Promise<EffectEvidence | null>;
}

export interface SpineRun {
  rootId: string;
  runId: string;
  attempt: number;
  records: RunRecords;
  batch(): Promise<FencedDrive>;
  effects: Effects;
  plan(): Promise<RunManifest>;
  clock(): number;
  newId(): string;
}

export type RunEnd = { state: 'settled'; chain: Checkpoint[] } | { state: 'failed'; why: string };

export async function runOperations(_run: SpineRun): Promise<RunEnd> {
  return { state: 'failed', why: 'not built yet' };
}
