/**
 * The runner's reads of its run records, over its Drive adapter. Stub: the behaviour comes in the next commit.
 */
import type { RecordReads } from '../../../src/data/spine/records';
import type { DriveFile } from '../../../src/data/drive/drive-api';

/** What the runner's adapter reads: a folder's live children, and a file's text. */
export interface RunnerReads {
  list(parentId: string): Promise<DriveFile[]>;
  readText(id: string): Promise<string>;
}

export function runnerReads(_drive: RunnerReads): RecordReads {
  return { listAll: async () => [], readBytes: async () => new Uint8Array() };
}
