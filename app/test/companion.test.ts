import { describe, expect, it } from 'vitest';

import {
  copyNotice,
  findCompanion,
  originalName,
  pageUrl,
  parseCatalogueFiles,
  sourceKindOf,
  sourceUrl,
  walkOf,
  whereToLook,
  withoutWhereToLook,
} from '../src/companion.js';
import type { DriveFile } from '../src/drive.js';

function file(path: string, id = path): DriveFile {
  return {
    id,
    name: path.split('/').pop() ?? path,
    path,
    mimeType: path.endsWith('.md') ? 'text/markdown' : 'application/pdf',
    parents: [],
  };
}

const PDF = file('Flat/Lease.pdf');
const NOTE = file('Flat/Lease summary.md');
const SAME_NAME = file('Flat/Lease.md');

function sources(
  notes: DriveFile[],
  originals: Record<string, string> = {},
  catalogue: Record<string, string> = {},
) {
  return {
    notes,
    byPath: new Map(notes.map((note) => [note.path, note])),
    originals: new Map(Object.entries(originals)),
    catalogue: new Map(Object.entries(catalogue)),
  };
}

describe('findCompanion', () => {
  it('finds the note that names the file as its original', () => {
    const found = findCompanion(
      PDF,
      sources([NOTE], { [NOTE.id]: '[[Lease.pdf]]' }),
    );
    expect(found).toBe(NOTE);
  });

  it('prefers the original over a same-name note', () => {
    const found = findCompanion(
      PDF,
      sources([SAME_NAME, NOTE], { [NOTE.id]: '[[Flat/Lease.pdf|the lease]]' }),
    );
    expect(found).toBe(NOTE);
  });

  it('falls back to the catalogue row, then to the same name', () => {
    expect(
      findCompanion(PDF, sources([NOTE], {}, { 'lease.pdf': 'lease summary' })),
    ).toBe(NOTE);
    expect(findCompanion(PDF, sources([SAME_NAME]))).toBe(SAME_NAME);
  });

  it('finds none for a file nobody wrote about', () => {
    expect(findCompanion(PDF, sources([file('Flat/Other.md')]))).toBe(
      undefined,
    );
  });

  it('ignores notes in other folders', () => {
    const away = file('Work/Lease summary.md');
    expect(
      findCompanion(PDF, sources([away], { [away.id]: '[[Lease.pdf]]' })),
    ).toBe(undefined);
  });
});

describe('parseCatalogueFiles', () => {
  it('ties the files a note row links to that note', () => {
    const text = [
      '# Index',
      '- [[Lease summary]]: the tenancy ([[Lease.pdf]])',
      '- [[Photos/Sign.jpg]] · Photo · filed by Bower',
      '- [[Other note]]: nothing here',
    ].join('\n');
    expect([...parseCatalogueFiles(text)]).toEqual([
      ['lease.pdf', 'lease summary'],
    ]);
  });
});

describe('originalName', () => {
  it('reads a wikilink, a path and a plain name', () => {
    expect(originalName('[[A/Lease.PDF|alias]]')).toBe('lease.pdf');
    expect(originalName('Lease.pdf')).toBe('lease.pdf');
  });
});

const LONG = `---
pages: 42
---
Summary.

## Where to look
- [[Lease.pdf#page=4|p. 4]]: Rent, deposit
- [[Lease.pdf#page=12|p. 12]]: The break clause
- not a page link

## More
Tail.`;

describe('Where to look', () => {
  it('lists the page links in order', () => {
    expect(whereToLook(LONG)).toEqual([
      { page: 4, label: 'p. 4', text: 'Rent, deposit' },
      { page: 12, label: 'p. 12', text: 'The break clause' },
    ]);
  });

  it('is empty when the note has no such section', () => {
    expect(whereToLook('Just text.')).toEqual([]);
  });

  it('is taken out of the note the screen shows', () => {
    const rest = withoutWhereToLook(LONG);
    expect(rest).not.toContain('Where to look');
    expect(rest).toContain('Summary.');
    expect(rest).toContain('## More');
  });

  it('opens the file at the page', () => {
    expect(pageUrl('https://drive.example/view', 4)).toBe(
      'https://drive.example/view#page=4',
    );
  });
});

describe('copies', () => {
  it('says a Sheet is a copy, with the first-sheet sentence', () => {
    expect(copyNotice('sheet', 'Flat budget')).toBe(
      'A copy of your Google Sheet “Flat budget”. Bower keeps the first sheet only, as a table. The original, with all its sheets, stays where it was in your Drive.',
    );
  });

  it('has Doc and Slides variants, and copes with a lost name', () => {
    expect(copyNotice('doc', 'Notes')).toMatch(
      /^A copy of your Google Doc “Notes”\./,
    );
    expect(copyNotice('slides', null)).toMatch(
      /^A copy of your Google Slides\. /,
    );
  });

  it('reads the kind from the app property, and only when it is known', () => {
    expect(sourceKindOf({ appProperties: { bowerSourceKind: 'sheet' } })).toBe(
      'sheet',
    );
    expect(sourceKindOf({ appProperties: { bowerSourceKind: '' } })).toBe(null);
    expect(sourceKindOf({})).toBe(null);
  });

  it('opens the original in its own editor', () => {
    expect(sourceUrl('sheet', 'abc')).toBe(
      'https://docs.google.com/spreadsheets/d/abc/edit',
    );
  });
});

describe('walkOf', () => {
  const items = ['a', 'b', 'c'].map((id) => file(`F/${id}.pdf`, id));

  it('names the neighbours and the place', () => {
    const walk = walkOf(items, { id: 'b' });
    expect(walk?.previous?.id).toBe('a');
    expect(walk?.next?.id).toBe('c');
    expect([walk?.position, walk?.total]).toEqual([2, 3]);
  });

  it('has no previous at the start, no next at the end, nothing when absent', () => {
    expect(walkOf(items, { id: 'a' })?.previous).toBe(null);
    expect(walkOf(items, { id: 'c' })?.next).toBe(null);
    expect(walkOf(items, { id: 'z' })).toBe(null);
  });
});
