import { describe, expect, it } from 'vitest';
import { formerNames } from './links';

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
});
