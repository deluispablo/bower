import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';

// Same stand-in for IndexedDB as cache.test.ts: a Map behind `idb-keyval`.
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
  buildSearchIndex,
  deserialiseSearchIndex,
  formatPath,
  mergeFullText,
  pathSegments,
  persistSearchIndex,
  restoreSearchIndex,
  searchVault,
  serialiseSearchIndex,
  syncSearchIndex,
  withinOneEdit,
} = await import('../src/search-index.js');
const { buildVaultIndex } = await import('../src/vault-index.js');

const FOLDER = 'application/vnd.google-apps.folder';

function folder(id: string, path: string): DriveFile {
  return {
    id,
    name: path.split('/').pop() ?? path,
    mimeType: FOLDER,
    parents: ['P'],
    path,
  };
}

function file(
  id: string,
  path: string,
  mimeType: string,
  modifiedTime = '2026-09-27T06:49:00Z',
): DriveFile {
  return {
    id,
    name: path.split('/').pop() ?? path,
    mimeType,
    parents: ['P'],
    path,
    modifiedTime,
  };
}

const FILES: DriveFile[] = [
  folder('f1', '1-Projects'),
  folder('f2', '1-Projects/Flat hunt'),
  folder('f3', '1-Projects/Kitchen Refresh'),
  folder('f4', '2-Areas'),
  file('n1', '1-Projects/Flat hunt/Notes from the viewing.md', 'text/markdown'),
  file('n2', '1-Projects/Kitchen Refresh/Shopping list.md', 'text/markdown'),
  file(
    'p1',
    '1-Projects/Flat hunt/Lease agreement 2026.pdf',
    'application/pdf',
  ),
  file(
    'i1',
    '1-Projects/Flat hunt/Arlington Road, window sign.jpg',
    'image/jpeg',
    '2026-08-01T10:00:00Z',
  ),
];

const vault = buildVaultIndex(FILES);
const TEXTS = new Map([
  ['n1', 'The first flat we saw had a damp corner by the boiler.'],
]);

beforeEach(() => store.clear());

