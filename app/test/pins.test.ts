import { describe, expect, it } from 'vitest';

import {
  clearPinned,
  folderNoteName,
  folderNotePath,
  pinnedOf,
  setPinned,
  sortPinned,
} from '../src/pins.js';

const ISO = '2026-01-15T09:30:00.000Z';

describe('setPinned', () => {
  it('adds a minimal frontmatter block to a note with none', () => {
    expect(setPinned('# Ideas\n\nFirst.', ISO)).toBe(
      `---\npinned: ${ISO}\n---\n# Ideas\n\nFirst.`,
    );
  });

  it('adds pinned to a note with other frontmatter keys, leaving them as is', () => {
    const text = '---\ntags: [project]\ncreated: 2026-01-01\n---\nBody.';
    expect(setPinned(text, ISO)).toBe(
      `---\ntags: [project]\ncreated: 2026-01-01\npinned: ${ISO}\n---\nBody.`,
    );
  });

  it('replaces an existing pinned value in place, changing nothing else', () => {
    const text = `---\ntags: [project]\npinned: 2025-01-01T00:00:00.000Z\ncreated: 2026-01-01\n---\nBody.`;
    expect(setPinned(text, ISO)).toBe(
      `---\ntags: [project]\npinned: ${ISO}\ncreated: 2026-01-01\n---\nBody.`,
    );
  });

  it('leaves the body exactly as it was, byte for byte', () => {
    const body = '# Title\n\nA paragraph.\n\n- a\n- b\n';
    const text = `---\ntags: [x]\n---\n${body}`;
    expect(setPinned(text, ISO).endsWith(body)).toBe(true);
  });
});

describe('clearPinned', () => {
  it('removes pinned and strips the whole block when it was the only key', () => {
    const text = `---\npinned: ${ISO}\n---\nBody.`;
    expect(clearPinned(text)).toBe('Body.');
  });

  it('keeps every other frontmatter key when removing pinned', () => {
    const text = `---\ntags: [project]\npinned: ${ISO}\ncreated: 2026-01-01\n---\nBody.`;
    expect(clearPinned(text)).toBe(
      '---\ntags: [project]\ncreated: 2026-01-01\n---\nBody.',
    );
  });

  it('is a no-op on a note without pinned', () => {
    const text = '---\ntags: [project]\n---\nBody.';
    expect(clearPinned(text)).toBe(text);
  });

  it('is a no-op on a note with no frontmatter at all', () => {
    expect(clearPinned('Just a note.')).toBe('Just a note.');
  });

  it('strips an empty frontmatter block but keeps a folder note’s own content', () => {
    const text = `---\npinned: ${ISO}\n---\nThis describes the Move House folder.`;
    expect(clearPinned(text)).toBe('This describes the Move House folder.');
  });

  it('setPinned then clearPinned round-trips to the original text', () => {
    for (const original of [
      '# Ideas\n\nFirst.',
      '---\ntags: [project]\ncreated: 2026-01-01\n---\nBody.',
      '',
    ]) {
      expect(clearPinned(setPinned(original, ISO))).toBe(original);
    }
  });
});

describe('pinnedOf', () => {
  it('reads the pinned timestamp', () => {
    expect(pinnedOf(`---\npinned: ${ISO}\n---\nBody.`)).toBe(ISO);
  });

  it('reads pinned alongside other keys', () => {
    const text = `---\ntags: [project]\npinned: ${ISO}\n---\nBody.`;
    expect(pinnedOf(text)).toBe(ISO);
  });

  it('is null when absent, or when there is no frontmatter', () => {
    expect(pinnedOf('---\ntags: [project]\n---\nBody.')).toBeNull();
    expect(pinnedOf('Just a note.')).toBeNull();
  });
});

describe('sortPinned', () => {
  it('orders newest pin first', () => {
    const items = [
      { name: 'a', pinnedAt: '2026-01-01T00:00:00.000Z' },
      { name: 'b', pinnedAt: '2026-03-01T00:00:00.000Z' },
      { name: 'c', pinnedAt: '2026-02-01T00:00:00.000Z' },
    ];
    expect(sortPinned(items).map((i) => i.name)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate its input', () => {
    const items = [
      { name: 'a', pinnedAt: '2026-01-01T00:00:00.000Z' },
      { name: 'b', pinnedAt: '2026-02-01T00:00:00.000Z' },
    ];
    const copy = [...items];
    sortPinned(items);
    expect(items).toEqual(copy);
  });
});

describe('folderNoteName / folderNotePath', () => {
  it('names the note after the folder’s own last segment', () => {
    expect(folderNoteName('1-Projects/Move House')).toBe('_Move House.md');
    expect(folderNoteName('2-Areas')).toBe('_2-Areas.md');
  });

  it('places the note inside the folder itself', () => {
    expect(folderNotePath('1-Projects/Move House')).toBe(
      '1-Projects/Move House/_Move House.md',
    );
  });
});
