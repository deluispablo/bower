import { describe, expect, it } from 'vitest';
import { itemLine } from './item-words';

const item = { id: 'i', name: 'a.pdf', kind: 'pdf' as const, origin: 'From Mail' };

describe('what a thing in a pile says', () => {
  it('where it came from once it is in Drive', () => expect(itemLine(item)).toBe('From Mail'));
  it("that it did not arrive", () => expect(itemLine({ ...item, upload: -1 })).toBe("Didn't arrive"));
  it('a percentage only when one is really known', () => {
    expect(itemLine({ ...item, upload: 0 })).toBe('Sending…');
    expect(itemLine({ ...item, upload: 0.4 })).toBe('Sending… 40%');
    expect(itemLine({ ...item, upload: 0.99 })).toBe('Sending…');
  });
});
