/** Search index entries carry root, parent and updated time (#905,
 * R-API-15). */

import { describe, expect, it } from 'vitest';

import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import {
  buildSearchIndex,
  deserialiseSearchIndex,
  mergeFullText,
  searchVault,
  serialiseSearchIndex,
} from '../src/search-index.js';
import { buildVaultIndex } from '../src/vault-index.js';

function entry(
  id: string,
  path: string,
  mimeType: string,
  modifiedTime: string,
): DriveFile {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    mimeType,
    parents: ['FOLDER_ID'],
    path,
    modifiedTime,
  };
}

const vault = buildVaultIndex([
  entry('p', '1-Projects', FOLDER_MIME, '2026-01-01T00:00:00Z'),
  entry('h', '1-Projects/Housing', FOLDER_MIME, '2026-01-01T00:00:00Z'),
  entry('m', '1-Projects/Housing/Moonee Ponds', FOLDER_MIME, '2026-01-01T00:00:00Z'),
  entry('n', '1-Projects/Housing/Moonee Ponds/Buckley St.md', 'text/markdown', '2026-09-30T06:54:00Z'),
  entry('d', '1-Projects/Housing/Moonee Ponds/Lease.pdf', 'application/pdf', '2026-09-29T10:00:00Z'),
  entry('a', '2-Areas', FOLDER_MIME, '2026-03-01T00:00:00Z'),
]);

describe('search index facts', () => {
  const handle = buildSearchIndex(vault);

  it('gives a folder its newest change inside, its root and its parent', () => {
    const hit = searchVault(handle, vault, 'moonee').folders[0];
    expect(hit?.root).toBe('projects');
    expect(hit?.parent).toBe('Housing');
    expect(hit?.updated).toBe('2026-09-30T06:54:00Z');
  });

  it('gives a note and a file their own time and parent', () => {
    const note = searchVault(handle, vault, 'buckley').notes[0];
    expect(note).toMatchObject({
      root: 'projects',
      parent: 'Moonee Ponds',
      updated: '2026-09-30T06:54:00Z',
    });
    const file = searchVault(handle, vault, 'lease').files[0];
    expect(file?.updated).toBe('2026-09-29T10:00:00Z');
  });

  it('makes a root its own root, with no parent', () => {
    const hit = searchVault(handle, vault, 'areas').folders[0];
    expect(hit).toMatchObject({ root: 'areas', parent: '' });
  });

  it('keeps the facts through storage', () => {
    const restored = deserialiseSearchIndex(serialiseSearchIndex(handle));
    if (restored === undefined) throw new Error('not restored');
    const hit = searchVault(restored, vault, 'moonee').folders[0];
    expect(hit?.updated).toBe('2026-09-30T06:54:00Z');
  });

  it('gives Drive full-text hits the same facts', () => {
    const lease = vault.byId.get('d');
    if (lease === undefined) throw new Error('fixture');
    const merged = mergeFullText(
      { folders: [], notes: [], files: [], fuzzy: false },
      [lease],
      vault,
      'deposit',
    );
    expect(merged.files[0]).toMatchObject({
      root: 'projects',
      parent: 'Moonee Ponds',
    });
  });
});
