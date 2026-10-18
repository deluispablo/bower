import { describe, expect, it } from 'vitest';
import { headingOrigin, itemLine, pileLine } from './item-words';

const item = { id: 'i', name: 'a.pdf', kind: 'pdf' as const, origin: 'From Mail' };

describe('what a thing in a pile says', () => {
  it('where it came from once it is in Drive', () => expect(itemLine(item)).toBe('From Mail'));
  it('nothing once the heading says where it came from, but a change still shows', () => {
    expect(itemLine(item, true)).toBeNull();
    expect(itemLine({ ...item, changed: true }, true)).toBe('Changed');
    expect(itemLine({ ...item, upload: 0.4 }, true)).toBe('Sending… 40%');
    expect(itemLine({ ...item, upload: -1 }, true)).toBe("Didn't arrive");
  });
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

  it('a pile from one origin says it once, after the count', () => {
    const now = Date.parse('2026-10-05T12:00:00');
    expect(pileLine({ things: 9, onlyNote: false, createdAt: Date.parse('2026-10-03T09:00:00'), origin: 'from your phone' }, now)).toBe('9 things from your phone, added 3 Oct');
    expect(pileLine({ things: 1, onlyNote: false, createdAt: Date.parse('2026-10-05T09:30:00'), origin: 'you pasted' }, now)).toBe('1 thing you pasted, added today, 09:30');
    expect(pileLine({ things: 2, onlyNote: false, createdAt: now - 5 * 60_000, origin: 'from Drive' }, now)).toBe('2 things from Drive, added 5 min ago');
    expect(pileLine({ things: 0, onlyNote: true, createdAt: now - 5 * 60_000, origin: null }, now)).toBe('A note, added 5 min ago. Bower files it as a note where it belongs.');
  });

  it('each origin has one heading phrase; mixed or unknown origins have none', () => {
    const phrases: Array<[string, string]> = [
      ['From this device', 'from this device'],
      ['From the camera', 'from the camera'],
      ['Dropped here', 'dropped here'],
      ['A link you pasted', 'you pasted'],
      ['Added in Drive', 'from Drive'],
      ['From this computer', 'from this computer'],
      ['From your phone', 'from your phone'],
      ['From Mail', 'from Mail'],
      ['From the browser', 'from the browser'],
    ];
    for (const [origin, phrase] of phrases) expect(headingOrigin([{ ...item, origin }, { ...item, id: 'j', origin, upload: 0 }])).toBe(phrase);
    expect(headingOrigin([item, { ...item, id: 'j', origin: 'From your phone' }])).toBeNull();
    expect(headingOrigin([{ ...item, origin: 'x' }])).toBeNull();
    expect(headingOrigin([{ ...item, origin: 'constructor' }])).toBeNull();
    expect(headingOrigin([])).toBeNull();
  });
});
