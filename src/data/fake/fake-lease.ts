/**
 * The pretend Worker's session lease (TL-P2-14): one per person and world,
 * `{holder, epoch, beatAt}`, kept in this browser's localStorage so every
 * tab and window of the fake shares it as devices share the real Worker.
 *
 * - `check` by the holder renews its lease with the same epoch, even after
 *   the TTL when nobody took it meanwhile (TL-P2-25); a free lease, or one
 *   another place let expire, is granted to whoever checks, with a higher
 *   epoch; a live lease held by another place answers `active: false`.
 * - `take` always moves the lease to the place, with a higher epoch.
 * - `leave` by the holder frees it at once (the epoch stays). A `check` by
 *   the place that left, with nobody in between, takes it back with the
 *   same epoch (a failed sign-out, a reload); any other grant raises it.
 */
import { LEASE_TTL_MS, createPlaceGuard, sessionBus, type LeaseReply, type PlaceDeps, type PlaceGuard, type PlaceOptions, type SessionAction } from '../session';

export interface LeaseRecord {
  holder: string | null;
  epoch: number;
  beatAt: number;
  /** The place that let it go, while nobody else has had it since. */
  left?: string;
}

export interface FakeLeaseOptions {
  /** `leaseKey(world, person)`. */
  key: string;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  now?: () => number;
  ttlMs?: number;
}

/** Demo, each fake scenario and real are separate worlds; the person is never an email (a hash or an id). */
export function leaseKey(world: string, person: string): string {
  return `bower:lease:${world}:${person}`;
}

const FREE: LeaseRecord = { holder: null, epoch: 0, beatAt: 0 };

const isRecord = (v: unknown): v is LeaseRecord => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (r.holder === null || typeof r.holder === 'string') && typeof r.epoch === 'number' && Number.isSafeInteger(r.epoch) && r.epoch >= 0 && typeof r.beatAt === 'number' && Number.isFinite(r.beatAt) && (r.left === undefined || typeof r.left === 'string');
};

export class FakeLease {
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'>;
  private readonly now: () => number;
  private readonly ttl: number;

  constructor(private readonly opts: FakeLeaseOptions) {
    this.storage = opts.storage ?? localStorage;
    this.now = opts.now ?? Date.now;
    this.ttl = opts.ttlMs ?? LEASE_TTL_MS;
  }

  async session(place: string, action: SessionAction): Promise<LeaseReply> {
    const lease = this.read();
    const live = this.live(lease);
    if (action === 'leave') {
      if (lease.holder === place) this.write({ holder: null, epoch: lease.epoch, beatAt: lease.beatAt, left: place });
      return { active: false, epoch: lease.epoch };
    }
    // Back after the TTL with nobody in between, or back after letting it go: the same epoch carries on (TL-P2-25).
    if (action === 'check' && (lease.holder === place || (lease.holder === null && lease.left === place))) {
      this.write({ holder: place, epoch: lease.epoch, beatAt: this.now() });
      return { active: true, epoch: lease.epoch };
    }
    if (action === 'take' || !live) {
      const next = { holder: place, epoch: lease.epoch + 1, beatAt: this.now() };
      this.write(next);
      return { active: true, epoch: next.epoch };
    }
    return { active: false, epoch: lease.epoch };
  }

  /**
   * Whether `place` holds the lease at `epoch`: the Worker's own check on its endpoints. An expired lease
   * nobody took is still this place's (TL-P2-25); a stale or missing epoch is not.
   */
  holds(place: string | null, epoch: number | null): boolean {
    const lease = this.read();
    return place !== null && epoch !== null && lease.holder === place && lease.epoch === epoch;
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
    if (isRecord(value)) return value;
    // An unreadable lease is free, as an expired one: the next place takes it with a higher epoch than any it saw.
    console.error('The pretend session lease is unreadable');
    return { ...FREE };
  }

  private live(lease: LeaseRecord): boolean {
    return lease.holder !== null && this.now() - lease.beatAt < this.ttl;
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
    lease: (place, action) => lease.session(place, action),
    scope: async () => `${opts.world}:${opts.person}`,
  });
}