describe('pathSegments and formatPath', () => {
  it('drops numeric prefixes and never shows a slash', () => {
    const segments = pathSegments('1-Projects/Flat hunt/Lease.pdf', true);
    expect(segments.map((s) => s.name)).toEqual(['Projects', 'Flat hunt']);
    const line = formatPath(segments);
    expect(line).toBe('Projects › Flat hunt');
    expect(line).not.toMatch(/\d-|\//);
  });

  it('gives every segment the PARA kind of its top folder', () => {
    const segments = pathSegments('2-Areas/Cooking/Bread.md', true);
    expect(segments.map((s) => s.para)).toEqual(['areas', 'areas']);
  });

  it('is empty for a top-level file', () => {
    expect(pathSegments('Lease.pdf', true)).toEqual([]);
  });
});

describe('withinOneEdit', () => {
  it('accepts one insertion, deletion or substitution only', () => {
    expect(withinOneEdit('hnt', 'hunt')).toBe(true);
    expect(withinOneEdit('hunt', 'hint')).toBe(true);
    expect(withinOneEdit('hunt', 'hut')).toBe(true);
    expect(withinOneEdit('hunt', 'hunter')).toBe(false);
    expect(withinOneEdit('abc', 'xyz')).toBe(false);
  });
});

describe('searchVault', () => {
  const handle = buildSearchIndex(vault, TEXTS);

  it('finds the Flat hunt folder first for "flat hnt", flagged as fuzzy', () => {
    const results = searchVault(handle, vault, 'flat hnt');
    expect(results.folders[0]?.title).toBe('Flat hunt');
    expect(results.fuzzy).toBe(true);
    expect(results.folders[0]?.highlights).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 9 },
    ]);
  });

  it('does not flag an exact match as fuzzy', () => {
    const results = searchVault(handle, vault, 'flat hunt');
    expect(results.fuzzy).toBe(false);
    expect(results.folders[0]?.title).toBe('Flat hunt');
  });

  it('tolerates a typo in a longer word', () => {
    const results = searchVault(handle, vault, 'kichen');
    expect(results.folders[0]?.title).toBe('Kitchen Refresh');
    expect(results.fuzzy).toBe(true);
  });

  it('puts the lease PDF under files, with the PDF badge and kind word', () => {
    const results = searchVault(handle, vault, 'lease');
    expect(results.notes).toEqual([]);
    const hit = results.files[0];
    expect(hit?.title).toBe('Lease agreement 2026');
    expect(hit?.badge).toBe('PDF');
    expect(hit?.kindWord).toBe('PDF');
    expect(hit?.pathText).toBe('Projects › Flat hunt');
  });

  it('returns the Kitchen Refresh folder in the folders group', () => {
    const results = searchVault(handle, vault, 'kitchen');
    expect(results.folders.map((h) => h.title)).toEqual(['Kitchen Refresh']);
    expect(results.folders[0]?.kindWord).toBe('Folder');
    expect(results.folders[0]?.pathText).toBe('Projects');
  });

  it('matches a prefix and the kind word', () => {
    expect(searchVault(handle, vault, 'arl').files[0]?.title).toBe(
      'Arlington Road, window sign',
    );
    expect(searchVault(handle, vault, 'pdf').files[0]?.title).toBe(
      'Lease agreement 2026',
    );
  });

  it('finds text of a note read before, with a snippet', () => {
    const results = searchVault(handle, vault, 'boiler');
    const hit = results.notes[0];
    expect(hit?.file.id).toBe('n1');
    expect(hit?.snippet).toContain('boiler');
  });

  it('needs every word of a multi-word query, each still prefix and fuzzy', () => {
    expect(searchVault(handle, vault, 'boiler warranty').notes).toEqual([]);
    expect(searchVault(handle, vault, 'damp boiler').notes[0]?.file.id).toBe(
      'n1',
    );
    expect(searchVault(handle, vault, 'dam boilr').notes[0]?.file.id).toBe(
      'n1',
    );
  });

  it('scopes, filters kinds and dates', () => {
    expect(
      searchVault(handle, vault, 'refresh', { scope: '1-Projects/Flat hunt' })
        .folders,
    ).toEqual([]);
    const flat = searchVault(handle, vault, 'flat', { kinds: ['folder'] });
    expect(flat.notes).toEqual([]);
    expect(flat.files).toEqual([]);
    const since = Date.parse('2026-09-01T00:00:00Z');
    const recent = searchVault(handle, vault, 'window', { since });
    expect(recent.files).toEqual([]);
  });

  it('finds nothing for a blank or unrelated query', () => {
    const blank = searchVault(handle, vault, '  ');
    expect([blank.folders, blank.notes, blank.files]).toEqual([[], [], []]);
    expect(searchVault(handle, vault, 'zzzzqq').files).toEqual([]);
  });
});

