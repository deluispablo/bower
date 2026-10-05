/**
 * The real doors: the Bower folder in Google Drive, and the Worker for the
 * session and tidy-ups. The same screens run on these as on the demo.
 */
import type { DriveApi } from '../drive/drive-api';
import type { Sources } from '../sources';
import { DriveVault } from '../vault/drive-vault';
import type { WorkerApi } from '../worker/worker-api';
import { BowerError } from '../types';
import { LiveRuns } from './runs';
import { LiveSession } from './session';

export interface LiveOptions {
  driveLinks?: boolean;
  worker: WorkerApi;
  drive: DriveApi;
  /** The piles a running tidy-up took, when the Worker can say (the fake can); otherwise this device's guess. */
  runningPiles?: () => ReadonlySet<string>;
  /** How often to ask the Worker while a run is going (ms); 4 s by default. */
  pollMs?: number;
}

export interface LiveSources extends Sources {
  vault: DriveVault;
  session: LiveSession;
  runs: LiveRuns;
  worker: WorkerApi;
  drive: DriveApi;
  dispose(): void;
}

/**
 * The same client, but an `auth` refusal from any call also runs `onAuth`,
 * so an ended session reaches the sign-in screen from whatever screen hit it.
 */
export function watchAuth<T extends object>(api: T, onAuth: () => void): T {
  return new Proxy(api, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]): unknown => {
        const out: unknown = Reflect.apply(value, target, args);
        if (out instanceof Promise)
          return out.catch((e: unknown) => {
            if (e instanceof BowerError && e.code === 'auth') onAuth();
            throw e;
          });
        return out;
      };
    },
  });
}

export function makeLiveSources(opts: LiveOptions): LiveSources {
  let runs: LiveRuns | null = null;
  let vault: DriveVault | null = null;
  let session: LiveSession | null = null;
  const expire = (): void => session?.expire();
  const drive = watchAuth(opts.drive, expire);
  const worker = watchAuth(opts.worker, expire);
  session = new LiveSession(opts.worker, drive, () => void vault?.refresh());
  vault = new DriveVault({
    driveLinks: opts.driveLinks ?? false,
    drive,
    rootId: () => session.rootId(),
    runningPiles: () => {
      const theirs = opts.runningPiles?.();
      return theirs?.size ? theirs : (runs?.runningPiles() ?? new Set());
    },
  });
  runs = new LiveRuns(worker, vault, opts.pollMs);
  const v = vault;
  const r = runs;
  // The outbox goes when the device is back online, and once at start.
  const flush = (): void =>
    void v.flushJournal().catch((e: unknown) => {
      // expected: signed out or no folder yet; the lines wait for the next change.
      if (!(e instanceof BowerError && (e.code === 'auth' || e.code === 'not-found'))) console.error(e);
    });
  window.addEventListener('online', flush);
  flush();
  return {
    session,
    vault: v,
    runs: r,
    worker: opts.worker,
    drive: opts.drive,
    dispose: () => {
      window.removeEventListener('online', flush);
      r.dispose();
      v.dispose();
    },
  };
}

export { LiveRuns, LiveSession };
