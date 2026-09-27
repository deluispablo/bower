import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import {
  clearRecentSearches,
  filterToIndex,
  loadRecentSearches,
  saveRecentSearch,
  snippet,
} from '../src/search.js';
import { buildVaultIndex } from '../src/vault-index.js';

function note(id: string, path: string): DriveFile {
  const name = path.split('/').pop() ?? path;
  return { id, name, mimeType: 'text/markdown', parents: ['PARENT'], path };
}

function stubLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('filterToIndex', () => {
  it('keeps only the results that are in the vault index, in order', () => {
    const inVault = [
      note('a', 'a.md'),
      note('b', '1-Projects/b.md'),
      note('c', '2-Areas/c.md'),
    ];
    const index = buildVaultIndex(inVault);
    const results = [
      note('x1', 'x1.md'),
      inVault[0] ?? note('a', 'a.md'),
      note('x2', 'x2.md'),
      inVault[1] ?? note('b', 'b.md'),
      inVault[2] ?? note('c', 'c.md'),
    ];

    expect(filterToIndex(results, index).map((f) => f.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('returns an empty array when nothing matches', () => {
    const index = buildVaultIndex([note('a', 'a.md')]);

    expect(filterToIndex([note('x', 'x.md')], index)).toEqual([]);
  });

  it('leaves out an app file unless asked, checked against its real path', () => {
    const claude = note('c', 'CLAUDE.md');
    const instruction = note(
      'i',
      '0-Inbox/Bower - 2026-09-26 1405 Receipts.md',
    );
    const plain = note('p', 'Plan.md');
    const index = buildVaultIndex([claude, instruction, plain]);
    // A bare search result carries the file name only, no folder nesting.
    const results = [
      note('c', 'CLAUDE.md'),
      note('i', 'Bower - 2026-09-26 1405 Receipts.md'),
      note('p', 'Plan.md'),
    ];

    expect(filterToIndex(results, index).map((f) => f.id)).toEqual(['p']);
    expect(filterToIndex(results, index, true).map((f) => f.id)).toEqual([
      'c',
      'i',
      'p',
    ]);
  });
});

describe('snippet', () => {
  const text =
    'The quick brown fox jumps over the lazy dog while the sun sets slowly behind the distant, quiet hills.';

  it('marks only the trailing cut when the match is near the start', () => {
    const result = snippet(text, 'quick', 10);

    expect(result).not.toBeNull();
    expect(result?.startsWith('…')).toBe(false);
    expect(result?.endsWith('…')).toBe(true);
    expect(result).toContain('quick');
  });

  it('marks both ends when the match is in the middle', () => {
    const result = snippet(text, 'sun sets', 10);

    expect(result?.startsWith('…')).toBe(true);
    expect(result?.endsWith('…')).toBe(true);
    expect(result).toContain('sun sets');
  });

  it('marks only the leading cut when the match is near the end', () => {
    const result = snippet(text, 'quiet hills', 10);

    expect(result?.startsWith('…')).toBe(true);
    expect(result?.endsWith('…')).toBe(false);
    expect(result).toContain('quiet hills');
  });

  it('is case-insensitive', () => {
    const result = snippet(text, 'QUICK BROWN', 5);

    expect(result).toContain('quick brown');
  });

  it('returns null when there is no match', () => {
    expect(snippet(text, 'nonexistent', 10)).toBeNull();
  });

  it('returns null for an empty query', () => {
    expect(snippet(text, '', 10)).toBeNull();
  });
});

describe('recent searches', () => {
  it('stores the most recent search first', () => {
    stubLocalStorage();

    saveRecentSearch('garden');
    saveRecentSearch('taxes');

    expect(loadRecentSearches()).toEqual(['taxes', 'garden']);
  });

  it('dedupes case-insensitively, moving the repeat to the front', () => {
    stubLocalStorage();

    saveRecentSearch('Garden');
    saveRecentSearch('taxes');
    saveRecentSearch('garden');

    expect(loadRecentSearches()).toEqual(['garden', 'taxes']);
  });

  it('caps the list at 8 entries', () => {
    stubLocalStorage();

    for (let i = 0; i < 10; i++) saveRecentSearch(`search ${i}`);

    const recent = loadRecentSearches();
    expect(recent).toHaveLength(8);
    expect(recent[0]).toBe('search 9');
    expect(recent).not.toContain('search 0');
    expect(recent).not.toContain('search 1');
  });

  it('ignores a blank query', () => {
    stubLocalStorage();

    saveRecentSearch('   ');

    expect(loadRecentSearches()).toEqual([]);
  });

  it('never throws when localStorage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });

    expect(() => {
      saveRecentSearch('garden');
    }).not.toThrow();
    expect(loadRecentSearches()).toEqual([]);
  });

  it('falls back to an empty list when the stored value is not valid JSON', () => {
    const store = stubLocalStorage();
    store.set('bower.search.recent', 'not-json');

    expect(loadRecentSearches()).toEqual([]);
  });
});

describe('clearRecentSearches', () => {
  it('drops the stored recent-searches list', () => {
    stubLocalStorage();
    saveRecentSearch('garden');

    clearRecentSearches();

    expect(loadRecentSearches()).toEqual([]);
  });

  it('never throws when localStorage.removeItem is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {
        throw new Error('blocked');
      },
    });

    expect(() => {
      clearRecentSearches();
    }).not.toThrow();
  });
});
