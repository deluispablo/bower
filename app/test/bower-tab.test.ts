import { describe, expect, it } from 'vitest';

import {
  EXAMPLES,
  examplesFor,
  ruleSentences,
  sentenceKind,
  sinceLabel,
  waitingRequests,
} from '../src/bower-tab.js';
import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import type { SentItem } from '../src/tell.js';

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

describe('waitingRequests', () => {
  const name = 'Bower - 2026-09-27 0815 What do I still need for Lisbon.md';

  it('lists an instruction note directly in the inbox, with the words as sent', () => {
    const sent: SentItem[] = [
      {
        name,
        text: 'What do I still need for Lisbon?\nThanks',
        sentAt: '2026-09-27T08:15:00.000Z',
      },
    ];
    expect(
      waitingRequests({
        files: [file(`0-Inbox/${name}`, '2026-09-27T08:15:30.000Z')],
        fetchedAt: LISTED_AT,
        sent,
        justSent: [],
      }),
    ).toEqual([
      {
        name,
        text: 'What do I still need for Lisbon?',
        since: '2026-09-27T08:15:00.000Z',
      },
    ]);
  });

  it('falls back to the title in the name when this device did not send it', () => {
    const [request] = waitingRequests({
      files: [file(`0-Inbox/${name}`, '2026-09-27T08:15:30.000Z')],
      fetchedAt: LISTED_AT,
      sent: [],
      justSent: [],
    });
    expect(request?.text).toBe('What do I still need for Lisbon');
    expect(request?.since).toBe('2026-09-27T08:15:30.000Z');
  });

  it('leaves out processed notes, other inbox files and folders', () => {
    const files: DriveFile[] = [
      file(`0-Inbox/Processed/${name}`),
      file('0-Inbox/Tomato seedlings.md'),
      file('Clippings/Bower - 2026-09-27 0815 A clipped page.md'),
      {
        ...file('0-Inbox/Bower - 2026-09-27 0815 Folder.md'),
        mimeType: FOLDER_MIME,
      },
    ];
    expect(
      waitingRequests({ files, fetchedAt: LISTED_AT, sent: [], justSent: [] }),
    ).toEqual([]);
  });

  it('counts a note sent after the listing as waiting, newest first', () => {
    const later: SentItem = {
      name: 'Bower - 2026-09-27 1000 Make a packing list.md',
      text: 'Make a packing list',
      sentAt: '2026-09-27T10:00:00.000Z',
    };
    const result = waitingRequests({
      files: [file(`0-Inbox/${name}`, '2026-09-27T08:15:30.000Z')],
      fetchedAt: LISTED_AT,
      sent: [later],
      justSent: [later],
    });
    expect(result.map((request) => request.text)).toEqual([
      'Make a packing list',
      'What do I still need for Lisbon',
    ]);
  });

  it('trusts a listing fetched after the send: a processed note is no longer waiting', () => {
    const sentEarlier: SentItem = {
      name: 'Bower - 2026-09-27 0830 Make a packing list.md',
      text: 'Make a packing list',
      sentAt: '2026-09-27T08:30:00.000Z',
    };
    expect(
      waitingRequests({
        files: [],
        fetchedAt: LISTED_AT,
        sent: [sentEarlier],
        justSent: [sentEarlier],
      }),
    ).toEqual([]);
  });

  it('shows what was just sent before the first listing arrives', () => {
    const item: SentItem = {
      name: 'Bower - 2026-09-27 0830 Hello.md',
      text: 'Hello',
      sentAt: '2026-09-27T08:30:00.000Z',
    };
    expect(
      waitingRequests({
        files: [],
        fetchedAt: null,
        sent: [item],
        justSent: [item],
      }),
    ).toHaveLength(1);
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
