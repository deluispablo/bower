/**
 * One active place per person (TL-P2-13, TL-P2-14). A place is one tab,
 * named by a random id kept in `sessionStorage`. The Worker keeps one lease
 * per person, `{holder, epoch, beatAt}`: the place holding it is active and
 * every other place shows "Bower is open in another window." with Use here.
 *
 * Within one browser, Web Locks and a `BroadcastChannel` make a takeover
 * immediate; across devices the lease's epoch decides. Every app write path
 * asks `verify()`: a lease confirmed less than 5 s ago is trusted, and the
 * outbox flush, each upload start and `process()` always ask again. A Drive
 * write already in flight when the session moves cannot be recalled
 * (accepted, TL-P2-13). The runner's own effects are never fenced here.
 */
import type { LeaseReply, SessionAction } from './contracts/lease';
import { BowerError } from './types';
import type { Session, Sources, Unsubscribe } from './sources';
import type { WorkerApi } from './worker/worker-api';
import { isDriveWrite } from './drive/drive-api';

/** Approved copy (TL-P2-13): the block screen's heading and the refusal of a fenced write. */
export const OPEN_ELSEWHERE_TEXT = 'Bower is open in another window.';
/** Approved copy (TL-P2-24): Use here got no answer from Bower's server (network, timeout). */
export const NO_ANSWER_TEXT = "Bower's server didn't answer. Try again.";
/** Approved copy (TL-P2-24): Bower's server answered and refused to move the session here. */
export const COULD_NOT_OPEN_TEXT = "Bower couldn't open here. Try again.";
/** Approved copy (TL-P2-24): the block screen's line while things added here exist only in this page. */
export const PAGE_ONLY_TEXT = 'Some things you added here are only on this page. Use Bower here to send them.';
/** How often the active place renews its lease. */
export const HEARTBEAT_MS = 30_000;
/** How long a confirmed lease is trusted for ordinary writes. */
export const TRUST_MS = 5_000;

export { LEASE_TTL_MS, type LeaseReply, type SessionAction } from './contracts/lease';
/**
 * `gen` is the place's leave generation (TL-P3-14): it goes with every `check` and `leave`, so the Worker
 * discards a check that began before the place's latest leave. A call without it counts as 0.
 */
export type LeaseCall = (place: string, action: SessionAction, gen: number) => Promise<LeaseReply>;

export function isLeaseReply(value: unknown): value is LeaseReply {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.active === 'boolean' && typeof v.epoch === 'number' && Number.isSafeInteger(v.epoch) && v.epoch >= 0;
}

/**
 * The refusal of a place that is not active: the app's own fence, or the Worker's (`stale-session`).
 * Its own class, so it is never confused with another conflict (a Drive 409 on a read-back, say).
 */
export class OpenElsewhereError extends BowerError {
  constructor() {
    super('conflict', OPEN_ELSEWHERE_TEXT);
  }
}

/** What a write from a place that is not active gets. */
export function openElsewhere(): BowerError {
  return new OpenElsewhereError();
}

export function isOpenElsewhere(error: unknown): boolean {
  return error instanceof OpenElsewhereError;
}

const PLACE_KEY = 'bower:place';

/** This tab's place: kept for the tab's life, so a reload stays the same place. */
export function placeId(storage?: Pick<Storage, 'getItem' | 'setItem'>): string {
  try {
    const kept = (storage ?? sessionStorage).getItem(PLACE_KEY);
    if (kept) return kept;
    const made = crypto.randomUUID();
    (storage ?? sessionStorage).setItem(PLACE_KEY, made);
    return made;
  } catch (e) {
    // A tab without storage is a new place on every load: a reload then asks before taking over.
    console.error(e);
    return crypto.randomUUID();
  }
}

export type PlaceState = 'starting' | 'active' | 'elsewhere';

/** What the screens see (S2a/S2b): where Bower is active, and Use here. */
export interface PlaceSource {
  state(): PlaceState;
  /** Joins: active at once when no other place holds a live lease; otherwise `elsewhere`, taking nothing. */
  start(): Promise<PlaceState>;
  /** Use here: takes the lease, tells the other tabs, reloads the data, then sends what waited here. */
  useHere(): Promise<void>;
  subscribe(cb: () => void): Unsubscribe;
  /** Things added in this page exist only in its memory, not yet in Drive: the block screen says `PAGE_ONLY_TEXT`. */
  pageOnly(): boolean;
}

