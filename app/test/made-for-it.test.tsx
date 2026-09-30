// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';

import {
  isMadeForName,
  MadeForIt,
  madeForItem,
} from '../src/components/made-for-it.js';
import { noteMetaFrom } from '../src/note-meta.js';

function candidate(
  name: string,
  madeFor: unknown,
): Parameters<typeof madeForItem>[1][number] {
  return {
    file: { id: `id-${name}`, name: `${name}.md`, path: `CVs/${name}.md` },
    meta: noteMetaFrom({ made_for: madeFor }),
  };
}

const ITEM = { path: 'Applications/Data Lead, Northwind.md' };

describe('madeForItem (R-VERDICT-3)', () => {
  it('lists the notes that point at the item, CVs before letters', () => {
    const notes = madeForItem(ITEM, [
      candidate('Letter · Northwind', '[[Data Lead, Northwind]]'),
      candidate('CV · Fabrikam', '[[Analytics Lead, Fabrikam]]'),
      candidate('CV · Northwind', '[[Applications/Data Lead, Northwind|offer]]'),
    ]);
    expect(notes.map((note) => note.name)).toEqual([
      'CV · Northwind',
      'Letter · Northwind',
    ]);
  });

  it('matches the item by its title too, and ignores notes without made_for', () => {
    const notes = madeForItem({ ...ITEM, title: 'Data Lead at Northwind' }, [
      candidate('CV · Northwind', '[[Data Lead at Northwind]]'),
      candidate('Letter · Northwind', undefined),
    ]);
    expect(notes.map((note) => note.name)).toEqual(['CV · Northwind']);
  });

  it('knows the R-AG-4 names', () => {
    expect(isMadeForName('CV · Northwind.md')).toBe(true);
    expect(isMadeForName('Letter · Northwind.md')).toBe(true);
    expect(isMadeForName('Notes on Northwind.md')).toBe(false);
  });
});

describe('MadeForIt', () => {
  it('renders the label and one button per note, nothing when empty', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    await act(() => {
      render(
        h(MadeForIt, {
          notes: [{ id: 'abc', name: 'CV · Northwind' }],
        }),
        root,
      );
    });
    expect(root.textContent).toContain('Made for it:');
    const link = root.querySelector<HTMLAnchorElement>('a.made-for-it-note');
    expect(link?.getAttribute('href')).toBe('/note/abc');
    expect(link?.textContent).toBe('CV · Northwind');
    await act(() => {
      render(h(MadeForIt, { notes: [] }), root);
    });
    expect(root.innerHTML).toBe('');
    root.remove();
  });
});
