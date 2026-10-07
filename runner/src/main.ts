/** The runner's entry: built to one ESM file (`dist/runner.mjs`). Stub: `runTidy` comes in the next commit. */
import type { RunManifest } from '../../src/data/spine/records';
import type { ItemDisposition } from '../../src/data/spine/report';
import type { RunnerDrive } from './drive';
import type { Admitted } from './spine/admitted';
import type { Effects } from './spine/run';

export { RunnerDrive, type RunnerDriveOptions } from './drive';
export { RunnerToken, isStaleAttempt, type RunnerTokenOptions, type TokenGrant } from './token';

export interface TidyOptions {
  api: string;
  runId: string;
  ticket: string;
  attempt: number;
  fetch?: typeof fetch;
  provider(taken: Admitted): Promise<RunManifest>;
  effects(drive: RunnerDrive): Effects;
  clock?: () => number;
  newId?: () => string;
  /** Sees the adapter before the run starts (tests set its fault hook). */
  onDrive?: (drive: RunnerDrive) => void;
}

export type TidyEnd =
  | { phase: 'done'; dispositions: ItemDisposition[] }
  | { phase: 'saving'; why: string }
  | { phase: 'failed'; why: string };

export async function runTidy(opts: TidyOptions): Promise<TidyEnd> {
  void opts;
  return { phase: 'failed', why: 'stub' };
}