/** The slice of `navigator.locks` the guard uses. */
export interface PlaceLocks {
  request(name: string, options: { ifAvailable?: boolean; steal?: boolean }, callback: (lock: unknown) => Promise<void>): Promise<void>;
}

/** A takeover, told to this browser's other tabs. */
export interface SessionMessage {
  scope: string;
  place: string;
  epoch: number;
}

export interface SessionBus {
  post(message: SessionMessage): void;
  listen(onMessage: (message: SessionMessage) => void): () => void;
}

const isMessage = (v: unknown): v is SessionMessage =>
  !!v && typeof v === 'object' && typeof (v as SessionMessage).scope === 'string' && typeof (v as SessionMessage).place === 'string' && typeof (v as SessionMessage).epoch === 'number';

/** A `BroadcastChannel` bus between this browser's tabs, or `undefined` where there is none. */
export function sessionBus(): SessionBus | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined;
  const channel = new BroadcastChannel('bower:session');
  return {
    post: (message) => channel.postMessage(message),
    listen: (onMessage) => {
      const handle = (e: MessageEvent<unknown>): void => {
        if (isMessage(e.data)) onMessage(e.data);
      };
      channel.addEventListener('message', handle);
      return () => channel.removeEventListener('message', handle);
    },
  };
}

export interface PlaceClock {
  now(): number;
  every(ms: number, fn: () => void): () => void;
}

const realClock: PlaceClock = {
  now: () => Date.now(),
  every: (ms, fn) => {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  },
};

/** What a page can replace (tests): its place id, locks, bus, clock, where `pagehide` and `pageshow` are heard, and how it reloads. */
export interface PlaceOptions {
  place?: string;
  locks?: PlaceLocks;
  bus?: SessionBus;
  clock?: PlaceClock;
  target?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  /** Reloads the page (default `location.reload()`). */
  reload?: () => void;
}

export interface PlaceDeps extends PlaceOptions {
  lease: LeaseCall;
  /** The world and the person (never an email): the lock and the bus are per scope. */
  scope: () => Promise<string>;
  /** This place became active: `start` silently, `take` by Use here. */
  onActive?: (how: ActiveHow) => Promise<void> | void;
  /** This place is no longer active: stop every background job. */
  onBlocked?: () => void;
  /** Where this tab remembers the last epoch it confirmed (default `sessionStorage`). */
  memory?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  /** Whether things exist only in this page's memory, and when that changes (the upload queue). */
  pageOnly?: { now(): boolean; subscribe(cb: () => void): Unsubscribe };
}

/** How a place became active: on a load, or by Use here (which reads the data again). */
export type ActiveHow = 'start' | 'take';

export interface PlaceGuard extends PlaceSource {
  readonly place: string;
  /** The lease epoch this place holds, while active. */
  epoch(): number | null;
  /** Throws unless this place is active; asks the lease unless it was confirmed in the last 5 s (`fresh`: always). */
  verify(fresh?: boolean): Promise<void>;
  /** Lets the lease go (closing page, sign-out); the place starts again later. */
  leave(): Promise<void>;
  /**
   * Signing out: lets the lease go, runs `work`, and only then forgets this place. When `work` fails the
   * place stays as it was (an active one takes its lease back before the failure is heard).
   */
  leaveFor<T>(work: () => Promise<T>): Promise<T>;
  /** Forgets this place's state without asking the Worker (the person is gone). */
  reset(): void;
  /** The Worker refused this place because another one is active: it blocks at once. */
  refused(): void;
  /** Settles when this place is active again (after the data was read again); rejects once disposed. */
  whenActive(): Promise<void>;
  dispose(): void;
}

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';
const NOT_READY = (): BowerError => new BowerError('unknown', 'Bower is not ready yet.');

