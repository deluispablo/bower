/**
 * Retention of run folders (TL-P3-21 point 3; retention-never-wired, round 2): at a run's end, after the report
 * barrier and before `done` (`main.ts`), the folders in `.bower/runs/` of ended runs beyond the newest 20 go to the
 * Drive Bin, never a hard delete; the same 20 as the Worker's run history.
 *
 * Ended is known without reading a record: at done a run stamps its own folder's `appProperties` with its run id and
 * when it ended (`endedStamp`; app-private properties, https://developers.google.com/workspace/drive/api/guides/properties).
 * So the run's own listing of `.bower/runs` (the read cache, `records.ts`) is enough to pick the oldest; no kept chain
 * is read again. A folder is ended only when its stamp names its own run id (its folder name); a folder with no such
 * stamp, a run still going or one from before the stamp, is never counted nor let go of. Newest is by when the run
 * ended, then by folder name, so the choice is the same on every runner.
 *
 * At most 3 go to the Bin per run, the oldest first, so a backlog drains over a few runs at a bounded cost. Each goes
 * through the run's fenced writes, checked against the name and place the listing gave (`stillAsSeen`), with its
 * write-once stamp (`write-once.ts`). A Bin or a stamp that fails is logged and never fails the run, nor changes its
 * report: the next run tries again.
 */
import type { DriveFile } from '../../../src/data/drive/drive-api';
import type { RunRecords } from '../../../src/data/spine/records';
import { updateByStamp } from '../../../src/data/spine/write-once';
import { PROP } from '../../../src/data/vault/layout';
import type { RunnerDrive } from '../drive';

export const KEEP_FINISHED = 20;
/** The most run folders one run puts in the Bin. */
export const BIN_PER_RUN = 3;

/** The stamp a run puts on its own folder at done: its run id and when it ended (ms). */
export const endedStamp = (runId: string, at: number): Record<string, string> => ({ [PROP.run]: runId, [PROP.runEnded]: String(at) });

/** When the run of a run folder ended, from its stamp; null with no stamp, or one naming another run. */
export function endedAt(folder: DriveFile): number | null {
  const props = folder.appProperties ?? {};
  const at = Number(props[PROP.runEnded]);
  return props[PROP.run] === folder.name && Number.isSafeInteger(at) ? at : null;
}

/**
 * The run folders to put in the Bin, oldest first: of the ended ones and this run (`runId`, the newest), those beyond
 * the newest `keep`, at most `most` of them. This run's own folders are never among them.
 */
export function toBin(folders: readonly DriveFile[], runId: string, keep = KEEP_FINISHED, most = BIN_PER_RUN): DriveFile[] {
  const ended = folders.flatMap((folder) => {
    const when = folder.name === runId ? null : endedAt(folder);
    return when === null ? [] : [{ folder, at: when }];
  });
  ended.sort((a, b) => a.at - b.at || (a.folder.name < b.folder.name ? -1 : a.folder.name > b.folder.name ? 1 : 0));
  // This run is the newest, so it counts as one of the `keep`.
  const beyond = Math.max(0, ended.length + 1 - keep);
  return ended.slice(0, Math.min(beyond, most)).map((e) => e.folder);
}

type Ends = Pick<RunnerDrive, 'fencedWrites' | 'get' | 'expectSeen'>;

/**
 * At a run's end (`runId`, ended `at`): puts the oldest ended run folders beyond the newest `keep` in the Bin, then
 * stamps this run's own folder as ended. Reads only the run's own listing (`own`), with no Drive call of its own when
 * that listing is current. Gives the ids put in the Bin; a failure is logged and gives what landed before it.
 */
export async function keepFinishedAtEnd(drive: Ends, own: RunRecords, runId: string, at: number, keep = KEEP_FINISHED, most = BIN_PER_RUN): Promise<string[]> {
  let folders: DriveFile[];
  try {
    folders = await own.runFolders();
  } catch (e) {
    console.error('Old run records could not go to the Bin; the next run tries again.', e);
    return [];
  }
  const binned: string[] = [];
  const old = toBin(folders, runId, keep, most);
  const mine = folders.filter((f) => f.name === runId && endedAt(f) === null);
  if (!old.length && !mine.length) return binned;
  // Every fenced write reads the attempt again right before it is sent (`drive.ts`), so no batch read goes first.
  const w = drive.fencedWrites();
  try {
    for (const folder of old) {
      seenAt(drive, folder);
      await updateByStamp(drive, folder, 'bin', (op) => w.trash(folder.id, op));
      binned.push(folder.id);
    }
  } catch (e) {
    console.error('Old run records could not go to the Bin; the next run tries again.', e);
  }
  try {
    for (const folder of mine) {
      seenAt(drive, folder);
      await updateByStamp(drive, folder, 'ended', (op) => w.update(folder.id, { appProperties: { ...op, ...endedStamp(runId, at) } }));
    }
  } catch (e) {
    console.error('This run could not be marked as ended; its folder is kept.', e);
  }
  return binned;
}

/** The name and place the listing gave a run folder, as its fence must find them right before the write (`stillAsSeen`). */
function seenAt(drive: Ends, folder: DriveFile): void {
  drive.expectSeen({ fileId: folder.id, name: folder.name, parents: folder.parents, folder: true, modifiedTime: folder.modifiedTime });
}
