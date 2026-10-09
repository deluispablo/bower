/**
 * Retention of run folders (TL-P3-21 point 3): after a run ends, the folders in `.bower/runs/` of finished runs
 * beyond the newest 20 go to the Drive Bin through the fenced `trash`, never a hard delete; the same 20 as the
 * Worker's run history. Finished means a verified chain whose head is done or failed; a folder that cannot be
 * verified, or a run still going, is never let go of. Newest is by when the run ended (the terminal checkpoint's
 * `phaseAt`), then by folder name, so the choice is the same on every runner.
 */
import type { FencedDrive } from '../../../src/data/drive/drive-api';
import type { RunRecords } from '../../../src/data/spine/records';
import { updateByStamp, type Gets } from '../../../src/data/spine/write-once';

export const KEEP_FINISHED = 20;

/**
 * Puts the finished run folders beyond the newest `keep` in the Bin; gives their ids. Each Bin carries its stamp, so
 * one whose answer was lost is read back by it through `reads` (`write-once.ts`), never sent again.
 */
export async function keepFinished(records: RunRecords, w: FencedDrive, reads: Gets, keep = KEEP_FINISHED): Promise<string[]> {
  const finished = await records.finished();
  finished.sort((a, b) => b.at - a.at || (a.folder.name < b.folder.name ? 1 : a.folder.name > b.folder.name ? -1 : 0));
  const old = finished.slice(keep).map((f) => f.folder);
  for (const folder of old) await updateByStamp(reads, folder, 'bin', (op) => w.trash(folder.id, op));
  return old.map((f) => f.id);
}