export function createPlaceGuard(deps: PlaceDeps): PlaceGuard {
  const place = deps.place ?? placeId();
  const clock = deps.clock ?? realClock;
  const listeners = new Set<() => void>();
  /** Waiting for this place to be active again (an upload the block held back). */
  const waiters = new Set<{ resolve: () => void; reject: (e: unknown) => void }>();
  let state: PlaceState = 'starting';
  let held: number | null = null;
  let confirmedAt = Number.NEGATIVE_INFINITY;
  let scope: string | null = null;
  let checking: Promise<LeaseReply> | null = null;
  let starting: Promise<PlaceState> | null = null;
  let stopBeat = (): void => undefined;
  let unlisten = (): void => undefined;
  let release: (() => void) | null = null;
  /** Bumped on every lock request and release, so a late steal of an old lock blocks nothing. */
  let lockGen = 0;
  let disposed = false;
  /** A sign-out in progress from this active place (see `leaveFor`). */
  let leaving: Promise<unknown> | null = null;
  const genKey = `bower:place-gen:${place}`;
  /**
   * Bumped whenever this place lets its lease go (sign-out, leave, reset): an answer to a check begun before
   * says nothing now, and the Worker discards such a check (TL-P3-14). Kept for the tab's life with the
   * place id, so a reload after the leave on `pagehide` is not taken for a check from before it.
   */
  let leaveGen = ((): number => {
    try {
      const n = Number((deps.memory ?? sessionStorage).getItem(genKey) ?? '0');
      return Number.isSafeInteger(n) && n >= 0 ? n : 0;
    } catch (e) {
      console.error(e);
      return 0;
    }
  })();
  function nextLeave(): void {
    leaveGen++;
    try {
      (deps.memory ?? sessionStorage).setItem(genKey, String(leaveGen));
    } catch (e) {
      // Without it, a reload of this place may be refused until Use here; nothing is lost.
      console.error(e);
    }
  }
  const lease = (action: SessionAction): Promise<LeaseReply> => deps.lease(place, action, leaveGen);

  const emit = (): void => listeners.forEach((l) => l());
  const lockName = (s: string): string => `bower-place:${s}`;
  const memoryKey = (s: string): string => `bower:place-epoch:${s}`;

  /** The last epoch this tab confirmed for the scope, so a reload that starts offline knows what it held. */
  function remembered(s: string): number | null {
    try {
      const text = (deps.memory ?? sessionStorage).getItem(memoryKey(s));
      const n = text === null ? Number.NaN : Number(text);
      return Number.isSafeInteger(n) && n >= 0 ? n : null;
    } catch (e) {
      console.error(e);
      return null;
    }
  }
  /** Let go on purpose (closing page, sign-out): a reload then starts as a new place, never blocked by it. */
  function forget(): void {
    if (scope === null) return;
    try {
      (deps.memory ?? sessionStorage).removeItem(memoryKey(scope));
    } catch (e) {
      console.error(e);
    }
  }
  function remember(epoch: number): void {
    if (scope === null) return;
    try {
      (deps.memory ?? sessionStorage).setItem(memoryKey(scope), String(epoch));
    } catch (e) {
      // Without it, a reload that starts offline confirms its lease as a new place would.
      console.error(e);
    }
  }

  const letGo = (): void => {
    lockGen++;
    stopBeat();
    stopBeat = () => undefined;
    release?.();
    release = null;
  };

  function block(): void {
    if (state === 'elsewhere') return;
    letGo();
    state = 'elsewhere';
    held = null;
    emit();
    deps.onBlocked?.();
  }

  /**
   * Holds this browser's lock for the scope; false when another tab has it. Stolen later: this place blocks.
   * Limits: a tab the browser suspends (frozen, discarded) may keep its lock, so a new tab of this browser
   * shows Use here even after the lease expired; Use here steals it. Without Web Locks a duplicated tab,
   * which copies this tab's place id, can believe it is active too until the next check: the epoch then
   * tells them apart (the Worker refuses the stale one).
   */
  function hold(s: string, steal: boolean): Promise<boolean> {
    const locks = deps.locks;
    if (!locks) return Promise.resolve(true);
    const gen = ++lockGen;
    return new Promise<boolean>((resolve) => {
      let granted = false;
      locks
        .request(lockName(s), steal ? { steal: true } : { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(false);
            return Promise.resolve();
          }
          granted = true;
          resolve(true);
          return new Promise<void>((done) => {
            release = done;
          });
        })
        .catch((e: unknown) => {
          if (!granted) {
            console.error(e);
            resolve(false);
            return;
          }
          // Stolen: another tab of this browser chose Use here.
          if (!isAbort(e)) console.error(e);
          if (gen === lockGen && state === 'active') block();
        });
    });
  }

  async function join(): Promise<string> {
    const s = await deps.scope();
    if (s !== scope) {
      unlisten();
      scope = s;
      unlisten = deps.bus?.listen((m) => {
        if (m.scope !== scope || state !== 'active') return;
        if (m.place !== place || m.epoch !== held) block();
      }) ?? (() => undefined);
    }
    return s;
  }

  const ask = (action: 'check' | 'take'): Promise<LeaseReply> => {
    if (action === 'take') return lease('take');
    if (!checking) {
      const p = lease('check');
      checking = p;
      const clear = (): void => {
        if (checking === p) checking = null;
      };
      // expected: only forgets the shared answer; every caller of this check hears its failure itself.
      p.then(clear, clear);
    }
    return checking;
  };

  /** A heartbeat or check answer while active: the same epoch keeps it, anything else lost it. */
  function judge(reply: LeaseReply): void {
    if (state !== 'active') return;
    if (reply.active && (held === null || reply.epoch === held)) {
      held = reply.epoch;
      confirmedAt = clock.now();
      remember(reply.epoch);
      return;
    }
    // The lease was granted again with a new epoch: someone held it meanwhile (TL-P2-25), so let it go.
    if (reply.active) void lease('leave').catch((e: unknown) => console.error(e));
    block();
  }

  /** Renews the lease every HEARTBEAT_MS while this place is active. */
  function beat(): void {
    stopBeat();
    stopBeat = clock.every(HEARTBEAT_MS, () => {
      const gen = leaveGen;
      void ask('check').then(
        (reply) => {
          // Begun before a leave: its answer says nothing about the lease now.
          if (gen === leaveGen) judge(reply);
        },
        (e: unknown) => {
          // expected: offline, a place keeps working into its outbox; the next beat asks again.
          if (!(e instanceof BowerError && e.code === 'offline')) console.error(e);
        },
      );
    });
  }

  async function activate(epoch: number | null, confirmed: boolean, how: ActiveHow): Promise<void> {
    state = 'active';
    held = epoch;
    confirmedAt = confirmed ? clock.now() : Number.NEGATIVE_INFINITY;
    if (confirmed && epoch !== null) remember(epoch);
    beat();
    emit();
    try {
      await deps.onActive?.(how);
    } catch (e) {
      // The place is active; what failed to load says so on its own screen.
      console.error(e);
    }
    // What the block held back goes now, after the data was read again.
    if (state === 'active') for (const w of [...waiters]) {
      waiters.delete(w);
      w.resolve();
    }
  }

  /**
   * Still signed in after all: the lease this place let go comes back, or another place has it now. It asks
   * afresh (a check that began before the lease was let go may answer for then); a different epoch means
   * another place had it meanwhile, so the data is read again as after Use here.
   */
  /** Answers whether the data must be read again (the epoch moved on); the caller does it once signing out is over. */
  async function takeBack(before: number | null): Promise<boolean> {
    if (state !== 'active' || disposed) return false;
    let moved = false;
    try {
      const reply = await lease('check');
      if (state !== 'active' || disposed) return false;
      if (!reply.active) {
        block();
        return false;
      }
      held = reply.epoch;
      confirmedAt = clock.now();
      remember(reply.epoch);
      moved = before !== null && reply.epoch !== before;
    } catch (e) {
      // Offline: it carries on unconfirmed; the next check takes the lease back or finds it taken.
      if (!(e instanceof BowerError && e.code === 'offline')) console.error(e);
      held = null;
      confirmedAt = Number.NEGATIVE_INFINITY;
    }
    beat();
    return moved;
  }

  async function verify(fresh = false): Promise<void> {
    if (disposed) throw new BowerError('unknown', 'Bower is no longer open on this page.');
    // Signing out: a write waits for how it ends (gone, or this place carries on with its lease taken back).
    // expected: leaving's own caller hears its failure; here only the outcome matters.
    if (leaving) await leaving.then(() => undefined, () => undefined);
    if (state === 'starting') {
      if (!starting) throw NOT_READY();
      await starting;
    }
    if (state !== 'active') throw openElsewhere();
    if (!fresh && clock.now() - confirmedAt < TRUST_MS) return;
    const gen = leaveGen;
    const reply = await ask('check');
    // Begun before a leave: ask again for how things stand now.
    if (gen !== leaveGen) return verify(fresh);
    judge(reply);
    if (state !== 'active') throw openElsewhere();
  }

  /** Joins as on a page load. */
  function begin(): Promise<PlaceState> {
    if (disposed) return Promise.reject(new BowerError('unknown', 'Bower is no longer open on this page.'));
    if (state !== 'starting') return Promise.resolve(state);
    if (starting) return starting;
    const p = (async (): Promise<PlaceState> => {
      const s = await join();
      if (disposed) return state;
      if (!(await hold(s, false))) {
        if (!disposed) block();
        return state;
      }
      let reply: LeaseReply | null = null;
      // shortcut: resets during join/hold need a reload; harden if they become normal use.
      const gen = leaveGen;
      try {
        reply = await ask('check');
      } catch (e) {
        // Offline: work goes on into the outbox; every write and the flush ask again when they can.
        if (!(e instanceof BowerError && e.code === 'offline')) {
          if (gen !== leaveGen) {
            console.error(e);
            return state;
          }
          letGo();
          throw e;
        }
      }
      // Disposed meanwhile, another start/reset decided, or a leave since: this answer activates nothing.
      if (disposed || state !== 'starting' || gen !== leaveGen) {
        if (disposed) letGo();
        return state;
      }
      if (reply && !reply.active) {
        block();
        return state;
      }
      // Offline, the epoch this tab last confirmed is the one it holds: a newer one blocks it once it can ask.
      await activate(reply ? reply.epoch : remembered(s), reply !== null, 'start');
      return state;
    })();
    starting = p;
    const clear = (): void => {
      if (starting === p) starting = null;
    };
    // expected: only forgets this start; its caller hears any fresh failure.
    p.then(clear, clear);
    return p;
  }

  const onPageHide = (): void => {
    void guard.leave().catch((e: unknown) => console.error(e));
  };
  // Restored from the back/forward cache, the page reloads: it starts afresh (lease, data, the queue from this
  // device) and never writes with what it held before (web.dev/articles/bfcache). This is the only place that reacts.
  const reload = deps.reload ?? ((): void => location.reload());
  const onPageShow = (e: Event): void => {
    if ((e as PageTransitionEvent).persisted) reload();
  };
  deps.target?.addEventListener('pagehide', onPageHide);
  deps.target?.addEventListener('pageshow', onPageShow);

  const guard: PlaceGuard = {
    place,
    state: () => state,
    epoch: () => held,
    pageOnly: () => deps.pageOnly?.now() ?? false,
    verify,
    start: begin,
    async useHere(): Promise<void> {
      if (disposed) throw new BowerError('unknown', 'Bower is no longer open on this page.');
      if (state === 'active') return;
      const s = await join();
      let reply: LeaseReply;
      try {
        reply = await ask('take');
      } catch (e) {
        console.error(e);
        // No answer at all (network, timeout) is not a refusal; signing in again keeps its own sentence.
        if (e instanceof BowerError && e.code === 'offline') throw new BowerError('offline', NO_ANSWER_TEXT);
        if (e instanceof BowerError && e.code === 'auth') throw e;
        throw new BowerError('conflict', COULD_NOT_OPEN_TEXT);
      }
      if (!reply.active) {
        console.error('The Worker refused to move the session here');
        throw new BowerError('conflict', COULD_NOT_OPEN_TEXT);
      }
      if (disposed) return;
      await hold(s, true);
      if (disposed) {
        letGo();
        return;
      }
      deps.bus?.post({ scope: s, place, epoch: reply.epoch });
      await activate(reply.epoch, true, 'take');
    },
    subscribe(cb) {
      listeners.add(cb);
      // The block screen also hears when things only on this page arrive or are sent.
      const off = deps.pageOnly?.subscribe(cb) ?? (() => undefined);
      return () => {
        listeners.delete(cb);
        off();
      };
    },
    refused(): void {
      if (state === 'active') block();
    },
    whenActive(): Promise<void> {
      if (disposed) return Promise.reject(new BowerError('unknown', 'Bower is no longer open on this page.'));
      if (state === 'active') return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        waiters.add({ resolve, reject });
      });
    },
    async leaveFor<T>(work: () => Promise<T>): Promise<T> {
      if (state !== 'active') {
        // A blocked or starting place has no lease to let go: it stays as it is until the work is done.
        const out = await work();
        guard.reset();
        return out;
      }
      // Active throughout: the lease goes first (the Worker may not hear this place after), the state and
      // this browser's lock stay, so a failed sign-out never shows anything else (not even for a moment).
      stopBeat();
      stopBeat = () => undefined;
      // Checks already on their way answer for before the leave: forget them.
      nextLeave();
      checking = null;
      const before = held;
      /** This sign-out, so its own failure path can stop writes waiting for it. */
      const mine: { p: Promise<unknown> | null } = { p: null };
      const p = (async (): Promise<T> => {
        try {
          await lease('leave');
        } catch (e) {
          // The TTL lets it go instead.
          console.error(e);
        }
        forget();
        let out: T;
        try {
          out = await work();
        } catch (e) {
          const moved = await takeBack(before);
          // Signing out is over: writes stop waiting, and the reload below may write (the outbox).
          if (leaving === mine.p) leaving = null;
          if (moved && state === 'active') {
            try {
              await deps.onActive?.('take');
            } catch (err) {
              // The place is active; what failed to load says so on its own screen.
              console.error(err);
            }
          }
          throw e;
        }
        guard.reset();
        return out;
      })();
      mine.p = p;
      leaving = p;
      const done = (): void => {
        if (leaving === p) leaving = null;
      };
      // expected: only forgets the pending sign-out; its caller hears the failure.
      p.then(done, done);
      return p;
    },
    async leave(): Promise<void> {
      const was = state;
      guard.reset();
      if (was !== 'active') return;
      forget();
      await lease('leave');
    },
    reset(): void {
      nextLeave();
      checking = null;
      starting = null;
      letGo();
      const changed = state !== 'starting';
      state = 'starting';
      held = null;
      confirmedAt = Number.NEGATIVE_INFINITY;
      if (changed) emit();
    },
    dispose(): void {
      disposed = true;
      letGo();
      unlisten();
      deps.target?.removeEventListener('pagehide', onPageHide);
      deps.target?.removeEventListener('pageshow', onPageShow);
      listeners.clear();
      for (const w of waiters) w.reject(new BowerError('unknown', 'Bower is no longer open on this page.'));
      waiters.clear();
    },
  };
  return guard;
}

