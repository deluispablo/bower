import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from './drive/fake-drive';
import { driveError } from './drive/drive-api';
import { FakeLease, leaseKey } from './fake/fake-lease';
import { FakeWorker } from './fake/fake-worker';
import { FakeRunService } from './fake/fake-run-service';
import { makeLiveSources, uploadAccount, type LiveSources } from './live';
import { IDBFactory } from 'fake-indexeddb';
import { createUploadQueue } from './upload-queue';
import { indexedDbUploadStore } from './upload-store';
import { sha256 } from './vault/hashes';
import { localPlace } from './fake/fake-lease';
import {
  COULD_NOT_OPEN_TEXT,
  NO_ANSWER_TEXT,
  PAGE_ONLY_TEXT,
  TRUST_MS,
  isOpenElsewhere,
  HEARTBEAT_MS,
  LEASE_TTL_MS,
  OPEN_ELSEWHERE_TEXT,
  createPlaceGuard,
  fenceDoors,
  fenceDrive,
  fenceWorker,
  type PlaceClock,
  type PlaceGuard,
  type PlaceLocks,
  type SessionBus,
  type SessionMessage,
} from './session';
import type { Sources } from './sources';
import { ALEX } from './demo/fixture';
import { buildSources, type SourceKind } from './choose';
import type { DemoWorld } from './demo/world';
import { BowerError } from './types';
import type { QueueRole, UploadQueue } from './upload-queue';
import type { WorkerApi } from './worker/worker-api';

/** The Worker's storage: one per test, shared by every place of the person. */
function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const kept = new Map<string, string>();
  return { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => void kept.set(k, v), removeItem: (k) => void kept.delete(k) };
}

class TestClock implements PlaceClock {
  t = 1_000_000;
  private timers = new Set<{ ms: number; next: number; fn: () => void }>();
  now = (): number => this.t;
  every(ms: number, fn: () => void): () => void {
    const timer = { ms, next: this.t + ms, fn };
    this.timers.add(timer);
    return () => this.timers.delete(timer);
  }
  async advance(ms: number): Promise<void> {
    const end = this.t + ms;
    for (;;) {
      const due = [...this.timers].filter((x) => x.next <= end).sort((a, b) => a.next - b.next)[0];
      if (!due) break;
      this.t = due.next;
      due.next += due.ms;
      due.fn();
      await drain();
    }
    this.t = end;
    await drain();
  }
}

async function drain(): Promise<void> {
  for (let i = 0; i < 50; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

/** One browser: Web Locks with `ifAvailable` and `steal`, and a BroadcastChannel between its tabs. */
function browser(): { locks: PlaceLocks; bus: () => SessionBus; sent: SessionMessage[]; holds: (name: string) => boolean } {
  const held = new Map<string, { reject: (e: unknown) => void }>();
  const listeners = new Set<{ owner: object; cb: (m: SessionMessage) => void }>();
  const sent: SessionMessage[] = [];
  const locks: PlaceLocks = {
    request(name, options, callback) {
      const current = held.get(name);
      if (current && !options.steal) {
        if (options.ifAvailable) return callback(null);
        return Promise.reject(new Error('The guard never waits in line for a lock'));
      }
      return new Promise<void>((resolve, reject) => {
        if (current) {
          held.delete(name);
          current.reject(new DOMException('The lock was stolen', 'AbortError'));
        }
        const entry = { reject };
        held.set(name, entry);
        callback({ name }).then(
          () => {
            if (held.get(name) === entry) held.delete(name);
            resolve();
          },
          (e: unknown) => {
            if (held.get(name) === entry) held.delete(name);
            reject(e);
          },
        );
      });
    },
  };
  const bus = (): SessionBus => {
    const owner = {};
    return {
      post: (m) => {
        sent.push(m);
        for (const l of listeners) if (l.owner !== owner) queueMicrotask(() => l.cb(m));
      },
      listen: (cb) => {
        const l = { owner, cb };
        listeners.add(l);
        return () => listeners.delete(l);
      },
    };
  };
  return { locks, bus, sent, holds: (name) => held.has(name) };
}

const WORLD = 'fake:empty';
const PERSON = 'person-hash';

function leaseOn(storage: Pick<Storage, 'getItem' | 'setItem'>, clock: TestClock, world = WORLD): FakeLease {
  return new FakeLease({ key: leaseKey(world, PERSON), storage, now: clock.now });
}

function guardOn(hub: ReturnType<typeof browser>, place: string, lease: FakeLease, clock: TestClock, scope = `${WORLD}:${PERSON}`, extra: Partial<Parameters<typeof createPlaceGuard>[0]> = {}): PlaceGuard {
  const g = createPlaceGuard({ place, lease: (p, a) => lease.session(p, a), scope: async () => scope, locks: hub.locks, bus: hub.bus(), clock, ...extra });
  guards.push(g);
  return g;
}

const guards: PlaceGuard[] = [];
const pages: LiveSources[] = [];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  for (const g of guards.splice(0)) g.dispose();
  for (const p of pages.splice(0)) p.dispose();
  vi.restoreAllMocks();
});

