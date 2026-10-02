/** The meta line, kind words and short dates (#905, spec §3.5, K-14..K-16). */

import { describe, expect, it } from 'vitest';

import { FOLDER_MIME } from '../src/drive.js';
import {
  dayWords,
  kindLabel,
  metaLine,
  shortDate,
  sizeWords,
  writtenWords,
} from '../src/meta-line.js';

/** 30 Sep 2026, 09:15 local time: every test injects this clock. */
const NOW = new Date(2026, 8, 30, 9, 15);

const PDF = 'application/pdf';
const MD = 'text/markdown';

describe('shortDate', () => {
  it('shows the time on the same local day', () => {
    expect(shortDate(new Date(2026, 8, 30, 6, 54), NOW)).toBe('06:54');
  });
  it('shows day and month on another day of the year', () => {
    expect(shortDate(new Date(2026, 8, 29, 23, 5), NOW)).toBe('29 Sep');
  });
  it('adds the year for another year', () => {
    expect(shortDate(new Date(2025, 8, 29, 12, 0), NOW)).toBe('29 Sep 2025');
  });
  it('takes ISO text and epoch milliseconds too', () => {
    const iso = new Date(2026, 0, 3, 8, 0).toISOString();
    expect(shortDate(iso, NOW.getTime())).toBe('3 Jan');
  });
  it('gives nothing for an unreadable date', () => {
    expect(shortDate('not a date', NOW)).toBe('');
  });
});

describe('dayWords', () => {
  it('reads today, yesterday, then the date', () => {
    expect(dayWords(new Date(2026, 8, 30, 1, 0), NOW)).toBe('today');
    expect(dayWords(new Date(2026, 8, 29, 23, 0), NOW)).toBe('yesterday');
    expect(dayWords(new Date(2026, 8, 27, 10, 0), NOW)).toBe('27 Sep');
  });
});

describe('sizeWords', () => {
  it('writes kilobytes and megabytes, never under 1 KB', () => {
    expect(sizeWords(300)).toBe('1 KB');
    expect(sizeWords(117 * 1024)).toBe('117 KB');
    expect(sizeWords(2.4 * 1024 * 1024)).toBe('2.4 MB');
  });
});