/**
 * Signing out and leaving Bower let the session lease go one way on every source (demo, fake, real when
 * wired), so no source can drift. Signing out goes through `leaveFor`: the lease goes first, the place
 * shows nothing else until the sign-out is done, and a failed one keeps it as it was (an active place
 * takes its lease back, a blocked one stays blocked). Leaving Bower keeps the lease while the account is
 * deleted (the Worker checks it), then lets it go, so the next place or person starts without asking.
 */
export function leavingLetsGo<T extends Pick<Session, 'signOut' | 'deleteAccount'>>(door: T, place: PlaceGuard): T {
  return new Proxy(door, {
    get(target, key, receiver) {
      if (key === 'signOut') return (): Promise<void> => place.leaveFor(() => target.signOut());
      if (key === 'deleteAccount')
        return async (): Promise<void> => {
          await target.deleteAccount();
          // The account is gone either way: a lease left behind (the Worker drops it with the account) ends with its TTL.
          await place.leave().catch((e: unknown) => console.error(e));
        };
      const value: unknown = Reflect.get(target, key, receiver);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

/** Every Drive write is fenced; a method the table does not know is too (fail closed). */
export const needsFence = isDriveWrite;

/** The guard's check before one Drive call, and what the call answered (to learn upload sessions). */
export interface DrivePolicy {
  before(key: PropertyKey, args: readonly unknown[]): Promise<void> | null;
  after(key: PropertyKey, result: unknown): void;
}

/**
 * When a Drive write asks the lease afresh: each upload's start, the first chunk of an upload this place
 * did not open in its current epoch (a resumed one), and every write while `fresh()` says so (lines wait in
 * the outbox, which the journal sends before its next line). Otherwise a lease confirmed in the last 5 s is trusted.
 */
export function drivePolicy(guard: PlaceGuard, fresh: () => boolean = () => false): DrivePolicy {
  const opened = new Set<string>();
  const mark = (session: string): string => `${guard.epoch() ?? '-'}:${session}`;
  return {
    before(key, args) {
      if (!needsFence(key)) return null;
      if (key === 'openResumable') return guard.verify(true);
      if (key === 'putChunk') {
        const session = String(args[0]);
        if (opened.has(mark(session))) return guard.verify(fresh());
        return guard.verify(true).then(() => {
          opened.add(mark(session));
        });
      }
      return guard.verify(fresh());
    },
    after(key, result) {
      if (key === 'openResumable' && typeof result === 'string') opened.add(mark(result));
    },
  };
}

/** A Drive client whose writes only go from the active place. */
export function fenceDrive<T extends object>(drive: T, guard: PlaceGuard): T {
  const policy = drivePolicy(guard);
  return new Proxy(drive, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function' || !needsFence(key)) return value;
      return async (...args: unknown[]): Promise<unknown> => {
        await policy.before(key, args);
        const result: unknown = await Reflect.apply(value, target, args);
        policy.after(key, result);
        return result;
      };
    },
  });
}

/**
 * The Worker's calls from a place: `process` checks the lease afresh, `createFolder` and `deleteAccount`
 * trust a recent one (the Worker checks all three again, TL-P2-14), and a blocked place asks no status.
 * A Worker refusal because another place is active blocks this place at once.
 */
export function fenceWorker<T extends WorkerApi>(worker: T, guard: PlaceGuard): T {
  return new Proxy(worker, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      if (key === 'process' || key === 'createFolder' || key === 'deleteAccount')
        return async (...args: unknown[]): Promise<unknown> => {
          await guard.verify(key === 'process');
          return (Reflect.apply(value, target, args) as Promise<unknown>).catch((e: unknown) => {
            if (isOpenElsewhere(e)) guard.refused();
            throw e;
          });
        };
      if (key === 'status')
        return (...args: unknown[]): unknown => {
          if (guard.state() === 'elsewhere') return Promise.reject(openElsewhere());
          return Reflect.apply(value, target, args);
        };
      return value.bind(target);
    },
  });
}

