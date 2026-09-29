import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DURABLE_MAX_BYTES,
  KEEP_OPEN_TEXT,
  createUploadQueue,
  lockName,
} from '../src/upload-queue.js';
import type {
  LocksLike,
  QueueBus,
  ResumableTransport,
  UploadQueue,
  UploadQueueDeps,
} from '../src/upload-queue.js';
import {
  fakeResumableDrive,
  fakeUploadStore,
} from './helpers/fake-resumable-drive.js';
import type {
  FakeDriveOptions,
  FakeResumableDrive,
  FakeUploadStore,
} from './helpers/fake-resumable-drive.js';

vi.mock('../src/drive.js', () => ({
  DRIVE_BASE: 'https://drive.test',
  RESUMABLE_CHUNK_BYTES: 8 * 1024 * 1024,
  getToken: () => Promise.resolve({ accessToken: 'TOKEN' }),
  invalidateToken: () => undefined,
}));

const CHUNK = 256;
const USER = 'USER_A';

// --- A fake of `navigator.locks` shared by the tabs of one test -------------

interface Holder {
  reject: (error: unknown) => void;
}

interface FakeLocks extends LocksLike {
  /** Another party takes the lock: the holder's request rejects. */
  steal: (name: string) => void;
  holder: (name: string) => Holder | undefined;
}

function fakeLocks(): FakeLocks {
  const held = new Map<string, Holder>();
  const waiting = new Map<string, (() => void)[]>();

  function next(name: string): void {
    const queue = waiting.get(name) ?? [];
    const first = queue.shift();
    first?.();
  }

  function grant(
    name: string,
    callback: (lock: unknown) => Promise<void>,
    resolve: () => void,
    reject: (error: unknown) => void,
  ): void {
    const holder: Holder = { reject };
    held.set(name, holder);
    callback({ name }).then(
      () => {
        if (held.get(name) === holder) {
          held.delete(name);
          next(name);
        }
        resolve();
      },
      (error: unknown) => {
        if (held.get(name) === holder) {
          held.delete(name);
          next(name);
        }
        reject(error);
      },
    );
  }

  return {
    request(name, options, callback) {
      return new Promise<void>((resolve, reject) => {
        if (!held.has(name)) {
          grant(name, callback, resolve, reject);
          return;
        }
        if (options.ifAvailable === true) {
          callback(null).then(resolve, reject);
          return;
        }
        const queue = waiting.get(name) ?? [];
        const turn = (): void => grant(name, callback, resolve, reject);
        queue.push(turn);
        waiting.set(name, queue);
        options.signal?.addEventListener('abort', () => {
          const i = queue.indexOf(turn);
          if (i >= 0) queue.splice(i, 1);
          reject(new DOMException('Aborted.', 'AbortError'));
        });
      });
    },
    steal(name) {
      const holder = held.get(name);
      held.delete(name);
      holder?.reject(new DOMException('Lock stolen.', 'AbortError'));
      next(name);
    },
    holder: (name) => held.get(name),
  };
}

function fakeBus(): { tab: () => QueueBus } {
  const listeners: (() => void)[] = [];
  return {
    tab() {
      let own: (() => void) | undefined;
      return {
        post: () => {
          for (const l of listeners) if (l !== own) l();
        },
        listen: (onMessage) => {
          own = onMessage;
          listeners.push(onMessage);
        },
      };
    },
  };
}

/** Records which tab sent each Drive request. */
function tagged(
  transport: ResumableTransport,
  tab: string,
  log: string[],
): ResumableTransport {
  return {
    open: (url, headers, body) => {
      log.push(`${tab} POST`);
      return transport.open(url, headers, body);
    },
    put: (url, headers, body, onProgress, signal) => {
      log.push(`${tab} PUT ${headers['Content-Range'] ?? ''}`);
      return transport.put(url, headers, body, onProgress, signal);
    },
  };
}

interface World {
  drive: FakeResumableDrive;
  store: FakeUploadStore;
  locks: FakeLocks;
  bus: ReturnType<typeof fakeBus>;
  log: string[];
  tab: (name: string, extra?: Partial<UploadQueueDeps>) => UploadQueue;
}

const queues: UploadQueue[] = [];

function world(options: FakeDriveOptions = {}, quotaBytes?: number): World {
  const drive = fakeResumableDrive(options);
  const store = fakeUploadStore({ quotaBytes });
  const locks = fakeLocks();
  const bus = fakeBus();
  const log: string[] = [];
  let ids = 0;
  let clock = 0;
  return {
    drive,
    store,
    locks,
    bus,
    log,
    tab(name, extra = {}) {
      const queue = createUploadQueue({
        store,
        transport: tagged(drive.transport, name, log),
        locks,
        bus: bus.tab(),
        chunkSize: CHUNK,
        newId: () => {
          ids += 1;
          return `up-${ids}`;
        },
        now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, (clock += 1))),
        ...extra,
      });
      queues.push(queue);
      return queue;
    },
  };
}

