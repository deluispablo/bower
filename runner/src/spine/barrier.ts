/** The runner's report barrier (TL-P3-22 point 2). Stub: the behaviour comes in the next commit. */
import type { FencedDrive } from '../../../src/data/drive/fake-drive';
import type { Checkpoint } from '../../../src/data/contracts/run-checkpoint';
import type { Checksum } from '../../../src/data/spine/barrier';
import type { AdmissionManifest } from '../../../src/data/spine/admission';
import type { RecordReads, RunManifest, RunRecords } from '../../../src/data/spine/records';
import type { ItemDisposition } from '../../../src/data/spine/report';

export interface BarrierRun {
  rootId: string;
  runId: string;
  attempt: number;
  records: RunRecords;
  reads: RecordReads;
  checksum: Checksum;
  batch(): Promise<FencedDrive>;
  admission: AdmissionManifest | null;
  clock(): number;
  newId(): string;
}

export interface Finished {
  chain: Checkpoint[];
  written: string[];
  dispositions: ItemDisposition[];
}

export async function finishRun(run: BarrierRun, manifest: RunManifest, manifestHash: string, chain: Checkpoint[]): Promise<Finished> {
  void run;
  void manifest;
  void manifestHash;
  return { chain, written: [], dispositions: [] };
}
