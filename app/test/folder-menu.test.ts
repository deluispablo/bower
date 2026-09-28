import { describe, expect, it } from 'vitest';

import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import { folderMeaning, ROOT_FOLDERS } from '../src/folder-meanings.js';
import { menuRoots, pinnedDetail, thingsLabel } from '../src/folder-menu.js';
import { folderCounts } from '../src/navigation.js';
import { buildVaultIndex } from '../src/vault-index.js';
import type { PinnedFolder, PinnedNote } from '../src/vault-store.js';

let nextId = 0;

function entry(path: string, mimeType = 'text/markdown'): DriveFile {
  nextId++;
  return {
    id: `id${nextId}`,
    name: path.split('/').pop() ?? path,
    mimeType,
    parents: ['FOLDER_ID'],
    path,
  };
}

function dir(path: string): DriveFile {
  return entry(path, FOLDER_MIME);
}

const FILES: DriveFile[] = [
  // Out of order on purpose: the menu keeps the table's order.
  dir('Answers'),
  dir('2-Areas'),
  dir('2-Areas/Home'),
  entry('2-Areas/Home/Shopping list.md'),
  dir('0-Inbox'),
  entry('0-Inbox/Idea.md'),
  dir('1-Projects'),
  dir('1-Projects/Lisbon trip'),
  dir('1-Projects/Flat hunt'),
  entry('1-Projects/Flat hunt/Viewings.md'),
  entry('1-Projects/Flat hunt/Budget.md'),
  // Not one of the six: left to the Notes tab.
  dir('Clippings'),
  entry('Clippings/Article.md'),
];

describe('ROOT_FOLDERS', () => {
  it('lists the six top-level folders in order, each with a meaning', () => {
    expect(ROOT_FOLDERS.map((folder) => folder.name)).toEqual([
      '0-Inbox',
      '1-Projects',
      '2-Areas',
      '3-Resources',
      '4-Archives',
      'Answers',
    ]);
    for (const folder of ROOT_FOLDERS) expect(folder.meaning).not.toBe('');
  });

  it('reads a meaning by path, and none for any other folder', () => {
    expect(folderMeaning('1-Projects')).toBe('Things with an end date');
    expect(folderMeaning('1-Projects/Flat hunt')).toBeUndefined();
    expect(folderMeaning('Recipes')).toBeUndefined();
  });

  it('reads the board lines, the short variants, Answers and Clippings', () => {
    expect(folderMeaning('0-Inbox')).toBe('Waiting for the next tidy-up');
    expect(folderMeaning('2-Areas')).toBe(
      'Parts of life that go on: home, health, money',
    );
    expect(folderMeaning('2-Areas', 'short')).toBe('Parts of life that go on');
    expect(folderMeaning('3-Resources')).toBe(
      'Things to keep: articles, recipes, manuals',
    );
    expect(folderMeaning('3-Resources', 'short')).toBe('Things to keep');
    expect(folderMeaning('4-Archives', 'short')).toBe(
      'Finished, kept, never deleted',
    );
    expect(folderMeaning('Answers')).toBe('What Bower wrote back to you');
    expect(folderMeaning('Clippings')).toBe(
      'Pages you clipped, waiting to be read',
    );
  });

  it('reads a renamed PARA folder by its name', () => {
    expect(folderMeaning('Projects')).toBe('Things with an end date');
  });
});

describe('menuRoots', () => {
  const index = buildVaultIndex(FILES);
  const roots = menuRoots(index, folderCounts(index));

  it('keeps the table order, skipping folders the index does not hold', () => {
    expect(roots.map((root) => root.path)).toEqual([
      '0-Inbox',
      '1-Projects',
      '2-Areas',
      'Answers',
    ]);
  });

  it('gives each its meaning, count and direct subfolders by name', () => {
    const projects = roots[1];
    expect(projects?.meaning).toBe('Things with an end date');
    expect(projects?.count).toBe(2);
    expect(projects?.children).toEqual([
      { path: '1-Projects/Flat hunt', name: 'Flat hunt', count: 2 },
      { path: '1-Projects/Lisbon trip', name: 'Lisbon trip', count: 0 },
    ]);
    expect(roots[3]).toMatchObject({ path: 'Answers', count: 0, children: [] });
  });
});

describe('pinnedDetail', () => {
  const counts = new Map([
    ['1-Projects/Flat hunt', 6],
    ['2-Areas', 1],
  ]);

  it('shows where a note lives', () => {
    const note: PinnedNote = {
      kind: 'note',
      file: entry('2-Areas/Home/Shopping list.md'),
      pinnedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(pinnedDetail(note, counts)).toBe('2-Areas / Home');
    const top: PinnedNote = { ...note, file: entry('Loose.md') };
    expect(pinnedDetail(top, counts)).toBe('');
  });

  it('shows where a folder lives and how much it holds', () => {
    const folder: PinnedFolder = {
      kind: 'folder',
      path: '1-Projects/Flat hunt',
      file: entry('1-Projects/Flat hunt/_Flat hunt.md'),
      pinnedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(pinnedDetail(folder, counts)).toBe('1-Projects · 6 things');
    expect(pinnedDetail({ ...folder, path: '2-Areas' }, counts)).toBe(
      '1 thing',
    );
  });

  it('says "thing" once and "things" otherwise', () => {
    expect(thingsLabel(0)).toBe('0 things');
    expect(thingsLabel(1)).toBe('1 thing');
    expect(thingsLabel(9)).toBe('9 things');
  });
});
