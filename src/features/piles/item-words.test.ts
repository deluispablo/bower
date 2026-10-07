import { describe, expect, it } from 'vitest';
import { itemLine, pileLine } from './item-words';

const item = { id: 'i', name: 'a.pdf', kind: 'pdf' as const, origin: 'From Mail' };

describe('what a thing in a pile says', () => {
  it('where it came from once it is in Drive', () => expect(itemLine(item)).toBe('From Mail'));
  it("that it did not arrive", () => expect(itemLine({ ...item, upload: -1 })).toBe("Didn't arrive"));
  it('a file whose bytes this device lost asks to choose the file again', () => {
    expect(itemLine({ ...item, upload: -1, chooseAgain: true })).toBe("Didn't arrive. Choose the file again.");
    expect(itemLine({ ...item, kind: 'link', upload: -1, chooseAgain: true })).toBe("Didn't arrive");
  });
  it('a percentage only when one is really known', () => {
    expect(itemLine({ ...item, upload: 0 })).toBe('Sending…');
    expect(itemLine({ ...item, upload: 0.4 })).toBe('Sending… 40%');
    expect(itemLine({ ...item, upload: 0.99 })).toBe('Sending…');
  });
});

describe('a pile page', () => {
  it('a pile says its day as Home does', () => {
    const now = Date.parse('2026-10-05T12:00:00');
    expect(pileLine({ things: 9, onlyNote: false, createdAt: Date.parse('2026-10-03T09:00:00') }, now)).toBe('9 things, added 3 Oct');
    expect(pileLine({ things: 0, onlyNote: true, createdAt: now - 5 * 60_000 }, now)).toBe('A note, added 5 min ago. Bower files it as a note where it belongs.');
    expect(pileLine({ things: 1, onlyNote: false, createdAt: Date.parse('2026-10-05T09:30:00') }, now)).toBe('1 thing, added today, 09:30');
    expect(pileLine({ things: 0, onlyNote: false, createdAt: now - 5 * 60_000 }, now)).toBe('Nothing in it, added 5 min ago');
  });
});
