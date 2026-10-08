/**
 * The pretend Worker's session lease (TL-P2-14): one per person and world,
 * `{holder, epoch, beatAt}`, kept in this browser's localStorage so every
 * tab and window of the fake shares it as devices share the real Worker.
 *
 * The rules are `decideLease` (contracts/lease.ts), the same function the Worker's person object runs; this class only
 * stores its answer.
 */
import { decideLease, holdsLease, leaveCounts, type Lease, type LeaveMark } from '../contracts/lease';
import { createPlaceGuard, sessionBus, type LeaseReply, type PlaceDeps, type PlaceGuard, type PlaceOptions, type SessionAction } from '../session';

export interface LeaseRecord extends Omit<Lease, 'left'> {
  /** The place that let it go, while nobody else has had it since. */
  left?: string;
  /** Each place's latest leave. */
  leaves?: Record<string, LeaveMark>;
}

export interface FakeLeaseOptions {
  /** `leaseKey(world, person)`. */
  key: string;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  now?: () => number;
}

/** Demo, each fake scenario and real are separate worlds; the person is never an email (a hash or an id). */
export function leaseKey(world: string, person: string): string {
  return `bower:lease:${world}:${person}`;
}

const FREE: LeaseRecord = { holder: null, epoch: 0, beatAt: 0 };

const isMark = (v: unknown): v is LeaveMark => !!v && typeof v === 'object' && typeof (v as LeaveMark).gen === 'number' && Number.isSafeInteger((v as LeaveMark).gen) && (v as LeaveMark).gen >= 0 && Number.isFinite((v as LeaveMark).at);
const isLeaves = (v: unknown): v is Record<string, LeaveMark> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(isMark);
/** What the pretend lease kept before leaves carried a time: the generations alone, read as left at time 0 (so long ago). */
const isLegacyGens = (v: unknown): v is Record<string, number> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0);

const isRecord = (v: unknown): v is LeaseRecord => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (r.holder === null || typeof r.holder === 'string') && typeof r.epoch === 'number' && Number.isSafeInteger(r.epoch) && r.epoch >= 0 && typeof r.beatAt === 'number' && Number.isFinite(r.beatAt) && (r.left === undefined || typeof r.left === 'string') && (r.leaves === undefined || isLeaves(r.leaves));
};

export class FakeLease {
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'>;
  private readonly now: () => number;

  constructor(private readonly opts: FakeLeaseOptions) {
    this.storage = opts.storage ?? localStorage;
    this.now = opts.now ?? Date.now;
  }

  async session(place: string, action: SessionAction, gen = 0): Promise<LeaseReply> {
    const stored = this.read();
    const now = this.now();
    const lease: Lease = { holder: stored.holder, epoch: stored.epoch, beatAt: stored.beatAt, left: stored.left ?? null };
    const decision = decideLease(lease, stored.leaves?.[place], { place, action, gen, now });
    const leaves = { ...stored.leaves };
    if (decision.leave) leaves[place] = decision.leave;
    for (const [p, m] of Object.entries(leaves)) if (!leaveCounts(m, now)) delete leaves[p];
    if (decision.lease !== lease || decision.leave) {
      const { holder, epoch, beatAt, left } = decision.lease;
      this.write({ holder, epoch, beatAt, ...(left !== null ? { left } : {}), ...(Object.keys(leaves).length ? { leaves } : {}) });
    }
    return decision.reply;
  }

  /**
   * Whether `place` holds the lease at `epoch`: the Worker's own check on its endpoints. An expired lease
   * nobody took is still this place's (TL-P2-25); a stale or missing epoch is not.
   */
  holds(place: string | null, epoch: number | null): boolean {
    const lease = this.read();
    return holdsLease({ holder: lease.holder, epoch: lease.epoch, beatAt: lease.beatAt, left: lease.left ?? null }, place, epoch);
  }

  read(): LeaseRecord {
    const text = this.storage.getItem(this.opts.key);
    if (text === null) return { ...FREE };
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      value = null;
    }
    if (isRecord(value)) {
      const legacy = (value as { gens?: unknown }).gens;
      if (value.leaves === undefined && isLegacyGens(legacy)) return { ...value, leaves: Object.fromEntries(Object.entries(legacy).map(([place, gen]) => [place, { gen, at: 0 }])) };
      return value;
    }
    // An unreadable lease is free, as an expired one: the next place takes it with a higher epoch than any it saw.
    console.error('The pretend session lease is unreadable');
    return { ...FREE };
  }

  private write(lease: LeaseRecord): void {
    this.storage.setItem(this.opts.key, JSON.stringify(lease));
  }
}

export interface LocalPlaceOptions extends PlaceOptions, Pick<PlaceDeps, 'onActive' | 'onBlocked' | 'pageOnly'> {
  /** `demo`, or `fake:<scenario>`. */
  world: string;
  /** The person as the lease keys them: an id or a hash, never an email. */
  person: string;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  now?: () => number;
}

/**
 * A place for the demo (and any source without a Worker), on a `FakeLease` in this browser (TL-P2-24):
 * the same session as the fake Worker gives, so every demo and fake factory has one. Wrap the demo's
 * sources with `fenceDoors(sources, place)`. In a browser it uses this tab's place id, Web Locks,
 * BroadcastChannel and `pagehide` unless the options replace them.
 */
export function localPlace(opts: LocalPlaceOptions): PlaceGuard {
  const lease = new FakeLease({ key: leaseKey(opts.world, opts.person), ...(opts.storage ? { storage: opts.storage } : {}), ...(opts.now ? { now: opts.now } : {}) });
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const locks = opts.locks ?? nav?.locks;
  const bus = opts.bus ?? sessionBus();
  const target = opts.target ?? (typeof window === 'undefined' ? undefined : window);
  return createPlaceGuard({
    ...(opts.place ? { place: opts.place } : {}),
    ...(locks ? { locks } : {}),
    ...(bus ? { bus } : {}),
    ...(opts.clock ? { clock: opts.clock } : {}),
    ...(opts.reload ? { reload: opts.reload } : {}),
    ...(target ? { target } : {}),
    ...(opts.onActive ? { onActive: opts.onActive } : {}),
    ...(opts.onBlocked ? { onBlocked: opts.onBlocked } : {}),
    ...(opts.pageOnly ? { pageOnly: opts.pageOnly } : {}),
    lease: (place, action, gen) => lease.session(place, action, gen),
    scope: async () => `${opts.world}:${opts.person}`,
  });
}
