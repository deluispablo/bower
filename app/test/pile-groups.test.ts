import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import {
  clearPileOrigins,
  groupByOrigin,
  pileConfirm,
  pileConfirmLine,
  pileHeading,
  pileOriginOf,
  pileSnippet,
  rememberPileOrigins,
} from '../src/pile-groups.js';
import type { Pile } from '../src/pile-store.js';

function pile(id: string, text: string, names: string[]): Pile {
  return {
    id,
    noteFileId: null,
    createdAt: '2026-09-30T10:00:00.000Z',
    text,
    items: names.map((name) => ({ name, state: 'done' as const })),
    closed: true,
  };
}

function inbox(name: string): DriveFile {
  return {
    id: name,
    name,
    mimeType: 'application/pdf',
    parents: ['INBOX'],
    path: `0-Inbox/${name}`,
  };
}

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pileHeading', () => {
  it('quotes the note, cut to one short line', () => {
    expect(pileHeading('Five job offers.\nScore them.')).toBe(
      'From your pile: “Five job offers. Score them.”',
    );
    expect(pileSnippet('x'.repeat(100))).toHaveLength(61);
    expect(pileSnippet('x'.repeat(100)).endsWith('…')).toBe(true);
  });

  it('says so when the pile has no note', () => {
    expect(pileHeading('  ')).toBe('From your pile: no note');
  });
});

describe('pileConfirm', () => {
  const piles = [
    pile('a', 'Job offers', ['a1.pdf', 'a2.pdf']),
    pile('b', 'Flat', ['b1.pdf']),
  ];

  it('names each pile with its things and counts what came from elsewhere', () => {
    const files = ['a1.pdf', 'a2.pdf', 'b1.pdf', 'x.pdf', 'y.pdf'].map(inbox);
    const confirm = pileConfirm(files, piles);
    expect(confirm?.piles.map((p) => [p.label, p.count])).toEqual([
      ['From your pile: “Job offers”', 2],
      ['From your pile: “Flat”', 1],
    ]);
    expect(confirm?.elsewhere).toBe(2);
    if (confirm === undefined) throw new Error('no piles');
    expect(pileConfirmLine(5, confirm)).toBe(
      '5 things: 2 piles and 2 added from elsewhere',
    );
    expect(pileConfirmLine(3, { ...confirm, elsewhere: 0 })).toBe(
      '3 things in 2 piles',
    );
  });

  it('is undefined when no pile has a thing waiting', () => {
    expect(pileConfirm([inbox('x.pdf')], piles)).toBeUndefined();
    expect(pileConfirm([], [])).toBeUndefined();
  });
});

describe('remembered origins', () => {
  it('finds the pile a file came from, and forgets on clear', () => {
    rememberPileOrigins([pile('a', 'Job offers', ['a1.pdf'])]);
    expect(pileOriginOf('a1.pdf')).toBe('From your pile: “Job offers”');
    expect(pileOriginOf('other.pdf')).toBeUndefined();
    clearPileOrigins();
    expect(pileOriginOf('a1.pdf')).toBeUndefined();
  });

  it('a blocked storage is not an error', () => {
    vi.stubGlobal('localStorage', {
      getItem: (): never => {
        throw new Error('blocked');
      },
    });
    expect(pileOriginOf('a1.pdf')).toBeUndefined();
  });
});

describe('groupByOrigin', () => {
  it('keeps first-seen order and puts the rest last', () => {
    const rows = [
      { n: 1, o: 'B' },
      { n: 2, o: undefined },
      { n: 3, o: 'A' },
      { n: 4, o: 'B' },
    ];
    expect(
      groupByOrigin(rows, (r) => r.o).map((g) => [
        g.origin,
        g.rows.map((r) => r.n),
      ]),
    ).toEqual([
      ['B', [1, 4]],
      ['A', [3]],
      [undefined, [2]],
    ]);
  });
});