function file(size: number, name = 'photo.jpg') {
  return {
    blob: new Blob([new Uint8Array(size)], { type: 'image/jpeg' }),
    name,
    pileId: 'pile-1',
    parentId: 'FOLDER_ID',
  };
}

async function settle(...tabs: UploadQueue[]): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((r) => setTimeout(r, 0));
    for (const t of tabs) await t.idle();
  }
}

afterEach(() => {
  for (const q of queues.splice(0)) q.stop();
  vi.restoreAllMocks();
});

describe('the queue (R-UPL-7, R-UPL-8)', () => {
  it('keeps a copy until Drive confirms it, then drops it', async () => {
    const w = world();
    const a = w.tab('A');
    expect(await a.start(USER)).toBe('owner');

    const added = await a.add(file(300));
    expect(added.durable).toBe(true);
    expect(w.store.records.size).toBe(1);

    await settle(a);

    expect(a.items()[0]).toMatchObject({ state: 'done', sent: 300 });
    expect(a.items()[0]?.fileId).toBe(w.drive.files[0]?.id);
    expect(w.store.records.size).toBe(0);
    expect(a.hasUnfinished()).toBe(false);
  });

  it('finishes a file left from last time without picking it again', async () => {
    const w = world({
      acceptPerChunk: 100,
      beforeChunk: (request) => {
        // Closing the app while the second chunk is on its way.
        if (request.contentRange?.startsWith('bytes 100-') === true) {
          first.stop();
        }
      },
    });
    const first = w.tab('A');
    await first.start(USER);
    await first.add(file(300));
    await settle(first);
    const saved = [...w.store.records.values()][0];
    expect(saved?.session).not.toBeNull();
    expect(saved?.confirmed).toBe(100);

    w.log.length = 0;
    const next = w.tab('B');
    await next.start(USER);
    await settle(next);

    expect(w.log[0]).toMatch(/^B PUT bytes \*\/300$/);
    expect(w.log).not.toContain('B POST');
    expect(next.items()[0]?.state).toBe('done');
    expect(w.drive.files).toHaveLength(1);
    expect(w.store.records.size).toBe(0);
  });

  it('keeps each user apart and clears only the one asked', async () => {
    const w = world();
    const a = w.tab('A');
    await a.start('USER_1');
    a.stop();
    await w.store.put({
      id: 'x',
      userId: 'USER_2',
      pileId: 'pile-1',
      parentId: 'FOLDER_ID',
      name: 'other.jpg',
      type: 'image/jpeg',
      size: 3,
      blob: new Blob(['abc']),
      session: null,
      confirmed: 0,
      addedAt: '2026-01-01T00:00:00.000Z',
    });

    const b = w.tab('B', { transport: fakeResumableDrive().transport });
    await b.start('USER_1');
    expect(b.items()).toEqual([]);
    expect(w.locks.holder(lockName('USER_1'))).toBeDefined();
    expect(w.locks.holder(lockName('USER_2'))).toBeUndefined();

    await b.clear('USER_1');

    expect(w.store.records.size).toBe(1);
    expect(b.role()).toBe('idle');
    expect(w.locks.holder(lockName('USER_1'))).toBeUndefined();

    await b.clear();
    expect(w.store.records.size).toBe(0);
  });

  it('clearing stops the file in flight and forgets it', async () => {
    let clearing: Promise<void> | undefined;
    const w = world({
      beforeChunk: () => {
        clearing ??= a.clear(USER);
      },
    });
    const a = w.tab('A');
    await a.start(USER);
    await a.add(file(600));
    await settle(a);
    await clearing;

    expect(a.items()).toEqual([]);
    expect(w.store.records.size).toBe(0);
    expect(w.log.filter((l) => l.startsWith('A PUT'))).toHaveLength(1);
  });
});

describe('names (R-UPL-6)', () => {
  it('reserves a name against the inbox listing and the queue', async () => {
    const w = world();
    const a = w.tab('A');
    await a.start(USER);
    a.stop();
    const b = w.tab('B', { transport: fakeResumableDrive().transport });
    await b.start(USER);
    await b.add(file(3, 'photo.jpg'));

    expect(b.reserveName('FOLDER_ID', 'photo.jpg', ['photo (2).jpg'])).toBe(
      'photo (3).jpg',
    );
    // Two files with one name never share it, even without a reservation.
    const second = await b.add(file(3, 'photo.jpg'));
    expect(second.name).toBe('photo (2).jpg');
    expect(b.queuedNames('FOLDER_ID')).toEqual(['photo.jpg', 'photo (2).jpg']);
  });
});

