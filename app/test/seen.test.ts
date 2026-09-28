import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import type { VaultIndex } from '../src/vault-index.js';

// A `Map` stands in for IndexedDB (same approach as cache.test.ts).
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
  getSeen,
  isNew,
  loadSeenSet,
  markAllSeen,
  markSeen,
  newCountIn,
  newIds,
  resetSeenForTests,
} = await import('../src/seen.js');

function indexOf(paths: Record<string, string>): VaultIndex {
  const byPath = new Map<string, DriveFile>();
  for (const [path, id] of Object.entries(paths)) {
    byPath.set(path, {
      id,
      name: path.split('/').pop() ?? path,
      mimeType: 'application/pdf',
      parents: [],
      path,
    });
  }
  return { byPath } as unknown as VaultIndex;
}

const index = indexOf({
  'Projects/Flat/Lease.pdf': 'a',
  'Projects/Flat/Deep/Photo.jpg': 'b',
  'Areas/Health/Scan.pdf': 'c',
  'Notes.md': 'd',
});

const run = {
  items: [
    {
      path: '0-Inbox/1.pdf',
      kind: 'file' as const,
      to: 'Projects/Flat/Lease.pdf',
    },
    {
      path: '0-Inbox/2.jpg',
      kind: 'file' as const,
      to: 'Projects/Flat/Deep/Photo.jpg',
    },
    {
      path: '0-Inbox/3.pdf',
      kind: 'file' as const,
      to: 'Areas/Health/Scan.pdf',
    },
    { path: '0-Inbox/4.pdf', kind: 'file' as const, to: 'Gone/Missing.pdf' },
  ],
};

beforeEach(() => {
  store.clear();
  resetSeenForTests();
});

describe('newIds', () => {
  it('maps processed items to ids and subtracts the seen set', () => {
    expect([...newIds(run, index, new Set())].sort()).toEqual(['a', 'b', 'c']);
    expect([...newIds(run, index, new Set(['b']))].sort()).toEqual(['a', 'c']);
  });

  it('yields none for a report without to', () => {
    const old = { items: [{ path: '0-Inbox/1.pdf', kind: 'file' as const }] };
    expect(newIds(old, index, new Set()).size).toBe(0);
    expect(newIds({}, index, new Set()).size).toBe(0);
    expect(newIds(null, index, new Set()).size).toBe(0);
  });
});

describe('markSeen and markAllSeen', () => {
  it('persist across a reload through the seen store', async () => {
    await markSeen('a');
    await markAllSeen(['b', 'c']);
    resetSeenForTests(); // a reload: memory gone, the store stays
    expect(getSeen().size).toBe(0);
    await loadSeenSet();
    expect([...getSeen()].sort()).toEqual(['a', 'b', 'c']);
    expect(isNew('a', new Set(['a', 'z']))).toBe(false);
    expect(isNew('z', new Set(['a', 'z']))).toBe(true);
  });
});

describe('newCountIn', () => {
  it('counts new items under a folder at any depth', () => {
    const ids = newIds(run, index, new Set());
    expect(newCountIn('Projects', ids, index)).toBe(2);
    expect(newCountIn('Projects/Flat', ids, index)).toBe(2);
    expect(newCountIn('Projects/Flat/Deep', ids, index)).toBe(1);
    expect(newCountIn('Areas', ids, index)).toBe(1);
    expect(newCountIn('Proj', ids, index)).toBe(0);
    expect(newCountIn('', ids, index)).toBe(3);
  });
});
