/**
 * A run's records in `.bower/runs/<runId>/` (TL-P3-21 point 3), shared by the fake run service and the runner.
 * Stub: the behaviour comes in the next commit.
 */
import type { DriveFile } from '../drive/drive-api';
import type { FencedDrive } from '../drive/fake-drive';
import type { Checkpoint } from '../contracts/run-checkpoint';
import type { Manifest, OperationV2 } from '../contracts/run-manifest';

export const RUNS_NAME = 'runs';
export const manifestName = (hash: string): string => `manifest-${hash}.json`;
export const checkpointName = (revision: number, hash: string): string => `checkpoint-${revision}-${hash}.json`;
export const reportName = (hash: string): string => `report-${hash}.json`;
export const dispositionName = (hash: string): string => `disposition-${hash}.json`;

export type RunManifest = Omit<Manifest, 'v' | 'operations'> & { v: 1 | 2; operations: OperationV2[] };
export type Where = { runId: string } | 'piles';

export interface RecordReads {
  listAll(rootId: string): Promise<DriveFile[]>;
  readBytes(id: string): Promise<Uint8Array>;
}

export interface AttemptMark {
  attemptId: string;
  epoch: number;
}

export type CheckpointPatch = Partial<Pick<Checkpoint, 'phase' | 'phaseAt' | 'outcomes' | 'report' | 'retainedPileIds'>>;

export type Found =
  | { kind: 'new' }
  | { kind: 'run'; manifest: RunManifest; manifestHash: string; chain: Checkpoint[]; head: string | null }
  | { kind: 'broken'; why: string };

export interface Finished {
  folder: DriveFile;
  at: number;
}

export async function canonical(_value: unknown): Promise<{ text: string; bytes: Uint8Array; hash: string }> {
  return { text: '', bytes: new Uint8Array(), hash: '' };
}

export function firstCheckpoint(manifest: RunManifest, manifestHash: string, mark: AttemptMark, at: number): Checkpoint {
  return {
    v: 1, kind: 'run-checkpoint', scope: { rootId: manifest.scope.rootId }, runId: manifest.runId, manifestHash,
    revision: 0, previous: null, attemptId: mark.attemptId, epoch: mark.epoch, phase: 'queued', phaseAt: at,
    outcomes: [], report: { state: 'not-ready' }, retainedPileIds: [],
  };
}

export function nextCheckpoint(head: Checkpoint, _previous: string, _mark: AttemptMark, _patch: CheckpointPatch): Checkpoint {
  return head;
}

export class RunRecords {
  constructor(
    protected readonly reads: RecordReads,
    protected readonly rootId: string,
    protected readonly placed: Map<string, string> = new Map(),
  ) {}

  async list(_where: Where): Promise<DriveFile[]> {
    return [];
  }

  async read(_where: Where, _name: string): Promise<Uint8Array | null> {
    return null;
  }

  async put(_w: FencedDrive, _where: Where, _name: string, _text: string): Promise<void> {}

  async putNew(_w: FencedDrive, _where: Where, _name: string, _text: string): Promise<void> {}

  async manifest(_runId: string, _hash: string): Promise<RunManifest> {
    throw new Error('Not built yet.');
  }

  async chain(_manifest: RunManifest, _manifestHash: string, _head: string): Promise<Checkpoint[]> {
    return [];
  }

  async found(_runId: string): Promise<Found> {
    return { kind: 'new' };
  }

  async finished(): Promise<Finished[]> {
    return [];
  }
}
