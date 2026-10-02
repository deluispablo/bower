import { describe, expect, it } from 'vitest';

import {
  FORMAT_POLICIES,
  FORMATS_EXPLANATION,
  MAX_READ_BYTES,
  MAX_READ_PAGES,
  READ_LIMITS_NOTICE,
  formatPolicy,
} from '../src/formats.js';
import type { AppShows, FormatPolicy } from '../src/formats.js';
import { FILE_KIND_LABELS } from '../src/vault-index.js';
import type { FileKind } from '../src/vault-index.js';

const OFFICE = 'Bower keeps it, not reads it. A Google Sheet works.';

type Row = [
  FileKind,
  'yes' | 'no',
  AppShows,
  string | null,
  string | null,
  string | null,
];

// kind, bowerReads, appShows, addNotice, queueLine, fileNotice
const rows: Row[] = [
  ['note', 'yes', 'text', null, null, null],
  ['markdown', 'yes', 'text', null, null, null],
  ['text', 'yes', 'text', null, null, null],
  ['email', 'yes', 'text', null, null, null],
  ['csv', 'yes', 'table', null, null, null],
  ['pdf', 'yes', 'page', null, null, null],
  ['photo', 'yes', 'image', null, null, null],
  ['image', 'yes', 'image', null, null, null],
  [
    'heic',
    'no',
    'drive-preview',
    "Bower keeps it by its date; it can't read this kind of photo yet.",
    "Kept, not read: Bower can't read this kind of photo yet",
    null,
  ],
  ['word', 'yes', 'none', null, null, null],
  ['opendocument', 'yes', 'drive-preview', null, null, null],
  ['web', 'yes', 'drive-preview', null, null, null],
  ['doc', 'yes', 'text', 'Saved as text', null, null],
  ['sheet', 'yes', 'table', 'Saved as a table, first sheet only', null, null],
  ['slides', 'yes', 'page', 'Saved as a PDF', null, null],
  [
    'excel',
    'no',
    'none',
    OFFICE,
    'Kept, not read: a Google Sheet works instead',
    OFFICE,
  ],
  [
    'powerpoint',
    'no',
    'none',
    OFFICE,
    'Kept, not read: a Google Sheet works instead',
    OFFICE,
  ],
  [
    'audio',
    'no',
    'player',
    "Bower can't listen to audio. Say what it is.",
    "Kept, not read: Bower can't listen to audio",
    null,
  ],
  [
    'video',
    'no',
    'player',
    "Bower can't watch videos. Say what it is.",
    "Kept, not read: Bower can't watch videos",
    "Bower can't watch videos.",
  ],
  [
    'zip',
    'no',
    'none',
    'Add the files inside instead.',
    'Kept, not read: add the files inside instead',
    null,
  ],
  [
    'file',
    'no',
    'none',
    'Bower will keep it, not read it.',
    'Kept, not read: Bower keeps it by its name',
    null,
  ],
];

describe('formats policy', () => {
  it.each(rows)(
    '%s: reads %s, shows %s',
    (kind, bowerReads, appShows, addNotice, queueLine, fileNotice) => {
      const expected: FormatPolicy = {
        bowerReads,
        appShows,
        addNotice,
        queueLine,
        fileNotice,
      };
      expect(formatPolicy(kind)).toEqual(expected);
      expect(FORMAT_POLICIES[kind]).toEqual(expected);
    },
  );

  it('has one row for every file kind', () => {
    expect(rows.map((row) => row[0]).sort()).toEqual(
      Object.keys(FILE_KIND_LABELS).sort(),
    );
    expect(Object.keys(FORMAT_POLICIES).sort()).toEqual(
      Object.keys(FILE_KIND_LABELS).sort(),
    );
  });

  it('gives every kept, not read kind a queue line and an Add notice', () => {
    for (const [kind, policy] of Object.entries(FORMAT_POLICIES)) {
      if (policy.bowerReads === 'no') {
        expect(policy.queueLine, kind).toMatch(/^Kept, not read: /);
        expect(policy.addNotice, kind).not.toBeNull();
      }
    }
  });

  it('states the limits and the explanation as the board words them', () => {
    expect(MAX_READ_BYTES).toBe(50 * 1024 * 1024);
    expect(MAX_READ_PAGES).toBe(300);
    expect(READ_LIMITS_NOTICE).toBe(
      'a file over 50 MB or a PDF over 300 pages is filed by name, not read; the working sheet says which.',
    );
    expect(FORMATS_EXPLANATION).toBe(
      '“Bower reads it” means it can name, file, describe and pull details from it. “Kept” means filed by its name and date, and Bower says so.',
    );
  });
});
