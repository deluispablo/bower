import { describe, expect, it } from 'vitest';

import { hasNoteProperties } from '../src/components/note-properties.js';
import type { NoteProperties } from '../src/markdown/frontmatter.js';

const EMPTY: NoteProperties = { tags: [] };

describe('hasNoteProperties (issue #307)', () => {
  it('is false with no folder, tags, created or source', () => {
    expect(hasNoteProperties(undefined, EMPTY)).toBe(false);
  });

  it('is true with a folder link alone', () => {
    expect(
      hasNoteProperties({ name: 'Garden', href: '/folder/Garden' }, EMPTY),
    ).toBe(true);
  });

  it('is true with tags alone', () => {
    expect(hasNoteProperties(undefined, { tags: ['travel'] })).toBe(true);
  });

  it('is true with created or source alone', () => {
    expect(
      hasNoteProperties(undefined, { tags: [], created: '2026-09-24' }),
    ).toBe(true);
    expect(
      hasNoteProperties(undefined, { tags: [], source: 'listing.pdf' }),
    ).toBe(true);
  });
});
