import { describe, expect, it } from 'vitest';

import {
  CONTEXT_TITLE,
  EXAMPLES,
  dayLabel,
  examplesFor,
  requestRows,
  ruleSentences,
  sentenceKind,
  sinceLabel,
  stateLabel,
} from '../src/bower-tab.js';
import type { RequestsInput, SentRequest } from '../src/bower-tab.js';
import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import { allRules, parseRules } from '../src/rules.js';
import { instructionNote } from '../src/tell.js';

function file(path: string, modifiedTime?: string): DriveFile {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return {
    id: path,
    name,
    mimeType: 'text/markdown',
    parents: ['FOLDER_ID'],
    path,
    ...(modifiedTime === undefined ? {} : { modifiedTime }),
  };
}

const LISTED_AT = '2026-09-27T09:00:00.000Z';

describe('examplesFor', () => {
  it('shows three examples, the first set on the first visit', () => {
    expect(examplesFor(0)).toEqual(EXAMPLES.slice(0, 3));
  });

  it('moves to the next set on every visit and wraps around', () => {
    expect(examplesFor(1)).toEqual(EXAMPLES.slice(3, 6));
    expect(examplesFor(2)).toEqual(EXAMPLES.slice(6, 9));
    expect(examplesFor(3)).toEqual(examplesFor(0));
  });

  it('never offers a Rule/Task/Question label, only sentences', () => {
    for (const example of EXAMPLES) {
      expect(example.split(' ').length).toBeGreaterThan(3);
    }
  });
});

