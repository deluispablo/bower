import { describe, expect, it } from 'vitest';

import {
  drivePreviewUrl,
  formatDuration,
  formatSize,
  kindWord,
  metaFacts,
  previewKind,
  shortDate,
  thumbnailUrl,
  typeLine,
  whenLine,
} from '../src/file-preview.js';

const NOW = Date.parse('2026-09-28T12:00:00.000Z');

describe('previewKind', () => {
  it('shows an image a browser can draw inline', () => {
    expect(previewKind({ name: 'Patch.png', mimeType: 'image/png' })).toBe(
      'image',
    );
    expect(previewKind({ name: 'plan', mimeType: 'image/svg+xml' })).toBe(
      'image',
    );
  });

  it('shows a Google Doc as its exported text', () => {
    expect(
      previewKind({
        name: 'Minutes',
        mimeType: 'application/vnd.google-apps.document',
      }),
    ).toBe('text');
  });

  it("uses Drive's thumbnail for a PDF and for anything else", () => {
    expect(
      previewKind({ name: 'Lease.pdf', mimeType: 'application/pdf' }),
    ).toBe('thumbnail');
    expect(previewKind({ name: 'IMG_1.heic', mimeType: 'image/heic' })).toBe(
      'thumbnail',
    );
    expect(
      previewKind({
        name: 'Budget',
        mimeType: 'application/vnd.google-apps.spreadsheet',
      }),
    ).toBe('thumbnail');
  });

  it('has nothing to show for a ZIP or an unknown file', () => {
    expect(previewKind({ name: 'a.zip', mimeType: 'application/zip' })).toBe(
      'none',
    );
    expect(previewKind({ name: 'a.xyz', mimeType: '' })).toBe('none');
  });

  it('reads a CSV as a table and text as text', () => {
    expect(previewKind({ name: 'Budget.csv', mimeType: 'text/csv' })).toBe(
      'table',
    );
    expect(previewKind({ name: 'a.txt', mimeType: 'text/plain' })).toBe(
      'plain',
    );
  });

  it('gives Office files and video to Drive', () => {
    expect(
      previewKind({
        name: 'Costs.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ).toBe('drive');
    expect(previewKind({ name: 'Walk.mp4', mimeType: 'video/mp4' })).toBe(
      'drive',
    );
  });
});

describe('thumbnailUrl', () => {
  const LINK = 'https://lh3.googleusercontent.com/drive-storage/abc=s220';

  it('asks for a bigger picture than the default 220 px', () => {
    expect(thumbnailUrl(LINK)).toBe(
      'https://lh3.googleusercontent.com/drive-storage/abc=s1000',
    );
    expect(thumbnailUrl(LINK, 400)).toBe(
      'https://lh3.googleusercontent.com/drive-storage/abc=s400',
    );
  });

  it('keeps a link with no size suffix as it is', () => {
    const plain = 'https://lh4.googleusercontent.com/abc';
    expect(thumbnailUrl(plain)).toBe(plain);
  });

  it('is null without a link, or for one the CSP would block', () => {
    expect(thumbnailUrl(null)).toBeNull();
    expect(thumbnailUrl('not a url')).toBeNull();
    expect(thumbnailUrl('http://lh3.googleusercontent.com/abc')).toBeNull();
    expect(thumbnailUrl('https://docs.google.com/feeds/vt?id=1')).toBeNull();
    expect(
      thumbnailUrl('https://googleusercontent.com.example/abc'),
    ).toBeNull();
  });
});

describe('formatSize and typeLine', () => {
  it('says a size in bytes, KB or MB', () => {
    expect(formatSize(820)).toBe('820 bytes');
    expect(formatSize(14_200)).toBe('14 KB');
    expect(formatSize(1_234_567)).toBe('1.2 MB');
    expect(formatSize(23_400_000)).toBe('23 MB');
  });

  it('is the type word, then the size when Drive knows it', () => {
    expect(
      typeLine({
        name: 'Lease.pdf',
        mimeType: 'application/pdf',
        size: 1_200_000,
      }),
    ).toBe('PDF · 1.2 MB');
    expect(
      typeLine({
        name: 'Minutes',
        mimeType: 'application/vnd.google-apps.document',
      }),
    ).toBe('Google Doc');
  });
});

describe('whenLine', () => {
  it('says who put the file there and when', () => {
    expect(whenLine('filed', '2026-09-28T08:00:00.000Z', NOW)).toBe(
      'Filed by Bower · today',
    );
    expect(whenLine(null, '2026-09-25T08:00:00.000Z', NOW)).toBe(
      'In this folder · 3 days ago',
    );
    expect(whenLine('drive', undefined, NOW)).toBe(
      'From your Drive, as Markdown',
    );
  });
});

describe('drivePreviewUrl', () => {
  it('is the address of Drive embeddable viewer', () => {
    expect(drivePreviewUrl('a b')).toBe(
      'https://drive.google.com/file/d/a%20b/preview',
    );
  });
});

describe('formatDuration and shortDate', () => {
  it('says a length in words', () => {
    expect(formatDuration(45_000)).toBe('45 s');
    expect(formatDuration(134_000)).toBe('2 min 14 s');
    expect(formatDuration(120_000)).toBe('2 min');
    expect(formatDuration(3_900_000)).toBe('1 h 5 min');
  });

  it('says a day and month, from an ISO time or EXIF', () => {
    expect(shortDate('2026-09-26T11:20:00.000Z')).toBe('26 Sep');
    expect(shortDate('2024:05:01 10:00:00')).toBe('1 May');
    expect(shortDate('nonsense')).toBeNull();
    expect(shortDate(undefined)).toBeNull();
  });
});

describe('kindWord and metaFacts', () => {
  it('names a CSV a spreadsheet (CSV)', () => {
    expect(kindWord({ name: 'Budget.csv', mimeType: 'text/csv' })).toBe(
      'Spreadsheet (CSV)',
    );
    expect(kindWord({ name: 'a.zip', mimeType: 'application/zip' })).toBe(
      'ZIP archive',
    );
  });

  it('follows the boards for each kind', () => {
    expect(
      metaFacts({
        name: 'Sign.jpg',
        mimeType: 'image/jpeg',
        size: 2_400_000,
        imageMediaMetadata: { time: '2026:09:26 10:00:00' },
      }),
    ).toEqual(['Taken 26 Sep', '2.4 MB']);
    expect(
      metaFacts(
        { name: 'Budget.csv', mimeType: 'text/csv', size: 3000 },
        { rows: 24 },
      ),
    ).toEqual(['3 KB', '24 rows']);
    expect(
      metaFacts({
        name: 'Walk.mp4',
        mimeType: 'video/mp4',
        size: 86_000_000,
        modifiedTime: '2026-09-26T11:20:00.000Z',
        videoMediaMetadata: { durationMillis: 134_000 },
      }),
    ).toEqual(['2 min 14 s', '86 MB', '26 Sep']);
    expect(
      metaFacts(
        { name: 'Lease.pdf', mimeType: 'application/pdf', size: 1_100_000 },
        { pages: 42 },
      ),
    ).toEqual(['42 pages', '1.1 MB']);
  });

  it('leaves out what nobody knows', () => {
    expect(
      metaFacts({ name: 'Lease.pdf', mimeType: 'application/pdf' }),
    ).toEqual([]);
    expect(
      metaFacts({
        name: 'a.zip',
        mimeType: 'application/zip',
        size: 38_000_000,
      }),
    ).toEqual(['38 MB']);
  });
});
