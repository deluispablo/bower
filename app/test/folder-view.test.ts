import { describe, expect, it } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import {
  buildFolderModel,
  filterKind,
  groupLabel,
  groupRows,
  kindOptions,
  lastFiled,
  metaCounts,
  rowsFor,
  sortRows,
  subjectOf,
  folderPagesUnder,
  subfolderThings,
} from '../src/folder-view.js';
import type { FolderSources } from '../src/folder-view.js';
import { noteMetaFrom } from '../src/note-meta.js';
import type { NoteMeta } from '../src/note-meta.js';

const NOW = Date.parse('2026-09-28T12:00:00Z');
const DIR = '1-Projects/Flat hunt';

function file(
  name: string,
  mimeType: string,
  modifiedTime: string,
  extra: Partial<DriveFile> = {},
): DriveFile {
  return {
    id: `id-${name}`,
    name,
    mimeType,
    parents: ['FOLDER_ID'],
    path: `${DIR}/${name}`,
    modifiedTime,
    ...extra,
  };
}

const pdf = file(
  'Arlington Road, 2 bed.pdf',
  'application/pdf',
  '2026-09-27T08:00:00Z',
);
const note = file(
  'Arlington Road, 2 bed.md',
  'text/markdown',
  '2026-09-27T09:00:00Z',
);
const answer = file(
  'Which flat should we view first.md',
  'text/markdown',
  '2026-09-27T10:00:00Z',
);
const photo = file(
  'Arlington Road, window sign.jpg',
  'image/jpeg',
  '2026-09-27T07:00:00Z',
  {
    size: 2.4 * 1024 * 1024,
  },
);
const lease = file(
  'Lease agreement 2026.pdf',
  'application/pdf',
  '2026-09-27T06:00:00Z',
);
const budget = file('Flat budget.csv', 'text/csv', '2026-09-24T09:00:00Z', {
  appProperties: { bowerOrigin: 'drive' },
});
const viewing = file(
  'Notes from the viewing.md',
  'text/markdown',
  '2026-09-23T09:00:00Z',
);

const ITEMS = [pdf, note, answer, photo, lease, budget, viewing];

const METAS = new Map<string, NoteMeta>([
  [
    note.id,
    noteMetaFrom({
      kind: 'rental-listing',
      original: '[[Arlington Road, 2 bed.pdf]]',
    }),
  ],
  [answer.id, noteMetaFrom({ type: 'answer' })],
  [viewing.id, noteMetaFrom({ title: 'Notes' })],
]);

function sources(
  items: readonly DriveFile[] = ITEMS,
  metas: ReadonlyMap<string, NoteMeta> = METAS,
): FolderSources {
  return {
    items,
    byPath: new Map(items.map((item) => [item.path, item])),
    metas,
    origins: new Map(),
    catalogueFiles: new Map(),
  };
}

const title = (row: { file: DriveFile }): string =>
  row.file.name.replace(/\.[^.]+$/, '');

describe('folder model (Flat hunt)', () => {
  const model = buildFolderModel(sources());

  it('counts the origin filter: 5 originals, 2 by Bower', () => {
    expect(model.originals.map((f) => f.id).sort()).toEqual(
      [pdf, photo, lease, budget, viewing].map((f) => f.id).sort(),
    );
    expect(model.bower.map((f) => f.id).sort()).toEqual(
      [note, answer].map((f) => f.id).sort(),
    );
    expect(metaCounts(model)).toBe('7 things · 5 originals, 2 by Bower');
  });

  it('says when something was last filed', () => {
    expect(lastFiled(ITEMS, NOW)).toBe('Last filed yesterday');
    expect(lastFiled([], NOW)).toBeNull();
  });

  it('shows a PDF with its companion note as one row in All, one each in Originals and By Bower', () => {
    const all = rowsFor(model, 'all');
    expect(all).toHaveLength(6);
    const pair = all.find((row) => row.file.id === note.id);
    expect(pair?.original?.id).toBe(pdf.id);
    expect(pair?.kind).toBe('pdf');
    expect(all.some((row) => row.file.id === pdf.id)).toBe(false);

    const originals = rowsFor(model, 'originals');
    expect(originals).toHaveLength(5);
    expect(originals.some((row) => row.file.id === pdf.id)).toBe(true);
    expect(originals.some((row) => row.file.id === note.id)).toBe(false);

    const bower = rowsFor(model, 'bower');
    expect(bower.map((row) => row.file.id).sort()).toEqual(
      [note, answer].map((f) => f.id).sort(),
    );
  });

  it('marks the answer, and names what a note is about', () => {
    const answerRow = rowsFor(model, 'all').find(
      (r) => r.file.id === answer.id,
    );
    expect(answerRow?.answer).toBe(true);
    expect(answerRow?.bower).toBe(true);
    expect(subjectOf(METAS.get(note.id))).toBe('listing');
    expect(subjectOf(undefined)).toBe('original');
  });

  it('pairs by name alone, but never a note the person wrote', () => {
    const sameNameNote = file(
      'Lease agreement 2026.md',
      'text/markdown',
      '2026-09-27T06:30:00Z',
    );
    const byName = buildFolderModel(sources([lease, sameNameNote], new Map()));
    expect(byName.pairs.size).toBe(1);
    const mine = buildFolderModel({
      ...sources([lease, sameNameNote], new Map()),
      origins: new Map([[sameNameNote.path.toLowerCase(), 'yours' as const]]),
    });
    expect(mine.pairs.size).toBe(0);
    expect(mine.bower).toHaveLength(0);
  });

  it('shows a pair whose original moved elsewhere as separate rows', () => {
    const moved = buildFolderModel(sources([note, lease]));
    expect(moved.pairs.size).toBe(0);
    const rows = rowsFor(moved, 'all');
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.original === undefined)).toBe(true);
  });
});