describe('requestRows', () => {
  const question = 'Bower - 2026-09-27 0815 What do I still need for Lisbon.md';
  const context = 'Bower - 2026-09-27 0900 Context.md';
  // The times in the names are local, as `instructionFileName` writes them.
  const questionAt = new Date(2026, 8, 27, 8, 15).toISOString();
  const contextAt = new Date(2026, 8, 27, 9, 0).toISOString();
  const answeredAt = '2026-09-21T10:00:00.000Z';

  /** A fixture inbox: a question and Add's context note waiting, a
   * processed note, a file, an answer, and the files `Answers/` always
   * has. */
  const files: DriveFile[] = [
    file(`0-Inbox/${question}`, '2026-09-27T12:00:00.000Z'),
    file(`0-Inbox/${context}`),
    file('0-Inbox/Processed/Bower - 2026-09-20 0930 Start a reading list.md'),
    file('0-Inbox/Tomato seedlings.md'),
    file('Clippings/Bower - 2026-09-27 0815 A clipped page.md'),
    {
      ...file('0-Inbox/Bower - 2026-09-27 0815 Folder.md'),
      mimeType: FOLDER_MIME,
    },
    file(
      'Answers/2026-09-21 Which subscriptions renew this autumn.md',
      answeredAt,
    ),
    file('Answers/_Answers.md'),
    file('Answers/Bower - Proposals.md'),
  ];

  const texts = new Map([
    [
      `0-Inbox/${question}`,
      instructionNote(
        'What do I still need to sort out for the Lisbon trip?',
        new Date(questionAt),
        'request',
      ),
    ],
    [
      `0-Inbox/${context}`,
      instructionNote(
        'Receipts: add them to a table',
        new Date(contextAt),
        'context',
      ),
    ],
  ]);

  const rules = allRules(
    parseRules(
      [
        '## Money',
        "- Never archive Money (owner's request, 2026-09-27)",
        '- ~~Receipts go to Money~~ (paused 2026-09-26)',
        '- Tag bills (accepted suggestion, 2026-09-12)',
        '',
      ].join('\n'),
    ),
  );

  const base: RequestsInput = {
    files,
    fetchedAt: LISTED_AT,
    texts,
    justSent: [],
    runSince: null,
    rules,
    justKept: [],
  };

  it('derives every state from the folder, newest first', () => {
    expect(requestRows(base)).toEqual([
      {
        key: `request-${context}`,
        state: 'waiting',
        text: CONTEXT_TITLE,
        kind: 'context',
        since: contextAt,
        fileId: `0-Inbox/${context}`,
      },
      {
        key: `request-${question}`,
        state: 'waiting',
        text: 'What do I still need to sort out for the Lisbon trip?',
        kind: 'question',
        since: questionAt,
        fileId: `0-Inbox/${question}`,
      },
      {
        key: 'rule-1',
        state: 'kept',
        text: 'Never archive Money',
        kind: 'rule',
        since: new Date(2026, 8, 27).toISOString(),
        fileId: null,
      },
      {
        key: 'answer-Answers/2026-09-21 Which subscriptions renew this autumn.md',
        state: 'answered',
        text: 'Which subscriptions renew this autumn',
        kind: 'job',
        since: answeredAt,
        fileId: 'Answers/2026-09-21 Which subscriptions renew this autumn.md',
      },
    ]);
  });

  it('falls back to the title in the name while a note is not read', () => {
    const rows = requestRows({ ...base, texts: new Map() });
    expect(rows.map((row) => [row.text, row.kind])).toEqual([
      [CONTEXT_TITLE, 'context'],
      ['What do I still need for Lisbon', 'job'],
      ['Never archive Money', 'rule'],
      ['Which subscriptions renew this autumn', 'job'],
    ]);
  });

  // #465: the file name's own short title ("Which subscriptions renew this
  // autumn", no question mark, read as a job) is not the sentence sent
  // ("Which subscriptions renew this autumn?", a question) -- an answered
  // row must read the note's own words once its text is fetched.
  it("reads an answered row's real question once its note is read", () => {
    const answerId =
      'Answers/2026-09-21 Which subscriptions renew this autumn.md';
    const rows = requestRows({
      ...base,
      texts: new Map([
        ...texts,
        [
          answerId,
          '---\ntags: [answer]\ncreated: 2026-09-21\nupdated: 2026-09-21\n---\n\n# Which subscriptions renew this autumn?\n\nBroadband runs until January.\n',
        ],
      ]),
    });
    const answered = rows.find((row) => row.fileId === answerId);
    expect(answered?.text).toBe('Which subscriptions renew this autumn?');
    expect(answered?.kind).toBe('question');
  });

  it('marks what was waiting before the run in flight as Tidying up', () => {
    const rows = requestRows({
      ...base,
      runSince: new Date(2026, 8, 27, 8, 30).toISOString(),
    });
    const states = new Map(rows.map((row) => [row.fileId, row.state]));
    expect(states.get(`0-Inbox/${question}`)).toBe('tidying');
    // Sent after the run was asked for: it waits for the next one.
    expect(states.get(`0-Inbox/${context}`)).toBe('waiting');
  });

  it('counts a sentence sent after the listing as waiting, with its words', () => {
    const later: SentRequest = {
      name: 'Bower - 2026-09-27 1000 Make a packing list.md',
      text: 'Make a packing list\nfor Lisbon',
      sentAt: '2026-09-27T10:00:00.000Z',
    };
    const [first] = requestRows({ ...base, justSent: [later] });
    expect(first).toEqual({
      key: `request-${later.name}`,
      state: 'waiting',
      text: 'Make a packing list',
      kind: 'job',
      since: later.sentAt,
      fileId: null,
    });
  });

  // #491: sent while a run is in flight, and a listing fetched just after
  // the send (one already in flight, or Drive not listing the new note yet)
  // does not show it: the row is still there, Waiting for the next tidy-up.
  it('keeps a request sent while a run is in flight as waiting', () => {
    const runSince = '2026-09-27T09:10:00.000Z';
    const during: SentRequest = {
      name: 'Bower - 2026-09-27 1112 When does the lease end.md',
      text: 'When does the lease end?',
      sentAt: '2026-09-27T09:12:00.000Z',
    };
    const rows = requestRows({
      ...base,
      fetchedAt: '2026-09-27T09:12:05.000Z',
      justSent: [during],
      runSince,
    });
    expect(rows.find((row) => row.key === `request-${during.name}`)).toEqual({
      key: `request-${during.name}`,
      state: 'waiting',
      text: 'When does the lease end?',
      kind: 'question',
      since: during.sentAt,
      fileId: null,
    });

    // Once the listing shows the note, it is the note's row, still waiting.
    const note = file(`0-Inbox/${during.name}`, during.sentAt);
    const listed = requestRows({
      ...base,
      files: [...files, note],
      fetchedAt: '2026-09-27T09:13:00.000Z',
      justSent: [during],
      runSince,
    });
    expect(
      listed.filter((row) => row.key === `request-${during.name}`),
    ).toEqual([expect.objectContaining({ state: 'waiting', fileId: note.id })]);
  });

  it('trusts a listing fetched after the send: a processed note is gone', () => {
    const earlier: SentRequest = {
      name: 'Bower - 2026-09-27 0830 Make a packing list.md',
      text: 'Make a packing list',
      sentAt: '2026-09-27T08:30:00.000Z',
    };
    const rows = requestRows({ ...base, justSent: [earlier] });
    expect(rows.some((row) => row.key === `request-${earlier.name}`)).toBe(
      false,
    );
  });

  it('dates a rule kept from this screen to the minute, even before Rules.md is read again', () => {
    const since = '2026-09-28T07:00:00.000Z';
    const kept = requestRows({
      ...base,
      justKept: [
        { text: 'Never archive Money', since },
        { text: 'Always tag receipts', since },
      ],
    }).filter((row) => row.state === 'kept');
    expect(kept.map((row) => [row.text, row.since])).toEqual([
      ['Never archive Money', since],
      ['Always tag receipts', since],
    ]);
  });
});

