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
  listedUnder,
  segmentSubfolders,
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

describe('a folder page never shows in a list (#922)', () => {
  const at = (path: string, minute: number): DriveFile => ({
    id: `id-${path}`,
    name: path.slice(path.lastIndexOf('/') + 1),
    mimeType: MD,
    parents: ['FOLDER_ID'],
    path,
    modifiedTime: `2026-09-30T10:${String(minute).padStart(2, '0')}:00Z`,
  });
  const page = at('2-Areas/Visa/Visa.md', 59);
  const mine = at('2-Areas/Home/Home.md', 58);
  const note = at('2-Areas/Visa/Checklist.md', 10);
  const byPath = new Map([page, mine, note].map((f) => [f.path, f]));
  const known = new Map<string, NoteMeta>([
    [page.id, noteMetaFrom({ tags: ['area'] })],
    [mine.id, noteMetaFrom({ by: 'person' })],
  ]);

  it('leaves pages out of a card preview and Recently changed', () => {
    const shown = listedUnder(byPath, '2-Areas', 5, (f) => known.get(f.id));
    expect(shown.map((f) => f.path)).toEqual([mine.path, note.path]);
    const card = listedUnder(byPath, '2-Areas/Visa', 3, (f) => known.get(f.id));
    expect(card.map((f) => f.path)).toEqual([note.path]);
  });

  it('counts no subfolder as an original in a folder that holds only folders', () => {
    const empty = { originals: [], bower: [] };
    // Housing Search Australia: only the Moonee Ponds subfolder (and its
    // own page, which is not listed): "Originals 0 · By Bower 0".
    expect(segmentSubfolders(1, false, empty)).toBe(0);
    expect(segmentSubfolders(2, true, { originals: [note], bower: [] })).toBe(
      0,
    );
    expect(segmentSubfolders(2, false, { originals: [note], bower: [] })).toBe(
      2,
    );
  });

  it('treats a same-name note as a page until its frontmatter is read', () => {
    expect(listedUnder(byPath, '2-Areas', 5).map((f) => f.path)).toEqual([
      note.path,
    ]);
  });
});
