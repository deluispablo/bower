import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addSent,
  instructionFileName,
  instructionNote,
  loadSent,
} from '../src/tell.js';
import type { SentItem } from '../src/tell.js';

// Built from local components (not an ISO/UTC string) so the local getters
// `instructionFileName` reads (`getFullYear`, `getHours`, …) are stable no
// matter which timezone the test runner is in.
const NOW = new Date(2026, 8, 26, 14, 5, 0, 0); // 2026-09-26 14:05 local

describe('instructionFileName', () => {
  it('uses the title when one is given', () => {
    expect(instructionFileName('the body text', 'Recipes rule', NOW)).toBe(
      'Bower - 2026-09-26 1405 Recipes rule.md',
    );
  });

  it('falls back to the first six words of the text when there is no title', () => {
    expect(
      instructionFileName(
        'file every receipt under Finance and tag it as such',
        '',
        NOW,
      ),
    ).toBe('Bower - 2026-09-26 1405 file every receipt under Finance and.md');
  });

  it('ignores a blank (whitespace-only) title', () => {
    expect(instructionFileName('what did I save about trips', '   ', NOW)).toBe(
      'Bower - 2026-09-26 1405 what did I save about trips.md',
    );
  });

  it('strips characters illegal in a file name', () => {
    expect(
      instructionFileName('body', 'Rent/Utilities: "who pays?"', NOW),
    ).toBe('Bower - 2026-09-26 1405 RentUtilities who pays.md');
  });

  it('caps the title at 60 characters', () => {
    const longTitle = 'x'.repeat(80);
    const name = instructionFileName('body', longTitle, NOW);
    const title = name.slice(
      'Bower - 2026-09-26 1405 '.length,
      name.length - '.md'.length,
    );
    expect(title.length).toBe(60);
  });

  it('pads the date and time', () => {
    const early = new Date(2026, 0, 5, 3, 7, 0, 0); // 2026-01-05 03:07 local
    expect(instructionFileName('a b c', '', early)).toBe(
      'Bower - 2026-01-05 0307 a b c.md',
    );
  });
});

describe('instructionNote', () => {
  it('builds frontmatter with tags, date and via, then the text', () => {
    const note = instructionNote(
      'From now on, file recipes under Cooking.',
      NOW,
    );
    expect(note).toBe(
      '---\n' +
        'tags: [instruction]\n' +
        `date: ${NOW.toISOString()}\n` +
        'via: app\n' +
        '---\n' +
        '\n' +
        'From now on, file recipes under Cooking.\n',
    );
  });

  it('trims surrounding whitespace from the text', () => {
    const note = instructionNote('  hello  \n', NOW);
    expect(note.endsWith('\nhello\n')).toBe(true);
  });
});

// --- sentItem helpers, with a stubbed localStorage --------------------

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadSent / addSent', () => {
  it('returns an empty list when nothing was stored', () => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    expect(loadSent()).toEqual([]);
  });

  it('round-trips an added item', () => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    const item: SentItem = {
      name: 'Bower - 2026-09-26 1405 a note.md',
      text: 'a note',
      sentAt: NOW.toISOString(),
    };

    const result = addSent(item);

    expect(result).toEqual([item]);
    expect(loadSent()).toEqual([item]);
  });

  it('keeps newest first', () => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    const first: SentItem = {
      name: 'a.md',
      text: 'a',
      sentAt: '2026-09-26T10:00:00.000Z',
    };
    const second: SentItem = {
      name: 'b.md',
      text: 'b',
      sentAt: '2026-09-26T11:00:00.000Z',
    };

    addSent(first);
    const result = addSent(second);

    expect(result).toEqual([second, first]);
  });

  it('caps the list at 50 entries', () => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    for (let i = 0; i < 55; i++) {
      addSent({
        name: `item-${i}.md`,
        text: `item ${i}`,
        sentAt: NOW.toISOString(),
      });
    }

    const result = loadSent();

    expect(result.length).toBe(50);
    // Newest (last added, item-54) stays at the front; oldest five fall off.
    expect(result[0]?.name).toBe('item-54.md');
    expect(result.some((item) => item.name === 'item-4.md')).toBe(false);
  });

  it('never throws when localStorage.getItem throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('unavailable');
      },
      setItem: () => {
        throw new Error('unavailable');
      },
    });

    expect(() => loadSent()).not.toThrow();
    expect(loadSent()).toEqual([]);
  });

  it('never throws when localStorage.setItem throws, and still returns the list', () => {
    const storage = createMemoryStorage();
    vi.stubGlobal('localStorage', {
      ...storage,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    });

    const item: SentItem = {
      name: 'a.md',
      text: 'a',
      sentAt: NOW.toISOString(),
    };

    expect(() => addSent(item)).not.toThrow();
    // setItem always throws, so nothing ever actually persists: each call
    // starts again from the (empty) underlying storage.
    expect(addSent(item)).toEqual([item]);
  });

  it('ignores malformed stored JSON', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => '{not json',
      setItem: () => {},
    });

    expect(loadSent()).toEqual([]);
  });

  it('ignores a stored value that is not an array of sent items', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ not: 'an array' }),
      setItem: () => {},
    });

    expect(loadSent()).toEqual([]);
  });
});
