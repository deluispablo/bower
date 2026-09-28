import { describe, expect, it } from 'vitest';

import {
  formatSize,
  previewKind,
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
    expect(previewKind({ name: 'a.zip', mimeType: 'application/zip' })).toBe(
      'thumbnail',
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
