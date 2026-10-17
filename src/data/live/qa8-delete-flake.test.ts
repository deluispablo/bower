import { afterEach, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { FakeLease, leaseKey } from '../fake/fake-lease';
import { FakeRunService } from '../fake/fake-run-service';
import { FakeWorker } from '../fake/fake-worker';
import type { PlaceGuard } from '../session';
import type { QueueRole, UploadQueue } from '../upload-queue';
import { makeLiveSources, type LiveSources } from './index';

// qa8: leaving Bower lets this place's lease go before the device forgets the person, exactly once.

const opened: LiveSources[] = [];
afterEach(() => {
  for (const s of opened.splice(0)) s.dispose();
  vi.restoreAllMocks();
});

function barrier() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => { open = resolve; });
  return { promise, open };
}

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const kept = new Map<string, string>();
  return { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => void kept.set(k, v), removeItem: (k) => void kept.delete(k) };
}

/** A queue whose forgetAccount waits on a barrier: the device is still forgetting the person. */
function heldQueue(entered: () => void, release: Promise<void>): UploadQueue {
  let role: QueueRole = 'idle';
  return {
    start: async () => (role = 'owner'),
    add: async () => { throw new Error('not used'); },
    items: () => [],
    role: () => role,
    subscribe: () => () => undefined,
    hasUnfinished: () => false,
    retry: () => undefined,
    idle: async () => undefined,
    discard: async () => undefined,
    halt: async () => null,
    resume: () => undefined,
    forgetAccount: async () => { entered(); await release; },
    stop: () => { role = 'idle'; },
    pause: () => { role = 'idle'; },
    onlyHere: () => 0,
    notice: () => null,
    persistence: () => 'unknown',
  };
}

async function setUp() {
  const drive = new FakeDrive();
  const root = await drive.createFolder('root', 'Bower');
  for (const name of ['Inbox', 'Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(root.id, name);
  await drive.createFolder((await drive.createFolder(root.id, '.bower')).id, 'changes');
  const lease = new FakeLease({ key: leaseKey('fake:empty', 'person-hash'), storage: memoryStorage(), now: () => 1_000_000 });
  const worker = new FakeWorker({ drive, runs: new FakeRunService({ drive, scale: 'instant' }), rootId: root.id, scenario: 'empty', lease });
  const entered = barrier(), release = barrier();
  const live = makeLiveSources({
    drive, worker, uploadQueue: heldQueue(entered.open, release.promise),
    place: { place: 'laptop', clock: { now: () => 1_000_000, every: () => () => undefined }, bus: { post: () => undefined, listen: () => () => undefined }, world: 'fake:empty' },
  });
  opened.push(live);
  const place = live.place as PlaceGuard;
  await live.session.signIn();
  expect(await place.start()).toBe('active');
  return { live, worker, lease, place, entered, release };
}

it('qa8: once the account is deleted and while the device still forgets, the place starts again and asks the server', async () => {
  const { live, worker, place, entered, release } = await setUp();
  const deleting = live.session.deleteAccount();
  try {
    await entered.promise;
    expect(place.state(), 'the claim is released before forgetPerson').toBe('starting');
    const asked = vi.spyOn(worker, 'session');
    await live.session.signIn();
    const starting = place.start();
    release.open();
    await starting;
    expect(asked.mock.calls.map((c) => c[1]), 'a sign-in in the gap asks the server again').toContain('check');
  } finally { release.open(); }
  await deleting;
});

it('qa8: the claim is released exactly once: a sign-in in the gap keeps its lease after forgetting ends', async () => {
  const { live, lease, place, entered, release } = await setUp();
  const leave = vi.spyOn(place, 'leave');
  const deleting = live.session.deleteAccount();
  await entered.promise;
  await live.session.signIn();
  const starting = place.start();
  release.open();
  await deleting;
  await starting;
  expect(place.state()).toBe('active');
  expect(lease.read().holder).toBe(place.place);
  expect(leave, 'one release').toHaveBeenCalledTimes(1);
});
