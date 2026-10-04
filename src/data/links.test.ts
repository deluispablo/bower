import { describe, expect, it } from 'vitest';
import { formerNames, rewriteLinks } from './links';

describe('former names', () => {
  it('links follow a rename: a former name points to where the note is now, through two renames', () => {
    const map = formerNames([
      { id: '1', at: 1, kind: 'rename', what: '', path: 'P/Cobble.md', from: 'P/Flat 7, Cobble Row.md' },
      { id: '2', at: 2, kind: 'rename', what: '', path: 'P/Cobble Row flat.md', from: 'P/Cobble.md' },
      { id: '3', at: 3, kind: 'move', what: '', path: 'Q/Cobble Row flat.md', from: 'P/Cobble Row flat.md' },
    ]);
    expect(map.get('flat 7, cobble row')).toBe('Q/Cobble Row flat.md');
    expect(map.get('cobble')).toBe('Q/Cobble Row flat.md');
  });

  it('former names: a note inside a renamed folder is still found by its old name', () => {
    const map = formerNames([
      { id: '1', at: 1, kind: 'rename', what: '', path: 'P/Old/Cobble.md', from: 'P/Old/Flat 7.md' },
      { id: '2', at: 2, kind: 'rename', what: '', path: 'P/New', from: 'P/Old' },
    ]);
    expect(map.get('flat 7')).toBe('P/New/Cobble.md');
  });

  it('former names: a [[Name#heading]] link is rewritten with its heading kept', () => {
    const map = formerNames([{ id: '1', at: 1, kind: 'rename', what: '', path: 'P/Cobble.md', from: 'P/Flat 7.md' }]);
    expect(rewriteLinks('See [[Flat 7#Rent]] and [[Flat 7#Rent|the rent]].', map)).toBe('See [[Cobble#Rent]] and [[Cobble#Rent|the rent]].');
  });

  it('former names: a name another note has taken since is left alone', () => {
    const map = formerNames([{ id: '1', at: 1, kind: 'rename', what: '', path: 'P/Cobble.md', from: 'P/Flat 7.md' }], new Set(['flat 7']));
    expect(map.has('flat 7')).toBe(false);
    expect(rewriteLinks('See [[Flat 7]].', map)).toBe('See [[Flat 7]].');
  });
});

