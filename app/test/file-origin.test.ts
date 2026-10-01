import { describe, expect, it } from 'vitest';

import { FIXTURE_FILES } from '../src/demo/fixture.js';
import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import {
  CATALOGUE_PATH,
  originLine,
  originOf,
  parseCatalogueOrigins,
  parseOrigin,
} from '../src/file-origin.js';
import { folderContents, folderOf } from '../src/navigation.js';
import { buildVaultIndex, fileTitle } from '../src/vault-index.js';

function file(
  path: string,
  mimeType: string,
  appProperties?: Record<string, string>,
): DriveFile {
  const name = path.split('/').pop() ?? path;
  const result: DriveFile = { id: path, name, mimeType, parents: [], path };
  if (appProperties !== undefined) result.appProperties = appProperties;
  return result;
}

describe('parseOrigin', () => {
  it('reads a key or a label, in any letter case', () => {
    expect(parseOrigin('filed')).toBe('filed');
    expect(parseOrigin(' Filed by Bower ')).toBe('filed');
    expect(parseOrigin('your note')).toBe('yours');
    expect(parseOrigin('Bower wrote it when you asked')).toBe('asked');
    expect(parseOrigin('from your Drive, as Markdown')).toBe('drive');
  });

  it('is null for anything else', () => {
    expect(parseOrigin('PDF')).toBeNull();
    expect(parseOrigin('')).toBeNull();
  });
});

describe('parseCatalogueOrigins', () => {
  it('keys each row with an origin by its link target', () => {
    const origins = parseCatalogueOrigins(
      [
        '# Index',
        '',
        '## Projects',
        '- [[Flat hunt]]: finding a flat before March',
        '- [[1-Projects/Flat hunt/Lease agreement 2026.pdf]] · PDF · filed by Bower',
        '* [[1-Projects/Flat hunt/Window sign.jpg|Window sign]] · Photo · filed',
        '- [[Viewing checklist]] · note · Bower wrote it when you asked',
        '- [[Budget]] · note · a note about money',
        'Not a row [[Loose.pdf]] · filed',
      ].join('\r\n'),
    );
    expect([...origins]).toEqual([
      ['1-projects/flat hunt/lease agreement 2026.pdf', 'filed'],
      ['1-projects/flat hunt/window sign.jpg', 'filed'],
      ['viewing checklist', 'asked'],
    ]);
  });

  it('keeps the first row for a target', () => {
    const origins = parseCatalogueOrigins(
      '- [[a.pdf]] · filed\n- [[A.pdf]] · your note\n',
    );
    expect(origins.get('a.pdf')).toBe('filed');
  });

  it('reads rules v24 rows, with tags and a description, as it reads v23 rows', () => {
    const v23 = parseCatalogueOrigins(
      [
        '- [[1-Projects/Flat hunt/Arlington Road, listing.pdf]] · PDF · filed by Bower',
        '- [[1-Projects/Flat hunt/Arlington Road, 2 bed]] · Note · filed by Bower',
      ].join('\n'),
    );
    const v24 = parseCatalogueOrigins(
      [
        '## Projects',
        '- [[1-Projects/Flat hunt/Arlington Road, listing.pdf]] · PDF · #rental-listing #flat-hunt · Listing for a two-bed flat on Arlington Road · filed by Bower',
        '- [[1-Projects/Flat hunt/Arlington Road, 2 bed]] · Note · #rental-listing · Two-bed flat, available in November · filed by Bower · [[1-Projects/Flat hunt/Arlington Road, listing.pdf]]',
      ].join('\n'),
    );
    expect([...v24]).toEqual([...v23]);
    expect([...v24]).toEqual([
      ['1-projects/flat hunt/arlington road, listing.pdf', 'filed'],
      ['1-projects/flat hunt/arlington road, 2 bed', 'filed'],
    ]);
  });

  it('finds nothing in the Tags section', () => {
    const origins = parseCatalogueOrigins(
      [
        '## Tags',
        '- #rental-listing · A listing of a flat or house to rent · 3',
        '- #filed · filed by Bower · 1',
        '',
      ].join('\n'),
    );
    expect(origins.size).toBe(0);
  });
});

