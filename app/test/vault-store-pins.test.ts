/**
 * `hydratePinnedAt`'s hydration order (#539): a full-text search for the
 * `pinned` frontmatter key resolves the (few) actual pins first, ahead of
 * the capped, path-ordered walk over every note and folder note — so a
 * pin far down the alphabet, or a folder pin (checked only after every
 * note), still shows on a first, cold-cache visit instead of waiting
 * behind items that happen to sort earlier.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import { buildVaultIndex } from '../src/vault-index.js';

const { getTextMock, searchFullTextMock } = vi.hoisted(() => ({
  getTextMock: vi.fn<(id: string) => Promise<string>>(),
  searchFullTextMock: vi.fn<(query: string) => Promise<DriveFile[]>>(),
}));

vi.mock('../src/drive.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/drive.js')>()),
  getText: (id: string) => getTextMock(id),
  searchFullText: (query: string) => searchFullTextMock(query),
}));

// A cold cache throughout: every call is a miss, nothing to reuse.
vi.mock('../src/cache.js', () => ({
  loadNote: () => Promise.resolve(undefined),
  saveNote: () => Promise.resolve(undefined),
}));

const { hydratePinnedAt } = await import('../src/vault-store.js');

let nextId = 0;

function entry(path: string, mimeType = 'text/markdown'): DriveFile {
  nextId++;
  const name = path.split('/').pop() ?? path;
  return { id: `id${nextId}`, name, mimeType, parents: ['PARENT'], path };
}

function dir(path: string): DriveFile {
  return entry(path, FOLDER_MIME);
}

/** 20 plain notes under 1-Projects, alphabetically well past any small
 * fetch cap, plus a folder note and a note that are the vault's only two
 * pins — both sorting near the end. */
function buildFiles(): DriveFile[] {
  const files: DriveFile[] = [dir('1-Projects')];
  for (let i = 0; i < 20; i++) {
    files.push(entry(`1-Projects/Note ${String(i).padStart(2, '0')}.md`));
  }
  files.push(dir('2-Areas'));
  files.push(dir('2-Areas/Home'));
  files.push(entry('2-Areas/Home/_Home.md'));
  files.push(entry('2-Areas/Home/Zzz late note.md'));
  return files;
}

const PINNED = '---\npinned: 2026-09-27T08:00:00.000Z\n---\n';
const UNPINNED = '---\ntags: [note]\n---\n';

afterEach(() => {
  vi.clearAllMocks();
});

describe('hydratePinnedAt', () => {
  it('finds a note pin and a folder pin past the fetch cap via search', async () => {
    const files = buildFiles();
    const index = buildVaultIndex(files);
    const folderNoteFile = files.find((f) => f.name === '_Home.md');
    const lateNoteFile = files.find((f) => f.name === 'Zzz late note.md');
    if (folderNoteFile === undefined || lateNoteFile === undefined) {
      throw new Error('fixture missing expected files');
    }

    searchFullTextMock.mockResolvedValue([folderNoteFile, lateNoteFile]);
    getTextMock.mockImplementation((id: string) =>
      Promise.resolve(
        id === folderNoteFile.id || id === lateNoteFile.id ? PINNED : UNPINNED,
      ),
    );

    const { notePinnedAt, folderPinnedAt } = await hydratePinnedAt(index);

    expect(notePinnedAt.get(lateNoteFile.id)).toBe('2026-09-27T08:00:00.000Z');
    expect(folderPinnedAt.get('2-Areas/Home')).toBe('2026-09-27T08:00:00.000Z');
    // The two search hits are the very first fetches, ahead of the
    // capped walk over the other ~20 files (which still runs, to warm
    // the cache for everything else) — the total stays at the cap.
    expect(getTextMock.mock.calls.slice(0, 2).map(([id]) => id)).toEqual(
      expect.arrayContaining([folderNoteFile.id, lateNoteFile.id]),
    );
    expect(getTextMock).toHaveBeenCalledTimes(12);
  });

  it('falls back to the walk alone when the search fails, unchanged from before', async () => {
    const files = buildFiles();
    const index = buildVaultIndex(files);
    const firstNote = files.find((f) => f.name === 'Note 00.md');
    if (firstNote === undefined) throw new Error('fixture missing Note 00');

    searchFullTextMock.mockRejectedValue(new Error('offline'));
    getTextMock.mockImplementation((id: string) =>
      Promise.resolve(id === firstNote.id ? PINNED : UNPINNED),
    );

    const { notePinnedAt } = await hydratePinnedAt(index);

    // An early item (within the cap) still resolves via the walk.
    expect(notePinnedAt.get(firstNote.id)).toBe('2026-09-27T08:00:00.000Z');
  });
});
