import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Run } from '../src/api.js';
import type { DriveFile } from '../src/drive.js';
import { tableRows } from '../src/just-filed.js';
import { outcomeFromRun } from '../src/run-outcome.js';
import { rowFor } from '../src/components/working-sheet.js';
import {
  clearPileOrigins,
  groupByOrigin,
  pileConfirm,
  pileConfirmLine,
  confirmRows,
  requestRowLabel,
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
    // Two noted piles and the "Added from elsewhere" row: three rows.
    expect(pileConfirmLine(5, confirm)).toBe('5 things in 3 piles');
    expect(pileConfirmLine(3, { ...confirm, elsewhere: 0 })).toBe(
      '3 things in 2 piles',
    );
  });

  it('counts every row the confirm lists as a pile, the request included (AD-Confirm ruling)', () => {
    // One noted pile of 2 plus the default demo inbox (2 from elsewhere and
    // a waiting request): 5 things, three rows.
    const demo = {
      piles: [{ id: 'a', label: 'x', count: 2 }],
      elsewhere: 2,
      requests: 1,
    };
    expect(pileConfirmLine(5, demo)).toBe('5 things in 3 piles');
    expect(confirmRows(demo)).toBe(3);
    expect(
      pileConfirmLine(3, {
        piles: [{ id: 'a', label: 'x', count: 2 }],
        elsewhere: 0,
        requests: 1,
      }),
    ).toBe('3 things in 2 piles');
    expect(
      pileConfirmLine(2, {
        piles: [{ id: 'a', label: 'x', count: 2 }],
        elsewhere: 0,
      }),
    ).toBe('2 things in 1 pile');
    expect(requestRowLabel(1)).toBe('A request for Bower');
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

describe('rows name their pile (R-PILE-5)', () => {
  const run: Run = {
    state: 'done',
    requestedAt: '2026-09-29T13:50:00.000Z',
    finishedAt: '2026-09-29T13:57:00.000Z',
    runId: 'run-a',
    items: [
      {
        path: '0-Inbox/scan_0412.pdf',
        kind: 'file',
        to: '2-Areas/Home/Boiler manual.pdf',
        renamedFrom: 'scan_0412.pdf',
      },
      {
        path: '0-Inbox/offer.pdf',
        kind: 'file',
        to: '1-Projects/Jobs/offer.pdf',
      },
    ],
  };

  it('Just filed rows and the sheet rows carry the heading, by the inbox name', () => {
    rememberPileOrigins([pile('a', 'Flat papers', ['scan_0412.pdf'])]);
    const rows = tableRows(run, null);
    expect(rows.map((r) => r.origin)).toEqual([
      'From your pile: “Flat papers”',
      undefined,
    ]);
    const items = outcomeFromRun(run).items;
    expect(items.map((item) => rowFor(item).origin)).toEqual([
      'From your pile: “Flat papers”',
      undefined,
    ]);
  });
});
