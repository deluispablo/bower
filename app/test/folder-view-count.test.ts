/** One count per folder and one sibling order (#905, R-API-9, K-31). */

import { describe, expect, it } from 'vitest';

import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import {
  buildFolderModel,
  folderCount,
  folderSegments,
  siblings,
} from '../src/folder-view.js';
import { buildTree, folderContents } from '../src/navigation.js';
import { noteMetaFrom } from '../src/note-meta.js';
import { buildVaultIndex } from '../src/vault-index.js';

const DIR = '1-Projects/Housing Search Australia/Moonee Ponds';
const MD = 'text/markdown';

function entry(path: string, mimeType: string, modifiedTime?: string): DriveFile {
  return {
    id: `id-${path}`,
    name: path.slice(path.lastIndexOf('/') + 1),
    mimeType,
    parents: ['FOLDER_ID'],
    path,
    ...(modifiedTime === undefined ? {} : { modifiedTime }),
  };
}

/** The demo's Moonee Ponds, shaped like the fixture: the Listings
 * subfolder (one original) and six notes Bower wrote. */
const STREETS = [
  '10-43 Buckley St',
  '6-20 Mantell St',
  '9-2 Alexandra Ave',
  '21-51 Buckley St',
  '8-128 Park St',
  '10-8 Eddy St',
];

const files: DriveFile[] = [
  entry('1-Projects', FOLDER_MIME),
  entry('1-Projects/Housing Search Australia', FOLDER_MIME),
  entry(DIR, FOLDER_MIME),
  entry(`${DIR}/Listings`, FOLDER_MIME),
  entry(`${DIR}/Listings/8-128 Park St.md`, MD, '2026-09-28T08:00:00Z'),
  ...STREETS.map((street, i) =>
    entry(`${DIR}/${street}, Moonee Ponds.md`, MD, `2026-09-30T06:${50 - i}:00Z`),
  ),
];

describe('folderCount', () => {
  const index = buildVaultIndex(files);
  const contents = folderContents(index, DIR);
  const notes = files.filter((file) => file.path.startsWith(`${DIR}/`) && !file.path.includes('/Listings'));
  const metas = new Map(
    notes.map((note) => [note.id, noteMetaFrom({ by: 'bower' })] as const),
  );
  const model = buildFolderModel({
    items: contents.items,
    byPath: index.byPath,
    metas,
    origins: new Map(),
    catalogueFiles: new Map(),
  });
  const folder = { subfolders: contents.subfolders.length, model };

  it('adds up to the segments: 7 = Originals 1 + By Bower 6', () => {
    expect(folderSegments(folder)).toEqual({ originals: 1, bower: 6 });
    expect(folderCount(folder)).toBe(7);
  });

  it('counts an empty folder as nothing', () => {
    expect(
      folderCount({ subfolders: 0, model: { originals: [], bower: [] } }),
    ).toBe(0);
  });
});

describe('siblings', () => {
  // Newest first, as the explorer draws Moonee Ponds on PF-Main-1280.
  const tree = buildTree(buildVaultIndex(files), 'modified');

  it('lists the folder’s things in tree order, subfolders left out', () => {
    const item = files.find((file) => file.name === '8-128 Park St, Moonee Ponds.md');
    if (item === undefined) throw new Error('fixture');
    const names = siblings(item, tree).map((file) => file.name);
    const inTree = tree.folders[0]?.folders[0]?.folders[0]?.items.map(
      (file) => file.name,
    );
    expect(names).toHaveLength(6);
    expect(names).toEqual(inTree);
    expect(names[0]).toBe('10-43 Buckley St, Moonee Ponds.md');
  });

  it('is empty when the folder is not in the tree', () => {
    expect(siblings({ path: 'Nowhere/Note.md' }, tree)).toEqual([]);
  });
});