/** A synthetic folder in a shared pretend Drive, and the Worker's lease storage. */
async function world(): Promise<{ drive: FakeDrive; root: string; storage: Pick<Storage, 'getItem' | 'setItem'>; clock: TestClock }> {
  const drive = new FakeDrive();
  const root = await drive.createFolder('root', 'Bower');
  for (const name of ['Inbox', 'Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(root.id, name);
  const system = await drive.createFolder(root.id, '.bower');
  await drive.createFolder(system.id, 'changes');
  await drive.createText(root.id, 'Synthetic.md', 'Made-up note.');
  return { drive, root: root.id, storage: memoryStorage(), clock: new TestClock() };
}

type World = Awaited<ReturnType<typeof world>>;

function queueStub(log: string[]): UploadQueue & { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> } {
  let role: QueueRole = 'idle';
  return {
    start: vi.fn(async (): Promise<QueueRole> => {
      log.push('uploads');
      role = 'owner';
      return role;
    }),
    add: vi.fn(async () => {
      throw new Error('not used');
    }),
    items: () => [],
    role: () => role,
    subscribe: () => () => undefined,
    hasUnfinished: () => false,
    retry: vi.fn(),
    idle: async () => undefined,
    discard: async () => undefined,
    halt: async () => null,
    resume: () => undefined,
    forgetAccount: async () => undefined,
    stop: vi.fn(() => {
      role = 'idle';
    }),
    pause: vi.fn(() => {
      role = 'idle';
    }),
    onlyHere: () => 0,
    notice: () => null,
    persistence: () => 'unknown',
  };
}

function page(w: World, place: string, hub: ReturnType<typeof browser>, uploadQueue?: UploadQueue, extra: { declarePiles?: boolean; reload?: () => void } = {}): { live: LiveSources; worker: FakeWorker; lease: FakeLease; target: EventTarget; place: PlaceGuard } {
  const lease = leaseOn(w.storage, w.clock);
  const worker = new FakeWorker({ drive: w.drive, runs: new FakeRunService({ drive: w.drive, scale: 'instant' }), rootId: w.root, scenario: 'empty', lease });
  const target = new EventTarget();
  const { reload, ...more } = extra;
  const live = makeLiveSources({ drive: w.drive, worker, place: { place, locks: hub.locks, bus: hub.bus(), clock: w.clock, target, world: WORLD, ...(reload ? { reload } : {}) }, ...(uploadQueue ? { uploadQueue } : {}), ...more });
  pages.push(live);
  expect(live.place).toBeDefined();
  return { live, worker, lease, target, place: live.place as PlaceGuard };
}

const elsewhere = { name: 'BowerError', code: 'conflict', message: OPEN_ELSEWHERE_TEXT };
const outboxOf = (root: string): string | null => localStorage.getItem(`bower:outbox:${root}`);

describe('one active session per person fences the old place', () => {
  it('a first place takes a free lease without asking', async () => {
    const clock = new TestClock();
    const lease = leaseOn(memoryStorage(), clock);
    const hub = browser();
    const onActive = vi.fn();
    const a = guardOn(hub, 'tab-a', lease, clock, undefined, { onActive });
    expect(a.state()).toBe('starting');
    expect(await a.start()).toBe('active');
    expect(a.state()).toBe('active');
    expect(a.epoch()).toBe(1);
    expect(lease.read()).toEqual({ holder: 'tab-a', epoch: 1, beatAt: clock.t });
    expect(onActive).toHaveBeenCalledWith('start');
    await expect(a.verify(true)).resolves.toBeUndefined();
  });

  it('a second tab of the same browser asks first and takes nothing silently', async () => {
    const clock = new TestClock();
    const storage = memoryStorage();
    const hub = browser();
    const a = guardOn(hub, 'tab-a', leaseOn(storage, clock), clock);
    await a.start();
    const before = leaseOn(storage, clock).read();
    const b = guardOn(hub, 'tab-b', leaseOn(storage, clock), clock);
    const told = vi.fn();
    b.subscribe(told);
    expect(await b.start()).toBe('elsewhere');
    expect(b.state()).toBe('elsewhere');
    expect(told).toHaveBeenCalled();
    expect(leaseOn(storage, clock).read()).toEqual(before);
    expect(a.state()).toBe('active');
    expect(hub.holds(`bower-place:${WORLD}:${PERSON}`)).toBe(true);
    await expect(b.verify()).rejects.toMatchObject(elsewhere);
  });

  it('another device with a live lease asks first and takes nothing silently', async () => {
    const clock = new TestClock();
    const storage = memoryStorage();
    const a = guardOn(browser(), 'laptop', leaseOn(storage, clock), clock);
    await a.start();
    await clock.advance(HEARTBEAT_MS * 2);
    const before = leaseOn(storage, clock).read();
    const phone = guardOn(browser(), 'phone', leaseOn(storage, clock), clock);
    expect(await phone.start()).toBe('elsewhere');
    expect(leaseOn(storage, clock).read()).toEqual(before);
    expect(a.state()).toBe('active');
  });

  it('Use here moves the session with a higher epoch and the old tab blocks at once', async () => {
    const clock = new TestClock();
    const storage = memoryStorage();
    const hub = browser();
    const onBlocked = vi.fn();
    const a = guardOn(hub, 'tab-a', leaseOn(storage, clock), clock, undefined, { onBlocked });
    await a.start();
    const first = a.epoch() ?? 0;
    const onActive = vi.fn();
    const b = guardOn(hub, 'tab-b', leaseOn(storage, clock), clock, undefined, { onActive });
    await b.start();
    const toldA = vi.fn();
    a.subscribe(toldA);
    await b.useHere();
    await drain();
    expect(b.state()).toBe('active');
    expect(b.epoch()).toBe(first + 1);
    expect(onActive).toHaveBeenCalledWith('take');
    expect(leaseOn(storage, clock).read()).toMatchObject({ holder: 'tab-b', epoch: first + 1 });
    expect(hub.sent).toContainEqual({ scope: `${WORLD}:${PERSON}`, place: 'tab-b', epoch: first + 1 });
    expect(a.state()).toBe('elsewhere');
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(toldA).toHaveBeenCalled();
    await expect(a.verify()).rejects.toMatchObject(elsewhere);
    // The old tab offers Use here too, and taking it back works the same way.
    await a.useHere();
    await drain();
    expect(a.state()).toBe('active');
    expect(b.state()).toBe('elsewhere');
    expect(a.epoch()).toBe(first + 2);
  });

  it('the old place writes nothing to Drive after a takeover, on live and on demo doors', async () => {
    const w = await world();
    const hub = browser();
    const a = page(w, 'tab-a', hub);
    expect(await a.place.start()).toBe('active');
    await a.live.vault.tree();
    const b = page(w, 'tab-b', hub);
    expect(await b.place.start()).toBe('elsewhere');
    await b.place.useHere();
    await drain();
    expect(a.place.state()).toBe('elsewhere');
    const before = await w.drive.snapshot();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(a.live.vault.rename('Synthetic.md', 'Renamed')).rejects.toMatchObject(elsewhere);
    await expect(a.live.vault.create('Projects', 'note', 'Made up')).rejects.toMatchObject(elsewhere);
    await expect(a.live.vault.trash('Synthetic.md')).rejects.toMatchObject(elsewhere);
    await expect(a.live.runs.start('instructions')).rejects.toMatchObject({ name: 'BowerError' });
    expect(await w.drive.snapshot()).toBe(before);
    // Demo doors are fenced the same way: reads go on, changes are refused.
    const addRequest = vi.fn(async () => ({ id: 'r1', text: 'x', at: 1 }));
    const tree = vi.fn(async () => []);
    const startRun = vi.fn();
    const demo = { session: { createFolder: vi.fn(), deleteAccount: vi.fn(), current: vi.fn() }, vault: { addRequest, tree, driveLinks: false }, runs: { start: startRun, current: vi.fn() } } as unknown as Sources;
    const fenced = fenceDoors(demo, a.place);
    expect(fenced.place).toBe(a.place);
    await expect(fenced.vault.tree()).resolves.toEqual([]);
    expect(fenced.vault.driveLinks).toBe(false);
    await expect(fenced.vault.addRequest('Made up')).rejects.toMatchObject(elsewhere);
    await expect(fenced.runs.start('all')).rejects.toMatchObject(elsewhere);
    await expect(fenced.session.deleteAccount()).rejects.toMatchObject(elsewhere);
    expect(addRequest).not.toHaveBeenCalled();
    expect(startRun).not.toHaveBeenCalled();
  });

  it('the old place keeps its outbox until it uses Bower again', async () => {
    const w = await world();
    const a = page(w, 'laptop', browser());
    await a.place.start();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fail = vi.spyOn(w.drive, 'createText').mockRejectedValueOnce(driveError('offline'));
    await a.live.vault.addRequest('Made-up request');
    fail.mockRestore();
    const waiting = outboxOf(w.root);
    expect(waiting).toContain('Made-up request');
    // Another device takes over while this one is away.
    await leaseOn(w.storage, w.clock).session('phone', 'take');
    const before = await w.drive.snapshot();
    window.dispatchEvent(new Event('online'));
    await drain();
    expect(a.place.state()).toBe('elsewhere');
    expect(outboxOf(w.root)).toBe(waiting);
    expect(await w.drive.snapshot()).toBe(before);
    await a.live.vault.flushJournal().catch(() => undefined);
    expect(outboxOf(w.root)).toBe(waiting);
    await a.place.useHere();
    await drain();
    expect(a.place.state()).toBe('active');
    expect(outboxOf(w.root)).toBeNull();
    expect([...w.drive.dump(w.root).values()].join('')).toContain('Made-up request');
  });

  it('a blocked place stops polling status and its heartbeat', async () => {
    const w = await world();
    const a = page(w, 'laptop', browser());
    await a.place.start();
    const beat = vi.spyOn(a.worker, 'session');
    const status = vi.spyOn(a.worker, 'status');
    a.live.runs.subscribe(() => undefined);
    await a.live.runs.current();
    const asked = status.mock.calls.length;
    document.dispatchEvent(new Event('visibilitychange'));
    await drain();
    expect(status.mock.calls.length).toBeGreaterThan(asked);
    await w.clock.advance(HEARTBEAT_MS);
    expect(beat).toHaveBeenCalledWith('laptop', 'check', 0);
    await leaseOn(w.storage, w.clock).session('phone', 'take');
    await w.clock.advance(HEARTBEAT_MS);
    expect(a.place.state()).toBe('elsewhere');
    const beats = beat.mock.calls.length;
    const statuses = status.mock.calls.length;
    await w.clock.advance(LEASE_TTL_MS * 2);
    document.dispatchEvent(new Event('visibilitychange'));
    await drain();
    expect(beat.mock.calls.length).toBe(beats);
    expect(status.mock.calls.length).toBe(statuses);
  });

  it('a blocked place stops its uploads and resumes them, before the outbox, on Use here', async () => {
    const w = await world();
    const log: string[] = [];
    const queue = queueStub(log);
    const a = page(w, 'laptop', browser(), queue);
    await a.place.start();
    await drain();
    const account = await uploadAccount(ALEX.email);
    expect(queue.start).toHaveBeenCalledWith(account, w.root);
    await leaseOn(w.storage, w.clock).session('phone', 'take');
    await w.clock.advance(HEARTBEAT_MS);
    expect(a.place.state()).toBe('elsewhere');
    // Blocked is not closed (TL-P2-24): the queue pauses, keeping what is only in this page.
    expect(queue.pause).toHaveBeenCalled();
    expect(queue.stop).not.toHaveBeenCalled();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // A change made while blocked reaches no Drive: its line waits on this device.
    await a.live.vault.addRequest('Waits on this device');
    expect(outboxOf(w.root)).toContain('Waits on this device');
    const write = w.drive.createText.bind(w.drive);
    vi.spyOn(w.drive, 'createText').mockImplementation(async (...args) => {
      log.push('outbox');
      return write(...args);
    });
    log.length = 0;
    queue.start.mockClear();
    await a.place.useHere();
    await drain();
    expect(queue.start).toHaveBeenCalledWith(account, w.root);
    expect(log[0]).toBe('uploads');
    expect(log).toContain('outbox');
  });

  it('the Worker refuses process, createFolder and deleteAccount from a place that is not active', async () => {
    const w = await world();
    const lease = leaseOn(w.storage, w.clock);
    const a = new FakeWorker({ drive: w.drive, runs: new FakeRunService({ drive: w.drive, scale: 'instant' }), rootId: w.root, scenario: 'empty', lease });
    const b = new FakeWorker({ drive: w.drive, runs: new FakeRunService({ drive: w.drive, scale: 'instant' }), rootId: w.root, scenario: 'empty', lease: leaseOn(w.storage, w.clock) });
    expect(await a.session('laptop', 'check')).toEqual({ active: true, epoch: 1 });
    expect(await b.session('phone', 'check')).toEqual({ active: false, epoch: 1 });
    await expect(b.process('instructions')).rejects.toMatchObject(elsewhere);
    await expect(b.createFolder()).rejects.toMatchObject(elsewhere);
    await expect(b.deleteAccount()).rejects.toMatchObject(elsewhere);
    expect(await b.session('phone', 'take')).toEqual({ active: true, epoch: 2 });
    await expect(a.process('instructions')).rejects.toMatchObject(elsewhere);
    await expect(a.createFolder()).rejects.toMatchObject(elsewhere);
    await expect(a.deleteAccount()).rejects.toMatchObject(elsewhere);
    expect(await b.createFolder()).toEqual({ id: w.root, found: false });
    // Without a lease (tests, older pages) nothing is fenced.
    const plain = new FakeWorker({ drive: w.drive, runs: new FakeRunService({ drive: w.drive, scale: 'instant' }), rootId: w.root, scenario: 'empty' });
    expect(await plain.createFolder()).toEqual({ id: w.root, found: false });
  });

  it('a heartbeat keeps the lease; an expired or left lease is taken without asking', async () => {
    const clock = new TestClock();
    const storage = memoryStorage();
    const target = new EventTarget();
    const a = guardOn(browser(), 'laptop', leaseOn(storage, clock), clock, undefined, { target });
    await a.start();
    await clock.advance(LEASE_TTL_MS - 1);
    expect(leaseOn(storage, clock).read().beatAt).toBeGreaterThan(clock.t - HEARTBEAT_MS - 1);
    expect(await guardOn(browser(), 'phone', leaseOn(storage, clock), clock).start()).toBe('elsewhere');
    // The laptop goes away without a word: after the TTL the next place starts silently.
    a.dispose();
    await clock.advance(LEASE_TTL_MS + 1);
    const tablet = guardOn(browser(), 'tablet', leaseOn(storage, clock), clock, undefined, { target });
    expect(await tablet.start()).toBe('active');
    expect(tablet.epoch()).toBe(2);
    // A closing page lets the lease go at once; the next one does not wait for the TTL.
    target.dispatchEvent(new Event('pagehide'));
    await drain();
    expect(leaseOn(storage, clock).read().holder).toBeNull();
    const desk = guardOn(browser(), 'desk', leaseOn(storage, clock), clock);
    expect(await desk.start()).toBe('active');
    expect(desk.epoch()).toBe(3);
  });

  it('an offline holder keeps working into its outbox and, back after someone took the lease meanwhile, is blocked and its outbox waits', async () => {
    const w = await world();
    const a = page(w, 'laptop', browser());
    await a.place.start();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const away = vi.spyOn(a.worker, 'session').mockRejectedValue(new BowerError('offline', "You're offline."));
    w.drive.offline = true;
    await w.clock.advance(LEASE_TTL_MS + HEARTBEAT_MS);
    expect(a.place.state()).toBe('active');
    await a.live.vault.addRequest('Written while offline');
    const waiting = outboxOf(w.root);
    expect(waiting).toContain('Written while offline');
    // While it was away the phone took the lease, even briefly (TL-P2-25: the epoch moved on).
    await leaseOn(w.storage, w.clock).session('phone', 'take');
    await leaseOn(w.storage, w.clock).session('phone', 'leave');
    away.mockRestore();
    w.drive.offline = false;
    const before = await w.drive.snapshot();
    window.dispatchEvent(new Event('online'));
    await drain();
    expect(a.place.state()).toBe('elsewhere');
    expect(outboxOf(w.root)).toBe(waiting);
    expect(await w.drive.snapshot()).toBe(before);
    expect(leaseOn(w.storage, w.clock).read().holder).not.toBe('laptop');
  });

  it('writes trust a lease confirmed in the last 5 s; outbox, uploads and process always check again', async () => {
    const clock = new TestClock();
    const storage = memoryStorage();
    const lease = leaseOn(storage, clock);
    const calls = vi.spyOn(lease, 'session');
    const a = guardOn(browser(), 'laptop', lease, clock);
    await a.start();
    calls.mockClear();
    const writes: string[] = [];
    const drive = {
      listAll: async () => [],
      createText: async () => void writes.push('createText'),
      openResumable: async () => {
        writes.push('openResumable');
        return 'session-1';
      },
      putChunk: async (_session: string) => void writes.push('putChunk'),
      sessionStatus: async () => ({}),
    };
    const fenced = fenceDrive(drive, a);
    await fenced.createText();
    await fenced.listAll();
    expect(calls).not.toHaveBeenCalled();
    await clock.advance(4_000);
    await fenced.createText();
    expect(calls).not.toHaveBeenCalled();
    await clock.advance(2_000);
    await fenced.createText();
    expect(calls).toHaveBeenCalledTimes(1);
    await fenced.openResumable();
    expect(calls).toHaveBeenCalledTimes(2);
    // The chunks of an upload this place just opened trust that check.
    await fenced.putChunk('session-1');
    expect(calls).toHaveBeenCalledTimes(2);
    await a.verify(true);
    expect(calls).toHaveBeenCalledTimes(3);
    const worker = { process: vi.fn(async () => ({ id: 'run-1' })), status: vi.fn(async () => null), me: vi.fn(async () => null) } as unknown as WorkerApi;
    const fencedWorker = fenceWorker(worker, a);
    await fencedWorker.process('all');
    expect(calls).toHaveBeenCalledTimes(4);
    await fencedWorker.me();
    expect(calls).toHaveBeenCalledTimes(4);
    // Another device took over: the next fresh check blocks; nothing more is written.
    await leaseOn(storage, clock).session('phone', 'take');
    await expect(fenced.openResumable()).rejects.toMatchObject(elsewhere);
    await expect(fenced.createText()).rejects.toMatchObject(elsewhere);
    await expect(fencedWorker.process('all')).rejects.toMatchObject(elsewhere);
    expect(writes).toEqual(['createText', 'createText', 'createText', 'openResumable', 'putChunk']);
    expect(worker.process).toHaveBeenCalledTimes(1);
  });

  it('demo, each fake scenario and real are separate worlds that never block each other', async () => {
    const clock = new TestClock();
    const storage = memoryStorage();
    const hub = browser();
    const worlds = ['demo', 'fake:empty', 'fake:running', 'real'];
    for (const name of worlds) {
      const g = guardOn(hub, `tab-${name}`, leaseOn(storage, clock, name), clock, `${name}:${PERSON}`);
      expect(await g.start()).toBe('active');
    }
    expect(new Set(worlds.map((name) => leaseKey(name, PERSON))).size).toBe(worlds.length);
    for (const name of worlds) expect(leaseOn(storage, clock, name).read()).toMatchObject({ holder: `tab-${name}`, epoch: 1 });
    // The same world is one place, whoever asks second.
    const again = guardOn(hub, 'tab-again', leaseOn(storage, clock, 'fake:running'), clock, `fake:running:${PERSON}`);
    expect(await again.start()).toBe('elsewhere');
  });
});

describe('Use here wording and things only on this page (TL-P2-24)', () => {
  it('a refused take and a take with no answer say different things', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const clock = new TestClock();
    let answer: () => Promise<{ active: boolean; epoch: number }> = async () => ({ active: false, epoch: 3 });
    const g = guardOn(browser(), 'tab-a', leaseOn(memoryStorage(), clock), clock, undefined, { lease: async (_p, action) => (action === 'take' ? answer() : { active: false, epoch: 3 }) });
    expect(await g.start()).toBe('elsewhere');
    await expect(g.useHere()).rejects.toMatchObject({ name: 'BowerError', code: 'conflict', message: COULD_NOT_OPEN_TEXT });
    answer = async () => {
      throw new BowerError('conflict', 'That cannot be done right now.');
    };
    await expect(g.useHere()).rejects.toMatchObject({ code: 'conflict', message: COULD_NOT_OPEN_TEXT });
    answer = async () => {
      throw new BowerError('offline', "You're offline. Try again when you're back.");
    };
    await expect(g.useHere()).rejects.toMatchObject({ code: 'offline', message: NO_ANSWER_TEXT });
    answer = async () => {
      throw new BowerError('auth', 'Sign in again to keep going.');
    };
    await expect(g.useHere()).rejects.toMatchObject({ code: 'auth', message: 'Sign in again to keep going.' });
    expect(g.state()).toBe('elsewhere');
    expect(COULD_NOT_OPEN_TEXT).toBe("Bower couldn't open here. Try again.");
    expect(NO_ANSWER_TEXT).toBe("Bower's server didn't answer. Try again.");
  });

  it('a blocked page keeps what is only on it, paused, says so, and sends it once after Use here', async () => {
    const w = await world();
    const store = indexedDbUploadStore(new IDBFactory());
    store.add = () => Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
    const queue = createUploadQueue({ drive: w.drive, store });
    const a = page(w, 'laptop', browser(), queue);
    await a.place.start();
    await drain();
    expect(queue.role()).toBe('owner');
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });
    w.drive.beforeChunk = async () => {
      await gate;
    };
    const inbox = (await w.drive.listAll(w.root)).find((f) => f.name === 'Inbox')?.id ?? '';
    const body = new Blob([new Uint8Array([1, 2, 3])], { type: 'text/plain' });
    await queue.add({ declarationId: 'decl-1', memberKey: 'member-1', sha256: await sha256(body), pileId: 'pile-1', parentId: inbox, name: 'made-up.txt', body });
    await vi.waitFor(() => expect(w.drive.resumableCalls.some((c) => c.op === 'put')).toBe(true));
    expect(a.place.pageOnly()).toBe(true);
    const told = vi.fn();
    a.place.subscribe(told);
    await leaseOn(w.storage, w.clock).session('phone', 'take');
    await w.clock.advance(HEARTBEAT_MS);
    expect(a.place.state()).toBe('elsewhere');
    open();
    w.drive.beforeChunk = null;
    await queue.idle();
    await drain();
    const sent = async (): Promise<number> => (await w.drive.listAll(w.root)).filter((f) => f.name === 'made-up.txt').length;
    expect(await sent()).toBe(0);
    expect(queue.items()).toEqual([expect.objectContaining({ state: 'waiting', durable: false })]);
    expect(a.place.pageOnly()).toBe(true);
    expect(told).toHaveBeenCalled();
    expect(PAGE_ONLY_TEXT).toBe('Some things you added here are only on this page. Use Bower here to send them.');
    told.mockClear();
    await a.place.useHere();
    await vi.waitFor(() => expect(queue.items()[0]?.state).toBe('done'));
    await queue.idle();
    expect(await sent()).toBe(1);
    expect(a.place.pageOnly()).toBe(false);
    expect(told).toHaveBeenCalled();
  });

  it('demo and fake places get a session from one factory, per world', async () => {
    const clock = new TestClock();
    const storage = memoryStorage();
    const hub = browser();
    const made = (place: string, world: string): PlaceGuard => {
      const g = localPlace({ world, person: PERSON, place, storage, now: clock.now, locks: hub.locks, bus: hub.bus(), clock });
      guards.push(g);
      return g;
    };
    expect(await made('tab-a', 'demo').start()).toBe('active');
    expect(await made('tab-b', 'demo').start()).toBe('elsewhere');
    expect(await made('tab-c', 'fake:empty').start()).toBe('active');
    expect(leaseOn(storage, clock, 'demo').read()).toMatchObject({ holder: 'tab-a', epoch: 1 });
    // The fake Worker always answers session; without a lease every place is active.
    const w = await world();
    expect(await new FakeWorker({ drive: w.drive, runs: new FakeRunService({ drive: w.drive, scale: 'instant' }), rootId: w.root, scenario: 'empty' }).session('tab-a', 'check')).toEqual({ active: true, epoch: 0 });
  });
});

