import { describe, expect, it } from 'vitest';

import { askBowerHref, moreMenuMeta, moveToHref } from '../src/more-menu.js';

function prefill(href: string): string | null {
  return new URL(href, 'https://example.com').searchParams.get('text');
}

describe('moreMenuMeta (#352)', () => {
  it('reads "type · folder / subfolder", as the board draws it', () => {
    expect(moreMenuMeta('PDF', '1-Projects/Flat hunt/Lease 2026.pdf')).toBe(
      'PDF · 1-Projects / Flat hunt',
    );
  });

  it('is just the type word at the top of the Bower folder', () => {
    expect(moreMenuMeta('Folder', '1-Projects')).toBe('Folder');
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

describe('moveToHref (#302, #352)', () => {
  it('prefills the path in the move request words and nothing else', () => {
    expect(prefill(moveToHref('3-Resources/Recipe.md'))).toBe(
      '"3-Resources/Recipe.md" was misfiled. It should go to: ',
    );
  });
});
