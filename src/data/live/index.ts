/**
 * The real doors: the Bower folder in Google Drive, and the Worker for the
 * session and tidy-ups. The same screens run on these as on the demo.
 */
import type { DriveApi, ResumableDrive } from '../drive/drive-api';
import type { Sources } from '../sources';
import { DriveVault } from '../vault/drive-vault';
import { outboxKey } from '../vault/journal';
import { PROP } from '../vault/layout';
import type { WorkerApi } from '../worker/worker-api';
import { BowerError } from '../types';
import { broadcastBus, createUploadQueue, type QueueRole, type UploadQueue } from '../upload-queue';
import { indexedDbUploadStore } from '../upload-store';
import { sha256 } from '../vault/hashes';
import { LiveRuns } from './runs';
import { LiveSession } from './session';
import { createPlaceGuard, drivePolicy, fenceDrive, fenceWorker, isOpenElsewhere, leavingLetsGo, placeId, sessionBus, type ActiveHow, type PlaceGuard, type PlaceOptions } from '../session';

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
  /**
   * Send pile files through the persistent upload queue: `true` builds it over
   * this device (needs a resumable Drive client and IndexedDB), a queue uses that
   * one. Off unless asked for: the real resumable protocol waits for P3 (TL-P2-07).
   */
  uploadQueue?: boolean | UploadQueue | null;
  /**
   * One active place per person (TL-P2-13): `true` uses this browser's tab id, Web Locks, BroadcastChannel
   * and timers; options replace them (tests). `world` keeps demo, each fake scenario and real apart.
   * Off unless asked for: nothing is fenced then.
   */
  place?: true | (PlaceOptions & { world?: string });
}

/** How the upload queue keys a person on this device: a hash of their email, never the email. */
export async function uploadAccount(email: string): Promise<string> {
  return sha256(new Blob([email.trim().toLowerCase()]));
}

const isResumable = (drive: DriveApi): drive is DriveApi & ResumableDrive =>
  'generateIds' in drive && 'openResumable' in drive && 'putChunk' in drive && 'sessionStatus' in drive && 'getUploaded' in drive;

/**
 * The app's upload queue over this device's IndexedDB, Web Locks and storage.
 * None without a resumable Drive, or where there is no IndexedDB at all (tests):
 * things are then sent straight, as before.
 */
function deviceQueue(drive: DriveApi): UploadQueue | null {
  if (!isResumable(drive) || typeof indexedDB === 'undefined') return null;
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const bus = broadcastBus();
  return createUploadQueue({ drive, store: indexedDbUploadStore(), ...(nav?.locks ? { locks: nav.locks } : {}), ...(nav?.storage ? { storage: nav.storage } : {}), ...(bus ? { bus } : {}) });
}