describe('review findings and TL-P2-25: blocked is not closed, nothing stale lands', () => {
  const body = (): Blob => new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' });
  const lone = (name: string) => ({ text: '', items: [{ name, kind: 'pdf' as const, origin: 'Added here', body: body() }] });
  const failedRows = async (live: LiveSources): Promise<number> => (await live.vault.piles()).flatMap((p) => p.items).filter((i) => i.upload === -1).length;
  const inDrive = async (w: World, name: string): Promise<number> => (await w.drive.listAll(w.root)).filter((f) => f.name === name && !f.folder).length;

  it.each([
    ['kept on this device', false],
    ['only in this page', true],
  ] as const)('a block interrupts a queued upload (%s): it waits, never fails, and Use here sends it once', async (_label, pageOnly) => {
    const w = await world();
    const store = indexedDbUploadStore(new IDBFactory());
    if (pageOnly) store.add = () => Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
    const queue = createUploadQueue({ drive: w.drive, store });
    const a = page(w, 'laptop', browser(), queue);
    await a.place.start();
    await drain();
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });
    w.drive.beforeChunk = async () => {
      await gate;
    };
    await a.live.vault.addPile(lone('made-up.pdf'));
    await vi.waitFor(() => expect(w.drive.resumableCalls.some((c) => c.op === 'put')).toBe(true));
    await leaseOn(w.storage, w.clock).session('phone', 'take');
    await w.clock.advance(HEARTBEAT_MS);
    expect(a.place.state()).toBe('elsewhere');
    open();
    w.drive.beforeChunk = null;
    await queue.idle();
    await drain();
    expect(await inDrive(w, 'made-up.pdf')).toBe(0);
    expect(queue.items()).toEqual([expect.objectContaining({ state: 'waiting' })]);
    expect(queue.items()[0]?.error).toBeUndefined();
    expect(await failedRows(a.live)).toBe(0);
    await a.place.useHere();
    await vi.waitFor(async () => expect(await inDrive(w, 'made-up.pdf')).toBe(1));
    await queue.idle();
    await drain();
    expect(await inDrive(w, 'made-up.pdf')).toBe(1);
    expect(await failedRows(a.live)).toBe(0);
  });

  it('a tidy-up from a blocked place says Bower is open in another window', async () => {
    const w = await world();
    const hub = browser();
    const a = page(w, 'tab-a', hub);
    await a.place.start();
    const b = page(w, 'tab-b', hub);
    await b.place.start();
    await b.place.useHere();
    await drain();
    await expect(a.live.runs.start('instructions')).rejects.toMatchObject(elsewhere);
    await expect(a.live.runs.start('all')).rejects.toMatchObject(elsewhere);
  });

  it('offline at start, a reloaded place keeps its last epoch: a newer holder in between blocks it once it can ask', async () => {
    const clock = new TestClock();
    const storage = memoryStorage();
    const memory = memoryStorage();
    const lease = leaseOn(storage, clock);
    const first = guardOn(browser(), 'laptop', lease, clock, undefined, { memory });
    expect(await first.start()).toBe('active');
    expect(first.epoch()).toBe(1);
    first.dispose();
    await leaseOn(storage, clock).session('phone', 'take');
    await leaseOn(storage, clock).session('phone', 'leave');
    let offline = true;
    const again = guardOn(browser(), 'laptop', lease, clock, undefined, {
      memory,
      lease: async (p, action) => {
        if (offline) throw new BowerError('offline', "You're offline.");
        return lease.session(p, action);
      },
    });
    expect(await again.start()).toBe('active');
    // Nothing lands unconfirmed: a write asks the lease and hears offline, so it waits in the outbox.
    await expect(again.verify()).rejects.toMatchObject({ code: 'offline' });
    offline = false;
    await expect(again.verify(true)).rejects.toMatchObject(elsewhere);
    expect(again.state()).toBe('elsewhere');
  });

  it('back after the TTL with nobody else in between, a place carries on silently with the same epoch', async () => {
    const clock = new TestClock();
    const storage = memoryStorage();
    const lease = leaseOn(storage, clock);
    let offline = false;
    const a = guardOn(browser(), 'laptop', lease, clock, undefined, {
      lease: async (p, action) => {
        if (offline) throw new BowerError('offline', "You're offline.");
        return lease.session(p, action);
      },
    });
    await a.start();
    offline = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await clock.advance(LEASE_TTL_MS + HEARTBEAT_MS);
    // The Worker still knows this place's epoch: nobody took the lease.
    expect(lease.holds('laptop', 1)).toBe(true);
    offline = false;
    await a.verify(true);
    expect(a.state()).toBe('active');
    expect(a.epoch()).toBe(1);
    expect(lease.read()).toEqual({ holder: 'laptop', epoch: 1, beatAt: clock.t });
  });

  it('a page restored from the back/forward cache reloads', async () => {
    const w = await world();
    const reload = vi.fn();
    const a = page(w, 'laptop', browser(), undefined, { reload });
    await a.place.start();
    await drain();
    const asked = vi.spyOn(a.worker, 'session');
    // A page's first show is not a restore: nothing happens.
    a.target.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    a.target.dispatchEvent(new Event('pagehide'));
    await drain();
    a.target.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    await drain();
    expect(reload).toHaveBeenCalledTimes(1);
    // The restored page joins nothing and writes nothing with what it held: the reload starts it afresh.
    expect(asked.mock.calls.map(([, action]) => action)).toEqual(['leave']);
    expect(a.place.state()).toBe('starting');
    expect(a.place.epoch()).toBeNull();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(a.live.vault.flushJournal()).rejects.toBeInstanceOf(BowerError);

    // The demo's place (no Worker) reacts the same way.
    const demoReload = vi.fn();
    const target = new EventTarget();
    const demo = localPlace({ world: 'demo', person: PERSON, place: 'demo-tab', storage: w.storage, now: w.clock.now, clock: w.clock, target, reload: demoReload });
    guards.push(demo);
    await demo.start();
    target.dispatchEvent(new Event('pagehide'));
    target.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    await drain();
    expect(demoReload).toHaveBeenCalledTimes(1);
    expect(demo.state()).toBe('starting');
  });

  it('a resumed upload checks the lease before its first chunk', async () => {
    const clock = new TestClock();
    const lease = leaseOn(memoryStorage(), clock);
    const calls = vi.spyOn(lease, 'session');
    const a = guardOn(browser(), 'laptop', lease, clock);
    await a.start();
    calls.mockClear();
    const drive = { putChunk: async (_session: string) => ({}) };
    const fenced = fenceDrive(drive, a);
    await fenced.putChunk('session-1');
    expect(calls).toHaveBeenCalledTimes(1);
    await fenced.putChunk('session-1');
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('a change made while lines wait in the outbox checks the lease before sending them', async () => {
    const w = await world();
    const a = page(w, 'laptop', browser());
    await a.place.start();
    await drain();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fail = vi.spyOn(w.drive, 'createText').mockRejectedValueOnce(driveError('offline'));
    await a.live.vault.addRequest('First, kept on this device');
    fail.mockRestore();
    await leaseOn(w.storage, w.clock).session('phone', 'take');
    const before = await w.drive.snapshot();
    await a.live.vault.addRequest('Second, within five seconds');
    await drain();
    expect(a.place.state()).toBe('elsewhere');
    expect(await w.drive.snapshot()).toBe(before);
    expect(outboxOf(w.root)).toContain('First, kept on this device');
  });

  it('flushJournal always checks the lease afresh', async () => {
    const w = await world();
    const a = page(w, 'laptop', browser());
    await a.place.start();
    await drain();
    const beat = vi.spyOn(a.worker, 'session');
    await a.live.vault.flushJournal();
    expect(beat).toHaveBeenCalledWith('laptop', 'check', 0);
  });

  it('a Worker refusal blocks the place at once, and is told apart from other conflicts', async () => {
    const w = await world();
    const lease = leaseOn(w.storage, w.clock);
    const worker = new FakeWorker({ drive: w.drive, runs: new FakeRunService({ drive: w.drive, scale: 'instant' }), rootId: w.root, scenario: 'empty', lease });
    const g = guardOn(browser(), 'laptop', lease, w.clock, undefined, { lease: (p, action) => worker.session(p, action) });
    await g.start();
    const fenced = fenceWorker(worker, g);
    await leaseOn(w.storage, w.clock).session('phone', 'take');
    const refusal = await fenced.createFolder().then(
      () => null,
      (e: unknown) => e,
    );
    expect(isOpenElsewhere(refusal)).toBe(true);
    expect(g.state()).toBe('elsewhere');
    expect(isOpenElsewhere(new BowerError('conflict', OPEN_ELSEWHERE_TEXT))).toBe(false);
  });

  it('a place disposed while it starts never becomes active', async () => {
    const clock = new TestClock();
    let answer!: (r: { active: boolean; epoch: number }) => void;
    const onActive = vi.fn();
    const g = guardOn(browser(), 'laptop', leaseOn(memoryStorage(), clock), clock, undefined, {
      onActive,
      lease: () =>
        new Promise((r) => {
          answer = r;
        }),
    });
    const started = g.start().catch((e: unknown) => e);
    await drain();
    g.dispose();
    answer({ active: true, epoch: 1 });
    await started;
    expect(g.state()).not.toBe('active');
    expect(onActive).not.toHaveBeenCalled();
  });

  it('a reset starts afresh while an old lease answer is pending, and the old start clears only itself', async () => {
    const clock = new TestClock();
    const lease = leaseOn(memoryStorage(), clock);
    let answerOld!: (r: { active: boolean; epoch: number }) => void;
    let answerNew!: (r: { active: boolean; epoch: number }) => void;
    const oldAnswer = new Promise<{ active: boolean; epoch: number }>((r) => { answerOld = r; });
    const newAnswer = new Promise<{ active: boolean; epoch: number }>((r) => { answerNew = r; });
    const calls = vi.spyOn(lease, 'session').mockReturnValueOnce(oldAnswer).mockReturnValueOnce(newAnswer);
    const onActive = vi.fn();
    const g = guardOn(browser(), 'laptop', lease, clock, undefined, { onActive });
    const oldStart = g.start();
    await drain();
    expect(calls).toHaveBeenCalledTimes(1);
    g.reset();
    const newStart = g.start();
    await drain();
    answerOld({ active: true, epoch: 99 });
    expect(await oldStart).toBe('starting');
    expect(g.epoch()).toBeNull();
    expect(onActive).not.toHaveBeenCalled();
    const drive = { updateText: vi.fn(async () => undefined) };
    const written = fenceDrive(drive, g).updateText().catch((e: unknown) => e);
    await drain();
    expect(drive.updateText).not.toHaveBeenCalled();
    expect.soft(g.start()).toBe(newStart);
    answerNew({ active: true, epoch: 2 });
    expect.soft(await newStart).toBe('active');
    expect(await written).toBeUndefined();
    expect(calls).toHaveBeenCalledTimes(2);
    expect(g.epoch()).toBe(2);
    expect(onActive).toHaveBeenCalledExactlyOnceWith('start');
    expect(drive.updateText).toHaveBeenCalledTimes(1);
  });

  it('a stale start logs a non-offline lease failure without releasing the newer active lock or heartbeat', async () => {
    const clock = new TestClock();
    const hub = browser();
    const lease = leaseOn(memoryStorage(), clock);
    let rejectOld!: (e: unknown) => void;
    const oldAnswer = new Promise<{ active: boolean; epoch: number }>((_, reject) => { rejectOld = reject; });
    const calls = vi.spyOn(lease, 'session').mockReturnValueOnce(oldAnswer);
    const onActive = vi.fn();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const g = guardOn(hub, 'laptop', lease, clock, undefined, { onActive });
    const oldStart = g.start().catch((e: unknown) => e);
    await drain();
    expect(calls).toHaveBeenCalledTimes(1);
    g.reset();
    const newStart = g.start().catch((e: unknown) => e);
    await drain();
    expect.soft(g.state()).toBe('active');
    const failure = new BowerError('unknown', 'lease check failed');
    rejectOld(failure);
    expect.soft(await oldStart).toBe('active');
    expect(await newStart).toBe('active');
    expect(logged).toHaveBeenCalledExactlyOnceWith(failure);
    expect(g.epoch()).toBe(1);
    expect(hub.holds(`bower-place:${WORLD}:${PERSON}`)).toBe(true);
    expect(onActive).toHaveBeenCalledExactlyOnceWith('start');
    const before = calls.mock.calls.length;
    await clock.advance(HEARTBEAT_MS);
    expect(calls).toHaveBeenCalledTimes(before + 1);
    expect(lease.read().beatAt).toBe(clock.t);
    expect(g.state()).toBe('active');
    expect(hub.holds(`bower-place:${WORLD}:${PERSON}`)).toBe(true);
  });

  it('concurrent starts and a waiting write share one start attempt without a reset', async () => {
    const clock = new TestClock();
    const lease = leaseOn(memoryStorage(), clock);
    let answer!: (r: { active: boolean; epoch: number }) => void;
    const pending = new Promise<{ active: boolean; epoch: number }>((r) => { answer = r; });
    const calls = vi.spyOn(lease, 'session').mockReturnValueOnce(pending);
    const scope = vi.fn(async () => `${WORLD}:${PERSON}`);
    const onActive = vi.fn();
    const g = guardOn(browser(), 'laptop', lease, clock, undefined, { scope, onActive });
    const first = g.start();
    const second = g.start();
    expect(second).toBe(first);
    const drive = { updateText: vi.fn(async () => undefined) };
    const written = fenceDrive(drive, g).updateText();
    await drain();
    expect(scope).toHaveBeenCalledTimes(1);
    expect(calls).toHaveBeenCalledTimes(1);
    expect(drive.updateText).not.toHaveBeenCalled();
    answer({ active: true, epoch: 1 });
    expect(await first).toBe('active');
    expect(await second).toBe('active');
    await written;
    expect(calls).toHaveBeenCalledTimes(1);
    expect(onActive).toHaveBeenCalledExactlyOnceWith('start');
    expect(drive.updateText).toHaveBeenCalledTimes(1);
  });

  it('a fresh start propagates a non-offline lease failure and releases its lock without activating', async () => {
    const clock = new TestClock();
    const hub = browser();
    const lease = leaseOn(memoryStorage(), clock);
    let reject!: (e: unknown) => void;
    const pending = new Promise<{ active: boolean; epoch: number }>((_, r) => { reject = r; });
    vi.spyOn(lease, 'session').mockReturnValueOnce(pending);
    const onActive = vi.fn();
    const g = guardOn(hub, 'laptop', lease, clock, undefined, { onActive });
    const started = g.start();
    await drain();
    expect(hub.holds(`bower-place:${WORLD}:${PERSON}`)).toBe(true);
    const failure = new BowerError('unknown', 'lease check failed');
    const rejected = expect(started).rejects.toBe(failure);
    reject(failure);
    await rejected;
    await drain();
    expect(g.state()).toBe('starting');
    expect(g.epoch()).toBeNull();
    expect(onActive).not.toHaveBeenCalled();
    expect(hub.holds(`bower-place:${WORLD}:${PERSON}`)).toBe(false);
  });

  it('signing out lets the lease go; a failed sign-out keeps an active place active and a blocked place blocked', async () => {
    const w = await world();
    const hub = browser();
    const a = page(w, 'tab-a', hub);
    await a.place.start();
    const b = page(w, 'tab-b', hub);
    await b.place.start();
    await b.place.useHere();
    await drain();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(a.worker, 'signOut').mockRejectedValueOnce(new BowerError('offline', "You're offline."));
    await expect(a.live.session.signOut()).rejects.toMatchObject({ code: 'offline' });
    await drain();
    expect(a.place.state()).toBe('elsewhere');
    expect(leaseOn(w.storage, w.clock).read().holder).toBe('tab-b');
    vi.spyOn(b.worker, 'signOut').mockRejectedValueOnce(new BowerError('offline', "You're offline."));
    await expect(b.live.session.signOut()).rejects.toMatchObject({ code: 'offline' });
    await drain();
    expect(b.place.state()).toBe('active');
    expect(leaseOn(w.storage, w.clock).read().holder).toBe('tab-b');
    await b.live.session.signOut();
    await drain();
    expect(b.place.state()).toBe('starting');
    expect(leaseOn(w.storage, w.clock).read().holder).toBeNull();
  });

  it('a failed sign-out never shows another state, not even for a moment', async () => {
    const w = await world();
    const a = page(w, 'laptop', browser());
    await a.place.start();
    await drain();
    const seen: string[] = [];
    a.place.subscribe(() => seen.push(a.place.state()));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(a.worker, 'signOut').mockRejectedValueOnce(new BowerError('offline', "You're offline."));
    await expect(a.live.session.signOut()).rejects.toMatchObject({ code: 'offline' });
    // Settled with the rejection itself: nothing left to happen later.
    expect(a.place.state()).toBe('active');
    expect(seen).not.toContain('starting');
    expect(leaseOn(w.storage, w.clock).read().holder).toBe('laptop');
    await expect(a.place.verify(true)).resolves.toBeUndefined();
    await a.live.session.signOut();
    expect(a.place.state()).toBe('starting');
    expect(leaseOn(w.storage, w.clock).read().holder).toBeNull();
  });

  it('a failed sign-out asks the lease afresh, never trusting a check that began before it let go', async () => {
    const w = await world();
    const a = page(w, 'laptop', browser());
    await a.place.start();
    await drain();
    const order: string[] = [];
    const real = a.worker.session.bind(a.worker);
    let hold: ((r: { active: boolean; epoch: number }) => void) | null = null;
    vi.spyOn(a.worker, 'session').mockImplementation(async (p, action) => {
      order.push(action);
      if (action === 'check' && !hold && order.length === 1) return new Promise((r) => (hold = r));
      return real(p, action);
    });
    // A heartbeat check starts and is slow to answer.
    await w.clock.advance(HEARTBEAT_MS);
    expect(order).toEqual(['check']);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(a.worker, 'signOut').mockImplementationOnce(async () => {
      // Its stale answer (from before the lease was let go) arrives only after the failure.
      setTimeout(() => hold?.({ active: true, epoch: 1 }), 5);
      throw new BowerError('offline', "You're offline.");
    });
    await expect(a.live.session.signOut()).rejects.toMatchObject({ code: 'offline' });
    expect(order.slice(order.indexOf('leave'))).toEqual(['leave', 'check']);
    expect(a.place.state()).toBe('active');
  });

  it('a failed sign-out keeps the same epoch when nobody took the lease, and reads everything again when someone did', async () => {
    const w = await world();
    const a = page(w, 'laptop', browser());
    await a.place.start();
    await drain();
    const first = a.place.epoch();
    const refresh = vi.spyOn(a.live.vault, 'refresh');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(a.worker, 'signOut').mockRejectedValueOnce(new BowerError('offline', "You're offline."));
    await expect(a.live.session.signOut()).rejects.toMatchObject({ code: 'offline' });
    expect(a.place.state()).toBe('active');
    expect(a.place.epoch()).toBe(first);
    expect(refresh).not.toHaveBeenCalled();
    vi.spyOn(a.worker, 'signOut').mockImplementationOnce(async () => {
      // Meanwhile the phone took the lease and let it go again.
      await leaseOn(w.storage, w.clock).session('phone', 'take');
      await leaseOn(w.storage, w.clock).session('phone', 'leave');
      throw new BowerError('offline', "You're offline.");
    });
    await expect(a.live.session.signOut()).rejects.toMatchObject({ code: 'offline' });
    expect(a.place.state()).toBe('active');
    expect(a.place.epoch()).not.toBe(first);
    expect(refresh).toHaveBeenCalled();
  });

  it.each(['succeeds', 'fails'] as const)('a heartbeat check that began before a sign-out that %s is ignored when it answers', async (outcome) => {
    const w = await world();
    const a = page(w, 'laptop', browser());
    await a.place.start();
    await drain();
    const first = a.place.epoch() ?? 0;
    const real = a.worker.session.bind(a.worker);
    let answer: ((r: { active: boolean; epoch: number }) => void) | null = null;
    vi.spyOn(a.worker, 'session').mockImplementation(async (p, action) => {
      if (action === 'check' && answer === null) return new Promise((r) => (answer = r));
      return real(p, action);
    });
    // A heartbeat check starts and is slow to answer.
    await w.clock.advance(HEARTBEAT_MS);
    expect(answer).not.toBeNull();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const told: string[] = [];
    a.place.subscribe(() => told.push(a.place.state()));
    const remembered = (): string[] => Object.keys(sessionStorage).filter((k) => k.startsWith('bower:place-epoch:'));
    const signOut = a.worker.signOut.bind(a.worker);
    // It answers for before (the lease was this place's, at the first epoch) while signing out.
    const late = (): void => void setTimeout(() => answer?.({ active: true, epoch: first }), 0);
    if (outcome === 'succeeds') {
      vi.spyOn(a.worker, 'signOut').mockImplementationOnce(async () => {
        late();
        await new Promise((r) => setTimeout(r, 10));
        return signOut();
      });
      await a.live.session.signOut();
      await drain();
      expect(a.place.state()).toBe('starting');
      expect(a.place.epoch()).toBeNull();
      expect(remembered()).toEqual([]);
      expect(told).not.toContain('elsewhere');
    } else {
      // Someone took the lease and let it go while signing out: the take-back has a new epoch.
      vi.spyOn(a.worker, 'signOut').mockImplementationOnce(async () => {
        await leaseOn(w.storage, w.clock).session('phone', 'take');
        await leaseOn(w.storage, w.clock).session('phone', 'leave');
        late();
        throw new BowerError('offline', "You're offline.");
      });
      await expect(a.live.session.signOut()).rejects.toMatchObject({ code: 'offline' });
      await drain();
      const now = a.place.epoch();
      expect(now).not.toBe(first);
      expect(a.place.state()).toBe('active');
      expect(told).not.toContain('elsewhere');
      expect(leaseOn(w.storage, w.clock).read()).toMatchObject({ holder: 'laptop', epoch: now });
    }
  });

  it('leaving Bower lets the lease go and the place starts again', async () => {
    const w = await world();
    const a = page(w, 'laptop', browser());
    await a.place.start();
    await drain();
    await a.live.session.deleteAccount();
    await drain();
    expect(a.place.state()).toBe('starting');
    expect(leaseOn(w.storage, w.clock).read().holder).toBeNull();
  });

  it('a duplicated tab with the same place id asks first, and Use here there blocks the original', async () => {
    const w = await world();
    const hub = browser();
    const a = page(w, 'tab-a', hub);
    await a.place.start();
    const copy = page(w, 'tab-a', hub);
    expect(await copy.place.start()).toBe('elsewhere');
    await copy.place.useHere();
    await drain();
    expect(copy.place.state()).toBe('active');
    expect(a.place.state()).toBe('elsewhere');
    await expect(a.worker.process('instructions')).rejects.toMatchObject(elsewhere);
  });

  it('Use here reads everything again before uploads resume, and before the outbox goes', async () => {
    const w = await world();
    const log: string[] = [];
    const queue = queueStub(log);
    const a = page(w, 'laptop', browser(), queue);
    await a.place.start();
    await drain();
    await leaseOn(w.storage, w.clock).session('phone', 'take');
    await w.clock.advance(HEARTBEAT_MS);
    await a.live.vault.addRequest('Waits on this device');
    const refresh = a.live.vault.refresh.bind(a.live.vault);
    vi.spyOn(a.live.vault, 'refresh').mockImplementation(async () => {
      log.push('refresh');
      return refresh();
    });
    const write = w.drive.createText.bind(w.drive);
    vi.spyOn(w.drive, 'createText').mockImplementation(async (...args) => {
      log.push('outbox');
      return write(...args);
    });
    log.length = 0;
    await a.place.useHere();
    await drain();
    expect(log.slice(0, 3)).toEqual(['refresh', 'uploads', 'outbox']);
  });

  it('a declared pile writes nothing from a blocked place', async () => {
    const w = await world();
    const hub = browser();
    const a = page(w, 'tab-a', hub, undefined, { declarePiles: true });
    await a.place.start();
    await a.live.vault.tree();
    const b = page(w, 'tab-b', hub);
    await b.place.start();
    await b.place.useHere();
    await drain();
    const before = await w.drive.snapshot();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(a.live.vault.addPile({ text: 'About the made-up trip', items: [{ name: 'ticket.pdf', kind: 'pdf', origin: 'Added here', body: body() }] })).rejects.toMatchObject(elsewhere);
    await drain();
    expect(await w.drive.snapshot()).toBe(before);
  });

  it('a tidy-up keeps going for the person while the place that asked for it is blocked', async () => {
    const w = await world();
    const a = page(w, 'laptop', browser());
    await a.place.start();
    await drain();
    await a.live.vault.rename('Synthetic.md', 'Renamed');
    const run = await a.live.runs.start('instructions');
    await leaseOn(w.storage, w.clock).session('phone', 'take');
    await w.clock.advance(HEARTBEAT_MS);
    expect(a.place.state()).toBe('elsewhere');
    for (let i = 0; i < 200 && ((await a.worker.status()).run)?.phase !== 'done'; i++) await new Promise((r) => setTimeout(r, 1));
    expect((await a.worker.status()).run).toMatchObject({ id: run.id, phase: 'done' });
  });
});