describe('sort, kind filter and date groups', () => {
  const model = buildFolderModel(sources());
  const rows = rowsFor(model, 'all');

  it('sorts newest first, oldest first, by name and by kind', () => {
    expect(sortRows(rows, 'newest', title).map(title)[0]).toBe(
      'Which flat should we view first',
    );
    expect(sortRows(rows, 'oldest', title).map(title)[0]).toBe(
      'Notes from the viewing',
    );
    expect(sortRows(rows, 'name', title).map(title)).toEqual([
      'Arlington Road, 2 bed',
      'Arlington Road, window sign',
      'Flat budget',
      'Lease agreement 2026',
      'Notes from the viewing',
      'Which flat should we view first',
    ]);
    expect(sortRows(rows, 'kind', title).map((row) => row.kind)).toEqual([
      'note',
      'note',
      'pdf',
      'pdf',
      'photo',
      'csv',
    ]);
  });

  it('lists only the kinds present, with counts', () => {
    expect(kindOptions(rows)).toEqual([
      { kind: 'note', label: 'Note', plural: 'Notes', count: 2 },
      { kind: 'pdf', label: 'PDF', plural: 'PDFs', count: 2 },
      { kind: 'photo', label: 'Photo', plural: 'Photos', count: 1 },
      {
        kind: 'csv',
        label: 'Spreadsheet (CSV)',
        plural: 'Spreadsheets (CSV)',
        count: 1,
      },
    ]);
    expect(filterKind(rows, 'pdf')).toHaveLength(2);
    expect(filterKind(rows, null)).toHaveLength(6);
  });

  it('groups by Today, Yesterday, This week, Earlier this month, then by month', () => {
    const groups = groupRows(sortRows(rows, 'newest', title), NOW);
    expect(groups.map((g) => [g.label, g.rows.length])).toEqual([
      ['Yesterday', 4],
      ['This week', 2],
    ]);
    expect(groupLabel('2026-09-28T01:00:00Z', NOW)).toBe('Today');
    expect(groupLabel('2026-09-10T12:00:00Z', NOW)).toBe('Earlier this month');
    expect(groupLabel('2026-08-10T12:00:00Z', NOW)).toBe('August');
    expect(groupLabel('2025-12-10T12:00:00Z', NOW)).toBe('December 2025');
    expect(groupLabel('', NOW)).toBe('Undated');
  });
});

describe('subfolderThings (#950, K-31)', () => {
  it('counts everything inside, folders too, but not the folder page Bower wrote', () => {
    const hub: DriveFile = {
      id: 'hub',
      name: 'Apps.md',
      mimeType: 'text/markdown',
      parents: [],
      path: 'P/Apps/Apps.md',
    };
    const folders = [{ path: 'P/Apps' }, { path: 'P/Apps/Old' }];
    const byPath = new Map([[hub.path, hub]]);
    // folderContents counts the notes and files inside, the hub page too.
    const sub = { path: 'P/Apps', things: 10 };
    expect(subfolderThings(sub, folders, byPath, new Set(['hub']))).toBe(10);
    expect(subfolderThings(sub, folders, byPath, new Set())).toBe(11);
  });
});

describe('subfolderThings at every depth (#950, HM-Main)', () => {
  it("leaves out Bower's folder page of the folder and of every folder under it", () => {
    const page = (path: string): DriveFile => ({
      id: path,
      name: path.slice(path.lastIndexOf('/') + 1),
      mimeType: 'text/markdown',
      parents: [],
      path,
    });
    const housing = 'P/Housing Search Australia';
    const moonee = `${housing}/Moonee Ponds`;
    const folders = [
      { path: housing },
      { path: moonee },
      { path: `${moonee}/Listings` },
    ];
    const pages = [
      page(`${housing}/Housing Search Australia.md`),
      page(`${moonee}/Moonee Ponds.md`),
    ];
    const byPath = new Map(pages.map((one) => [one.path, one]));
    expect(folderPagesUnder(folders, byPath, housing)).toHaveLength(2);
    // Two pages, six notes and six PDFs inside, as folderContents counts
    // them; plus Moonee Ponds and Listings; less the two pages: 14.
    const sub = { path: housing, things: 14 };
    const bower = new Set(pages.map((one) => one.id));
    expect(subfolderThings(sub, folders, byPath, bower)).toBe(14);
  });
});
