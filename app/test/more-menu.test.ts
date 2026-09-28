import { describe, expect, it } from 'vitest';

import {
  askBowerHref,
  moreMenuHeader,
  showInFoldersHref,
} from '../src/more-menu.js';
import { revealHref } from '../src/reveal.js';

function prefill(href: string): string | null {
  return new URL(href, 'https://example.com').searchParams.get('text');
}

describe('moreMenuHeader (#352, #608)', () => {
  it('gives the type word and the folder with its PARA kind, as the board draws it', () => {
    expect(
      moreMenuHeader('PDF', '1-Projects/Flat hunt/Lease 2026.pdf'),
    ).toEqual({
      typeLabel: 'PDF',
      place: { label: 'Projects › Flat hunt', kind: 'projects' },
    });
    expect(
      moreMenuHeader('Note', '2-Areas/Home/Boiler.md').place?.label,
    ).not.toMatch(/[0-4]-/);
  });

  it('has a neutral kind for a folder that is not a landmark', () => {
    expect(moreMenuHeader('Note', 'Answers/Reply.md').place).toEqual({
      label: 'Answers',
      kind: null,
    });
  });

  it('has no place at the top of the Bower folder', () => {
    expect(moreMenuHeader('Folder', '1-Projects')).toEqual({
      typeLabel: 'Folder',
      place: null,
    });
  });
});

describe('askBowerHref (#352)', () => {
  it('names a note or a file as a wikilink, and nothing else', () => {
    expect(prefill(askBowerHref('note', 'Shopping list'))).toBe(
      '[[Shopping list]] ',
    );
    expect(prefill(askBowerHref('file', 'Lease 2026.pdf'))).toBe(
      '[[Lease 2026.pdf]] ',
    );
  });

  it('names a folder as "About <folder>: ", and nothing else (#354)', () => {
    expect(prefill(askBowerHref('folder', 'Flat hunt'))).toBe(
      'About Flat hunt: ',
    );
    expect(askBowerHref('folder', 'Flat hunt')).toBe(
      `/bower?text=${encodeURIComponent('About Flat hunt: ')}`,
    );
  });

  it('opens the Bower tab, the name encoded', () => {
    expect(askBowerHref('note', 'A & B').startsWith('/bower?text=')).toBe(true);
    expect(prefill(askBowerHref('note', 'A & B'))).toBe('[[A & B]] ');
  });
});

describe('showInFoldersHref (#608)', () => {
  it('reveals a note or a file by id, and a folder by path', () => {
    expect(showInFoldersHref('note', { id: 'n1', path: 'a/b.md' })).toBe(
      revealHref({ kind: 'note', id: 'n1', path: 'a/b.md' }),
    );
    expect(showInFoldersHref('file', { id: 'f1', path: 'a/b.pdf' })).toBe(
      '/notes?reveal=file%2Ff1',
    );
    expect(
      showInFoldersHref('folder', { id: 'd1', path: '1-Projects/Flat hunt' }),
    ).toBe(revealHref({ kind: 'folder', path: '1-Projects/Flat hunt' }));
  });
});