describe('delta review: every thing added here waits for Use here', () => {
  const failedRows = async (live: LiveSources): Promise<number> => (await live.vault.piles()).flatMap((p) => p.items).filter((i) => i.upload === -1).length;
  const added = async (w: World, name: string): Promise<number> => (await w.drive.listAll(w.root)).filter((f) => !f.folder && f.appProperties?.asAdded === name).length;

  it.each([
    ['a pasted link', { name: 'https://example.com/made-up', kind: 'link' as const, origin: 'Pasted here', url: 'https://example.com/made-up' }],
    ['an empty note', { name: 'Made-up note', kind: 'note' as const, origin: 'Written here' }],
  ])('%s added while another place took over waits, is said to be only here, and goes once after Use here', async (_label, item) => {
    for (const queued of [false, true]) {
      localStorage.clear();
      const w = await world();
      const queue = queued ? createUploadQueue({ drive: w.drive, store: indexedDbUploadStore(new IDBFactory()) }) : undefined;
      const a = page(w, 'laptop', browser(), queue);
      await a.place.start();
      await drain();
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await leaseOn(w.storage, w.clock).session('phone', 'take');
      await w.clock.advance(TRUST_MS + 1);
      await a.live.vault.addPile({ text: '', items: [item] });
      await drain();
      expect(a.place.state()).toBe('elsewhere');
      expect(await added(w, item.name)).toBe(0);
      expect(await failedRows(a.live)).toBe(0);
      expect(a.place.pageOnly()).toBe(true);
      await a.place.useHere();
      await vi.waitFor(async () => expect(await added(w, item.name)).toBe(1));
      await drain();
      expect(await added(w, item.name)).toBe(1);
      expect(await failedRows(a.live)).toBe(0);
      expect(a.place.pageOnly()).toBe(false);
    }
  });

  it('a plain reload after pagehide that cannot reach the Worker at first is not blocked', async () => {
    const clock = new TestClock();
    const storage = memoryStorage();
    const memory = memoryStorage();
    const lease = leaseOn(storage, clock);
    const target = new EventTarget();
    const first = guardOn(browser(), 'laptop', lease, clock, undefined, { memory, target });
    expect(await first.start()).toBe('active');
    target.dispatchEvent(new Event('pagehide'));
    await drain();
    first.dispose();
    expect(lease.read().holder).toBeNull();
    let offline = true;
    const reloaded = guardOn(browser(), 'laptop', lease, clock, undefined, {
      memory,
      lease: async (p, action) => {
        if (offline) throw new BowerError('offline', "You're offline.");
        return lease.session(p, action);
      },
    });
    expect(await reloaded.start()).toBe('active');
    offline = false;
    await reloaded.verify(true);
    expect(reloaded.state()).toBe('active');
  });
});

