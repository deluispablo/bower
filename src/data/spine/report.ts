/**
 * What a run's report says, and where each admitted item ends. Stub: the behaviour comes in the next commit.
 */
import type { Outcome } from '../contracts/run-checkpoint';
import type { AdmissionManifest } from './admission';
import type { RunManifest } from './records';

export type ItemDisposition = { fileId: string; pileId: string; disposition: 'filed' | 'set-aside' | 'waiting' };

export function itemDispositions(admission: AdmissionManifest, manifest: RunManifest, outcomes: readonly Outcome[]): ItemDisposition[] {
  void admission;
  void manifest;
  void outcomes;
  return [];
}