/** Door methods that only read; any other one changes something and is fenced (fail closed). */
const DOOR_READS: Record<keyof Omit<Sources, 'place'>, ReadonlySet<PropertyKey>> = {
  session: new Set(['current', 'signIn', 'signOut', 'folderState', 'subscribe']),
  vault: new Set(['driveLink', 'tree', 'note', 'piles', 'pilesListed', 'duplicates', 'questions', 'rules', 'requests', 'linkAddress', 'search', 'suggestions', 'changes', 'failedChanges', 'putAwayFailed', 'markFailedSeen', 'uploadNotice', 'subscribe']),
  runs: new Set(['current', 'markSeen', 'subscribe']),
};

function fenceDoor<T extends object>(door: T, reads: ReadonlySet<PropertyKey>, guard: PlaceGuard): T {
  return new Proxy(door, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      if (reads.has(key)) return value.bind(target);
      return async (...args: unknown[]): Promise<unknown> => {
        await guard.verify(key === 'start');
        const out: unknown = await Reflect.apply(value, target, args);
        if (typeof out !== 'function') return out;
        // An Undo is a change too.
        return async (...undoArgs: unknown[]): Promise<unknown> => {
          await guard.verify();
          return Reflect.apply(out, undefined, undoArgs);
        };
      };
    },
  });
}

/** The demo's doors, fenced the same way as the real ones (the demo has no Drive to fence). */
export function fenceDoors(sources: Sources, guard: PlaceGuard): Sources {
  return {
    session: fenceDoor(sources.session, DOOR_READS.session, guard),
    vault: fenceDoor(sources.vault, DOOR_READS.vault, guard),
    runs: fenceDoor(sources.runs, DOOR_READS.runs, guard),
    place: guard,
  };
}