describe('final delta: a file sent straight checks the lease afresh', () => {
  it('an upload asks the lease right before it starts, even within 5 s of the last check', async () => {
    const w = await world();
    const a = page(w, 'laptop', browser());
    await a.place.start();
    await drain();
    await a.place.verify(true);
    const order: string[] = [];
    const check = a.worker.session.bind(a.worker);
    vi.spyOn(a.worker, 'session').mockImplementation(async (p, action) => {
      order.push(action);
      return check(p, action);
    });
    const open = w.drive.openResumable.bind(w.drive);
    vi.spyOn(w.drive, 'openResumable').mockImplementation(async (...args) => {
      order.push('upload');
      return open(...args);
    });
    await a.live.vault.addPile({ text: '', items: [{ name: 'fresh.pdf', kind: 'pdf', origin: 'Added here', body: new Blob([new Uint8Array([1])], { type: 'application/pdf' }) }] });
    await vi.waitFor(() => expect(order).toContain('upload'));
    expect(order.slice(order.indexOf('upload') - 1, order.indexOf('upload') + 1)).toEqual(['check', 'upload']);
  });
});

describe('one way to let the lease go (qa-25)', () => {
  /** The holder of the one lease this browser keeps for the source's world. */
  const holder = (): string | null => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('bower:lease:'));
    const text = key ? localStorage.getItem(key) : null;
    return text ? (JSON.parse(text) as { holder: string | null }).holder : null;
  };
  /** A tab of this browser on the source, as the app builds it; the next one is another tab. */
  async function tab(kind: SourceKind): Promise<{ sources: Sources; place: PlaceGuard; world?: DemoWorld; close(): void }> {
    sessionStorage.removeItem('bower:place');
    const built = await buildSources(kind, 'default', 'instant');
    const place = built.sources.place as PlaceGuard;
    const close = (): void => {
      const s = built.sources as Sources & { dispose?: () => void };
      if (s.dispose) s.dispose();
      else place.dispose();
    };
    return { sources: built.sources, place, ...(built.world ? { world: built.world } : {}), close };
  }
  /** The next sign-out of this tab fails as offline: the demo's world, or the pretend Worker. */
  function failNextSignOut(t: { world?: DemoWorld }): void {
    const offline = new BowerError('offline', "You're offline.");
    if (t.world) vi.spyOn(t.world as unknown as { wait(fn: () => unknown): Promise<unknown> }, 'wait').mockRejectedValueOnce(offline);
    else vi.spyOn(FakeWorker.prototype, 'signOut').mockRejectedValueOnce(offline);
  }

  it.each(['demo', 'fake'] as const)('every source lets the lease go the same way (%s)', async (kind) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const a = await tab(kind);
    const b = await tab(kind);
    try {
      expect(await a.place.start()).toBe('active');
      const first = a.place.epoch();
      const seen: string[] = [];
      a.place.subscribe(() => seen.push(a.place.state()));

      // A failed sign-out from the active place: it stays active with its lease, not even for a moment otherwise.
      failNextSignOut(a);
      await expect(a.sources.session.signOut()).rejects.toMatchObject({ code: 'offline' });
      expect(a.place.state()).toBe('active');
      expect(seen).not.toContain('starting');
      expect(holder()).toBe(a.place.place);
      expect(a.place.epoch()).toBe(first);

      // A failed sign-out from a blocked place: it stays blocked, and the lease stays where it is.
      expect(await b.place.start()).toBe('elsewhere');
      await b.place.useHere();
      await vi.waitFor(() => expect(a.place.state()).toBe('elsewhere'));
      failNextSignOut(a);
      await expect(a.sources.session.signOut()).rejects.toMatchObject({ code: 'offline' });
      expect(a.place.state()).toBe('elsewhere');
      expect(holder()).toBe(b.place.place);

      // Signing out lets the lease go: the place starts again with the next sign-in.
      await b.sources.session.signOut();
      expect(b.place.state()).toBe('starting');
      expect(holder()).toBeNull();

      // Leaving Bower lets it go too, once the account is gone.
      await a.place.useHere();
      expect(a.place.state()).toBe('active');
      await a.sources.session.deleteAccount();
      expect(a.place.state()).toBe('starting');
      expect(holder()).toBeNull();
    } finally {
      a.close();
      b.close();
    }
  });
});