describe('one tab at a time (R-UPL-7)', () => {
  it('a tab without the lock sends nothing and leaves the file to the owner', async () => {
    const w = world();
    const a = w.tab('A');
    const b = w.tab('B');
    expect(await a.start(USER)).toBe('owner');
    expect(await b.start(USER)).toBe('other-tab');

    await b.add(file(300));
    await settle(a, b);

    expect(w.log.some((l) => l.startsWith('B '))).toBe(false);
    expect(w.log.some((l) => l.startsWith('A '))).toBe(true);
    expect(w.drive.files).toHaveLength(1);
    expect(b.items()[0]?.state).toBe('done');
  });

  it('the tab that loses the lock stops and the other tab finishes the file', async () => {
    const w = world({
      beforeChunk: (request) => {
        if (request.contentRange === 'bytes 256-511/900') {
          w.locks.steal(lockName(USER));
        }
      },
    });
    const a = w.tab('A');
    const b = w.tab('B');
    await a.start(USER);
    await b.start(USER);
    await a.add(file(900));
    await settle(a, b);

    const aPuts = w.log.filter((l) => l.startsWith('A PUT'));
    expect(aPuts).toEqual(['A PUT bytes 0-255/900', 'A PUT bytes 256-511/900']);
    expect(a.role()).toBe('other-tab');
    expect(b.role()).toBe('owner');
    expect(w.log.some((l) => l.startsWith('B PUT'))).toBe(true);
    expect(w.log).not.toContain('B POST');
    expect(w.drive.files).toHaveLength(1);
    expect(w.drive.files[0]?.size).toBe(900);
    expect(w.store.records.size).toBe(0);
  });
});

describe('storage (R-UPL-9)', () => {
  it('falls back to keep-open when the copy hits QuotaExceededError', async () => {
    const w = world({}, 100);
    const a = w.tab('A');
    await a.start(USER);

    const added = await a.add(file(300));

    expect(added).toMatchObject({ durable: false, note: KEEP_OPEN_TEXT });
    expect(KEEP_OPEN_TEXT).toBe('Keep Bower open until this one is in.');
    expect(w.store.records.size).toBe(0);
    await settle(a);
    expect(a.items()[0]?.state).toBe('done');
  });

  it('keeps no copy of a file over 200 MB or over the space offered', async () => {
    const w = world();
    const persist = vi.fn(() => Promise.resolve(true));
    const a = w.tab('A', {
      storage: {
        persist,
        estimate: () => Promise.resolve({ quota: 1000, usage: 900 }),
      },
    });
    await a.start(USER);
    w.drive.failNext(403);
    w.drive.failNext(403);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const big = {
      size: DURABLE_MAX_BYTES + 1,
      type: 'video/mp4',
      slice: () => new Blob(['x']),
    } as unknown as Blob;
    const huge = await a.add({ ...file(0), blob: big, name: 'film.mp4' });
    const over = await a.add(file(200));

    expect(huge).toMatchObject({ durable: false, note: KEEP_OPEN_TEXT });
    expect(over).toMatchObject({ durable: false, note: KEEP_OPEN_TEXT });
    expect(w.store.records.size).toBe(0);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('a file with no copy still uploads in a tab without the lock', async () => {
    const w = world({}, 0);
    const a = w.tab('A');
    const b = w.tab('B');
    await a.start(USER);
    await b.start(USER);

    await b.add(file(3));
    await settle(a, b);

    expect(w.log.some((l) => l.startsWith('B '))).toBe(true);
    expect(b.items()[0]?.state).toBe('done');
  });
});

describe('unfinished files', () => {
  it('does not count a file Drive refused', async () => {
    const w = world();
    const a = w.tab('A');
    await a.start(USER);
    w.drive.failNext(403);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await a.add(file(3));
    await settle(a);
    expect(a.items()[0]?.state).toBe('failed');
    expect(a.hasUnfinished()).toBe(false);
  });
});

describe('offline', () => {
  it('waits for a connection and tries again on retry', async () => {
    const w = world();
    const a = w.tab('A');
    await a.start(USER);
    w.drive.failNext(0);
    await a.add(file(3));
    await settle(a);
    // No network when the session opens: the file waits, copy kept.
    expect(a.items()[0]).toMatchObject({ state: 'waiting', error: 'offline' });
    expect(w.store.records.size).toBe(1);

    a.retry();
    await settle(a);

    expect(a.items()[0]?.state).toBe('done');
    expect(w.store.records.size).toBe(0);
  });
});