describe('stateLabel', () => {
  it('says the state, and the kind while it waits or runs', () => {
    expect(stateLabel({ state: 'waiting', kind: 'job' })).toBe('Waiting · job');
    expect(stateLabel({ state: 'tidying', kind: 'question' })).toBe(
      'Tidying up · question',
    );
    expect(stateLabel({ state: 'waiting', kind: 'context' })).toBe('Waiting');
    expect(stateLabel({ state: 'answered', kind: 'question' })).toBe(
      'Answered',
    );
    expect(stateLabel({ state: 'kept', kind: 'rule' })).toBe('Rule kept');
  });
});

describe('dayLabel', () => {
  it('writes the local day as the Rules screen does', () => {
    expect(dayLabel(new Date(2026, 8, 27, 23, 30).toISOString())).toBe(
      '27 Sep',
    );
    expect(dayLabel('')).toBe('');
  });
});

describe('sinceLabel', () => {
  const now = Date.parse('2026-09-27T10:30:00.000Z');

  it('reads minutes and hours, then days', () => {
    expect(sinceLabel('2026-09-27T10:29:30.000Z', now)).toBe('just now');
    expect(sinceLabel('2026-09-27T10:25:00.000Z', now)).toBe('5 min ago');
    expect(sinceLabel('2026-09-27T08:15:00.000Z', now)).toBe('2 h ago');
    expect(sinceLabel('2026-09-25T10:00:00.000Z', now)).toBe('2 days ago');
  });

  it('is empty for a date it cannot read', () => {
    expect(sinceLabel('', now)).toBe('');
  });
});

describe('sentenceKind', () => {
  it('reads a rule from its first words, any case, leading spaces allowed', () => {
    for (const text of [
      'From now on, receipts go under Finance',
      '  always file recipes under Cooking',
      'NEVER archive Finance',
      'Every time I add a payslip, put it in Money',
      '\nfrom now on: tag bills',
    ]) {
      expect(sentenceKind(text)).toBe('rule');
    }
  });

  it('asks a sentence that ends in "?", even one that starts like a rule', () => {
    expect(sentenceKind('How much did I spend on the kitchen this year?')).toBe(
      'question',
    );
    expect(sentenceKind('Every time I add a receipt, where does it go? ')).toBe(
      'question',
    );
  });

  it('waits with everything else as a job', () => {
    for (const text of [
      'Make a packing list for my next trip',
      'Nevertheless, summarise the PDF',
      'Is it always like this',
      'Alwaysy is not a word',
    ]) {
      expect(sentenceKind(text)).toBe('job');
    }
  });
});

describe('ruleSentences', () => {
  it('finds the rule sentences in a longer text, as written', () => {
    expect(
      ruleSentences(
        'Receipts: add them to a table. From now on, file receipts under Money.\nnever archive these! Is it always like this?',
      ),
    ).toEqual([
      'From now on, file receipts under Money.',
      'never archive these!',
    ]);
  });

  it('finds none in a text without one', () => {
    expect(ruleSentences('Just file these, please.')).toEqual([]);
    expect(ruleSentences('')).toEqual([]);
  });
});