describe('the leave generation (TL-P3-14)', () => {
  it("the fake discards a check started before the place's latest leave", async () => {
    const storage = memoryStorage();
    const clock = new TestClock();
    const lease = leaseOn(storage, clock);
    expect(await lease.session('laptop', 'check', 0)).toEqual({ active: true, epoch: 1 });
    expect(await lease.session('laptop', 'leave', 1)).toEqual({ active: false, epoch: 1 });
    // A check sent before that leave arrives late: it grants and renews nothing.
    expect(await lease.session('laptop', 'check', 0)).toEqual({ active: false, epoch: 1 });
    // A missing gen counts as 0: discarded too.
    expect(await lease.session('laptop', 'check')).toEqual({ active: false, epoch: 1 });
    expect(lease.holds('laptop', 1)).toBe(false);
    expect(await lease.session('phone', 'check', 0)).toEqual({ active: true, epoch: 2 });
    expect(await lease.session('laptop', 'check', 0)).toEqual({ active: false, epoch: 2 });
    // The holder leaves: a check begun before its leave is discarded, one after takes it back with the same epoch.
    expect(await lease.session('phone', 'leave', 3)).toEqual({ active: false, epoch: 2 });
    expect(await lease.session('phone', 'check', 2)).toEqual({ active: false, epoch: 2 });
    expect(await lease.session('phone', 'check', 3)).toEqual({ active: true, epoch: 2 });
    // An older leave arriving late never lowers the generation.
    expect(await lease.session('laptop', 'leave', 0)).toEqual({ active: false, epoch: 2 });
    expect(await lease.session('laptop', 'check', 0)).toEqual({ active: false, epoch: 2 });

    // The pretend Worker passes the generation on.
    const w = await world();
    const worker = new FakeWorker({ drive: w.drive, runs: new FakeRunService({ drive: w.drive, scale: 'instant' }), rootId: w.root, scenario: 'empty', lease: leaseOn(w.storage, w.clock) });
    expect(await worker.session('tab-a', 'check', 0)).toEqual({ active: true, epoch: 1 });
    expect(await worker.session('tab-a', 'leave', 1)).toEqual({ active: false, epoch: 1 });
    expect(await worker.session('tab-a', 'check', 0)).toEqual({ active: false, epoch: 1 });
    expect(await worker.session('tab-a', 'check', 1)).toEqual({ active: true, epoch: 1 });
  });

  it('a place sends its leave generation on every check and leave, and keeps it across a reload', async () => {
    const w = await world();
    const memory = memoryStorage();
    const sent: { action: string; gen: number | undefined }[] = [];
    const lease = leaseOn(w.storage, w.clock);
    const open = (): PlaceGuard =>
      guardOn(browser(), 'laptop', lease, w.clock, undefined, {
        memory,
        lease: (p, action, gen) => {
          sent.push({ action, gen });
          return lease.session(p, action, gen);
        },
      });
    const first = open();
    expect(await first.start()).toBe('active');
    await first.leave();
    expect(sent).toEqual([{ action: 'check', gen: 0 }, { action: 'leave', gen: 1 }]);
    first.dispose();
    // The page reloads after its leave on pagehide: the same place starts again and is heard.
    const again = open();
    expect(await again.start()).toBe('active');
    expect(again.epoch()).toBe(1);
    expect(sent.at(-1)).toEqual({ action: 'check', gen: 1 });
  });
});
