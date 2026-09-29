import { describe, expect, it } from 'vitest';

import {
  QUARANTINED_REASON,
  UNREADABLE_REASON,
  activityCards,
  cardDuration,
  cardWhen,
  folderLabel,
  parseLog,
} from '../src/activity.js';
import type { Run } from '../src/api.js';
import type { DriveFile } from '../src/drive.js';
import logFixture from './fixtures/activity-log.md?raw';

/** 28 Sep 2026, 20:00 on this device. */
const NOW = new Date(2026, 8, 28, 20, 0).getTime();

function answer(name: string): DriveFile {
  return {
    id: `id-${name}`,
    name,
    mimeType: 'text/markdown',
    path: `Answers/${name}`,
    parents: ['ANSWERS_ID'],
    modifiedTime: '2026-09-28T17:51:00.000Z',
  };
}

const QUESTION =
  '0-Inbox/Bower - 2026-09-28 1702 Which flat should I visit first.md';

/** Today's tidy-up: three files (one renamed), a question, and the context
 * note of the batch. */
const TODAY: Run = {
  state: 'done',
  requestedAt: '2026-09-28T17:47:30.000Z',
  startedAt: '2026-09-28T17:48:00.000Z',
  finishedAt: '2026-09-28T17:51:10.000Z',
  processed: [
    '0-Inbox/Lease agreement 2026.pdf',
    '0-Inbox/IMG_4471.jpg',
    '0-Inbox/Notes from the viewing.md',
    QUESTION,
    '0-Inbox/Bower - 2026-09-28 1703 Context.md',
  ],
  items: [
    { path: '0-Inbox/Lease agreement 2026.pdf', kind: 'file' },
    { path: '0-Inbox/IMG_4471.jpg', kind: 'file' },
    { path: '0-Inbox/Notes from the viewing.md', kind: 'file' },
    { path: QUESTION, kind: 'request' },
    { path: '0-Inbox/Bower - 2026-09-28 1703 Context.md', kind: 'context' },
  ],
};

/** Yesterday's: a receipt filed, a document that could not be converted,
 * and a file the pre-scan set aside. */
const YESTERDAY: Run = {
  state: 'done',
  requestedAt: '2026-09-27T08:08:00.000Z',
  startedAt: '2026-09-27T08:08:20.000Z',
  finishedAt: '2026-09-27T08:12:30.000Z',
  processed: ['0-Inbox/receipt-hardware-store.jpg', '0-Inbox/Old notes.rtf'],
  items: [
    { path: '0-Inbox/receipt-hardware-store.jpg', kind: 'file' },
    { path: '0-Inbox/Old notes.rtf', kind: 'file' },
  ],
  quarantined: ['0-Inbox/Quarantine/Free gift card.md'],
};

describe('parseLog (#345)', () => {
  const entries = parseLog(logFixture);

  it('reads Filed, Correction, Applied rule and Context lines and skips the rest', () => {
    expect(entries.map((entry) => entry.type)).toEqual([
      'filed',
      'filed',
      'filed',
      'filed',
      'context',
      'rule',
      'correction',
    ]);
  });

  it('reads the name, the folder and the name it was renamed from', () => {
    expect(entries[2]).toEqual({
      type: 'filed',
      at: { day: '2026-09-28', time: '17:50' },
      name: 'Arlington Road, window sign.jpg',
      folder: '1-Projects/Flat hunt',
      renamedFrom: 'IMG_4471.jpg',
    });
    // A wikilinked name and a trailing slash on the folder are cleaned.
    expect(entries[3]).toMatchObject({
      name: 'Notes from the viewing.md',
      folder: '1-Projects/Flat hunt',
    });
  });

  it('reads a Correction line with its own date', () => {
    expect(entries[6]).toEqual({
      type: 'correction',
      at: { day: '2026-09-28' },
      from: '1-Projects/Flat hunt',
      to: '2-Areas/Home',
    });
  });

  it('reads Applied rule and Context lines word for word', () => {
    expect(entries[4]).toMatchObject({
      type: 'context',
      text: 'Voice memo 14.m4a is not in the inbox',
    });
    expect(entries[5]).toMatchObject({
      type: 'rule',
      text: 'Receipts go to Finance, named by shop and date',
    });
  });

  it('reads CRLF line endings and an arrow written as ->', () => {
    expect(
      parseLog('Filed: a.pdf -> 3-Resources\r\nFiled: b.md → 2-Areas\r\n'),
    ).toEqual([
      { type: 'filed', at: null, name: 'a.pdf', folder: '3-Resources' },
      { type: 'filed', at: null, name: 'b.md', folder: '2-Areas' },
    ]);
  });
});

