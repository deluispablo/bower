/**
 * Retention of run folders (TL-P3-21 point 3; retention-never-wired, rounds 2 and 3): at a run's terminal end, done
 * after the report barrier or failed for good, before that report (`main.ts`), the folders in `.bower/runs/` of ended
 * runs beyond the newest 20 go to the Drive Bin, never a hard delete; the same 20 as the Worker's run history.
 *
 * Ended is known without reading a record: at its end a run stamps its own folder's `appProperties` with its run id and
 * when it ended (`endedStamp`; app-private properties, https://developers.google.com/workspace/drive/api/guides/properties).
 * So the run's own listing of `.bower/runs` as it last read it (the read cache, `records.ts`, never listed again) is
 * enough to pick the oldest; no kept chain is read again. A folder is ended when its stamp names its own run id (its
 * folder name). A folder with no stamp at all, made over 24 h before this run ends and not this run's, is ended too, as
 * of when it was made (its listed `createdTime`): a run failed by the Worker's stale deadline, gone, or finished
 * elsewhere (retention ruling, 24 h). A younger one may be a run still going, and a stamp naming another run is not
 * ours: neither is counted nor let go of. Newest is by when the run ended, then by folder name, so the choice is the
 * same on every runner.
 *
 * At most 3 runs go to the Bin per run, the oldest first, so a backlog drains over a few runs at a bounded cost. Each goes
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

/** How old an unstamped run folder must be to count as an ended run (ms). */
export const UNSTAMPED_ENDED_AFTER = 24 * 3_600_000;

/** The stamp a run puts on its own folder at its terminal end (done or failed for good): its run id and when it ended (ms). */
export const endedStamp = (runId: string, at: number): Record<string, string> => ({ [PROP.run]: runId, [PROP.runEnded]: String(at) });

/** When the run of a run folder ended, from its stamp; null with no stamp, or one naming another run. */
export function endedAt(folder: DriveFile): number | null {
  const props = folder.appProperties ?? {};
  const at = Number(props[PROP.runEnded]);
  return props[PROP.run] === folder.name && Number.isSafeInteger(at) ? at : null;
}

/** When a run folder's run ended as seen at `now`: its stamp, or, with none, when it was made if over 24 h before `now`. */
function endedBy(folder: DriveFile, now: number): number | null {
  const props = folder.appProperties ?? {};
  if (props[PROP.run] !== undefined || props[PROP.runEnded] !== undefined) return endedAt(folder);
  const made = Date.parse(folder.createdTime);
  return Number.isFinite(made) && now - made > UNSTAMPED_ENDED_AFTER ? made : null;
}

/**
 * The run folders to put in the Bin, oldest first: of the ended runs and this run (`runId`, ended `at`), the runs
 * beyond the newest `keep`, at most `most` runs with all their folders. A run is matched by its run id (its folder
 * name) and counts once however many folders it has. This run is placed by when it ended, never as the newest by
 * default, so an old redispatch never lets go of one of the newest `keep`; its own folders are never among them.
 */
export function toBin(folders: readonly DriveFile[], runId: string, at: number, keep = KEEP_FINISHED, most = BIN_PER_RUN): DriveFile[] {
  const runs = new Map<string, { name: string; at: number; folders: DriveFile[] }>([[runId, { name: runId, at, folders: [] }]]);
  for (const folder of folders) {
    const when = folder.name === runId ? null : endedBy(folder, at);
    if (when === null) continue;
    const run = runs.get(folder.name);
    if (run) {
      run.at = Math.max(run.at, when);
      run.folders.push(folder);
    } else runs.set(folder.name, { name: folder.name, at: when, folders: [folder] });
  }
  const order = [...runs.values()].sort((a, b) => a.at - b.at || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return order.slice(0, Math.max(0, order.length - keep)).filter((run) => run.folders.length).slice(0, most).flatMap((run) => run.folders);
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
  const old = toBin(folders, runId, at, keep, most);
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
