import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';

// `idb-keyval` needs a real IndexedDB; a `Map` is enough to exercise our
// wrappers without one (vitest runs this suite in the node environment).
const store = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(store.get(key))),
  set: vi.fn((key: string, value: unknown) => {
    store.set(key, value);
    return Promise.resolve();
  }),
  del: vi.fn((key: string) => {
    store.delete(key);
    return Promise.resolve();
  }),
  clear: vi.fn(() => {
    store.clear();
    return Promise.resolve();
  }),
}));

const {
  BLOB_CACHE_CAP_BYTES,
  clearAll,
  evictPlan,
  invalidateIndex,
  loadBlob,
  loadIndex,
  loadNote,
  saveBlob,
  saveIndex,
  saveNote,
} = await import('../src/cache.js');

function file(id: string, path = `${id}.md`): DriveFile {
  return { id, name: path, mimeType: 'text/markdown', parents: ['ROOT'], path };
}

beforeEach(() => {
  store.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('index', () => {
  it('round trips through save and load', async () => {
    expect(await loadIndex()).toBeUndefined();

    const files = [file('a'), file('b')];
    await saveIndex(files, '2026-01-01T00:00:00.000Z');

    await expect(loadIndex()).resolves.toEqual({
      files,
      fetchedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('invalidateIndex drops it', async () => {
    await saveIndex([file('a')], '2026-01-01T00:00:00.000Z');
    await invalidateIndex();

    expect(await loadIndex()).toBeUndefined();
  });
});

describe('notes', () => {
  it('round trips through save and load, keyed by id', async () => {
    expect(await loadNote('n1')).toBeUndefined();

    await saveNote('n1', 'hello', 'v1', '2026-01-01T00:00:00.000Z');
    await saveNote('n2', 'other', 'v1', '2026-01-01T00:00:00.000Z');

    await expect(loadNote('n1')).resolves.toEqual({
      text: 'hello',
      modifiedTime: 'v1',
      fetchedAt: '2026-01-01T00:00:00.000Z',
    });
    await expect(loadNote('n2')).resolves.toMatchObject({ text: 'other' });
  });
});

describe('evictPlan', () => {
  it('keeps everything under the cap', () => {
    const entries = [
      { id: 'a', size: 10, lastUsed: 1 },
      { id: 'b', size: 10, lastUsed: 2 },
    ];
    expect(evictPlan(entries, 100)).toEqual([]);
  });

  it('evicts the oldest lastUsed first until under the cap', () => {
    const entries = [
      { id: 'a', size: 30, lastUsed: 1 },
      { id: 'b', size: 30, lastUsed: 3 },
      { id: 'c', size: 30, lastUsed: 2 },
    ];
    // Total 90, cap 50: drop oldest (a, lastUsed 1), then next oldest (c,
    // lastUsed 2); 30 (b) fits under 50, so it stops there.
    expect(evictPlan(entries, 50)).toEqual(['a', 'c']);
  });

  it('evicts everything if even the newest does not fit', () => {
    const entries = [{ id: 'a', size: 1000, lastUsed: 1 }];
    expect(evictPlan(entries, 10)).toEqual(['a']);
  });
});

describe('blobs', () => {
  it('round trips through save and load', async () => {
    expect(await loadBlob('b1')).toBeUndefined();

    const blob = new Blob(['hello']);
    await saveBlob('b1', blob);

    const loaded = await loadBlob('b1');
    expect(loaded).toBe(blob);
  });

  it('evicts the least recently used blob once the cap is exceeded', async () => {
    const chunk = new Blob([new Uint8Array(BLOB_CACHE_CAP_BYTES)]);

    await saveBlob('old', chunk);
    await saveBlob('new', chunk);

    // Two chunks of the full cap size can't both fit: the older one is gone.
    expect(await loadBlob('old')).toBeUndefined();
    expect(await loadBlob('new')).toBe(chunk);
  });

  it('loading a blob refreshes its place in the LRU', async () => {
    const small = new Blob([new Uint8Array(1)]);
    const big = new Blob([new Uint8Array(BLOB_CACHE_CAP_BYTES - 1)]);

    await saveBlob('a', small);
    await saveBlob('b', small);
    // Touch `a` so it is now the most recently used.
    await loadBlob('a');
    // Adding a blob that only leaves room for one of {a, b} evicts `b`.
    await saveBlob('c', big);

    expect(await loadBlob('a')).toBe(small);
    expect(await loadBlob('b')).toBeUndefined();
    expect(await loadBlob('c')).toBe(big);
  });

  it('keeps every blob in the LRU when several are saved at once (#133)', async () => {
    const blob = new Blob(['x']);
    await Promise.all([
      saveBlob('one', blob),
      saveBlob('two', blob),
      saveBlob('three', blob),
      loadBlob('one'),
    ]);

    const lru = store.get('blob-lru') as { id: string }[];
    expect(lru.map((entry) => entry.id).sort()).toEqual([
      'one',
      'three',
      'two',
    ]);
  });

  it('evicts blobs saved at once, so the cap holds (#133)', async () => {
    const chunk = new Blob([new Uint8Array(BLOB_CACHE_CAP_BYTES / 2 + 1)]);
    await Promise.all([
      saveBlob('a', chunk),
      saveBlob('b', chunk),
      saveBlob('c', chunk),
    ]);

    const kept = [...store.keys()].filter((key) => key.startsWith('blob:'));
    expect(kept).toHaveLength(1);
    const lru = store.get('blob-lru') as { id: string }[];
    expect(lru.map((entry) => `blob:${entry.id}`)).toEqual(kept);
  });
});

describe('clearAll', () => {
  it('drops the index, notes and blobs', async () => {
    await saveIndex([file('a')], '2026-01-01T00:00:00.000Z');
    await saveNote('n1', 'hello', 'v1', '2026-01-01T00:00:00.000Z');
    await saveBlob('b1', new Blob(['x']));

    await clearAll();

    expect(await loadIndex()).toBeUndefined();
    expect(await loadNote('n1')).toBeUndefined();
    expect(await loadBlob('b1')).toBeUndefined();
  });
});
