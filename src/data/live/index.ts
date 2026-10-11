/**
 * The real doors: the Bower folder in Google Drive, and the Worker for the
 * session and tidy-ups. The same screens run on these as on the demo.
 */
import { isKnownDriveWrite, type DriveApi } from '../drive/drive-api';
import type { Sources } from '../sources';
import { DriveVault } from '../vault/drive-vault';
import { outboxKey } from '../vault/journal';
import type { WorkerApi } from '../worker/worker-api';
import { BowerError } from '../types';
import { broadcastBus, createUploadQueue, type QueueRole, type UploadQueue } from '../upload-queue';
import { indexedDbUploadStore, memoryUploadStore } from '../upload-store';
import { sha256Sync } from '../vault/hashes';
import { forgetThisPerson } from '../device';
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
  /** Declares each new pile before sending it, through the same fenced Drive client as every other write. */
  declarePiles?: boolean;
  /**
   * The queue every pile file goes through. Default: one over this device's
   * IndexedDB (this page's memory where the browser has none, as in tests).
   */
  uploadQueue?: UploadQueue;
  /**
   * One active place per person (TL-P2-13): `true` uses this browser's tab id, Web Locks, BroadcastChannel
   * and timers; options replace them (tests). `world` keeps demo, each fake scenario and real apart.
   * Off unless asked for: nothing is fenced then.
   */
  place?: true | (PlaceOptions & { world?: string });
}

/** How the upload queue keys a person on this device: a hash of their email, never the email. */
export async function uploadAccount(email: string): Promise<string> {
  return sha256Sync(email.trim().toLowerCase());
}

/**
 * The app's upload queue over this device's IndexedDB, Web Locks and storage.
 * Where the browser has no IndexedDB at all (tests), its store is this page's memory.
 */