describe('kindLabel', () => {
  const cases: [string, Parameters<typeof kindLabel>[0], string][] = [
    [
      'Bower note',
      { name: 'Moonee Ponds.md', mimeType: MD, bowerWritten: true },
      'Bower note',
    ],
    [
      'Bower answer',
      { name: 'Answer.md', mimeType: MD, bowerWritten: true, answer: true },
      'Bower answer',
    ],
    ['your note', { name: 'Ideas.md', mimeType: MD }, 'Note'],
    ['PDF', { name: 'Passport copy.pdf', mimeType: PDF }, 'PDF'],
    [
      'Word',
      {
        name: 'CV Australia.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      'Word',
    ],
    [
      'Google Doc',
      {
        name: 'Cover Letter - Alex',
        mimeType: 'application/vnd.google-apps.document',
      },
      'Word',
    ],
    [
      'Spreadsheet',
      {
        name: 'Budget.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      'Spreadsheet',
    ],
    ['Photo', { name: 'Balcony.jpg', mimeType: 'image/jpeg' }, 'Photo'],
    [
      'Link',
      { name: 'Link - example.com 2026-09-30 0654.md', mimeType: MD },
      'Link',
    ],
    ['Folder', { name: 'Listings', mimeType: FOLDER_MIME }, 'Folder'],
    ['fallback', { name: 'archive.zip', mimeType: 'application/zip' }, 'File'],
  ];
  it.each(cases)('%s', (_label, item, word) => {
    expect(kindLabel(item)).toBe(word);
  });
});

describe('metaLine', () => {
  const now = NOW;

  it('builds a root folder title', () => {
    const meta = metaLine(
      {
        name: '1-Projects',
        mimeType: FOLDER_MIME,
        root: 'projects',
        rootName: '1-Projects',
        count: 7,
        updated: new Date(2026, 8, 30, 6, 54).toISOString(),
      },
      { view: 'title', now },
    );
    expect(meta.text).toBe('Projects · 7 things · updated today');
    expect(meta.dot).toEqual({ at: 0, root: 'projects' });
  });

  it('builds a subfolder title with its lifecycle', () => {
    const meta = metaLine(
      {
        name: 'Visa & Immigration',
        mimeType: FOLDER_MIME,
        root: 'areas',
        rootName: '2-Areas',
        lifecycle: 'Active',
        count: 2,
        updated: new Date(2026, 8, 29, 18, 0).toISOString(),
      },
      { view: 'title', now },
    );
    expect(meta.text).toBe('Areas · Active · 2 things · updated yesterday');
  });

  it('counts subfolders for a folder of folders', () => {
    const meta = metaLine(
      {
        name: '2-Areas',
        mimeType: FOLDER_MIME,
        root: 'areas',
        rootName: '2-Areas',
        count: 1,
        countUnit: 'folder',
        updated: new Date(2026, 8, 30, 7, 0).toISOString(),
      },
      { view: 'title', now },
    );
    expect(meta.text).toBe('Areas · 1 folder · updated today');
  });

  it('builds a note title with its date', () => {
    const meta = metaLine(
      {
        name: 'CV insights.md',
        mimeType: MD,
        bowerWritten: true,
        modified: new Date(2026, 8, 29, 10, 0).toISOString(),
      },
      { view: 'title', now },
    );
    expect(meta.text).toBe('Bower note · 29 Sep');
    expect(meta.dot).toBeNull();
  });

  it('builds a file title with size and who filed it', () => {
    const meta = metaLine(
      {
        name: 'Passport copy.pdf',
        mimeType: PDF,
        size: 117 * 1024,
        filed: 'filed by Bower yesterday',
      },
      { view: 'title', now },
    );
    expect(meta.text).toBe('PDF · 117 KB · filed by Bower yesterday');
  });

  it('builds the preview column line for a small Bower note', () => {
    const meta = metaLine(
      {
        name: '10-43 Buckley St.md',
        mimeType: MD,
        bowerWritten: true,
        size: 800,
        filed: 'filed by Bower today',
      },
      { view: 'title', now },
    );
    expect(meta.text).toBe('Bower note · 1 KB · filed by Bower today');
  });

  it('shows only the kind in a one-folder row', () => {
    const meta = metaLine(
      {
        name: 'Buckley St.md',
        mimeType: MD,
        bowerWritten: true,
        parentName: 'Moonee Ponds',
      },
      { view: 'row', now },
    );
    expect(meta.text).toBe('Bower note');
    expect(meta.dot).toBeNull();
  });

  it('shows a folder row as its count', () => {
    const meta = metaLine(
      { name: 'Listings', mimeType: FOLDER_MIME, count: 6 },
      { view: 'row', now },
    );
    expect(meta.text).toBe('6 things');
  });

  it('adds where in a mixed list, with the dot before the parent', () => {
    const meta = metaLine(
      {
        name: 'Passport copy.pdf',
        mimeType: PDF,
        root: 'areas',
        parentName: 'Visa & Immigration',
      },
      { view: 'mixed-row', now },
    );
    expect(meta.text).toBe('PDF · Visa & Immigration');
    expect(meta.parts).toEqual(['PDF', 'Visa & Immigration']);
    expect(meta.dot).toEqual({ at: 1, root: 'areas' });
  });

  it('shows a root as its display name when it is the parent', () => {
    const meta = metaLine(
      { name: 'Ideas.md', mimeType: MD, root: 'areas', parentName: '2-Areas' },
      { view: 'mixed-row', now },
    );
    expect(meta.text).toBe('Note · Areas');
  });

  it('adds count and updated for a folder in a mixed list', () => {
    const meta = metaLine(
      {
        name: 'Moonee Ponds',
        mimeType: FOLDER_MIME,
        root: 'projects',
        parentName: 'Housing Search Australia',
        count: 7,
        updated: new Date(2026, 8, 30, 6, 0).toISOString(),
      },
      { view: 'mixed-row', now },
    );
    expect(meta.text).toBe(
      'Folder · Housing Search Australia · 7 things · updated today',
    );
  });
});

describe('writtenWords (About: Written)', () => {
  // Local dates, so the test reads the same in every time zone.
  const now = new Date(2026, 9, 2, 12, 0);

  it('shows a date with no time as the day, never as a time', () => {
    expect(writtenWords('2026-10-02', now)).toBe('2 Oct');
    expect(writtenWords('2026-09-28', now)).toBe('28 Sep');
    expect(writtenWords('2025-09-28', now)).toBe('28 Sep 2025');
  });

  it('shows the real local time of a date and time written today', () => {
    const written = new Date(2026, 9, 2, 10, 18);
    expect(writtenWords(written.toISOString(), now)).toBe('10:18');
    expect(writtenWords('2026-10-02T10:18:00', now)).toBe('10:18');
  });

  it('shows the day of a date and time written before today', () => {
    expect(writtenWords('2026-09-30T08:05:00', now)).toBe('30 Sep');
  });

  it('keeps text that is not a date as it is', () => {
    expect(writtenWords('last spring', now)).toBe('last spring');
  });
});
