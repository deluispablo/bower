/**
 * The real doors: the Bower folder in Google Drive, and the Worker for the
 * session and tidy-ups. The same screens run on these as on the demo.
 */
import type { DriveApi } from '../drive/drive-api';
import type { Sources } from '../sources';
import { DriveVault } from '../vault/drive-vault';
import type { WorkerApi } from '../worker/worker-api';
import { LiveRuns } from './runs';
import { LiveSession } from './session';

export interface LiveOptions {
  worker: WorkerApi;
  drive: DriveApi;
  /** The piles a running tidy-up took, when the Worker can say (the fake can); otherwise this device's guess. */
  runningPiles?: () => ReadonlySet<string>;
}

export interface LiveSources extends Sources {
  vault: DriveVault;
  session: LiveSession;
  runs: LiveRuns;
  worker: WorkerApi;
  drive: DriveApi;
  dispose(): void;
}

export function makeLiveSources(opts: LiveOptions): LiveSources {
  let runs: LiveRuns | null = null;
  let vault: DriveVault | null = null;
  const session = new LiveSession(opts.worker, opts.drive, () => void vault?.refresh());
  vault = new DriveVault({
    drive: opts.drive,
    rootId: () => session.rootId(),
    runningPiles: () => {
      const theirs = opts.runningPiles?.();
      return theirs?.size ? theirs : (runs?.runningPiles() ?? new Set());
    },
  });
  runs = new LiveRuns(opts.worker, vault);
  const v = vault;
  const r = runs;
  return {
    session,
    vault: v,
    runs: r,
    worker: opts.worker,
    drive: opts.drive,
    dispose: () => {
      r.dispose();
      v.dispose();
    },
  };
}

export { LiveRuns, LiveSession };
