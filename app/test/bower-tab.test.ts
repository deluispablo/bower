import { describe, expect, it } from 'vitest';

import {
  BUBBLE,
  CONTEXT_TITLE,
  birdPose,
  requestWhen,
  EXAMPLES,
  dayLabel,
  examplesFor,
  lowerFirst,
  requestMeta,
  requestRows,
  isPileNoteName,
  waitingNotes,
  requestTargetPath,
  requestsForNote,
  requestsByTargetPath,
  ruleSentences,
  sentenceKind,
  sinceLabel,
  stateLabel,
} from '../src/bower-tab.js';
import type {
  RequestRow,
  RequestsInput,
  SentRequest,
} from '../src/bower-tab.js';
import type { Run } from '../src/api.js';
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

  it('drops a request a listing has shown once that listing no longer does', () => {
    const done: SentRequest = {
      name: 'Bower - 2026-09-27 1112 When does the lease end.md',
      text: 'When does the lease end?',
      sentAt: '2026-09-27T09:12:00.000Z',
      seen: true,
    };
    const rows = requestRows({
      ...base,
      fetchedAt: '2026-09-27T09:12:30.000Z',
      justSent: [done],
    });
    expect(rows.some((row) => row.key === `request-${done.name}`)).toBe(false);
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
  it('says the state in the board words (spec §6.7)', () => {
    expect(stateLabel({ state: 'waiting' })).toBe('Waiting');
    expect(stateLabel({ state: 'tidying' })).toBe('Being done now');
    expect(stateLabel({ state: 'done' })).toBe('Done');
    expect(stateLabel({ state: 'failed' })).toBe('Did not finish');
    expect(stateLabel({ state: 'answered' })).toBe('Answered');
    expect(stateLabel({ state: 'kept' })).toBe('Rule kept');
  });
});

describe('requests and their runs (#756, R-REQ-1)', () => {
  const name = 'Bower - 2026-09-28 1300 Make a packing list.md';
  const path = `0-Inbox/${name}`;
  const sentAt = new Date(2026, 8, 28, 13, 0).toISOString();
  const doneRun: Run = {
    state: 'done',
    requestedAt: '2026-09-29T13:20:00.000Z',
    finishedAt: '2026-09-29T13:26:00.000Z',
    runId: 'run-2',
    items: [
      { path, kind: 'request' },
      { path: '0-Inbox/Bower - 2026-09-29 1301 Context.md', kind: 'context' },
    ],
  };
  const failedRun: Run = {
    state: 'failed',
    requestedAt: '2026-09-29T14:00:00.000Z',
    finishedAt: '2026-09-29T14:05:00.000Z',
    runId: 'run-3',
    items: [{ path, kind: 'request' }],
  };
  const input = (
    files: DriveFile[],
    runs: Run[],
    extra: Partial<RequestsInput> = {},
  ): RequestsInput => ({
    files,
    fetchedAt: '2026-09-29T15:00:00.000Z',
    texts: new Map(),
    justSent: [],
    runSince: null,
    rules: [],
    justKept: [],
    runs,
    ...extra,
  });

  it('a request a run did stays listed as Done with its run key, never vanishing', () => {
    const rows = requestRows(
      input([file('0-Inbox/Processed/' + name)], [doneRun]),
    );
    expect(rows).toEqual([
      {
        key: `done-run-2-${name}`,
        state: 'done',
        text: 'Make a packing list',
        kind: 'job',
        since: '2026-09-29T13:26:00.000Z',
        fileId: null,
        runKey: 'run-2',
      },
    ]);
  });

  it('a done row uses the words this screen sent, once, without a waiting duplicate', () => {
    const rows = requestRows(
      input([], [doneRun], {
        justSent: [{ name, text: 'Make a packing list for Lisbon', sentAt }],
      }),
    );
    expect(rows.map((row) => [row.state, row.text])).toEqual([
      ['done', 'Make a packing list for Lisbon'],
    ]);
  });

  it('a failed run leaves its note in the inbox as Did not finish, with the run key and its menu file', () => {
    const rows = requestRows(input([file(path)], [failedRun]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      state: 'failed',
      fileId: path,
      runKey: 'run-3',
      since: '2026-09-29T14:05:00.000Z',
    });
  });

  it('a note sent after the failed run is waiting, not failed', () => {
    const later = 'Bower - 2026-09-30 1500 Another job.md';
    const rows = requestRows(input([file(`0-Inbox/${later}`)], [failedRun]));
    expect(rows.map((row) => row.state)).toEqual(['waiting']);
  });

  it('a note still in the inbox is not also listed as done', () => {
    const rows = requestRows(input([file(path)], [doneRun]));
    expect(rows.map((row) => row.state)).toEqual(['waiting']);
  });

  it('a pile note is never a request, waiting or done (#771)', () => {
    const pileName = 'Bower - 2026-09-29 1042-07 Context ab.md';
    const pileRun: Run = {
      state: 'done',
      requestedAt: '2026-09-29T13:20:00.000Z',
      finishedAt: '2026-09-29T13:26:00.000Z',
      runId: 'run-4',
      items: [{ path: `0-Inbox/${pileName}`, kind: 'request' }],
    };
    expect(isPileNoteName(pileName)).toBe(true);
    expect(isPileNoteName(name)).toBe(false);
    expect(waitingNotes([file(`0-Inbox/${pileName}`)])).toEqual([]);
    expect(
      requestRows(input([file(`0-Inbox/${pileName}`)], [pileRun])),
    ).toEqual([]);
  });

  it('the run in flight wins over an earlier failure', () => {
    const rows = requestRows(
      input([file(path)], [failedRun], {
        runSince: '2026-09-29T14:30:00.000Z',
      }),
    );
    expect(rows.map((row) => row.state)).toEqual(['tidying']);
  });
});

