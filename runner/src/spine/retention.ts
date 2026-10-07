/**
 * Retention of finished run folders (TL-P3-21 point 3). Stub: the behaviour comes in the next commit.
 */
import type { FencedDrive } from '../../../src/data/drive/fake-drive';
import type { RunRecords } from '../../../src/data/spine/records';

export const KEEP_FINISHED = 20;

export async function keepFinished(_records: RunRecords, _w: FencedDrive, _keep = KEEP_FINISHED): Promise<string[]> {
  return [];
}
