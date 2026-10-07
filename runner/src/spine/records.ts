/**
 * The runner's reads of its run records (`src/data/spine/records.ts`) over its Drive adapter. A record lookup
 * needs only Bower's own folders, so the listing walks `.bower`, `.bower/runs` (or `.bower/piles`) and each run's
 * folder, never the person's notes. Every folder and file listed is kept by the adapter, so the fenced writes that
 * follow (a record into its run's folder, a finished run's folder to the Bin) are checked against what was read.
 */
import type { DriveFile } from '../../../src/data/drive/drive-api';
import { RUNS_NAME, type RecordReads } from '../../../src/data/spine/records';
import { SYSTEM } from '../../../src/data/vault/layout';

/** What the runner's adapter reads: a file, a folder's live children, and a file's text. */
export interface RunnerReads {
  get(id: string): Promise<DriveFile>;
  list(parentId: string): Promise<DriveFile[]>;
  readText(id: string): Promise<string>;
  /** Rises with every write the adapter sends; a listing read at one value is current while it stays (`drive.ts`). */
  generation?: number;
}

const PILES_NAME = SYSTEM.piles.slice(SYSTEM.dir.length + 1);
/** The folders a record lookup goes into by name; a run's own folder is gone into because its parent is `runs`. */
const RECORD_FOLDERS: readonly string[] = [SYSTEM.dir, RUNS_NAME, PILES_NAME];

/**
 * `runId`: the one run whose folder is gone into, so a run's own records are read from its folder alone (TL-P3-21
 * point 3); without it, every run's folder is (retention).
 */
export function runnerReads(drive: RunnerReads, runId?: string): RecordReads {
  // The listing taken last, kept while no write has been sent since: the run's own folders are read again and again
  // between writes (is it done, where is it up to, is the record there), and nothing of ours changed them meanwhile.
  let kept: { rootId: string; at: number; files: DriveFile[] } | null = null;
  return {
    listAll: async (rootId) => {
      const at = drive.generation;
      if (kept && at !== undefined && kept.rootId === rootId && kept.at === at) return [...kept.files];
      const files = await listRecordFolders(drive, rootId, runId);
      kept = at === undefined || drive.generation !== at ? null : { rootId, at, files };
      return [...files];
    },
    // Records are canonical JSON written as UTF-8 text, so their text gives their exact bytes back.
    readBytes: async (id) => new TextEncoder().encode(await drive.readText(id)),
  };
}

async function listRecordFolders(drive: RunnerReads, rootId: string, runId: string | undefined): Promise<DriveFile[]> {
  // The folder itself is read too: a record folder made in it is checked against it.
  await drive.get(rootId);
  const out: DriveFile[] = [];
  let level: Array<{ id: string; runs: boolean }> = [{ id: rootId, runs: false }];
  while (level.length) {
    const next: typeof level = [];
    for (const folder of level) {
      for (const f of await drive.list(folder.id)) {
        out.push(f);
        const into = folder.runs ? runId === undefined || f.name === runId : RECORD_FOLDERS.includes(f.name);
        if (f.folder && into) next.push({ id: f.id, runs: f.name === RUNS_NAME && !folder.runs });
      }
    }
    level = next;
  }
  return out;
}