describe('activityCards (#345)', () => {
  const [today, yesterday] = activityCards({
    runs: [TODAY, YESTERDAY],
    log: logFixture,
    files: [answer('2026-09-28 Which flat should I visit first.md')],
    now: NOW,
  });

  it('one card per run, newest first, with when and how long', () => {
    expect(today?.when).toBe(cardWhen(TODAY.finishedAt ?? '', NOW));
    expect(today?.when.startsWith('Today, ')).toBe(true);
    expect(today?.duration).toBe('3 min');
    expect(today?.status).toBe('Done');
    expect(yesterday?.when.startsWith('Yesterday, ')).toBe(true);
    expect(yesterday?.duration).toBe('4 min');
  });

  it('what went where, the new name, the question with its answer, never the context note', () => {
    expect(today?.rows).toEqual([
      {
        key: '0-Inbox/Lease agreement 2026.pdf',
        tone: 'pdf',
        title: 'Lease agreement 2026.pdf',
        destination: 'Projects / Flat hunt',
      },
      {
        key: '0-Inbox/IMG_4471.jpg',
        tone: 'image',
        title: 'IMG_4471.jpg',
        destination: 'Projects / Flat hunt',
        renamed: 'Arlington Road, window sign',
      },
      {
        key: '0-Inbox/Notes from the viewing.md',
        tone: 'note',
        title: 'Notes from the viewing',
        destination: 'Projects / Flat hunt',
      },
      {
        key: QUESTION,
        tone: 'question',
        title: 'Which flat should I visit first?',
        answerId: 'id-2026-09-28 Which flat should I visit first.md',
      },
      {
        key: 'rule:Receipts go to Finance, named by shop and date',
        tone: 'rule',
        title: 'Receipts go to Finance, named by shop and date',
        outcome: 'your rule, applied',
      },
    ]);
  });

  it('a card carries the run outcome: counts and a sentence, no raw Moved lines (R-REQ-4)', () => {
    expect(today?.outcome.state).toBe('done');
    for (const row of today?.rows ?? []) {
      expect(row.title).not.toMatch(/^Moved/);
    }
    const [reported] = activityCards({
      runs: [
        {
          ...TODAY,
          items: [
            {
              path: '0-Inbox/Lease agreement 2026.pdf',
              kind: 'file',
              to: '1-Projects/Flat hunt/Lease agreement 2026.pdf',
            },
          ],
          created: ['1-Projects/Flat hunt/Summary.md'],
          updated: [{ path: '3-Resources/Lists.md' }],
        },
      ],
      log: '',
      files: [],
      now: NOW,
    });
    expect(reported?.counts).toBe('1 filed · 1 new note · 1 updated');
    expect(reported?.sentence).toMatch(
      /^Done .*: 1 filed · 1 new note · 1 updated\.$/,
    );
  });

  it('set aside, in people words: a document that could not be read and a quarantined file', () => {
    expect(yesterday?.status).toBe('Two things set aside');
    expect(yesterday?.rows).toEqual([
      {
        key: '0-Inbox/receipt-hardware-store.jpg',
        tone: 'image',
        title: 'receipt-hardware-store.jpg',
        destination: 'Areas / Finance',
      },
      {
        key: '0-Inbox/Old notes.rtf',
        tone: 'set-aside',
        title: 'Old notes.rtf',
        setAside: UNREADABLE_REASON,
      },
      {
        key: 'quarantined:0-Inbox/Quarantine/Free gift card.md',
        tone: 'set-aside',
        title: 'Free gift card.md',
        setAside: QUARANTINED_REASON,
      },
    ]);
  });

  it('a failed run says why, and a line outside its window is not its row', () => {
    const [failed] = activityCards({
      runs: [
        {
          state: 'failed',
          reason: 'timeout',
          requestedAt: '2026-09-28T19:00:00.000Z',
          finishedAt: '2026-09-28T19:30:00.000Z',
          processed: [],
        },
      ],
      log: logFixture,
      files: [],
      now: NOW,
    });
    expect(failed?.failed).toBe(true);
    expect(failed?.status).toBe('Failed · Took too long');
    // A Correction line is no row any more, so nothing is left.
    expect(failed?.rows).toEqual([]);
    expect(failed?.outcome.state).toBe('failed');
  });

  it('a request with no answer is done; a report without kinds falls back to the name', () => {
    const [card] = activityCards({
      runs: [
        {
          state: 'done',
          requestedAt: '2026-09-28T17:47:30.000Z',
          finishedAt: '2026-09-28T17:51:10.000Z',
          processed: [
            '0-Inbox/Bower - 2026-09-28 1702 Make a packing list.md',
            '0-Inbox/Bower - 2026-09-28 1703 Context.md',
          ],
        },
      ],
      log: '',
      files: [],
      now: NOW,
    });
    expect(card?.rows).toEqual([
      {
        key: '0-Inbox/Bower - 2026-09-28 1702 Make a packing list.md',
        tone: 'note',
        title: 'Make a packing list',
        outcome: 'done',
      },
    ]);
  });

  it('a run still going gets no card', () => {
    expect(
      activityCards({
        runs: [{ state: 'running', requestedAt: TODAY.requestedAt }],
        log: '',
        files: [],
        now: NOW,
      }),
    ).toEqual([]);
  });
});

