import { describe, expect, it } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import type { CachedNoteText, LoadCachedNote } from '../src/note-titles.js';
import { resolveNoteTitles, titleCacheKey } from '../src/note-titles.js';

function file(id: string, name: string, modifiedTime?: string): DriveFile {
  return {
    id,
    name,
    mimeType: 'text/markdown',
    parents: ['PARENT'],
    path: name,
    ...(modifiedTime !== undefined ? { modifiedTime } : {}),
  };
}

/** A stubbed `loadNote`, never touching IndexedDB or the network: answers
 * from a fixed table of `{ [id]: CachedNoteText }`. */
function stubCache(entries: Record<string, CachedNoteText>): LoadCachedNote {
  return (id) => Promise.resolve(entries[id]);
}

describe('titleCacheKey', () => {
  it('combines the id and modifiedTime', () => {
    expect(titleCacheKey(file('a', 'A.md', '2026-09-27T10:00:00Z'))).toBe(
      'a:2026-09-27T10:00:00Z',
    );
  });

  it('uses an empty string for a missing modifiedTime', () => {
    expect(titleCacheKey(file('a', 'A.md'))).toBe('a:');
  });
});

describe('resolveNoteTitles', () => {
  it('resolves the frontmatter/heading title from a matching cache hit', async () => {
    const a = file(
      'a',
      'Bower - 2026-09-27 0815 Lisbon.md',
      '2026-09-27T08:15:00Z',
    );
    const loadNote = stubCache({
      a: {
        text: '---\ntitle: Trip to Lisbon\n---\nBody.',
        modifiedTime: '2026-09-27T08:15:00Z',
      },
    });

    const titles = await resolveNoteTitles([a], loadNote);

    expect(titles.get(titleCacheKey(a))).toBe('Trip to Lisbon');
  });

  it('falls back to the file name on a cache miss', async () => {
    const a = file('a', 'Shopping list.md', '2026-09-27T08:15:00Z');
    const loadNote = stubCache({});

    const titles = await resolveNoteTitles([a], loadNote);

    expect(titles.get(titleCacheKey(a))).toBe('Shopping list');
  });

  it('falls back to the file name when the cached entry is stale', async () => {
    const a = file('a', 'Shopping list.md', '2026-09-27T09:00:00Z');
    // Cached under the note's *previous* modifiedTime: an edit happened since.
    const loadNote = stubCache({
      a: {
        text: '---\ntitle: Old Title\n---\n',
        modifiedTime: '2026-09-27T08:15:00Z',
      },
    });

    const titles = await resolveNoteTitles([a], loadNote);

    expect(titles.get(titleCacheKey(a))).toBe('Shopping list');
  });

  it('falls back to the file name when loadNote rejects', async () => {
    const a = file('a', 'Shopping list.md');
    const loadNote: LoadCachedNote = () =>
      Promise.reject(new Error('IndexedDB unavailable'));

    const titles = await resolveNoteTitles([a], loadNote);

    expect(titles.get(titleCacheKey(a))).toBe('Shopping list');
  });

  it('resolves several files independently, keyed by id + modifiedTime', async () => {
    const a = file('a', 'A.md', '2026-09-27T08:00:00Z');
    const b = file('b', 'B.md', '2026-09-27T09:00:00Z');
    const loadNote = stubCache({
      a: { text: '# Heading A', modifiedTime: '2026-09-27T08:00:00Z' },
    });

    const titles = await resolveNoteTitles([a, b], loadNote);

    expect(titles.get(titleCacheKey(a))).toBe('Heading A');
    expect(titles.get(titleCacheKey(b))).toBe('B');
  });

  it('resolves an empty file list to an empty map', async () => {
    const titles = await resolveNoteTitles([], stubCache({}));
    expect(titles.size).toBe(0);
  });
});
