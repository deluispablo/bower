/**
 * A folder's own page (K-31, lead ruling on #903): a note named after its
 * folder that Bower wrote is not listed and not counted; one the person
 * wrote is an ordinary note. Moonee Ponds 7, Visa & Immigration 2.
 */

import { describe, expect, it } from 'vitest';

import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import {
  buildFolderModel,
  folderCount,
  isFolderPage,
  siblings,
} from '../src/folder-view.js';
import { buildTree, folderContents } from '../src/navigation.js';
import { noteMetaFrom } from '../src/note-meta.js';
import type { NoteMeta } from '../src/note-meta.js';
import { buildVaultIndex } from '../src/vault-index.js';

const MD = 'text/markdown';
const MOONEE = '1-Projects/Housing Search Australia/Moonee Ponds';
const VISA = '2-Areas/Visa & Immigration';

function entry(path: string, mimeType = MD): DriveFile {
  return {
    id: `id-${path}`,
    name: path.slice(path.lastIndexOf('/') + 1),
    mimeType,
    parents: ['FOLDER_ID'],
    path,
    modifiedTime: '2026-09-30T06:00:00Z',
  };
}

const HUB = entry(`${MOONEE}/Moonee Ponds.md`);
const NOTE = entry(`${VISA}/Visa & Immigration.md`);
const files: DriveFile[] = [
  entry('1-Projects', FOLDER_MIME),
  entry('1-Projects/Housing Search Australia', FOLDER_MIME),
  entry(MOONEE, FOLDER_MIME),
  entry(`${MOONEE}/Listings`, FOLDER_MIME),
  entry(
    `${MOONEE}/Listings/10-43 Buckley St, Moonee Ponds.pdf`,
    'application/pdf',
  ),
  HUB,
  ...[1, 2, 3, 4, 5, 6].map((n) => entry(`${MOONEE}/Flat ${n}.md`)),
  entry('2-Areas', FOLDER_MIME),
  entry(VISA, FOLDER_MIME),
  NOTE,
  entry(`${VISA}/Passport copy.pdf`, 'application/pdf'),
];

const metas = new Map<string, NoteMeta>(
  files
    .filter((file) => file.mimeType === MD)
    .map((file) => [
      file.id,
      file === NOTE
        ? noteMetaFrom({ by: 'person', tags: ['area'] })
        : noteMetaFrom({ by: 'bower' }),
    ]),
);
const index = buildVaultIndex(files);

function countOf(path: string): number {
  const contents = folderContents(index, path);
  if (contents === null) throw new Error(`no folder ${path}`);
  const model = buildFolderModel({
    items: contents.items,
    byPath: index.byPath,
    metas,
    origins: new Map(),
    catalogueFiles: new Map(),
  });
  return folderCount({ subfolders: contents.subfolders.length, model });
}

describe('a folder’s own page', () => {
  it('is a same-name note Bower wrote, not one the person wrote', () => {
    expect(isFolderPage(HUB, metas.get(HUB.id))).toBe(true);
    expect(isFolderPage(NOTE, metas.get(NOTE.id))).toBe(false);
    expect(isFolderPage(HUB, undefined)).toBe(false);
  });

  it('is left out of the count: Moonee Ponds 7, Visa & Immigration 2', () => {
    expect(countOf(MOONEE)).toBe(7);
    expect(countOf(VISA)).toBe(2);
  });

  it('is left out of the siblings; the person’s same-name note stays', () => {
    const tree = buildTree(index, 'name');
    const flat = files.find((file) => file.name === 'Flat 1.md');
    if (flat === undefined) throw new Error('fixture');
    const names = siblings(flat, tree, metas).map((file) => file.name);
    expect(names).toHaveLength(6);
    expect(names).not.toContain('Moonee Ponds.md');
    expect(siblings(NOTE, tree, metas).map((file) => file.name)).toContain(
      'Visa & Immigration.md',
    );
  });
});