describe('labels', () => {
  const at = (min: number): string =>
    new Date(Date.UTC(2026, 8, 28, 10, min)).toISOString();

  it('folderLabel spaces the slashes and drops the numeric prefix', () => {
    expect(folderLabel('1-Projects/Flat hunt')).toBe('Projects / Flat hunt');
    expect(folderLabel('0-Inbox')).not.toMatch(/[0-4]-/);
  });

  it('cardDuration: at least a minute, hours past sixty', () => {
    expect(
      cardDuration({ state: 'done', requestedAt: at(0), finishedAt: at(0) }),
    ).toBe('1 min');
    expect(
      cardDuration({ state: 'done', requestedAt: at(0), finishedAt: at(65) }),
    ).toBe('1 h 5 min');
  });

  it('cardWhen: an older day by its date', () => {
    expect(cardWhen(new Date(2026, 8, 25, 18, 2).toISOString(), NOW)).toBe(
      '25 Sep, 18:02',
    );
  });
});

describe('Moved lines (#643)', () => {
  const log = [
    '- 2026-09-28 17:49 · Moved: 3-Resources/Recipes/soup.md → 2-Areas/Home/Cooking/soup.md',
    '- 2026-09-28 17:50 · Moved by you: 1-Projects/Flat hunt/plan.pdf → 4-Archives/Flat hunt/plan.pdf',
  ].join('\n');

  it('parses both line kinds', () => {
    expect(parseLog(log)).toEqual([
      {
        type: 'moved',
        at: { day: '2026-09-28', time: '17:49' },
        from: '3-Resources/Recipes/soup.md',
        to: '2-Areas/Home/Cooking/soup.md',
        byYou: false,
      },
      {
        type: 'moved',
        at: { day: '2026-09-28', time: '17:50' },
        from: '1-Projects/Flat hunt/plan.pdf',
        to: '4-Archives/Flat hunt/plan.pdf',
        byYou: true,
      },
    ]);
  });

  it('shows no row for a move: no raw "Moved" line anywhere (R-JUST-1)', () => {
    const [card] = activityCards({ runs: [TODAY], log, files: [], now: NOW });
    expect(card?.rows.filter((row) => row.tone === 'move')).toEqual([]);
    expect(JSON.stringify(card?.rows)).not.toMatch(/Moved/);
  });
});
