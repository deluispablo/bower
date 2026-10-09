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
  stamped(key: string, value: string): Promise<Array<{ file: DriveFile; trashed: boolean }>>;
  /** Rises with every write the adapter sends; a listing read at one value is current while it stays (`drive.ts`). */
  generation?: number;
  /** What the adapter's own writes did since a listing taken at a generation (`drive.ts`); null when that is not known. */
  changesSince?(generation: number): Array<{ file: DriveFile } | { gone: string }> | null;
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
  // After this runner's own writes it is brought up to date from their answers (`patched`) rather than read again.
  let kept: { rootId: string; at: number; files: DriveFile[]; walked: Map<string, boolean> } | null = null;
  return {
    listAll: async (rootId) => {
      const at = drive.generation;
      if (kept && at !== undefined && kept.rootId === rootId) {
        if (kept.at === at) return [...kept.files];
        const changes = drive.changesSince?.(kept.at);
        const files = changes ? patched(kept.files, kept.walked, changes, runId) : null;
        if (files) {
          kept = { ...kept, at, files };
          return [...files];
        }
      }
      const files = await listRecordFolders(drive, rootId, runId);
      kept = at === undefined || drive.generation !== at ? null : { rootId, at, files, walked: walkedBy(rootId, files, runId) };
      return [...files];
    },
    // Records are canonical JSON written as UTF-8 text, so their text gives their exact bytes back.
    readBytes: async (id) => new TextEncoder().encode(await drive.readText(id)),
    stamped: (key, value) => drive.stamped(key, value),
  };
}

/** Whether the walk goes into a folder named `name` found in a folder (`runs`: it is Bower's runs folder). */
const goesInto = (name: string, runs: boolean, runId: string | undefined): boolean => (runs ? runId === undefined || name === runId : RECORD_FOLDERS.includes(name));

/** The folders `listRecordFolders` listed in this listing: the root, and each record folder it went into (is it `runs`). */
function walkedBy(rootId: string, files: readonly DriveFile[], runId: string | undefined): Map<string, boolean> {
  const walked = new Map<string, boolean>([[rootId, false]]);
  let level = [rootId];
  while (level.length) {
    const next: string[] = [];
    for (const id of level) {
      const runs = walked.get(id) ?? false;
      for (const f of files) {
        if (!f.parents.includes(id) || !f.folder || walked.has(f.id) || !goesInto(f.name, runs, runId)) continue;
        walked.set(f.id, f.name === RUNS_NAME && !runs);
        next.push(f.id);
      }
    }
    level = next;
  }
  return walked;
}

/**
 * A listing brought up to date from this runner's own writes, as listing again would give it. A folder made in a
 * folder the walk lists is added (empty, as it is new), and the walk goes into it as it would; null, to list again,
 * when a folder was changed or put in the Bin (what is under it is not known from here).
 */
function patched(files: readonly DriveFile[], walked: Map<string, boolean>, changes: ReadonlyArray<{ file: DriveFile } | { gone: string }>, runId: string | undefined): DriveFile[] | null {
  let out = [...files];
  for (const c of changes) {
    if ('gone' in c) {
      if (out.find((f) => f.id === c.gone)?.folder) return null;
      out = out.filter((f) => f.id !== c.gone);
      continue;
    }
    const was = out.find((f) => f.id === c.file.id);
    if (was?.folder) return null;
    out = out.filter((f) => f.id !== c.file.id);
    const parent = c.file.parents.find((p) => walked.has(p));
    if (parent === undefined) continue;
    out.push({ ...c.file, parents: [...c.file.parents] });
    const runs = walked.get(parent) ?? false;
    if (c.file.folder && goesInto(c.file.name, runs, runId)) walked.set(c.file.id, c.file.name === RUNS_NAME && !runs);
  }
  return out;
}

/** Lists the record folders level by level: a level's folders (and the root itself) are read together, in order. */
async function listRecordFolders(drive: RunnerReads, rootId: string, runId: string | undefined): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let level: Array<{ id: string; runs: boolean }> = [{ id: rootId, runs: false }];
  let first = true;
  while (level.length) {
    // The folder itself is read too: a record folder made in it is checked against it.
    const [lists] = await Promise.all([Promise.all(level.map((folder) => drive.list(folder.id))), first ? drive.get(rootId) : null]);
    first = false;
    const next: typeof level = [];
    level.forEach((folder, i) => {
      for (const f of lists[i] ?? []) {
        out.push(f);
        if (f.folder && goesInto(f.name, folder.runs, runId)) next.push({ id: f.id, runs: f.name === RUNS_NAME && !folder.runs });
      }
    });
    level = next;
  }
  return out;
}