describe('originOf', () => {
  const catalogue = parseCatalogueOrigins(
    [
      '- [[1-Projects/Flat hunt/Lease.pdf]] · PDF · filed by Bower',
      '- [[1-Projects/Flat hunt/Viewing notes]] · note · from your Drive, as Markdown',
      '- [[Checklist]] · note · Bower wrote it when you asked',
    ].join('\n'),
  );

  it("prefers the file's own app property", () => {
    const lease = file('1-Projects/Flat hunt/Lease.pdf', 'application/pdf', {
      bowerOrigin: 'yours',
    });
    expect(originOf(lease, catalogue)).toBe('yours');
  });

  it('falls back to the catalogue when the property is missing or unknown', () => {
    const lease = file('1-Projects/Flat hunt/Lease.pdf', 'application/pdf', {
      bowerOrigin: 'somewhere',
    });
    expect(originOf(lease, catalogue)).toBe('filed');
  });

  it('matches a note linked without its extension, or by name alone', () => {
    const viewing = file(
      '1-Projects/Flat hunt/Viewing notes.md',
      'text/markdown',
    );
    const checklist = file(
      '1-Projects/Flat hunt/Checklist.md',
      'text/markdown',
    );
    expect(originOf(viewing, catalogue)).toBe('drive');
    expect(originOf(checklist, catalogue)).toBe('asked');
  });

  it('does not match a row for the same name in another folder', () => {
    const other = file('2-Areas/Home/Lease.pdf', 'application/pdf');
    expect(originOf(other, catalogue)).toBeNull();
  });
});

describe('originLine', () => {
  it('gives a file its type and origin, or just its type when unknown (#502)', () => {
    const pdf = file('a/Lease.pdf', 'application/pdf');
    const photo = file('a/Sign.jpg', 'image/jpeg');
    expect(originLine(pdf, 'filed')).toBe('PDF · filed by Bower');
    expect(originLine(photo, null)).toBe('Photo');
  });

  it('gives a note its origin alone, or just "Note" when unknown (#502)', () => {
    const note = file('a/Budget.md', 'text/markdown');
    expect(originLine(note, 'yours')).toBe('Your note');
    expect(originLine(note, 'asked')).toBe('Bower wrote it when you asked');
    expect(originLine(note, null)).toBe('Note');
  });
});

describe('the demo fixture', () => {
  it('lists a project folder’s PDF, photo and notes, newest first, with who put each there', () => {
    const folders = new Set<string>();
    for (const entry of FIXTURE_FILES) {
      for (let dir = folderOf(entry.path); dir !== ''; dir = folderOf(dir)) {
        folders.add(dir);
      }
    }
    const files: DriveFile[] = [
      ...[...folders].map((path) => file(path, FOLDER_MIME)),
      ...FIXTURE_FILES.map((entry) => {
        const driveFile = file(
          entry.path,
          entry.mimeType ?? 'text/markdown',
          entry.appProperties === undefined
            ? undefined
            : { ...entry.appProperties },
        );
        driveFile.modifiedTime = entry.modifiedTime;
        return driveFile;
      }),
    ];
    const index = buildVaultIndex(files);
    const catalogueText = FIXTURE_FILES.find(
      (entry) => entry.path === CATALOGUE_PATH,
    )?.content;
    expect(typeof catalogueText).toBe('string');
    const catalogue = parseCatalogueOrigins(
      typeof catalogueText === 'string' ? catalogueText : '',
    );

    const contents = folderContents(index, '4-Archives/Kitchen Refresh');
    expect(contents?.fileCount).toBe(2);
    expect(
      contents?.items.map((item) => [
        fileTitle(item.name),
        originLine(item, originOf(item, catalogue)),
      ]),
    ).toEqual([
      ['Sage green test patch', 'Photo · filed by Bower'],
      ['Shelves and tap quote', 'PDF · filed by Bower'],
      ['Kitchen Refresh', 'Note'],
      ['Paint colours', 'Note'],
      ['Quotes from fitters', 'Note'],
    ]);
  });
});
