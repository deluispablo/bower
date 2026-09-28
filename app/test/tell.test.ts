import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearSent,
  firstLine,
  instructionBody,
  instructionFileName,
  instructionNote,
  isContextNote,
  rewriteInstruction,
} from '../src/tell.js';

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

  it('adds kind after via when given (the Bower tab writes request)', () => {
    const note = instructionNote('Which flat first?', NOW, 'request');
    expect(note).toBe(
      '---\n' +
        'tags: [instruction]\n' +
        `date: ${NOW.toISOString()}\n` +
        'via: app\n' +
        'kind: request\n' +
        '---\n' +
        '\n' +
        'Which flat first?\n',
    );
  });
});

describe('instructionBody / rewriteInstruction / isContextNote', () => {
  const note = instructionNote(
    'Make a packing list\nfor Lisbon',
    NOW,
    'request',
  );

  it('reads the words without the frontmatter', () => {
    expect(instructionBody(note)).toBe('Make a packing list\nfor Lisbon');
    expect(instructionBody('No frontmatter here\n')).toBe(
      'No frontmatter here',
    );
  });

  it('rewrites the words and keeps the frontmatter as written', () => {
    const rewritten = rewriteInstruction(
      note,
      '  Make a packing list for Porto ',
    );
    expect(rewritten).toBe(
      '---\ntags: [instruction]\n' +
        `date: ${NOW.toISOString()}\n` +
        'via: app\nkind: request\n---\n\n' +
        'Make a packing list for Porto\n',
    );
    expect(instructionBody(rewritten)).toBe('Make a packing list for Porto');
  });

  it('keeps a CRLF frontmatter as it is', () => {
    const crlf =
      '---\r\ntags: [instruction]\r\nvia: app\r\n---\r\n\r\nOld words\r\n';
    expect(rewriteInstruction(crlf, 'New words')).toBe(
      '---\r\ntags: [instruction]\r\nvia: app\r\n---\n\nNew words\n',
    );
  });

  it("tells Add's context note apart from a request", () => {
    expect(isContextNote(instructionNote('Receipts', NOW, 'context'))).toBe(
      true,
    );
    expect(isContextNote(note)).toBe(false);
    expect(isContextNote('kind: context\n')).toBe(false);
  });
});

// --- The old sent list, with a stubbed localStorage -------------------

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

describe('clearSent', () => {
  it('drops the sent list older versions kept', () => {
    const storage = createMemoryStorage();
    vi.stubGlobal('localStorage', storage);
    storage.setItem('bower.tell.sent', '[]');
    storage.setItem('theme', 'dark');

    clearSent();

    expect(storage.getItem('bower.tell.sent')).toBeNull();
    expect(storage.getItem('theme')).toBe('dark');
  });

  it('never throws when localStorage.removeItem is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {
        throw new Error('blocked');
      },
    });

    expect(() => {
      clearSent();
    }).not.toThrow();
  });
});

describe('firstLine', () => {
  it('returns the whole text when it is one short line', () => {
    expect(firstLine('file every receipt under Finance')).toBe(
      'file every receipt under Finance',
    );
  });

  it('drops everything after the first newline', () => {
    expect(firstLine('first line\nsecond line')).toBe('first line');
  });

  it('shortens a line over 140 characters with an ellipsis', () => {
    const long = 'x'.repeat(150);
    const result = firstLine(long);
    expect(result).toBe(`${'x'.repeat(140)}…`);
  });
});
