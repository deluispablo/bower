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
  /** Declares each new pile before sending it (the pretend Drive only, until the real runner reads declarations). */
  declarePiles?: boolean;
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
export function watchAuth<T extends object>(api: T, onAuth: () => void, lifetime: () => number = () => 0): T {
  return new Proxy(api, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]): unknown => {
        const before = lifetime();
        const out: unknown = Reflect.apply(value, target, args);
        if (out instanceof Promise)
          return out.catch((e: unknown) => {
            if (before === lifetime() && e instanceof BowerError && e.code === 'auth') onAuth();
            throw e;
          });
        return out;
      };
    },
  });
}

export function makeLiveSources(opts: LiveOptions): LiveSources {
  let epoch = 0;
  let disposed = false;
  let expiredFrom = -1;
  let session: LiveSession | null = null;
  const expire = (): void => { expiredFrom = epoch; session?.expire(); };
  const drive = watchAuth(opts.drive, expire, () => epoch);
  const worker = watchAuth(opts.worker, expire, () => epoch);
  const vaultListeners = new Set<() => void>();
  const runListeners = new Set<() => void>();
  let detachVault = (): void => undefined;
  let detachRuns = (): void => undefined;
  let v!: DriveVault;
  let r!: LiveRuns;
  let root!: () => Promise<string>;
  let ready = (): boolean => false;
  const stale = (): BowerError => new BowerError('conflict', 'Your session changed; try again.');
  const check = (at: number, closedSnapshot = false): void => {
    if (at !== epoch) throw stale();
    if (disposed && !closedSnapshot) throw new BowerError('unknown', 'Bower is no longer open on this page.');
  };

  // Stable doors and subscriptions dispatch into private state belonging to one lifetime.
  function door<T extends object>(initial: T, current: () => T, listeners: Set<() => void>, connect: () => void): T {
    const methods = new Map<PropertyKey, (...args: unknown[]) => unknown>();
    const target = Object.create(Object.getPrototypeOf(initial), Object.getOwnPropertyDescriptors(initial)) as T;
    return new Proxy(target, {
      get(target, key, receiver) {
        if (key === 'subscribe') return (cb: () => void) => {
          if (disposed) return () => undefined;
          listeners.add(cb);
          connect();
          return () => { listeners.delete(cb); connect(); };
        };
        const value: unknown = Reflect.get(target, key, receiver);
        // Own method overrides belong to the stable door, rather than the private instance.
        if (Object.hasOwn(target, key) && typeof value === 'function') return value;
        const active = current();
        const member: unknown = Reflect.get(active, key);
        if (typeof member !== 'function') return member;
        if (!methods.has(key)) methods.set(key, (...args: unknown[]): unknown => {
          const at = epoch;
          const instance = current();
          const fn: unknown = Reflect.get(instance, key);
          if (typeof fn !== 'function') return fn;
          if (key === 'dispose' || key === 'runningPiles') return Reflect.apply(fn, instance, args);
          const owner = root;
          const resolved = ready;
          // A disposed run source keeps its last no-effect current() result; other work must stop.
          const closedSnapshot = instance instanceof LiveRuns && key === 'current';
          return (async () => {
            if (!resolved()) await owner();
            check(at, closedSnapshot);
            let result: unknown;
            try { result = await Reflect.apply(fn, instance, args); }
            catch (e) {
              // The current call's auth refusal causes this reset; preserve its readable auth meaning.
              if (!(e instanceof BowerError && e.code === 'auth' && expiredFrom === at && epoch === at + 1)) check(at, closedSnapshot);
              throw e;
            }
            check(at, closedSnapshot);
            if (typeof result !== 'function') return result;
            return async (...undoArgs: unknown[]): Promise<unknown> => {
              check(at);
              const out: unknown = await Reflect.apply(result, instance, undoArgs);
              check(at);
              return out;
            };
          })();
        });
        return methods.get(key);
      },
    });
  }
  const connectVault = (): void => {
    detachVault();
    detachVault = v.subscribe(() => { for (const cb of vaultListeners) cb(); });
  };
  const connectRuns = (): void => {
    detachRuns();
    detachRuns = runListeners.size ? r.subscribe(() => { for (const cb of runListeners) cb(); }) : () => undefined;
  };
  let vaultDoor: DriveVault | null = null;
  function fresh(): void {
    const at = epoch;
    const active = (): boolean => !disposed && at === epoch;
    let owner: Promise<string> | null = null;
    let resolved = false;
    ready = () => resolved;
    const originalOwner = (): Promise<string> => {
      if (!owner) {
        if (!session) throw new BowerError('unknown', 'Bower is not ready yet.');
        const p = session.rootId().then((id) => { resolved = true; return id; });
        owner = p;
        // expected: callers receive this failure; a later legitimate call can resolve the folder again.
        void p.catch(() => { if (owner === p) owner = null; });
      }
      return owner;
    };
    root = async () => { check(at); const id = await originalOwner(); check(at); return id; };
    const boundRoot = root;
    const boundWorker = guardWorker(at, boundRoot, () => resolved);
    function bound<T extends object>(api: T, mutations: readonly PropertyKey[] = []): T {
      return new Proxy(api, {
        get(target, key, receiver) {
          const value: unknown = Reflect.get(target, key, receiver);
          if (typeof value !== 'function') return value;
          return async (...args: unknown[]): Promise<unknown> => {
            check(at);
            if (disposed) throw new BowerError('unknown', 'Bower is no longer open on this page.');
            const result: unknown = await Reflect.apply(value, target, args);
            // Successful issued mutations can still reach their original owner's bookkeeping.
            if (!mutations.includes(key)) check(at);
            return result;
          };
        },
      });
    }
    v = new DriveVault({
      driveLinks: opts.driveLinks ?? false,
      declarePiles: opts.declarePiles ?? false,
      drive: bound(drive, ['createFolder', 'createText', 'upload', 'update', 'writeText', 'trash', 'untrash']),
      rootId: boundRoot,
      runningPiles: () => {
        if (!active()) return new Set();
        const mine = r?.runningPiles() ?? new Set<string>();
        // A provider's previously captured ids are usable after reset only for an observed active run.
        const theirs = at === 0 || mine.size ? opts.runningPiles?.() : undefined;
        return theirs?.size ? theirs : mine;
      },
    }, active, originalOwner, opts.drive);
    r = new LiveRuns(boundWorker, vaultDoor ?? v, opts.pollMs, epoch > 0);
  }
  const invalidate = (): void => {
    epoch++;
    detachVault();
    detachRuns();
    v?.dispose();
    r?.dispose(true);
    fresh();
    connectVault();
    connectRuns();
  };
  session = new LiveSession(worker, drive, () => undefined, invalidate);
  fresh();
  const vault = door(v, () => v, vaultListeners, connectVault);
  vaultDoor = vault;
  // Completion/admission use the stable vault door, including its concrete capabilities.
  r.dispose();
  r = new LiveRuns(guardWorker(epoch, root, ready), vault, opts.pollMs);
  function guardWorker(at: number, owner: () => Promise<string>, resolved: () => boolean): WorkerApi {
    return new Proxy(worker, {
      get(target, key, receiver) {
        const fn: unknown = Reflect.get(target, key, receiver);
        if (typeof fn !== 'function') return fn;
        return (...args: unknown[]): unknown => {
          const dispatch = (): unknown => {
            check(at);
            if (disposed) throw new BowerError('unknown', 'Bower is no longer open on this page.');
            // LiveRuns checks disposal/admission after replies; avoid delaying same-lifetime acceptance.
            return Reflect.apply(fn, target, args);
          };
          return resolved() ? dispatch() : owner().then(dispatch);
        };
      },
    });
  }
  const runs = door(r, () => r, runListeners, connectRuns);
  connectVault();
  // The outbox goes when the device is back online, and once at start.
  const flush = (): void =>
    void vault.flushJournal().catch((e: unknown) => {
      // expected: signed out or no folder yet; the lines wait for the next change.
      if (!(e instanceof BowerError && (e.code === 'auth' || e.code === 'not-found' || e.code === 'conflict'))) console.error(e);
    });
  window.addEventListener('online', flush);
  flush();
  return {
    session,
    vault,
    runs,
    worker: opts.worker,
    drive: opts.drive,
    dispose: () => {
      window.removeEventListener('online', flush);
      disposed = true;
      detachVault();
      detachRuns();
      vaultListeners.clear();
      runListeners.clear();
      r.dispose();
      v.dispose();
      session.dispose();
    },
  };
}

export { LiveRuns, LiveSession };