function deviceQueue(drive: DriveApi): UploadQueue {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const bus = broadcastBus();
  return createUploadQueue({ drive, store: typeof indexedDB === 'undefined' ? memoryUploadStore() : indexedDbUploadStore(), ...(nav?.locks ? { locks: nav.locks } : {}), ...(nav?.storage ? { storage: nav.storage } : {}), ...(bus ? { bus } : {}) });
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
export function watchAuth<T extends object>(api: T, onAuth: () => void | Promise<void>, lifetime: () => number = () => 0, onReply?: (key: PropertyKey, reply: unknown) => void): T {
  return new Proxy(api, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]): unknown => {
        const before = lifetime();
        const out: unknown = Reflect.apply(value, target, args);
        if (out instanceof Promise)
          return out.then((reply: unknown) => {
            if (before === lifetime()) onReply?.(prop, reply);
            return reply;
          }, async (e: unknown) => {
            if (before === lifetime() && e instanceof BowerError && e.code === 'auth') await onAuth();
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
 */
async function untilActive(guard: PlaceGuard, here: WaitingHere): Promise<void> {
  for (;;) {
    try {
      await guard.verify(false);
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

export function makeLiveSources(opts: LiveOptions): LiveSources {
  let epoch = 0;
  let disposed = false;
  let expiredFrom = -1;
  let expiryFailure: unknown = null;
  let session: LiveSession | null = null;
  let knownAccount: Promise<string> | null = null;
  // The person is gone: this place starts again when someone signs in.
  const expire = async (): Promise<void> => {
    expiredFrom = epoch;
    try { await session?.expire(); }
    catch (e) { expiryFailure = e; throw e; }
    finally { guard?.reset(); }
  };
  const drive = watchAuth(opts.drive, expire, () => epoch);
  const account = async (): Promise<string> => {
    const user = await session?.current();
    if (!user) throw new BowerError('auth', 'Sign in again to keep going.');
    return knownAccount ?? uploadAccount(user.email);
  };
  // Keep the accepted identity in this lifetime's memory, before expiry erases the session cache.
  const authed = watchAuth(opts.worker, expire, () => epoch, (key, reply) => {
    if (key !== 'me') return;
    const me = reply as Awaited<ReturnType<WorkerApi['me']>>;
    if (me !== null) knownAccount = uploadAccount(me.user.email);
  });
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
        now: () => queue.onlyHere() > 0 || waitingHere.count > 0,
        subscribe: (cb) => {
          waitingHere.listeners.add(cb);
          const off = queue.subscribe(cb);
          return () => {
            waitingHere.listeners.delete(cb);
            off();
          };
        },
      },
    });
  }
  // One queue for the page: each lifetime starts it for its own person and folder. Its uploads go only from the active place.
  const queue = opts.uploadQueue ?? deviceQueue(guard ? fenceDrive(drive, guard) : drive);
  // A place that is not active never starts the queue; becoming active starts it (below).
  const vaultQueue = guard ? new Proxy(queue, {
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
              if (!(e instanceof BowerError && (e.code === 'auth' || e === expiryFailure) && expiredFrom === at && epoch === at + 1)) check(at, closedSnapshot);
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
    /** `added`: a pile's link or empty thing on its way (blocked is not closed, TL-P2-24): its writes wait for Use here. */
    function bound<T extends object>(api: T, added = false): T {
      return new Proxy(api, {
        get(target, key, receiver) {
          const value: unknown = Reflect.get(target, key, receiver);
          if (typeof value !== 'function') return value;
          return async (...args: unknown[]): Promise<unknown> => {
            check(at);
            if (disposed) throw new BowerError('unknown', 'Bower is no longer open on this page.');
            // Fail closed: every method that is not a read goes only from the active place.
            // A file on its way waits while another place is active, and goes after Use here (TL-P2-24).
            const fencing = guard && policy ? (added && isKnownDriveWrite(key) ? untilActive(guard, waitingHere) : policy.before(key, args)) : null;
            if (fencing) {
              await fencing;
              check(at);
            }
            const result: unknown = await Reflect.apply(value, target, args);
            policy?.after(key, result);
            // Successful issued mutations can still reach their original owner's bookkeeping.
            if (!isKnownDriveWrite(key)) check(at);
            return result;
          };
        },
      });
    }
    v = new DriveVault({
      driveLinks: opts.driveLinks ?? false,
      declarePiles: opts.declarePiles ?? false,
      drive: bound(drive),
      addedDrive: bound(drive, true),
      rootId: boundRoot,
      uploads: { queue: vaultQueue, account },
      runningPiles: () => {
        if (!active()) return new Set();
        const mine = r?.runningPiles() ?? new Set<string>();
        // A provider's previously captured ids are usable after reset only for an observed active run.
        const theirs = at === 0 || mine.size ? opts.runningPiles?.() : undefined;
        return theirs?.size ? theirs : mine;
      },
    }, active, originalOwner, opts.drive);
    r = new LiveRuns(boundWorker, vaultDoor ?? v, opts.pollMs, epoch > 0, v);
  }
  const invalidate = (): void => {
    epoch++;
    // Fence the old lifetime immediately; explicit forgetting below also purges its device records.
    queue.stop();
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
  async function forgetPerson(who: Promise<string> | null): Promise<void> {
    forgetThisPerson();
    try { await queue.forgetAccount(who === null ? undefined : await who); }
    catch (e) {
      console.error(e);
      throw new BowerError('unknown', 'Signing out did not finish. Try again.');
    }
  }
  {
    const signIn = session.signIn.bind(session);
    session.signIn = () => {
      knownAccount = null;
      return signIn();
    };
    const signOut = session.signOut.bind(session);
    session.signOut = async (): Promise<void> => {
      const who = knownAccount;
      let failure: { cause: unknown } | undefined;
      try { await signOut(); }
      catch (cause) { console.error(cause); failure = { cause }; }
      // Every attempt forgets locally with the session's last known identity, including retries.
      await forgetPerson(who);
      if (failure) throw failure.cause;
    };
    const ended = session.expire.bind(session);
    session.expire = async (): Promise<void> => {
      if (disposed) return;
      const who = knownAccount;
      ended();
      await forgetPerson(who);
    };
  }
  {
    const leave = session.deleteAccount.bind(session);
    // Leaving Bower removes the uploads this device kept for that person, once the Worker agreed.
    session.deleteAccount = async (): Promise<void> => {
      const who = knownAccount;
      await leave();
      await forgetPerson(who);
    };
  }
  // Signing out and leaving Bower let the lease go as on every source.
  if (guard) session = leavingLetsGo(session, guard);
  fresh();
  const vault = door(v, () => v, vaultListeners, connectVault);
  vaultDoor = vault;
  Object.assign(vault, { pendingUploadCount: () => queue.pendingCount?.() ?? 0 });
  // Completion/admission use the stable vault door, including its concrete capabilities.
  r.dispose();
  r = new LiveRuns(guardWorker(epoch, root, ready), vault, opts.pollMs, false, v);
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
  const resume = (): void => queue.retry('offline');
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
    queue.pause();
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
      r = new LiveRuns(guardWorker(epoch, root, ready), vault, opts.pollMs, true, v);
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
    await step(async () => queue.start(await account(), await root()));
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
      queue.stop();
      session.dispose();
    },
  };
}

export { LiveRuns, LiveSession };
