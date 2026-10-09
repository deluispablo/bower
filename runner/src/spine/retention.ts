/**
 * Retention of run folders (TL-P3-21 point 3): after a run ends, the folders in `.bower/runs/` of finished runs
 * beyond the newest 20 go to the Drive Bin through the fenced `trash`, never a hard delete; the same 20 as the
 * Worker's run history. Finished means a verified chain whose head is done or failed; a folder that cannot be
 * verified, or a run still going, is never let go of. Newest is by when the run ended (the terminal checkpoint's
 * `phaseAt`), then by folder name, so the choice is the same on every runner.
 *
 * It runs once, at the end of a run, after the report barrier and before `done` (`main.ts`; retention-never-wired).
 * A Bin that fails is logged and never fails the run, nor changes its report: the next run tries again.
 */
import type { FencedDrive } from '../../../src/data/drive/drive-api';
import { RunRecords } from '../../../src/data/spine/records';
import type { RunnerDrive } from '../drive';
import { runnerReads } from './records';
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

/**
 * At a run's end: with more than `keep` folders in `.bower/runs` (counted from the run's own listing, `own`, with no
 * Drive call of its own), every run's records are read and the finished ones beyond the newest `keep` go to the Bin
 * through the run's fenced writes (`keepFinished`). Gives their ids; on any failure, logs it and gives none.
 */
export async function keepFinishedAtEnd(drive: RunnerDrive, rootId: string, own: RunRecords, keep = KEEP_FINISHED): Promise<string[]> {
  try {
    if ((await own.runFolders()).length <= keep) return [];
    return await keepFinished(new RunRecords(runnerReads(drive), rootId), await drive.batch(), drive, keep);
  } catch (e) {
    console.error('Old run records could not go to the Bin; the next run tries again.', e);
    return [];
  }
}
