import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  filesFromFormData,
  SHARE_CACHE_NAME,
  SHARE_INDEX_KEY,
  storeSharedFiles,
  takeSharedFiles,
} from '../src/share-target.js';

/** A minimal, in-memory stand-in for the Cache Storage API. */
function stubCaches(): {
  store: Map<string, Map<string, Response>>;
  deletedNames: string[];
} {
  const store = new Map<string, Map<string, Response>>();
  const deletedNames: string[] = [];

  function openedCache(name: string): Cache {
    let entries = store.get(name);
    if (entries === undefined) {
      entries = new Map();
      store.set(name, entries);
    }
    const map = entries;
    return {
      match: vi.fn((request: RequestInfo) => {
        const key = typeof request === 'string' ? request : request.url;
        return Promise.resolve(map.get(key));
      }),
      put: vi.fn((request: RequestInfo, response: Response) => {
        const key = typeof request === 'string' ? request : request.url;
        map.set(key, response.clone());
        return Promise.resolve();
      }),
      keys: vi.fn(() =>
        Promise.resolve(Array.from(map.keys()).map((k) => new Request(k))),
      ),
      delete: vi.fn((request: RequestInfo) => {
        const key = typeof request === 'string' ? request : request.url;
        return Promise.resolve(map.delete(key));
      }),
    } as unknown as Cache;
  }

  const caches: Partial<CacheStorage> = {
    open: vi.fn((name: string) => Promise.resolve(openedCache(name))),
    delete: vi.fn((name: string) => {
      deletedNames.push(name);
      return Promise.resolve(store.delete(name));
    }),
  };

  vi.stubGlobal('caches', caches);
  return { store, deletedNames };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('filesFromFormData', () => {
  it('collects every `files` entry that is a File, in order', () => {
    const a = new File(['a'], 'a.txt', { type: 'text/plain' });
    const b = new File(['b'], 'b.txt', { type: 'text/plain' });
    const formData = new FormData();
    formData.append('files', a);
    formData.append('other', 'ignored');
    formData.append('files', b);

    expect(filesFromFormData(formData)).toEqual([a, b]);
  });

  it('returns an empty array when there are no files', () => {
    expect(filesFromFormData(new FormData())).toEqual([]);
  });
});

describe('storeSharedFiles', () => {
  it('stores one entry per file plus an index of their names, in order', async () => {
    const { store } = stubCaches();
    const a = new File(['one'], 'a.pdf', { type: 'application/pdf' });
    const b = new File(['two'], 'b.png', { type: 'image/png' });

    await storeSharedFiles([a, b]);

    const cache = store.get(SHARE_CACHE_NAME);
    expect(cache).toBeDefined();
    expect(await cache?.get('/share/0')?.text()).toBe('one');
    expect(await cache?.get('/share/1')?.text()).toBe('two');

    const index = cache?.get(SHARE_INDEX_KEY);
    expect(index).toBeDefined();
    await expect(index?.json()).resolves.toEqual({ names: ['a.pdf', 'b.png'] });
  });
});

describe('takeSharedFiles', () => {
  it('rebuilds the Files in order from a stored index, then clears the cache', async () => {
    const { deletedNames } = stubCaches();
    const a = new File(['one'], 'a.pdf', { type: 'application/pdf' });
    const b = new File(['two'], 'b.png', { type: 'image/png' });
    await storeSharedFiles([a, b]);

    const files = await takeSharedFiles();

    expect(files.map((f) => f.name)).toEqual(['a.pdf', 'b.png']);
    expect(await files[0]?.text()).toBe('one');
    expect(await files[1]?.text()).toBe('two');
    expect(deletedNames).toEqual([SHARE_CACHE_NAME]);
  });

  it('returns an empty array and still clears the cache when there is no index', async () => {
    const { deletedNames } = stubCaches();

    const files = await takeSharedFiles();

    expect(files).toEqual([]);
    expect(deletedNames).toEqual([SHARE_CACHE_NAME]);
  });
});