export interface LiveSources extends Sources {
  vault: DriveVault;
  session: LiveSession;
  runs: LiveRuns;
  /** The raw clients, unfenced: for tests and diagnostics only (screens use the doors above). */
  worker: WorkerApi;
  /** The raw clients, unfenced: for tests and diagnostics only (screens use the doors above). */
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

/** Things added here and on their way, waiting for Use here: only this page has them. */
interface WaitingHere {
  count: number;
  listeners: Set<() => void>;
}

/**
 * Waits while another place is active (Use here lets it go); any other refusal is the caller's.
 * `fresh`: the lease is asked right before the write, as before each upload starts (TL-P2-14 Q3).
 */
async function untilActive(guard: PlaceGuard, here: WaitingHere, fresh: boolean): Promise<void> {
  for (;;) {
    try {
      await guard.verify(fresh);
      return;
    } catch (e) {
      if (!isOpenElsewhere(e)) throw e;
      here.count++;
      here.listeners.forEach((l) => l());
      try {
        await guard.whenActive();
      } finally {
        here.count--;
        here.listeners.forEach((l) => l());
      }
    }
  }
}

/**
 * A pile's thing on its way to Drive (blocked is not closed, TL-P2-24): a file sent straight, or a link or
 * note written as text with the "as added" property that only a pile's send sets.
 */
function addedHere(key: PropertyKey, args: readonly unknown[]): boolean {
  if (key === 'upload') return true;
  const props = key === 'createText' ? args[3] : undefined;
  return !!props && typeof props === 'object' && typeof (props as Record<string, unknown>)[PROP.asAdded] === 'string';
}

export function makeLiveSources(opts: LiveOptions): LiveSources {
  let epoch = 0;
  let disposed = false;
  let expiredFrom = -1;
  let session: LiveSession | null = null;
  // The person is gone: this place starts again when someone signs in.
  const expire = (): void => { expiredFrom = epoch; session?.expire(); guard?.reset(); };
  const drive = watchAuth(opts.drive, expire, () => epoch);
  const account = async (): Promise<string> => {
    const user = await session?.current();
    if (!user) throw new BowerError('auth', 'Sign in again to keep going.');
    return uploadAccount(user.email);
  };
  const authed = watchAuth(opts.worker, expire, () => epoch);
  const waitingHere: WaitingHere = { count: 0, listeners: new Set() };
  // One active place per person (TL-P2-13): built here, started by the screens once someone is signed in.
  const guard = opts.place ? placeGuard(opts.place === true ? {} : opts.place) : null;
  function placeGuard(o: PlaceOptions & { world?: string }): PlaceGuard {
    const nav = typeof navigator === 'undefined' ? undefined : navigator;
    const locks = o.locks ?? nav?.locks;
    const bus = o.bus ?? sessionBus();
    const target = o.target ?? (typeof window === 'undefined' ? undefined : window);
    return createPlaceGuard({
      place: o.place ?? placeId(),
      ...(locks ? { locks } : {}),
      ...(bus ? { bus } : {}),
      ...(o.clock ? { clock: o.clock } : {}),
      ...(o.reload ? { reload: o.reload } : {}),
      ...(target ? { target } : {}),
      lease: (place, action, gen) => authed.session(place, action, gen),
      // The world and a hash of the person: demo, each fake scenario and real never block each other.
      scope: async () => `${o.world ?? 'live'}:${await account()}`,
      onActive: (how) => activeHere(how),
      onBlocked: () => blockedHere(),
      // Things added here that exist only in this page's memory: the block screen says so (TL-P2-24).
      // They wait in the upload queue, or in this page on their way to Drive (sent straight, or a link or note).
      pageOnly: {
        now: () => (queue?.onlyHere() ?? 0) > 0 || waitingHere.count > 0,
        subscribe: (cb) => {
          waitingHere.listeners.add(cb);
          const off = queue?.subscribe(cb) ?? (() => undefined);
          return () => {
            waitingHere.listeners.delete(cb);
            off();
          };
        },
      },
    });
  }
  // One queue for the page: each lifetime starts it for its own person and folder. Its uploads go only from the active place.
  const queue = opts.uploadQueue === true ? deviceQueue(guard ? fenceDrive(drive, guard) : drive) : opts.uploadQueue || null;
  // A place that is not active never starts the queue; becoming active starts it (below).
  const vaultQueue = queue && guard ? new Proxy(queue, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      if (key === 'start') return (who: string, folder: string): Promise<QueueRole> => (guard.state() === 'active' ? queue.start(who, folder) : Promise.resolve('idle'));
      return value.bind(target);
    },
  }) : queue;
  const worker = guard ? fenceWorker(authed, guard) : authed;
  const vaultListeners = new Set<() => void>();
  const runListeners = new Set<() => void>();
  let detachVault = (): void => undefined;
  let detachRuns = (): void => undefined;
  /** Blocked: no status polling, no foreground refresh (TL-P2-14); becoming active starts them again. */
  let paused = false;
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
    detachRuns = runListeners.size && !paused ? r.subscribe(() => { for (const cb of runListeners) cb(); }) : () => undefined;
  };
  let vaultDoor: DriveVault | null = null;
  function fresh(): void {
    const at = epoch;
    const active = (): boolean => !disposed && at === epoch;
    let owner: Promise<string> | null = null;
    let resolved = false;
    /** The folder this lifetime resolved, once it did (whose outbox the journal sends). */
    let rootKnown: string | null = null;
    ready = () => resolved;
    const originalOwner = (): Promise<string> => {
      if (!owner) {
        if (!session) throw new BowerError('unknown', 'Bower is not ready yet.');
        const p = session.rootId().then((id) => { resolved = true; rootKnown = id; return id; });
        owner = p;
        // expected: callers receive this failure; a later legitimate call can resolve the folder again.
        void p.catch(() => { if (owner === p) owner = null; });
      }
      return owner;
    };
    root = async () => { check(at); const id = await originalOwner(); check(at); return id; };
    const boundRoot = root;
    /** Lines wait in this folder's outbox: the journal sends them before its next line, so writes check afresh. */
    const outboxWaiting = (): boolean => {
      if (rootKnown === null) return false;
      try {
        const text = localStorage.getItem(outboxKey(rootKnown));
        return text !== null && text !== '[]';
      } catch (e) {
        // Unreadable: check afresh, which is the safe side.
        console.error(e);
        return true;
      }
    };
    const policy = guard ? drivePolicy(guard, outboxWaiting) : null;
    const boundWorker = guardWorker(at, boundRoot, () => resolved);
    function bound<T extends object>(api: T, mutations: readonly PropertyKey[] = []): T {
      return new Proxy(api, {
        get(target, key, receiver) {
          const value: unknown = Reflect.get(target, key, receiver);
          if (typeof value !== 'function') return value;
          return async (...args: unknown[]): Promise<unknown> => {
            check(at);
            if (disposed) throw new BowerError('unknown', 'Bower is no longer open on this page.');
            // Fail closed: every method that is not a read goes only from the active place.
            // A file on its way waits while another place is active, and goes after Use here (TL-P2-24).
            const fencing = guard && policy ? (addedHere(key, args) ? untilActive(guard, waitingHere, key === 'upload') : policy.before(key, args)) : null;
            if (fencing) {
              await fencing;
              check(at);
            }
            const result: unknown = await Reflect.apply(value, target, args);
            policy?.after(key, result);
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
      ...(vaultQueue ? { uploads: { queue: vaultQueue, account } } : {}),
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
    // Signed out, or someone else: stop sending; what this device kept stays for that person.
    queue?.stop();
    detachVault();
    detachRuns();
    v?.dispose();
    r?.dispose(true);
    fresh();
    if (paused) r.dispose();
    connectVault();
    connectRuns();
  };
  session = new LiveSession(worker, drive, () => undefined, invalidate);
  if (queue) {
    const leave = session.deleteAccount.bind(session);
    // Leaving Bower removes the uploads this device kept for that person, once the Worker agreed.
    session.deleteAccount = async (): Promise<void> => {
      const who = await account().catch((e: unknown) => {
        console.error(e);
        return null;
      });
      await leave();
      if (who === null) return;
      // The account is gone either way; a device that cannot forget the bytes says why in the console.
      await queue.forgetAccount(who).catch((e: unknown) => console.error(e));
    };
  }
  // Signing out and leaving Bower let the lease go as on every source.
  if (guard) session = leavingLetsGo(session, guard);
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
  if (guard) {
    const startRun = runs.start.bind(runs);
    // A blocked place says why it cannot tidy up, before anything else is tried.
    runs.start = async (scope, o) => {
      await guard.verify();
      return startRun(scope, o);
    };
    const send = vault.flushJournal.bind(vault);
    // The outbox goes only after a fresh check of the lease (TL-P2-14): a place that lost it keeps its lines.
    vault.flushJournal = async (): Promise<void> => {
      await guard.verify(true);
      return send();
    };
  }
  const quiet = (e: unknown): void => {
    // expected: signed out, no folder yet, offline or open elsewhere; the lines wait for the next chance.
    if (!(e instanceof BowerError && (e.code === 'auth' || e.code === 'not-found' || e.code === 'conflict' || (guard && e.code === 'offline')))) console.error(e);
  };
  // The outbox goes when the device is back online, and once at start (with a place: once it is active).
  // expected: quiet logs every failure except the ones listed in it, after which the lines simply wait.
  const flush = (): Promise<void> => vault.flushJournal().catch(quiet);
  // Uploads that waited for a connection go on by themselves; ones Drive refused wait for Try again.
  const resume = (): void => queue?.retry('offline');
  const online = (): void => {
    if (!guard) {
      void flush();
      resume();
      return;
    }
    // Blocked or not started, nothing goes; active, the session is checked before anything is sent.
    if (guard.state() !== 'active') return;
    // expected: quiet logs anything but offline or a lost lease (which blocked this place); nothing is sent then.
    void guard.verify(true).then(() => {
      resume();
      return flush();
    }, quiet);
  };
  window.addEventListener('online', online);
  if (!guard) void flush();

  /** This place is no longer active: it stops sending and asking, and keeps what waits on this device or in this page. */
  function blockedHere(): void {
    // Blocked is not closed (TL-P2-24): what is only in this page's memory waits, paused, for Use here.
    queue?.pause();
    if (paused) return;
    paused = true;
    detachRuns();
    detachRuns = () => undefined;
    r.dispose();
  }

  /** This place is active: after Use here the data is read again in full, then uploads go on, then the outbox. */
  async function activeHere(how: ActiveHow): Promise<void> {
    if (paused) {
      paused = false;
      r = new LiveRuns(guardWorker(epoch, root, ready), vault, opts.pollMs, true);
      connectRuns();
    }
    const step = async (work: () => Promise<unknown>): Promise<void> => {
      try {
        await work();
      } catch (e) {
        // expected: one step failing (offline, no folder yet) leaves the next ones to try; quiet logs the rest.
        quiet(e);
      }
    };
    if (how !== 'start') {
      await step(() => vault.refresh());
      await step(() => runs.current());
    }
    if (queue) await step(async () => queue.start(await account(), await root()));
    await flush();
  }
  return {
    session,
    vault,
    runs,
    worker: opts.worker,
    drive: opts.drive,
    ...(guard ? { place: guard } : {}),
    dispose: () => {
      window.removeEventListener('online', online);
      disposed = true;
      guard?.dispose();
      detachVault();
      detachRuns();
      vaultListeners.clear();
      runListeners.clear();
      r.dispose();
      v.dispose();
      queue?.stop();
      session.dispose();
    },
  };
}

export { LiveRuns, LiveSession };