describe('index upkeep and storage', () => {
  const withSourdough = buildVaultIndex([
    ...FILES,
    file('n3', '2-Areas/Sourdough starter.md', 'text/markdown'),
  ]);

  it('updates when a note is added or removed', () => {
    const handle = buildSearchIndex(vault, TEXTS);
    expect(searchVault(handle, withSourdough, 'sourdough').notes).toEqual([]);
    // The new note, and its folder, whose "updated" time moved (#905).
    expect(syncSearchIndex(handle, withSourdough, TEXTS)).toEqual({
      updated: 2,
      removed: 0,
    });
    expect(
      searchVault(handle, withSourdough, 'sourdough').notes[0]?.file.id,
    ).toBe('n3');

    expect(syncSearchIndex(handle, withSourdough, TEXTS).updated).toBe(0);
    expect(syncSearchIndex(handle, vault, TEXTS).removed).toBe(1);
    expect(searchVault(handle, vault, 'sourdough').notes).toEqual([]);
  });

  it('re-indexes a note whose text was read since', () => {
    const handle = buildSearchIndex(vault);
    expect(searchVault(handle, vault, 'boiler').notes).toEqual([]);
    syncSearchIndex(handle, vault, TEXTS);
    expect(searchVault(handle, vault, 'boiler').notes[0]?.file.id).toBe('n1');
  });

  it('survives a reload from IndexedDB and keeps updating', async () => {
    await persistSearchIndex(buildSearchIndex(vault, TEXTS));
    const restored = await restoreSearchIndex();
    expect(restored).toBeDefined();
    if (restored === undefined) return;
    expect(searchVault(restored, vault, 'flat hnt').folders[0]?.title).toBe(
      'Flat hunt',
    );
    expect(searchVault(restored, vault, 'boiler').notes[0]?.snippet).toContain(
      'boiler',
    );
    expect(syncSearchIndex(restored, vault, TEXTS).updated).toBe(0);
    syncSearchIndex(restored, withSourdough, TEXTS);
    expect(
      searchVault(restored, withSourdough, 'sourdough').notes,
    ).toHaveLength(1);
  });

  it('restores nothing when nothing is saved or the data is unusable', async () => {
    expect(await restoreSearchIndex()).toBeUndefined();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(deserialiseSearchIndex('not json')).toBeUndefined();
    expect(deserialiseSearchIndex('{"format":99}')).toBeUndefined();
    error.mockRestore();
    const json = serialiseSearchIndex(buildSearchIndex(vault));
    expect(deserialiseSearchIndex(json)).toBeDefined();
  });
});

describe('mergeFullText', () => {
  it('adds Drive hits after local ones, without duplicates or strangers', () => {
    const handle = buildSearchIndex(vault, TEXTS);
    const local = searchVault(handle, vault, 'lease');
    const merged = mergeFullText(
      local,
      [
        file('p1', 'Lease agreement 2026.pdf', 'application/pdf'),
        file('n2', 'Shopping list.md', 'text/markdown'),
        file('x9', 'Elsewhere.md', 'text/markdown'),
      ],
      vault,
      'lease',
      {},
      new Map([['n2', '…lease the tap…']]),
    );
    expect(merged.files.map((h) => h.file.id)).toEqual(['p1']);
    expect(merged.notes.map((h) => h.file.id)).toEqual(['n2']);
    expect(merged.notes[0]?.snippet).toBe('…lease the tap…');
    expect(merged.notes[0]?.pathText).toBe('Projects › Kitchen Refresh');
  });
});

describe('a Bower answer in Search (#950 F-4)', () => {
  it('reads "Bower answer", as the list and the note do', () => {
    const files = [
      folder('a0', '1-Projects'),
      file('a1', '1-Projects/Job ratings.md', 'text/markdown'),
    ];
    const vault = buildVaultIndex(files);
    const handle = buildSearchIndex(
      vault,
      new Map([['a1', '---\ntype: answer\n---\n# Job ratings\nThree offers.']]),
    );
    const hit = searchVault(handle, vault, 'ratings').notes[0];
    expect(hit?.kindWord).toBe('Bower answer');
  });
});

describe('a Bower note in Search (#998, D10)', () => {
  const files = [
    folder('b0', '1-Projects'),
    file('b1', '1-Projects/Moving plan.md', 'text/markdown'),
    file('b2', '1-Projects/Packing list.md', 'text/markdown'),
  ];
  const vault = buildVaultIndex(files);
  const handle = buildSearchIndex(
    vault,
    new Map([
      ['b1', '---\nby: bower\n---\n# Moving plan\nThe boxes.'],
      ['b2', '---\nby: person\n---\n# Packing list\nThe boxes.'],
    ]),
  );

  it('reads "Bower note" for what Bower wrote, as every list does', () => {
    const hit = searchVault(handle, vault, 'moving').notes[0];
    expect(hit?.kindWord).toBe('Bower note');
  });

  it('reads "Note" for what the person wrote', () => {
    const hit = searchVault(handle, vault, 'packing').notes[0];
    expect(hit?.kindWord).toBe('Note');
  });
});