describe('requestMeta (#756)', () => {
  it('says each state in the board words', () => {
    expect(requestMeta({ state: 'waiting' }, { when: '' })).toBe(
      'Bower does it at the next tidy-up',
    );
    expect(
      requestMeta({ state: 'tidying' }, { when: '', startedAt: '13:52' }),
    ).toBe('started 13:52');
    expect(
      requestMeta(
        { state: 'done' },
        { when: 'today, 13:26', counts: '4 new · 4 updated' },
      ),
    ).toBe('today, 13:26 · 4 new · 4 updated');
    expect(requestMeta({ state: 'done' }, { when: 'today, 13:26' })).toBe(
      'today, 13:26',
    );
    expect(requestMeta({ state: 'failed' }, { when: 'today, 12:59' })).toBe(
      'today, 12:59 · still in your inbox for the next tidy-up',
    );
    expect(requestMeta({ state: 'answered' }, { when: 'today, 12:40' })).toBe(
      'answered today, 12:40',
    );
    expect(requestMeta({ state: 'kept' }, { when: '' })).toBe('In your rules');
  });

  it('lowerFirst reads "Today, 13:26" as "today, 13:26"', () => {
    expect(lowerFirst('Today, 13:26')).toBe('today, 13:26');
    expect(lowerFirst('')).toBe('');
  });
});

describe('requestsByTargetPath (#756, for #765 and #784)', () => {
  const row = (state: RequestRow['state'], text: string): RequestRow => ({
    key: text,
    state,
    text,
    kind: 'job',
    since: '',
    fileId: null,
  });

  it('reads the path a Move request names', () => {
    expect(
      requestTargetPath(
        'Move “Lease” (1-Projects/Flat/lease.pdf) to 4-Archives.',
      ),
    ).toBe('1-Projects/Flat/lease.pdf');
    expect(requestTargetPath('Make a packing list')).toBeNull();
  });

  it('reads the note an Ask or Rename request names as a wikilink', () => {
    expect(requestTargetPath('[[Data Lead, Northwind]] rename it')).toBe(
      'Data Lead, Northwind',
    );
    expect(requestTargetPath('Rename [[A/B.md|the offer]] to Offer')).toBe(
      'A/B.md',
    );
  });

  it('finds the requests about one note by path, file name or title', () => {
    const ask = row('tidying', '[[Data Lead, Northwind]] rename it');
    const other = row('tidying', '[[Something else]] rename it');
    const move = row('waiting', 'Move “x” (1-Projects/Jobs/offer.md) to Done.');
    const rows = [ask, other, move];
    expect(
      requestsForNote(rows, '1-Projects/Jobs/offer.md', [
        'data lead, Northwind',
      ]),
    ).toEqual([ask, move]);
    expect(requestsForNote(rows, '1-Projects/Jobs/offer.md')).toEqual([move]);
    expect(
      requestsForNote([row('tidying', '[[offer]] rename')], 'Jobs/offer.md'),
    ).toHaveLength(1);
  });

  it('groups waiting, running, failed and done requests by target path', () => {
    const move = 'Move “Lease” (1-Projects/Flat/lease.pdf) to 4-Archives.';
    const map = requestsByTargetPath([
      row('waiting', move),
      row('failed', move),
      row('kept', move),
      row('waiting', 'Make a packing list'),
    ]);
    expect([...map.keys()]).toEqual(['1-Projects/Flat/lease.pdf']);
    expect(map.get('1-Projects/Flat/lease.pdf')?.map((r) => r.state)).toEqual([
      'waiting',
      'failed',
    ]);
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

  it('splits two "from now on" sentences glued together with no punctuation between them (#499)', () => {
    expect(
      ruleSentences(
        'From now on, bird articles go to Learning From now on, nothing goes to Garden.',
      ),
    ).toEqual([
      'From now on, bird articles go to Learning',
      'From now on, nothing goes to Garden.',
    ]);
  });

  it('splits two "every time" sentences the same way', () => {
    expect(
      ruleSentences(
        'Every time I add a payslip put it in Money every time I add a receipt scan it first.',
      ),
    ).toEqual([
      'Every time I add a payslip put it in Money',
      'every time I add a receipt scan it first.',
    ]);
  });

  it('never splits mid-sentence on a lone "always" or "never" (only at the very start)', () => {
    // #499's fix is deliberately narrower than that: "always"/"never" are
    // ordinary words too often to trust wherever they appear.
    expect(
      ruleSentences('I want you to never archive Finance statements.'),
    ).toEqual([]);
  });
});

describe('the bird and the bubble (#915, G-24, K-32, R-BW-1)', () => {
  it('looks by default and listens only while the box is dictating', () => {
    expect(birdPose(false)).toBe('looking');
    expect(birdPose(true)).toBe('listening');
  });

  it('says one line, with no PARA in it', () => {
    expect(BUBBLE).toBe(
      'Tell me what you want, in your words. I work out whether it is a rule, a job or a question.',
    );
    expect(BUBBLE).not.toMatch(/PARA/);
  });
});

describe('requestWhen (#915, K-16)', () => {
  it('writes the day and the time, never a relative phrase', () => {
    const iso = new Date(2026, 8, 29, 12, 31).toISOString();
    expect(requestWhen(iso)).toBe('29 Sep, 12:31');
    expect(requestWhen('not a date')).toBe('');
  });
});
